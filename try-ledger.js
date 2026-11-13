const pool = require('./db');
const { move } = require('./ledger');

async function main() {
  const u = (await pool.query(
    `INSERT INTO users (email, password_hash, role) VALUES ('demo@test.com','x','holder')
     ON CONFLICT (email) DO UPDATE SET email = EXCLUDED.email RETURNING id, role`)).rows[0];
  const acc = (await pool.query(
    `INSERT INTO accounts (owner_id, name) VALUES ($1,'Demo') RETURNING id`, [u.id])).rows[0];
  const user = { id: u.id, role: u.role };
  const run = Date.now();

  await move(user, { type: 'deposit', fromId: 1, toId: acc.id, amount: 50000, idemKey: `dep-${run}` });

  // RACE: 20 withdrawals of 10000 at once against a balance of 50000
  const res = await Promise.allSettled(Array.from({ length: 20 }, (_, i) =>
    move(user, { type: 'withdrawal', fromId: acc.id, toId: 1, amount: 10000, idemKey: `w-${run}-${i}` })));
  console.log('succeeded:', res.filter(r => r.status === 'fulfilled').length, '(expect 5)');

  const bal = (await pool.query(`SELECT balance FROM accounts WHERE id=$1`, [acc.id])).rows[0].balance;
  console.log('balance:', bal, '(expect 0)');

  // RETRY: same key sent twice at once
  await move(user, { type: 'deposit', fromId: 1, toId: acc.id, amount: 1000, idemKey: `d2-${run}` });
  const same = await Promise.all([1, 2].map(() =>
    move(user, { type: 'withdrawal', fromId: acc.id, toId: 1, amount: 400, idemKey: `same-${run}` })));
  console.log('replayed flags:', same.map(r => r.replayed), '(expect one true, one false)');

  const bal2 = (await pool.query(`SELECT balance FROM accounts WHERE id=$1`, [acc.id])).rows[0].balance;
  console.log('balance:', bal2, '(expect 600)');

  const sum = (await pool.query(`SELECT SUM(balance) AS s FROM accounts`)).rows[0].s;
  console.log('sum of ALL balances:', sum, '(expect 0)');
  await pool.end();
}
main().catch((e) => { console.error(e); process.exit(1); });