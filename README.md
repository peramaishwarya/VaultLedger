# VaultLedger

**Money movement with a double-entry ledger you can prove.**

VaultLedger is a secure financial ledger management system built using Node.js, Express, PostgreSQL (Neon), and JavaScript. It supports deposits, withdrawals, transfers, role-based access control, transaction tracking, and audit verification.

- **Live site:** Add your Render deployment URL here.
- **Repository:** https://github.com/peramaishwarya/VaultLedger
- **Database:** PostgreSQL (Neon)
- **Money format:** Integer paise (10000 = ₹100.00). No floating-point arithmetic is used.

## Demo Accounts (Evaluation Only)

These accounts contain fake money and are provided for project evaluation.

| Role | Email | Password |
|---|---|---|
| Admin | admin@ledgerline.test | Admin#12345 |
| Account Holder | alice@ledgerline.test | Alice#12345 |
| Account Holder | bob@ledgerline.test | Bob#123456 |
| Auditor | auditor@ledgerline.test | Audit#12345 |

## Technologies Used

- Node.js
- Express.js
- PostgreSQL
- Neon Database
- JavaScript
- JSON Web Tokens (JWT)
- bcrypt
- HTML, CSS, JavaScript

## Features

- Secure user authentication
- Role-based access control
- Account creation and management
- Deposits and withdrawals
- Account-to-account transfers
- Double-entry bookkeeping
- Transaction history and statements
- Idempotency protection against duplicate transactions
- Database-level balance constraints
- Append-only financial records
- Audit and conservation verification
- Concurrent transaction safety

## Run Locally

### Requirements

- Node.js 20 or higher
- npm
- PostgreSQL database (Neon recommended)

### 1. Clone the repository

```bash
git clone https://github.com/peramaishwarya/VaultLedger.git
cd VaultLedger
```

### 2. Install dependencies

```bash
npm install
```

### 3. Configure environment variables

Create a `.env` file in the project root.

```env
DATABASE_URL=postgresql://user:password@host/dbname?sslmode=require
JWT_SECRET=your_secure_random_secret
```

Generate a secure JWT secret:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

Never commit your `.env` file to GitHub.

### 4. Apply the database schema

Run this command once on an empty database:

```bash
node apply-schema.js
```

This creates the required tables, constraints, and append-only database triggers.

### 5. Seed demo accounts

```bash
npm run seed
```

This creates the four demo users and two initial accounts.

### 6. Start the application

```bash
npm start
```

Open:

```text
http://localhost:3000
```

## Available Commands

| Command | Description |
|---|---|
| `npm install` | Install dependencies |
| `node apply-schema.js` | Create database schema |
| `npm run seed` | Insert demo users and accounts |
| `npm start` | Start the application |
| `npm test` | Run automated tests |

## User Roles and Permissions

| Role | Permissions |
|---|---|
| Admin | Create users and accounts, view all accounts, deposit into accounts, and access audit endpoints |
| Account Holder | View owned accounts, deposit, withdraw, and transfer money from owned accounts |
| Auditor | Read-only access to accounts, statements, and audit endpoints |

All permissions are verified by the server using database records.

## API Endpoints

All request bodies use JSON. Protected endpoints require a Bearer token.

| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/login` | Authenticate users |
| POST | `/api/users` | Create users |
| POST | `/api/accounts` | Create accounts |
| GET | `/api/accounts` | View accounts |
| GET | `/api/accounts/:id/statement` | View account statements |
| POST | `/api/deposits` | Deposit money |
| POST | `/api/withdrawals` | Withdraw money |
| POST | `/api/transfers` | Transfer money |
| GET | `/api/audit/refused` | View refused transactions |
| GET | `/api/audit/replays` | View duplicate request records |
| GET | `/api/audit/conservation` | Verify ledger integrity |

## Double-Entry Ledger

Every financial movement creates:

1. One transaction record.
2. Two corresponding ledger entries.
3. Equal and opposite signed amounts.
4. Updated account balances.

Every transaction must satisfy:

```text
Total Debits + Total Credits = 0
```

Deposits and withdrawals use an external account to maintain ledger balance.

## Security and Integrity

- Password hashing using bcrypt.
- JWT-based authentication.
- Server-side role verification.
- Database row locking using `SELECT FOR UPDATE`.
- Idempotency keys to prevent duplicate transactions.
- PostgreSQL constraints to prevent invalid balances.
- Append-only triggers protecting financial records.
- Transaction rollback when operations fail.
- Separate recording of refused transaction attempts.

## Automated Tests

Run:

```bash
npm test
```

The test suite covers:

- Concurrent transaction safety.
- Prevention of account overdrafts.
- Duplicate request protection.
- Idempotency key validation.
- Unauthorized transaction attempts.
- Auditor read-only restrictions.
- Invalid transaction amounts.
- Append-only database triggers.
- Opposite transfer concurrency.

**Important:** Tests write permanent records into the database specified by `DATABASE_URL`. Always use a separate scratch database for testing, not your production database.

## Deployment (Render)

1. Push the repository to GitHub.
2. Open [Render](https://render.com/).
3. Create a new Web Service.
4. Connect your GitHub repository.
5. Set the build command:

```bash
npm install
```

6. Set the start command:

```bash
npm start
```

7. Add these environment variables:

```text
DATABASE_URL
JWT_SECRET
```

8. Before starting the deployed application, prepare the production database once from your local machine:

```bash
node apply-schema.js
npm run seed
```

Make sure your local `.env` points to the production Neon database when running these commands.

## Project Structure

```text
VaultLedger/
├── schema.sql
├── apply-schema.js
├── package.json
├── server.js
├── ledger.js
├── db.js
├── seed.js
├── public/
│   └── index.html
├── tests/
│   └── ledger.test.js
├── THREATS.md
├── PROMPTS.md
└── README.md
```

## Future Improvements

- Multi-currency support.
- Transaction reversals and refunds.
- Scheduled transfers.
- Hash-chained ledger verification.
- AI-based anomaly detection.
- Token revocation.
- User and account management interface.

## Documentation

- `THREATS.md` – Security threat model and identified risks.
- `PROMPTS.md` – AI usage documentation.

---

**VaultLedger – Secure transactions. Transparent records. Verifiable balances.**