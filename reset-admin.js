require('dotenv').config();
const bcrypt = require('bcrypt');
const pool = require('./db');
(async () => {
  const h = await bcrypt.hash('Admin#12345', 10);
  const r = await pool.query(
    `UPDATE users SET password_hash=$1 WHERE email='admin@ledgerline.test' RETURNING id,email,role`, [h]);
  console.log('Admin reset:', r.rows[0]);
  await pool.end();
})();