import hashlib
import hmac
import json
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
    custom_data = payload.get("meta", {}).get("custom_data") or {}
    user_id = custom_data.get("user_id")
    attributes = payload.get("data", {}).get("attributes", {})
    variant_id = str(attributes.get("variant_id", ""))

    if not user_id or variant_id != settings.LEMON_SQUEEZY_VARIANT_ID:
        logger.warning("Ignoring unrelated payment webhook", event=event_name)
        return {"success": True, "ignored": True}

    try:
        user_id = str(UUID(str(user_id)))
    except ValueError:
        logger.warning("Ignoring payment webhook with invalid user ID", event=event_name)
        return {"success": True, "ignored": True}

    subscription_status = attributes.get("status", "")
    pro_statuses = {"on_trial", "active", "paused", "past_due", "cancelled"}
    should_be_pro = (
        event_name
        in {
            "subscription_created",
            "subscription_paused",
            "subscription_resumed",
            "subscription_unpaused",
            "subscription_updated",
        }
        and subscription_status in pro_statuses
    )
    should_be_free = event_name in {"subscription_expired"} or subscription_status in {
        "expired",
        "unpaid",
    }

    if should_be_pro or should_be_free:
        plan = "pro" if should_be_pro else "free"
        result = await db.execute(
            text("UPDATE users SET plan = :plan WHERE id = :user_id"),
            {"plan": plan, "user_id": user_id},
        )
        await db.commit()
        if result.rowcount:
            logger.info("User plan updated from payment webhook", user_id=user_id, plan=plan)
        else:
            logger.warning("Payment webhook referenced an unknown user", user_id=user_id)

    return {"success": True}


@router.get("/health")
async def payments_health():
    return {"status": "payments service running"}
