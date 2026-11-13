require('dotenv').config();
const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const pool = require('./db');
const { move, LedgerError } = require('./ledger');

if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32)
  throw new Error('JWT_SECRET missing or too short');

const app = express();
app.set('trust proxy', 1);
app.use(express.json({ limit: '10kb' }));
app.use(express.static('public'));

// The role is re-read from the DB on every request.
async function auth(req, res, next) {
  try {
    const token = (req.headers.authorization || '').replace(/^Bearer /, '');
    const { id } = jwt.verify(token, process.env.JWT_SECRET);
    const u = (await pool.query('SELECT id, email, role FROM users WHERE id=$1', [id])).rows[0];
    if (!u) throw new Error('no user');
    req.user = u;
    next();
  } catch { res.status(401).json({ error: 'UNAUTHENTICATED' }); }
}
const allow = (...roles) => (req, res, next) =>
  roles.includes(req.user.role) ? next() : res.status(403).json({ error: 'FORBIDDEN' });
const wrap = (fn) => (req, res, next) => fn(req, res).catch(next);

app.post('/api/login', rateLimit({ windowMs: 15 * 60 * 1000, limit: 20 }), wrap(async (req, res) => {
  const { email, password } = req.body || {};
  const u = (await pool.query('SELECT * FROM users WHERE email=$1', [String(email)])).rows[0];
  const ok = u && await bcrypt.compare(String(password), u.password_hash);
  if (!ok) return res.status(401).json({ error: 'BAD_CREDENTIALS' });
  const token = jwt.sign({ id: u.id }, process.env.JWT_SECRET, { expiresIn: '2h' });
  res.json({ token, role: u.role, email: u.email });
}));

app.post('/api/users', auth, allow('admin'), wrap(async (req, res) => {
  const { email, password, role } = req.body || {};
  if (typeof email !== 'string' || !email.includes('@') || typeof password !== 'string' || password.length < 8
      || !['admin', 'holder', 'auditor'].includes(role))
    return res.status(400).json({ error: 'INVALID_INPUT' });
  const hash = await bcrypt.hash(password, 10);
  const r = await pool.query('INSERT INTO users(email,password_hash,role) VALUES($1,$2,$3) RETURNING id,email,role',
    [email, hash, role]).catch((e) => { if (e.code === '23505') return null; throw e; });
  if (!r) return res.status(409).json({ error: 'EMAIL_EXISTS' });
  res.status(201).json(r.rows[0]);
}));

app.post('/api/accounts', auth, allow('admin'), wrap(async (req, res) => {
  const { ownerId, name, overdraftLimit = 0 } = req.body || {};
  if (!Number.isSafeInteger(ownerId) || typeof name !== 'string' || !name
      || !Number.isSafeInteger(overdraftLimit) || overdraftLimit < 0)
    return res.status(400).json({ error: 'INVALID_INPUT' });
  const r = await pool.query(
    `INSERT INTO accounts(owner_id,name,overdraft_limit) SELECT id,$2,$3 FROM users WHERE id=$1 AND role='holder' RETURNING *`,
    [ownerId, name, overdraftLimit]);
  if (!r.rowCount) return res.status(404).json({ error: 'HOLDER_NOT_FOUND' });
  res.status(201).json(r.rows[0]);
}));

app.get('/api/accounts', auth, wrap(async (req, res) => {
  const q = req.user.role === 'holder'
    ? pool.query(`SELECT * FROM accounts WHERE owner_id=$1 AND kind='customer' ORDER BY id`, [req.user.id])
    : pool.query(`SELECT * FROM accounts WHERE kind='customer' ORDER BY id`);
  res.json((await q).rows);
}));

app.get('/api/accounts/:id/statement', auth, wrap(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id)) return res.status(400).json({ error: 'INVALID_ACCOUNT' });
  const acc = (await pool.query('SELECT * FROM accounts WHERE id=$1 AND kind=$2', [id, 'customer'])).rows[0];
  if (!acc || (req.user.role === 'holder' && acc.owner_id !== req.user.id))
    return res.status(404).json({ error: 'ACCOUNT_NOT_FOUND' });
  const rows = (await pool.query(
    `SELECT * FROM (
       SELECT 'posting' AS kind, le.id, le.created_at, t.type, le.amount, le.balance_after,
              u.email AS initiated_by, t.id AS transaction_id, t.note
         FROM ledger_entries le JOIN transactions t ON t.id = le.transaction_id
         JOIN users u ON u.id = t.initiated_by WHERE le.account_id = $1
       UNION ALL
       SELECT 'refused', r.id, r.created_at, r.action, r.amount, NULL::bigint,
              u.email, NULL::bigint, r.reason
         FROM refused_attempts r LEFT JOIN users u ON u.id = r.user_id WHERE r.account_id = $1
     ) s ORDER BY created_at, kind, id LIMIT 500`, [id])).rows;
  res.json({ account: acc, entries: rows });
}));

function mover(type) {
  return wrap(async (req, res) => {
    const b = req.body || {};
    const idemKey = req.headers['idempotency-key'];
    const note = typeof b.note === 'string' ? b.note.slice(0, 200) : null;
    let r;
    if (type === 'deposit') r = { type, fromId: 1, toId: b.accountId, amount: b.amount };
    if (type === 'withdrawal') r = { type, fromId: b.accountId, toId: 1, amount: b.amount };
    if (type === 'transfer') r = { type, fromId: b.fromId, toId: b.toId, amount: b.amount };
    const out = await move(req.user, { ...r, note, idemKey });
    if (out.replayed) res.set('Idempotent-Replayed', 'true');
    res.status(out.code).json(out.body);
  });
}
app.post('/api/deposits', auth, mover('deposit'));
app.post('/api/withdrawals', auth, mover('withdrawal'));
app.post('/api/transfers', auth, mover('transfer'));

app.get('/api/audit/refused', auth, allow('admin', 'auditor'), wrap(async (req, res) =>
  res.json((await pool.query('SELECT * FROM refused_attempts ORDER BY id DESC LIMIT 200')).rows)));
app.get('/api/audit/replays', auth, allow('admin', 'auditor'), wrap(async (req, res) =>
  res.json((await pool.query('SELECT * FROM idempotency_replays ORDER BY id DESC LIMIT 200')).rows)));
app.get('/api/audit/conservation', auth, allow('admin', 'auditor'), wrap(async (req, res) => {
  const total = (await pool.query('SELECT COALESCE(SUM(balance),0) AS s FROM accounts')).rows[0].s;
  const badTx = (await pool.query(
    'SELECT transaction_id FROM ledger_entries GROUP BY transaction_id HAVING SUM(amount) <> 0')).rows;
  const badAcc = (await pool.query(
    `SELECT a.id FROM accounts a LEFT JOIN (SELECT account_id, SUM(amount) s FROM ledger_entries GROUP BY 1) l
       ON l.account_id = a.id WHERE a.balance <> COALESCE(l.s, 0)`)).rows;
  res.json({ sumOfAllBalances: Number(total), unbalancedTransactions: badTx, balancesNotMatchingLedger: badAcc,
             ok: Number(total) === 0 && !badTx.length && !badAcc.length });
}));

app.use((err, req, res, next) => {
  if (err instanceof LedgerError) return res.status(err.status).json({ error: err.code, message: err.message });
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'BAD_JSON' });
  console.error(err);
  res.status(500).json({ error: 'INTERNAL' });
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log('LedgerLine on', port));