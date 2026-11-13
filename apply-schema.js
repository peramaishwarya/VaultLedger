require('dotenv').config();
const fs = require('fs');
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
pool.query(fs.readFileSync('schema.sql', 'utf8'))
  .then(() => console.log('Schema applied'))
  .catch(e => console.error('Failed:', e.message))
  .finally(() => pool.end());