const crypto = require('crypto');
const pool = require('./db');

const EXTERNAL_ID = 1;
const MAX_AMOUNT = 100_000_000_000; // 1e11 paise = Rs 1,000,000,000

class LedgerError extends Error {
  constructor(code, message, status = 422) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

const hashRequest = (o) =>
  crypto.createHash('sha256').update(JSON.stringify(o)).digest('hex');

function validate(user, { fromId, toId, amount, idemKey }) {
  if (user.role === 'auditor')
    throw new LedgerError('READ_ONLY_ROLE', 'Auditors cannot move money', 403);
  if (!Number.isSafeInteger(amount) || amount <= 0 || amount > MAX_AMOUNT)
    throw new LedgerError('INVALID_AMOUNT', 'Amount must be a positive whole number of paise', 400);
  if (typeof idemKey !== 'string' || idemKey.length === 0 || idemKey.length > 100)
    throw new LedgerError('MISSING_IDEMPOTENCY_KEY', 'Idempotency-Key is required (max 100 chars)', 400);
  if (!Number.isSafeInteger(fromId) || !Number.isSafeInteger(toId))
    throw new LedgerError('INVALID_ACCOUNT', 'Invalid account id', 400);
  if (fromId === toId)
    throw new LedgerError('SAME_ACCOUNT', 'Source and destination must differ', 400);
}

// Decided by the SERVER, on every request, using the locked rows.
function authorize(user, type, from, to) {
  if (type === 'deposit') {
    if (to.kind !== 'customer') throw new LedgerError('INVALID_ACCOUNT', 'Cannot deposit here', 400);
    if (user.role !== 'admin' && to.owner_id !== user.id)
      throw new LedgerError('NOT_OWNER', 'You do not own that account', 403);
  } else if (type === 'withdrawal') {
    if (from.kind !== 'customer' || from.owner_id !== user.id)
      throw new LedgerError('NOT_OWNER', 'You do not own that account', 403);
  } else if (type === 'transfer') {
    if (from.kind !== 'customer' || to.kind !== 'customer')
      throw new LedgerError('INVALID_ACCOUNT', 'Transfers are between customer accounts only', 400);
    if (from.owner_id !== user.id)
      throw new LedgerError('NOT_OWNER', 'You do not own the source account', 403);
  } else {
    throw new LedgerError('INVALID_TYPE', 'Unknown movement type', 400);
  }
}

async function move(user, req) {
  const { type, fromId, toId, amount, note = null, idemKey } = req;
  const requestHash = hashRequest({ type, fromId, toId, amount });
  const client = await pool.connect();
  let released = false;
  try {
    validate(user, req);
    await client.query('BEGIN');

    // 1. IDEMPOTENCY: try to claim the key. The primary key makes this atomic.
    //    If another request holds the same key and is still running, this
    //    INSERT waits until that one commits or rolls back.
    const claim = await client.query(
      `INSERT INTO idempotency_keys (user_id, key, request_hash)
       VALUES ($1, $2, $3) ON CONFLICT (user_id, key) DO NOTHING RETURNING key`,
      [user.id, idemKey, requestHash]
    );
    if (claim.rowCount === 0) {
      const old = (await client.query(
        `SELECT request_hash, response_code, response_body
           FROM idempotency_keys WHERE user_id = $1 AND key = $2`,
        [user.id, idemKey]
      )).rows[0];
      if (old.request_hash !== requestHash)
        throw new LedgerError('IDEMPOTENCY_KEY_REUSED', 'This key was used with a different request', 422);
      await client.query(
        `INSERT INTO idempotency_replays (user_id, key) VALUES ($1, $2)`,
        [user.id, idemKey]
      );
      await client.query('COMMIT');
      return { replayed: true, code: old.response_code, body: old.response_body };
    }

    // 2. LOCK both accounts, always in ascending id order (prevents deadlock).
    const ids = [...new Set([fromId, toId])].sort((a, b) => a - b);
    const { rows } = await client.query(
      `SELECT id, owner_id, kind, balance, overdraft_limit
         FROM accounts WHERE id = ANY($1::bigint[]) ORDER BY id FOR UPDATE`,
      [ids]
    );
    const from = rows.find((r) => r.id === fromId);
    const to = rows.find((r) => r.id === toId);
    if (!from || !to) throw new LedgerError('ACCOUNT_NOT_FOUND', 'Account not found', 404);

    // 3. AUTHORISE, then CHECK BALANCE. Both happen while we hold the locks.
    authorize(user, type, from, to);
    if (from.kind === 'customer' && from.balance - amount < -from.overdraft_limit)
      throw new LedgerError('INSUFFICIENT_FUNDS', 'Insufficient funds', 422);

    // 4. WRITE: transaction row, both balances, both ledger entries.
    const tx = (await client.query(
      `INSERT INTO transactions (type, initiated_by, note) VALUES ($1, $2, $3) RETURNING id`,
      [type, user.id, note]
    )).rows[0];
    await client.query(`UPDATE accounts SET balance = balance - $1 WHERE id = $2`, [amount, from.id]);
    await client.query(`UPDATE accounts SET balance = balance + $1 WHERE id = $2`, [amount, to.id]);
    await client.query(
      `INSERT INTO ledger_entries (transaction_id, account_id, amount, balance_after)
       VALUES ($1, $2, $3, $4), ($1, $5, $6, $7)`,
      [tx.id, from.id, -amount, from.balance - amount, to.id, amount, to.balance + amount]
    );

    // 5. Save the response under the key, in the SAME transaction.
    const body = {
      transactionId: tx.id, type, amount,
      balanceAfter: type === 'deposit' ? to.balance + amount : from.balance - amount,
    };
    await client.query(
      `UPDATE idempotency_keys
          SET status = 'completed', response_code = 201, response_body = $3, transaction_id = $4
        WHERE user_id = $1 AND key = $2`,
      [user.id, idemKey, body, tx.id]
    );
    await client.query('COMMIT');
    return { replayed: false, code: 201, body };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    // Release BEFORE logging, so the pool is not starved under concurrency.
    client.release();
    released = true;
    // The database's own floor check (backstop) counts as a refusal too.
    const e = err.code === '23514'
      ? new LedgerError('BALANCE_FLOOR', 'Balance floor violated', 422)
      : err;
    if (e instanceof LedgerError) {
      // Logged on a SEPARATE connection, after the rollback, so it survives.
      await pool.query(
        `INSERT INTO refused_attempts (user_id, action, account_id, amount, reason)
         VALUES ($1, $2, $3, $4, $5)`,
        [user.id, type, type === 'deposit' ? toId : fromId, Number.isSafeInteger(amount) ? amount : null, e.code]
      ).catch((x) => console.error('could not log refusal', x.message));
    }
    throw e;
  } finally {
    if (!released) client.release();
  }
}

module.exports = { move, LedgerError, EXTERNAL_ID };