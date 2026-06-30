# FlowDesk Architecture Overview

FlowDesk is split into a Vite React frontend and a FastAPI backend.

## Frontend

- `frontend/src/pages` contains the major product surfaces: landing, auth, dashboard, snippets, notes, tasks, AI, timer, diff, compiler, and legal.
- `frontend/src/services/api` contains typed API clients.
- `frontend/src/store/authStore.ts` owns browser-side auth/session state.
- Build output is static and deploys cleanly to Vercel.

## Backend

- `backend/app/main.py` creates the FastAPI app, middleware, exception handlers, and health route.
- `backend/app/api/router.py` mounts versioned API modules under `/api/v1`.
- `backend/app/services` contains business logic for auth, snippets, notes, tasks, AI, payments, dashboard stats, and compiler execution.
- `backend/app/database` manages async SQLAlchemy connectivity and schema checks.

## Deployment

- Frontend: Vercel static build.
- Backend: Render Docker service.
- Database: Supabase PostgreSQL.
- Payments: Lemon Squeezy checkout plus webhook events.
- AI: provider keys loaded only from backend environment variables.

## Runtime Boundaries

Compiler execution is sandboxed by process timeout, code size, stdin size, output size, memory limits where supported, and per-user/per-global concurrency controls. It is designed for education and developer utilities, not arbitrary production workload execution.
