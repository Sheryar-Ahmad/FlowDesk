"""Protect server-owned tables from direct Supabase API access.

Revision ID: 20260926_0007
Revises: 20260621_0006
"""

from alembic import op

revision = "20260926_0007"
down_revision = "20260621_0006"
branch_labels = None
depends_on = None

# FlowDesk authenticates in FastAPI, not Supabase Auth. No browser role should
# access these tables, even when a snippet has is_public set. The API enforces
# ownership; its database role must own these tables or have BYPASSRLS.
TABLES = (
    "users", "refresh_tokens", "email_verification_tokens", "password_reset_tokens",
    "oauth_handoff_codes", "collections", "snippets", "tags", "snippet_tags",
    "notes", "note_versions", "projects", "kanban_columns", "tasks",
    "pomodoro_sessions", "ai_sessions", "audit_logs", "subscriptions",
    "payment_webhook_events", "compiler_files", "compiler_run_events",
    "alembic_version",
)


def upgrade() -> None:
    for table, column in (
        ("collections", "parent_id"), ("note_versions", "user_id"),
        ("snippets", "collection_id"), ("snippet_tags", "tag_id"),
        ("kanban_columns", "user_id"),
    ):
        op.execute(f'CREATE INDEX IF NOT EXISTS "ix_{table}_{column}" ON "{table}" ("{column}")')
    for table in TABLES:
        op.execute(f'ALTER TABLE public."{table}" ENABLE ROW LEVEL SECURITY')
        # Role checks keep this migration usable with ordinary local Postgres.
        for role in ("anon", "authenticated"):
            op.execute(f"""
                DO $$ BEGIN
                    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '{role}') THEN
                        REVOKE ALL ON TABLE public."{table}" FROM "{role}";
                    END IF;
                END $$;
            """)
        op.execute(f'REVOKE ALL ON TABLE public."{table}" FROM PUBLIC')


def downgrade() -> None:
    # Do not silently expose private data during an application rollback.
    # Reversing this hardening requires a deliberate database access review.
    pass
