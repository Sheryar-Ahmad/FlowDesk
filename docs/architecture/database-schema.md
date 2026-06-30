# Database Schema Notes

FlowDesk uses PostgreSQL-compatible SQL through SQLAlchemy and migration helpers.

## Core Tables

- `users`: account identity, plan, quota metadata, and auth fields.
- `snippets`: saved code snippets scoped by owner.
- `notes`: developer notes and rich-text content scoped by owner.
- `tasks`, `task_projects`, `task_columns`: project boards, cards, and workflow columns.
- `ai_sessions`, `ai_messages`: AI chat history and session metadata.
- `focus_sessions`: timer history and dashboard focus totals.
- `compiler_files`: saved compiler workspace files.
- `compiler_run_events`: compiler usage history, status, duration, and output size.
- `payment_events` / subscription-related fields: Lemon Squeezy billing sync.

## Ownership

Application queries must always scope user content by authenticated `user_id`. Supabase row-level security should mirror the same ownership rule for direct database protection.

## Launch Checklist

- Apply all migrations before serving production traffic.
- Confirm `DATABASE_URL` points to the production Supabase pooler or direct connection recommended for the hosting plan.
- Enable SSL for production database traffic.
- Back up the database before destructive migrations.
