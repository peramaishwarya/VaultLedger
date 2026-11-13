require('dotenv').config();
const pg = require('pg');

// Postgres returns BIGINT as a string by default. Parse it to a number.
// Safe because our amounts stay far below 2^53 paise.
pg.types.setTypeParser(20, (v) => parseInt(v, 10));

module.exports = new pg.Pool({ connectionString: process.env.DATABASE_URL });