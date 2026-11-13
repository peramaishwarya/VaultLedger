# PROMPTS.md — VaultLedger

## 1. Project Overview

VaultLedger is a secure, web-based ledger management application built using Node.js, Express, PostgreSQL, and JavaScript.

The application manages users, accounts, deposits, withdrawals, transfers, and transaction history. It uses a double-entry ledger system to maintain accurate and auditable financial records.

This is an educational/demo project. It does not process real money.

## 2. AI Assistance

AI assistance may be used during development to:
- Understand project requirements and architecture.
- Generate and improve application code.
- Identify potential bugs and suggest fixes.
- Improve input validation and error handling.
- Review authentication and authorization logic.
- Prepare project documentation and test cases.

## 3. Development Prompts

The following prompts describe the types of AI assistance used during development.

### Project Setup
"Help create a Node.js and Express application connected to PostgreSQL with a clear project structure and environment configuration."

### Database Design
"Design a PostgreSQL database schema for users, accounts, ledger entries, and audit records. Include appropriate constraints and relationships."

### Authentication
"Implement secure user authentication using bcrypt password hashing and JWT-based authentication."

### Role-Based Access Control
"Implement admin, account holder, and auditor roles with appropriate permissions. Ensure users can only access permitted operations and data."

### Ledger Transactions
"Implement deposits, withdrawals, and transfers using double-entry accounting. Store all monetary amounts as integer paise rather than floating-point values."

### Transaction Safety
"Use database transactions and row-level locking to prevent race conditions, duplicate transactions, and incorrect account balances."

### Idempotency
"Implement idempotency checks so that retrying the same transaction does not create duplicate ledger entries."

### Audit Logging
"Record refused transactions and relevant audit events. Prevent unauthorized modification of existing ledger records."

### Testing
"Write automated tests for authentication, permissions, deposits, withdrawals, transfers, idempotency, and ledger balance conservation."

### Documentation
"Prepare clear project documentation explaining setup, environment variables, API endpoints, security controls, and testing instructions."

## 4. Human Review and Verification

AI-generated suggestions were reviewed and tested before being used.

The developer is responsible for:
- Checking generated code.
- Verifying database operations.
- Testing authentication and permissions.
- Reviewing transaction correctness.
- Fixing errors found during testing.
- Confirming that the application works as expected.

## 5. Limitations

AI-generated code may contain mistakes or security weaknesses. It must not be treated as automatically correct.

All important application behavior must be verified through code review and testing.

## 6. Final Note

AI was used as a development assistant. The final implementation, testing, review, and project decisions remain the responsibility of the developer.