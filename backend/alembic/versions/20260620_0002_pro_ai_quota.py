"""Add monthly AI quota fields for Pro users.

Revision ID: 20260620_0002
Revises: 20260615_0001
Create Date: 2026-06-20
"""
from typing import Sequence

from alembic import op


revision: str = "20260620_0002"
down_revision: str | Sequence[str] | None = "20260615_0001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute(
        """
        ALTER TABLE users
        ADD COLUMN IF NOT EXISTS ai_messages_used_month INTEGER NOT NULL DEFAULT 0
        """
    )
    op.execute(
        """
        ALTER TABLE users
        ADD COLUMN IF NOT EXISTS ai_messages_month_reset_at TIMESTAMPTZ
        """
    )
    op.execute(
        """
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1
                FROM pg_constraint
                WHERE conname = 'ai_monthly_usage_nonnegative'
            ) THEN
                ALTER TABLE users
                ADD CONSTRAINT ai_monthly_usage_nonnegative
                CHECK (ai_messages_used_month >= 0);
            END IF;
        END $$;
        """
    )


def downgrade() -> None:
    op.drop_constraint("ai_monthly_usage_nonnegative", "users", type_="check")
    op.drop_column("users", "ai_messages_month_reset_at")
    op.drop_column("users", "ai_messages_used_month")
