"""Create payment subscription tables.

Revision ID: 20260621_0003
Revises: 20260620_0002
Create Date: 2026-06-21
"""
from typing import Sequence

from alembic import op


revision: str = "20260621_0003"
down_revision: str | Sequence[str] | None = "20260620_0002"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS pgcrypto")
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS subscriptions (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            provider VARCHAR(40) NOT NULL DEFAULT 'lemon_squeezy',
            provider_subscription_id VARCHAR(100) NOT NULL UNIQUE,
            provider_customer_id VARCHAR(100),
            store_id INTEGER,
            product_id INTEGER,
            variant_id INTEGER,
            status VARCHAR(30) NOT NULL,
            renews_at TIMESTAMPTZ,
            ends_at TIMESTAMPTZ,
            trial_ends_at TIMESTAMPTZ,
            cancelled_at TIMESTAMPTZ,
            is_test_mode BOOLEAN NOT NULL DEFAULT FALSE,
            provider_data JSONB NOT NULL DEFAULT '{}'::jsonb,
            created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
            CONSTRAINT ck_subscriptions_valid_status
                CHECK (status IN (
                    'on_trial',
                    'active',
                    'paused',
                    'past_due',
                    'unpaid',
                    'cancelled',
                    'expired'
                ))
        )
        """
    )
    op.execute("CREATE INDEX IF NOT EXISTS ix_subscriptions_user_id ON subscriptions (user_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_subscriptions_user_status ON subscriptions (user_id, status)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_subscriptions_customer ON subscriptions (provider_customer_id)")

    op.execute(
        """
        CREATE TABLE IF NOT EXISTS payment_webhook_events (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            provider VARCHAR(40) NOT NULL,
            provider_event_id VARCHAR(160) NOT NULL UNIQUE,
            event_name VARCHAR(100) NOT NULL,
            payload JSONB NOT NULL,
            processed_at TIMESTAMPTZ,
            processing_error VARCHAR(1000),
            created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
        """
    )
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS ix_payment_events_created
        ON payment_webhook_events (created_at)
        """
    )

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
    op.execute(
        """
        DROP TRIGGER IF EXISTS trg_subscriptions_updated_at ON subscriptions
        """
    )
    op.execute(
        """
        CREATE TRIGGER trg_subscriptions_updated_at
        BEFORE UPDATE ON subscriptions
        FOR EACH ROW
        EXECUTE FUNCTION flowdesk_set_updated_at()
        """
    )


def downgrade() -> None:
    op.execute("DROP TRIGGER IF EXISTS trg_subscriptions_updated_at ON subscriptions")
    op.execute("DROP TABLE IF EXISTS payment_webhook_events")
    op.execute("DROP TABLE IF EXISTS subscriptions")
