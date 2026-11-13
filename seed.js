require('dotenv').config();
const bcrypt = require('bcrypt');
const pool = require('./db');
const { move } = require('./ledger');

async function user(email, pw, role) {
  const h = await bcrypt.hash(pw, 10);
  return (await pool.query(
    `INSERT INTO users(email,password_hash,role) VALUES($1,$2,$3)
     ON CONFLICT (email) DO UPDATE SET password_hash=EXCLUDED.password_hash RETURNING id,role`, [email, h, role])).rows[0];
}
(async () => {
  await user('admin@ledgerline.test', 'Admin#12345', 'admin');
  await user('auditor@ledgerline.test', 'Audit#12345', 'auditor');
  const alice = await user('alice@ledgerline.test', 'Alice#12345', 'holder');
  const bob = await user('bob@ledgerline.test', 'Bob#123456', 'holder');
  const a = (await pool.query(`INSERT INTO accounts(owner_id,name) VALUES($1,'Alice Main') RETURNING id`, [alice.id])).rows[0];
  const b = (await pool.query(`INSERT INTO accounts(owner_id,name) VALUES($1,'Bob Main') RETURNING id`, [bob.id])).rows[0];
  const run = Date.now();
  await move(alice, { type: 'deposit', fromId: 1, toId: a.id, amount: 500000, idemKey: `seed-a-${run}` });
  await move(bob, { type: 'deposit', fromId: 1, toId: b.id, amount: 200000, idemKey: `seed-b-${run}` });
  console.log('Seeded. Alice account', a.id, 'Bob account', b.id);
  await pool.end();
})();