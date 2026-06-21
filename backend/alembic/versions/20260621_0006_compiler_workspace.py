"""Create compiler workspace tables.

Revision ID: 20260621_0006
Revises: 20260621_0005
Create Date: 2026-06-21
"""

from alembic import op


revision = "20260621_0006"
down_revision = "20260621_0005"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS pgcrypto")
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS compiler_files (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            title VARCHAR(200) NOT NULL,
            language VARCHAR(40) NOT NULL,
            code TEXT NOT NULL,
            stdin TEXT NOT NULL DEFAULT '',
            output TEXT NOT NULL DEFAULT '',
            is_pinned BOOLEAN NOT NULL DEFAULT FALSE,
            run_count INTEGER NOT NULL DEFAULT 0,
            last_run_at TIMESTAMPTZ,
            created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
            deleted_at TIMESTAMPTZ,
            CONSTRAINT compiler_file_run_count_nonnegative CHECK (run_count >= 0)
        )
        """
    )
    op.execute("CREATE INDEX IF NOT EXISTS ix_compiler_files_user_updated ON compiler_files (user_id, updated_at)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_compiler_files_user_language ON compiler_files (user_id, language)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_compiler_files_user_pinned ON compiler_files (user_id, is_pinned)")

    op.execute(
        """
        CREATE TABLE IF NOT EXISTS compiler_run_events (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            compiler_file_id UUID REFERENCES compiler_files(id) ON DELETE SET NULL,
            language VARCHAR(40) NOT NULL,
            status VARCHAR(40) NOT NULL,
            duration_ms INTEGER NOT NULL DEFAULT 0,
            output_size INTEGER NOT NULL DEFAULT 0,
            created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
            CONSTRAINT compiler_run_valid_status
                CHECK (status IN ('success', 'error', 'timeout', 'rejected', 'unsupported', 'disabled')),
            CONSTRAINT compiler_run_duration_nonnegative CHECK (duration_ms >= 0),
            CONSTRAINT compiler_run_output_size_nonnegative CHECK (output_size >= 0)
        )
        """
    )
    op.execute("CREATE INDEX IF NOT EXISTS ix_compiler_run_events_user_created ON compiler_run_events (user_id, created_at)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_compiler_run_events_file_created ON compiler_run_events (compiler_file_id, created_at)")

    op.execute(
        """
        CREATE OR REPLACE FUNCTION flowdesk_set_updated_at()
        RETURNS TRIGGER AS $$
        BEGIN
            NEW.updated_at = CURRENT_TIMESTAMP;
            RETURN NEW;
        END;
        $$ LANGUAGE plpgsql
        """
    )
    op.execute("DROP TRIGGER IF EXISTS trg_compiler_files_updated_at ON compiler_files")
    op.execute(
        """
        CREATE TRIGGER trg_compiler_files_updated_at
        BEFORE UPDATE ON compiler_files
        FOR EACH ROW
        EXECUTE FUNCTION flowdesk_set_updated_at()
        """
    )


def downgrade() -> None:
    op.execute("DROP TRIGGER IF EXISTS trg_compiler_files_updated_at ON compiler_files")
    op.execute("DROP TABLE IF EXISTS compiler_run_events")
    op.execute("DROP TABLE IF EXISTS compiler_files")
