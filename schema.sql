-- USERS -------------------------------------------------------
CREATE TABLE users (
  id            BIGSERIAL PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL CHECK (role IN ('admin','holder','auditor')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ACCOUNTS ----------------------------------------------------
-- Money is stored as integer paise. 10000 = Rs 100.00. Never floats.
CREATE TABLE accounts (
  id              BIGSERIAL PRIMARY KEY,
  owner_id        BIGINT REFERENCES users(id),      -- NULL for the EXTERNAL account
  name            TEXT NOT NULL,
  kind            TEXT NOT NULL DEFAULT 'customer' CHECK (kind IN ('customer','external')),
  balance         BIGINT NOT NULL DEFAULT 0,
  overdraft_limit BIGINT NOT NULL DEFAULT 0 CHECK (overdraft_limit >= 0),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Backstop: the database itself refuses a balance below the floor.
  CONSTRAINT balance_floor CHECK (kind = 'external' OR balance >= -overdraft_limit)
);

-- The single "outside world" account. Deposits come FROM it, withdrawals go TO it.
INSERT INTO accounts (id, name, kind) VALUES (1, 'EXTERNAL', 'external');
SELECT setval('accounts_id_seq', 1);

-- TRANSACTIONS (one row per movement) -------------------------
CREATE TABLE transactions (
  id           BIGSERIAL PRIMARY KEY,
  type         TEXT NOT NULL CHECK (type IN ('deposit','withdrawal','transfer','adjustment')),
  initiated_by BIGINT NOT NULL REFERENCES users(id),
  note         TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- LEDGER ENTRIES (double-entry, signed amounts) ---------------
-- amount > 0 = credit to that account, amount < 0 = debit.
-- Every transaction's entries must sum to exactly 0.
CREATE TABLE ledger_entries (
  id             BIGSERIAL PRIMARY KEY,
  transaction_id BIGINT NOT NULL REFERENCES transactions(id),
  account_id     BIGINT NOT NULL REFERENCES accounts(id),
  amount         BIGINT NOT NULL CHECK (amount <> 0),
  balance_after  BIGINT NOT NULL,                   -- running balance for the statement
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON ledger_entries (account_id, id);
CREATE INDEX ON ledger_entries (transaction_id);

-- IDEMPOTENCY -------------------------------------------------
CREATE TABLE idempotency_keys (
  user_id        BIGINT NOT NULL REFERENCES users(id),
  key            TEXT   NOT NULL,
  request_hash   TEXT   NOT NULL,                   -- hash of method+path+body
  status         TEXT   NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress','completed')),
  response_code  INT,
  response_body  JSONB,
  transaction_id BIGINT REFERENCES transactions(id),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, key)                        -- the database enforces uniqueness
);

-- DUPLICATE LOG: every time a key is replayed, record it (the brief asks to "show in the data")
CREATE TABLE idempotency_replays (
  id         BIGSERIAL PRIMARY KEY,
  user_id    BIGINT NOT NULL,
  key        TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- REFUSED ATTEMPTS --------------------------------------------
CREATE TABLE refused_attempts (
  id         BIGSERIAL PRIMARY KEY,
  user_id    BIGINT REFERENCES users(id),
  action     TEXT NOT NULL,
  account_id BIGINT,
  amount     BIGINT,
  reason     TEXT NOT NULL,                         -- e.g. INSUFFICIENT_FUNDS, NOT_OWNER
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- APPEND-ONLY ENFORCEMENT -------------------------------------
CREATE FUNCTION forbid_change() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION '% on % is forbidden: table is append-only', TG_OP, TG_TABLE_NAME;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER ledger_no_change BEFORE UPDATE OR DELETE ON ledger_entries
  FOR EACH ROW EXECUTE FUNCTION forbid_change();
CREATE TRIGGER ledger_no_truncate BEFORE TRUNCATE ON ledger_entries
  FOR EACH STATEMENT EXECUTE FUNCTION forbid_change();

CREATE TRIGGER tx_no_change BEFORE UPDATE OR DELETE ON transactions
  FOR EACH ROW EXECUTE FUNCTION forbid_change();
CREATE TRIGGER refused_no_change BEFORE UPDATE OR DELETE ON refused_attempts
  FOR EACH ROW EXECUTE FUNCTION forbid_change();