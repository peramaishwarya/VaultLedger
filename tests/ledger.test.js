const test = require('node:test');
const assert = require('node:assert/strict');
const pool = require('../db');
const { move } = require('../ledger');

const k = () => `k-${Date.now()}-${Math.random()}`;
const mkUser = async (role) => (await pool.query(
  `INSERT INTO users(email,password_hash,role) VALUES($1,'x',$2) RETURNING id,role`,
  [`t${Date.now()}${Math.random()}@test.com`, role])).rows[0];
const mkAcc = async (u) => (await pool.query(
  `INSERT INTO accounts(owner_id,name) VALUES($1,'T') RETURNING id`, [u.id])).rows[0].id;
const bal = async (id) => (await pool.query('SELECT balance FROM accounts WHERE id=$1', [id])).rows[0].balance;
const dep = (u, to, amount, idemKey = k()) => move(u, { type: 'deposit', fromId: 1, toId: to, amount, idemKey });
const wd = (u, from, amount, idemKey = k()) => move(u, { type: 'withdrawal', fromId: from, toId: 1, amount, idemKey });
const tr = (u, fromId, toId, amount, idemKey = k()) => move(u, { type: 'transfer', fromId, toId, amount, idemKey });

test.after(() => pool.end());

test('conservation: mixed concurrent traffic keeps books balanced', async () => {
  const u = await mkUser('holder'); const a = await mkAcc(u); const b = await mkAcc(u);
  await dep(u, a, 100000);
  const jobs = [
    ...Array.from({ length: 10 }, () => tr(u, a, b, 1000)),
    ...Array.from({ length: 5 }, () => tr(u, b, a, 500)),
    ...Array.from({ length: 3 }, () => wd(u, a, 700)),
  ];
  await Promise.allSettled(jobs);
  const total = Number((await pool.query('SELECT SUM(balance) s FROM accounts')).rows[0].s);
  assert.equal(total, 0, 'sum of all balances must be 0');
  const bad = (await pool.query('SELECT 1 FROM ledger_entries GROUP BY transaction_id HAVING SUM(amount)<>0')).rowCount;
  assert.equal(bad, 0, 'every transaction must net to zero');
  assert.equal((await bal(a)) + (await bal(b)), 100000 - 3 * 700, 'only external flows change the total');
});

test('concurrency: 30 parallel withdrawals cannot overdraw', async () => {
  const u = await mkUser('holder'); const a = await mkAcc(u);
  await dep(u, a, 50000);
  const res = await Promise.allSettled(Array.from({ length: 30 }, () => wd(u, a, 10000)));
  assert.equal(res.filter((r) => r.status === 'fulfilled').length, 5);
  assert.equal(await bal(a), 0);
});

test('idempotency: same key 10x at once moves money once', async () => {
  const u = await mkUser('holder'); const a = await mkAcc(u);
  await dep(u, a, 10000);
  const key = k();
  const res = await Promise.all(Array.from({ length: 10 }, () => wd(u, a, 1000, key)));
  assert.equal(res.filter((r) => !r.replayed).length, 1);
  assert.equal(await bal(a), 9000);
  const n = (await pool.query('SELECT COUNT(*)::int c FROM idempotency_replays WHERE user_id=$1 AND key=$2', [u.id, key])).rows[0].c;
  assert.equal(n, 9, 'duplicates are recorded in the data');
});

test('idempotency: same key with a different body is rejected', async () => {
  const u = await mkUser('holder'); const a = await mkAcc(u);
  await dep(u, a, 10000);
  const key = k();
  await wd(u, a, 1000, key);
  await assert.rejects(wd(u, a, 2000, key), { code: 'IDEMPOTENCY_KEY_REUSED' });
  assert.equal(await bal(a), 9000);
});

test('authorisation: one user cannot move another user\'s money', async () => {
  const alice = await mkUser('holder'); const bob = await mkUser('holder');
  const a = await mkAcc(alice); const b = await mkAcc(bob);
  await dep(alice, a, 10000);
  await assert.rejects(wd(bob, a, 1000), { code: 'NOT_OWNER' });
  await assert.rejects(tr(bob, a, b, 1000), { code: 'NOT_OWNER' });
  await assert.rejects(dep(bob, a, 1000), { code: 'NOT_OWNER' });
  assert.equal(await bal(a), 10000);
  assert.equal(await bal(b), 0);
  const logged = (await pool.query(`SELECT COUNT(*)::int c FROM refused_attempts WHERE user_id=$1 AND reason='NOT_OWNER'`, [bob.id])).rows[0].c;
  assert.equal(logged, 3, 'refusals are recorded');
});

test('role: auditor cannot move money', async () => {
  const aud = await mkUser('auditor'); const u = await mkUser('holder'); const a = await mkAcc(u);
  await assert.rejects(dep(aud, a, 1000), { code: 'READ_ONLY_ROLE' });
});

test('invalid amounts are refused', async () => {
  const u = await mkUser('holder'); const a = await mkAcc(u);
  for (const amount of [0, -5, 1.5, NaN, '100', 1e15])
    await assert.rejects(dep(u, a, amount), { code: 'INVALID_AMOUNT' });
});

test('append-only: ledger rows cannot be changed or deleted', async () => {
  const u = await mkUser('holder'); const a = await mkAcc(u);
  await dep(u, a, 1000);
  await assert.rejects(pool.query('UPDATE ledger_entries SET amount = amount + 1 WHERE account_id=$1', [a]), /append-only/);
  await assert.rejects(pool.query('DELETE FROM ledger_entries WHERE account_id=$1', [a]), /append-only/);
});

test('no deadlock: opposite transfers at once all settle', async () => {
  const u = await mkUser('holder'); const a = await mkAcc(u); const b = await mkAcc(u);
  await dep(u, a, 100000); await dep(u, b, 100000);
  const res = await Promise.allSettled(Array.from({ length: 40 }, (_, i) => i % 2 ? tr(u, a, b, 100) : tr(u, b, a, 100)));
  assert.equal(res.filter((r) => r.status === 'fulfilled').length, 40);
  assert.equal((await bal(a)) + (await bal(b)), 200000);
});