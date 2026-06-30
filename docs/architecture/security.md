# Security Notes

FlowDesk is designed around backend-held secrets, authenticated APIs, scoped database access, and conservative execution limits.

## Secrets

- Never expose provider keys in frontend code.
- Store `DATABASE_URL`, AI keys, OAuth secrets, Lemon Squeezy keys, and email keys in deployment environment variables.
- Rotate keys immediately if they are pasted into logs, screenshots, commits, or support messages.

## Authentication

- Email/password and Google OAuth both resolve into backend-issued sessions.
- Protected frontend routes still rely on backend authorization for real enforcement.
- Login and sensitive API routes should remain rate-limited.

## Compiler Safety

- Compiler runs are constrained by timeout, output size, stdin size, code size, run quotas, and concurrency limits.
- C/C++/Java runtimes are installed only in the backend Docker image.
- Public compiler execution should not allow network access, persistent filesystem writes outside temp directories, or unrestricted long-running workloads.

## Payments

- Lemon Squeezy webhook signatures must be verified before plan upgrades.
- The frontend must never be trusted as proof of payment.
- Plan and quota changes should come from backend payment state.

## Pre-Launch Review

- Confirm production CORS origins.
- Confirm trusted hosts.
- Confirm HTTPS URLs in OAuth and Lemon Squeezy callbacks.
- Confirm no real secrets are committed.
- Confirm database backups and rollback plan.
