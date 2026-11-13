# THREATS.md — VaultLedger Threat Model

## 1. Project Scope

VaultLedger is an educational/demo ledger management application built using Node.js, Express, PostgreSQL, and JavaScript.

It supports account management, deposits, withdrawals, transfers, and transaction auditing.

This application is not a real banking system and must not be used to store or transfer real money.

This document identifies potential security threats and the controls used to reduce them.

## 2. Assets to Protect

The important assets of the application include:

- User account information.
- Hashed user passwords.
- Authentication tokens.
- Account balances.
- Ledger transaction records.
- Audit logs.
- Database credentials and environment variables.

## 3. Potential Threats and Mitigations

### 3.1 Unauthorized Access

**Threat:** An unauthorized person may try to access protected application features.

**Mitigation:**
- Use JWT-based authentication.
- Verify authentication tokens on protected routes.
- Apply role-based access control.
- Reject requests from unauthenticated users.

### 3.2 Password Theft

**Threat:** Attackers may attempt to obtain user passwords.

**Mitigation:**
- Hash passwords using bcrypt.
- Never store plain-text passwords.
- Avoid exposing sensitive authentication information in API responses.

### 3.3 Privilege Escalation

**Threat:** A user may try to perform operations that are not allowed for their role.

**Mitigation:**
- Enforce permissions on the server.
- Restrict admin, account holder, and auditor operations.
- Never rely only on frontend restrictions.

### 3.4 Unauthorized Account Access

**Threat:** A user may try to view or modify another user's account.

**Mitigation:**
- Verify account ownership before account operations.
- Check authorization on every protected endpoint.
- Restrict account access according to user roles.

### 3.5 SQL Injection

**Threat:** Attackers may insert malicious SQL through application inputs.

**Mitigation:**
- Use parameterized SQL queries.
- Validate user input.
- Avoid constructing SQL queries using untrusted input.

### 3.6 Duplicate Transactions

**Threat:** Repeated requests may create duplicate deposits, withdrawals, or transfers.

**Mitigation:**
- Use idempotency keys.
- Check whether a transaction has already been processed.
- Prevent duplicate ledger entries.

### 3.7 Incorrect Balances and Race Conditions

**Threat:** Simultaneous transactions may cause incorrect account balances.

**Mitigation:**
- Use PostgreSQL database transactions.
- Apply row-level locking using `SELECT ... FOR UPDATE`.
- Keep related ledger operations atomic.
- Ensure every transaction preserves ledger balance conservation.

### 3.8 Negative or Invalid Amounts

**Threat:** Users may submit zero, negative, or invalid transaction amounts.

**Mitigation:**
- Validate transaction amounts on the server.
- Store monetary values as integer paise.
- Reject invalid amounts before processing.

### 3.9 Audit Log Tampering

**Threat:** Someone may attempt to modify or delete existing financial records.

**Mitigation:**
- Use append-only ledger records.
- Apply database triggers to prevent unauthorized updates and deletions.
- Record refused transactions and relevant audit events.

### 3.10 Secret Exposure

**Threat:** Database credentials or JWT secrets may be exposed.

**Mitigation:**
- Store secrets in environment variables.
- Keep `.env` out of Git.
- Use strong, randomly generated JWT secrets.
- Never commit database credentials to the repository.

### 3.11 Brute-Force Login Attempts

**Threat:** Attackers may repeatedly attempt to guess account passwords.

**Mitigation:**
- Apply rate limiting to authentication routes.
- Use secure password hashing.
- Return appropriate authentication errors without exposing sensitive details.

## 4. Security Assumptions

- Users have access only to the features permitted by their roles.
- The database is protected through appropriate access credentials.
- Environment variables are configured securely.
- The application is deployed over HTTPS in production.
- The application is used only for demonstration and educational purposes.

## 5. Known Limitations

VaultLedger is a demonstration project and is not a certified banking application.

It does not provide:
- Real banking integrations.
- Real-money payment processing.
- Regulatory banking compliance.
- Production-grade fraud detection.
- Independent security certification.

Additional security reviews and testing would be required before any real-world financial use.

## 6. Conclusion

VaultLedger uses authentication, role-based access control, parameterized queries, database transactions, idempotency checks, and audit protections to reduce common application security risks.

Security controls should be reviewed and tested regularly as the application develops.