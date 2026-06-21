"""Add account blocking state.

Revision ID: 20260621_0005
Revises: 20260621_0004
Create Date: 2026-06-21
"""

from alembic import op


revision = "20260621_0005"
down_revision = "20260621_0004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS account_status VARCHAR(20) NOT NULL DEFAULT 'active'")
    op.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS suspended_until TIMESTAMPTZ")
    op.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS suspension_reason TEXT")
    op.execute("""
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM pg_constraint WHERE conname = 'valid_account_status'
            ) THEN
                ALTER TABLE users
                ADD CONSTRAINT valid_account_status
                CHECK (account_status IN ('active', 'suspended', 'banned'));
            END IF;
        END $$;
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_users_account_status ON users (account_status)")


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_users_account_status")
    op.execute("ALTER TABLE users DROP CONSTRAINT IF EXISTS valid_account_status")
    op.execute("ALTER TABLE users DROP COLUMN IF EXISTS suspension_reason")
    op.execute("ALTER TABLE users DROP COLUMN IF EXISTS suspended_until")
    op.execute("ALTER TABLE users DROP COLUMN IF EXISTS account_status")
