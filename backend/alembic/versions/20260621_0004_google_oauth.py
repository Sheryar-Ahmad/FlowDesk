"""Add Google OAuth account linking.

Revision ID: 20260621_0004
Revises: 20260621_0003
Create Date: 2026-06-21
"""
from typing import Sequence

from alembic import op


revision: str = "20260621_0004"
down_revision: str | Sequence[str] | None = "20260621_0003"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS google_sub VARCHAR(255)")
    op.execute(
        """
        ALTER TABLE users
        ADD COLUMN IF NOT EXISTS auth_provider VARCHAR(40) NOT NULL DEFAULT 'password'
        """
    )
    op.execute(
        """
        CREATE UNIQUE INDEX IF NOT EXISTS ix_users_google_sub
        ON users (google_sub)
        WHERE google_sub IS NOT NULL AND deleted_at IS NULL
        """
    )
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS oauth_handoff_codes (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            code_hash VARCHAR(64) NOT NULL,
            expires_at TIMESTAMPTZ NOT NULL,
            used_at TIMESTAMPTZ,
            ip_address INET,
            created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
        """
    )
    op.execute(
        """
        CREATE UNIQUE INDEX IF NOT EXISTS ix_oauth_handoff_code_hash
        ON oauth_handoff_codes (code_hash)
        """
    )
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS ix_oauth_handoff_user_expires
        ON oauth_handoff_codes (user_id, expires_at)
        """
    )


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS oauth_handoff_codes")
    op.execute("DROP INDEX IF EXISTS ix_users_google_sub")
    op.execute("ALTER TABLE users DROP COLUMN IF EXISTS auth_provider")
    op.execute("ALTER TABLE users DROP COLUMN IF EXISTS google_sub")
