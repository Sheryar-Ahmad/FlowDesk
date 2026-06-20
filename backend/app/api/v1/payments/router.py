import hashlib
import hmac
import json
from datetime import datetime, timedelta, timezone
from uuid import UUID

import structlog
from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.core.middleware.auth_guard import get_current_user
from app.database.connection import get_db
from app.services.payment_service import (
    PaymentConfigurationError,
    PaymentProviderError,
    create_pro_checkout,
)

router = APIRouter()
logger = structlog.get_logger(__name__)
settings = get_settings()


def parse_provider_datetime(value):
    if not isinstance(value, str) or not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None


@router.post("/checkout")
async def create_checkout(current_user: dict = Depends(get_current_user)):
    if current_user["plan"] == "pro":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Your account is already Pro.")

    try:
        checkout_url = await create_pro_checkout(current_user)
        return {"success": True, "checkout_url": checkout_url}
    except PaymentConfigurationError as exc:
        logger.error("Payment checkout configuration error", error=str(exc))
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Pro checkout is not available yet. Please contact support.",
        ) from exc
    except PaymentProviderError as exc:
        logger.error("Payment checkout provider error", error=str(exc))
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="The secure payment service is temporarily unavailable. Please try again.",
        ) from exc


@router.post("/webhook")
async def lemon_squeezy_webhook(
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    if not settings.LEMON_SQUEEZY_WEBHOOK_SECRET:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Payment webhooks are not configured.",
        )

    body = await request.body()
    expected = hmac.new(
        settings.LEMON_SQUEEZY_WEBHOOK_SECRET.encode(),
        body,
        hashlib.sha256,
    ).hexdigest()
    signature = request.headers.get("X-Signature", "")
    if not hmac.compare_digest(expected, signature):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid webhook signature.")

    try:
        payload = json.loads(body)
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid webhook payload.") from exc

    if not isinstance(payload, dict):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid webhook payload.")

    event_name = payload.get("meta", {}).get("event_name", "")
    data = payload.get("data") or {}
    attributes = data.get("attributes") or {}
    custom_data = payload.get("meta", {}).get("custom_data") or attributes.get("custom_data") or {}
    user_id = custom_data.get("user_id")
    variant_id = str(attributes.get("variant_id", ""))
    store_id = str(attributes.get("store_id", ""))
    provider_subscription_id = str(attributes.get("subscription_id") or data.get("id", ""))
    is_test_mode = bool(attributes.get("test_mode", False))

    if not user_id and provider_subscription_id:
        existing_subscription = await db.execute(
            text(
                """
                SELECT user_id
                FROM subscriptions
                WHERE provider_subscription_id = :subscription_id
                """
            ),
            {"subscription_id": provider_subscription_id},
        )
        subscription_row = existing_subscription.fetchone()
        if subscription_row:
            user_id = str(subscription_row.user_id)

    if (
        not user_id
        or not provider_subscription_id
        or (variant_id and variant_id != settings.LEMON_SQUEEZY_VARIANT_ID)
        or (store_id and store_id != settings.LEMON_SQUEEZY_STORE_ID)
        or is_test_mode != settings.LEMON_SQUEEZY_TEST_MODE
    ):
        logger.warning("Ignoring unrelated payment webhook", event=event_name)
        return {"success": True, "ignored": True}

    try:
        user_id = str(UUID(str(user_id)))
    except ValueError:
        logger.warning("Ignoring payment webhook with invalid user ID", event=event_name)
        return {"success": True, "ignored": True}

    subscription_status = attributes.get("status", "")
    pro_statuses = {"on_trial", "active", "paused", "past_due", "cancelled"}
    pro_events = {
        "subscription_created",
        "subscription_paused",
        "subscription_resumed",
        "subscription_unpaused",
        "subscription_updated",
        "subscription_payment_success",
        "subscription_payment_recovered",
    }
    free_events = {
        "subscription_expired",
        "subscription_payment_refunded",
        "order_refunded",
    }
    should_be_free = event_name in free_events or subscription_status in {
        "expired",
        "unpaid",
    }
    should_be_pro = (
        event_name in pro_events
        and not should_be_free
        and (not subscription_status or subscription_status in pro_statuses)
    )
    should_reset_quota = event_name in {
        "subscription_created",
        "subscription_payment_success",
        "subscription_payment_recovered",
        "subscription_resumed",
        "subscription_unpaused",
    }

    event_id = hashlib.sha256(body).hexdigest()
    event_result = await db.execute(
        text("""
            INSERT INTO payment_webhook_events (
                provider, provider_event_id, event_name, payload
            )
            VALUES ('lemon_squeezy', :event_id, :event_name, CAST(:payload AS jsonb))
            ON CONFLICT (provider_event_id) DO NOTHING
            RETURNING id
        """),
        {
            "event_id": event_id,
            "event_name": event_name or "unknown",
            "payload": json.dumps(payload),
        },
    )
    event_row = event_result.fetchone()
    if not event_row:
        await db.rollback()
        return {"success": True, "duplicate": True}

    plan = "free" if should_be_free else "pro" if should_be_pro else None
    if plan:
        renews_at = parse_provider_datetime(attributes.get("renews_at"))
        quota_reset_at = renews_at or datetime.now(timezone.utc) + timedelta(days=30)
        user_result = await db.execute(
            text("""
                UPDATE users
                SET plan = :plan,
                    ai_messages_used_month = CASE
                        WHEN :plan = 'free' THEN 0
                        WHEN :reset_quota THEN 0
                        ELSE ai_messages_used_month
                    END,
                    ai_messages_month_reset_at = CASE
                        WHEN :plan = 'pro'
                            THEN COALESCE(:quota_reset_at, ai_messages_month_reset_at, NOW() + INTERVAL '1 month')
                        ELSE NULL
                    END,
                    updated_at = NOW()
                WHERE id = :user_id
            """),
            {
                "plan": plan,
                "reset_quota": should_reset_quota,
                "quota_reset_at": quota_reset_at,
                "user_id": user_id,
            },
        )
        if not user_result.rowcount:
            logger.warning("Payment webhook referenced an unknown user", user_id=user_id)
            await db.execute(
                text("""
                    UPDATE payment_webhook_events
                    SET processed_at = NOW(), processing_error = 'unknown_user'
                    WHERE id = :event_id
                """),
                {"event_id": str(event_row.id)},
            )
            await db.commit()
            return {"success": True, "ignored": True}

    if subscription_status in {
        "on_trial",
        "active",
        "paused",
        "past_due",
        "unpaid",
        "cancelled",
        "expired",
    }:
        await db.execute(
            text("""
                INSERT INTO subscriptions (
                    user_id, provider, provider_subscription_id,
                    provider_customer_id, store_id, product_id, variant_id,
                    status, renews_at, ends_at, trial_ends_at, cancelled_at,
                    is_test_mode, provider_data
                )
                VALUES (
                    :user_id, 'lemon_squeezy', :subscription_id,
                    :customer_id, :store_id, :product_id, :variant_id,
                    :status, :renews_at, :ends_at, :trial_ends_at, :cancelled_at,
                    :is_test_mode, CAST(:provider_data AS jsonb)
                )
                ON CONFLICT (provider_subscription_id) DO UPDATE SET
                    user_id = EXCLUDED.user_id,
                    provider_customer_id = EXCLUDED.provider_customer_id,
                    store_id = EXCLUDED.store_id,
                    product_id = EXCLUDED.product_id,
                    variant_id = EXCLUDED.variant_id,
                    status = EXCLUDED.status,
                    renews_at = EXCLUDED.renews_at,
                    ends_at = EXCLUDED.ends_at,
                    trial_ends_at = EXCLUDED.trial_ends_at,
                    cancelled_at = EXCLUDED.cancelled_at,
                    is_test_mode = EXCLUDED.is_test_mode,
                    provider_data = EXCLUDED.provider_data,
                    updated_at = NOW()
            """),
            {
                "user_id": user_id,
                "subscription_id": provider_subscription_id,
                "customer_id": str(attributes.get("customer_id") or "") or None,
                "store_id": int(store_id) if store_id else None,
                "product_id": int(attributes["product_id"]) if attributes.get("product_id") else None,
                "variant_id": int(variant_id) if variant_id else None,
                "status": subscription_status,
                "renews_at": parse_provider_datetime(attributes.get("renews_at")),
                "ends_at": parse_provider_datetime(attributes.get("ends_at")),
                "trial_ends_at": parse_provider_datetime(attributes.get("trial_ends_at")),
                "cancelled_at": parse_provider_datetime(attributes.get("cancelled_at")),
                "is_test_mode": is_test_mode,
                "provider_data": json.dumps(attributes),
            },
        )

    await db.execute(
        text("""
            UPDATE payment_webhook_events
            SET processed_at = NOW(), processing_error = NULL
            WHERE id = :event_id
        """),
        {"event_id": str(event_row.id)},
    )
    await db.commit()

    if plan:
        logger.info("User plan updated from payment webhook", user_id=user_id, plan=plan)

    return {"success": True}


@router.get("/health")
async def payments_health():
    return {"status": "payments service running"}
