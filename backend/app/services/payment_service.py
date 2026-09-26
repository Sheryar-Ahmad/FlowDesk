from urllib.parse import urlparse

import httpx
import structlog

from app.config import get_settings

logger = structlog.get_logger(__name__)
settings = get_settings()


class PaymentConfigurationError(RuntimeError):
    pass


class PaymentProviderError(RuntimeError):
    pass


def lemon_squeezy_headers() -> dict[str, str]:
    if not settings.LEMON_SQUEEZY_API_KEY:
        raise PaymentConfigurationError("LEMON_SQUEEZY_API_KEY is not configured.")
    return {
        "Accept": "application/vnd.api+json",
        "Content-Type": "application/vnd.api+json",
        "Authorization": f"Bearer {settings.LEMON_SQUEEZY_API_KEY}",
    }


async def retrieve_subscription(subscription_id: str) -> dict:
    """Retrieve the canonical subscription object for invoice webhooks."""
    normalized_id = str(subscription_id).strip()
    if not normalized_id.isdigit():
        raise PaymentProviderError("The payment provider returned an invalid subscription ID.")

    try:
        async with httpx.AsyncClient(timeout=15) as client:
            response = await client.get(
                f"https://api.lemonsqueezy.com/v1/subscriptions/{normalized_id}",
                headers=lemon_squeezy_headers(),
            )
            response.raise_for_status()
    except httpx.HTTPStatusError as exc:
        logger.error(
            "Lemon Squeezy rejected subscription retrieval",
            subscription_id=normalized_id,
            status=exc.response.status_code,
        )
        raise PaymentProviderError("The payment provider rejected subscription retrieval.") from exc
    except httpx.HTTPError as exc:
        logger.error(
            "Lemon Squeezy subscription retrieval failed",
            subscription_id=normalized_id,
            error=str(exc),
        )
        raise PaymentProviderError("The payment provider is temporarily unavailable.") from exc

    try:
        payload = response.json()
        data = payload["data"]
        attributes = data["attributes"]
    except (KeyError, TypeError, ValueError) as exc:
        raise PaymentProviderError(
            "The payment provider returned an invalid subscription response."
        ) from exc

    if (
        data.get("type") != "subscriptions"
        or str(data.get("id") or "") != normalized_id
        or not isinstance(attributes, dict)
    ):
        raise PaymentProviderError("The payment provider returned an invalid subscription response.")
    return data


async def create_pro_checkout(user: dict) -> str:
    required = {
        "LEMON_SQUEEZY_API_KEY": settings.LEMON_SQUEEZY_API_KEY,
        "LEMON_SQUEEZY_STORE_ID": settings.LEMON_SQUEEZY_STORE_ID,
        "LEMON_SQUEEZY_VARIANT_ID": settings.LEMON_SQUEEZY_VARIANT_ID,
        "FRONTEND_URL": settings.FRONTEND_URL,
    }
    missing = [name for name, value in required.items() if not value]
    if missing:
        raise PaymentConfigurationError(
            f"Pro checkout is not configured. Missing: {', '.join(missing)}."
        )

    try:
        store_id = int(settings.LEMON_SQUEEZY_STORE_ID)
        variant_id = int(settings.LEMON_SQUEEZY_VARIANT_ID)
    except ValueError as exc:
        raise PaymentConfigurationError(
            "LEMON_SQUEEZY_STORE_ID and LEMON_SQUEEZY_VARIANT_ID must be numeric."
        ) from exc

    if store_id <= 0 or variant_id <= 0:
        raise PaymentConfigurationError(
            "LEMON_SQUEEZY_STORE_ID and LEMON_SQUEEZY_VARIANT_ID must be positive."
        )

    frontend_url = settings.FRONTEND_URL.rstrip("/")
    parsed_frontend_url = urlparse(frontend_url)
    if parsed_frontend_url.scheme not in {"http", "https"} or not parsed_frontend_url.netloc:
        raise PaymentConfigurationError("FRONTEND_URL must be a valid HTTP or HTTPS URL.")

    payload = {
        "data": {
            "type": "checkouts",
            "attributes": {
                "product_options": {
                    "redirect_url": f"{frontend_url}/dashboard?checkout=success",
                    "enabled_variants": [variant_id],
                },
                "checkout_options": {
                    "embed": False,
                    "button_color": "#6366f1",
                },
                "checkout_data": {
                    "email": user["email"],
                    "name": user["display_name"],
                    "custom": {"user_id": user["id"]},
                },
                "test_mode": settings.LEMON_SQUEEZY_TEST_MODE,
            },
            "relationships": {
                "store": {
                    "data": {
                        "type": "stores",
                        "id": str(store_id),
                    }
                },
                "variant": {
                    "data": {
                        "type": "variants",
                        "id": str(variant_id),
                    }
                },
            },
        }
    }
    headers = lemon_squeezy_headers()

    try:
        async with httpx.AsyncClient(timeout=15) as client:
            response = await client.post(
                "https://api.lemonsqueezy.com/v1/checkouts",
                headers=headers,
                json=payload,
            )
            response.raise_for_status()
    except httpx.HTTPStatusError as exc:
        logger.error(
            "Lemon Squeezy rejected checkout creation",
            status=exc.response.status_code,
            response=exc.response.text[:500],
        )
        raise PaymentProviderError("The payment provider rejected the checkout request.") from exc
    except httpx.HTTPError as exc:
        logger.error("Lemon Squeezy checkout request failed", error=str(exc))
        raise PaymentProviderError("The payment provider is temporarily unavailable.") from exc

    try:
        response_payload = response.json()
    except ValueError as exc:
        raise PaymentProviderError(
            "The payment provider returned an unreadable response."
        ) from exc

    if not isinstance(response_payload, dict):
        raise PaymentProviderError("The payment provider returned an invalid response.")

    checkout_url = response_payload.get("data", {}).get("attributes", {}).get("url")
    if not isinstance(checkout_url, str) or not checkout_url.startswith("https://"):
        raise PaymentProviderError("The payment provider returned an invalid checkout URL.")
    return checkout_url
