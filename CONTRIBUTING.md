# Contributing

## Local Setup

1. Copy `.env.example` to `.env`.
2. Start PostgreSQL and configure `DATABASE_URL`.
3. Install backend dependencies from `backend/requirements-dev.txt`.
4. Install frontend dependencies with `npm ci` in `frontend`.
5. Apply migrations with `alembic -c alembic.ini upgrade head` from `backend`.

## Required Checks

Run these before opening a pull request:

```bash
cd backend
python -m compileall -q app tests
python -m pytest -q

cd ../frontend
npm run lint
npm run build
```

Keep changes focused, add tests for behavior changes, and never commit secrets
or generated dependency directories.
