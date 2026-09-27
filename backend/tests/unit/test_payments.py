from datetime import timezone
import hashlib
import hmac
import json
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import httpx
import pytest
from fastapi import HTTPException
from starlette.requests import Request

from app.api.v1.payments import router as payments_router
from app.services import payment_service


def test_provider_datetime_parser_accepts_utc_timestamp():
    parsed = payments_router.parse_provider_datetime("2026-07-05T15:25:17.095931Z")

    assert parsed is not None
    assert parsed.tzinfo == timezone.utc


def test_subscription_id_is_read_from_subscription_events():
    data = {"type": "subscriptions", "id": "123"}

    assert payments_router.subscription_id_from_event(data, {}) == "123"


def test_subscription_id_is_read_from_invoice_events():
    data = {"type": "subscription-invoices", "id": "invoice-1"}

    assert payments_router.subscription_id_from_event(data, {"subscription_id": 456}) == "456"


def test_order_id_is_not_mistaken_for_subscription_id():
    data = {"type": "orders", "id": "order-1"}

    assert payments_router.subscription_id_from_event(data, {}) == ""


@pytest.mark.parametrize(
    ("event_name", "status", "event_attributes", "expected_plan"),
    [
        ("subscription_created", "active", {}, "pro"),
        ("subscription_updated", "past_due", {}, "pro"),
        ("subscription_updated", "unpaid", {}, "pro"),
        ("subscription_cancelled", "cancelled", {}, "pro"),
        ("subscription_expired", "expired", {}, "free"),
        ("subscription_payment_refunded", "active", {"refunded": True}, "free"),
        ("subscription_payment_refunded", "active", {"refunded": False}, None),
        ("order_refunded", "", {"refunded": True}, None),
    ],
)
def test_subscription_events_choose_expected_plan(
    event_name,
    status,
    event_attributes,
    expected_plan,
):
    assert (
        payments_router.plan_for_subscription_event(event_name, status, event_attributes)
        == expected_plan
    )


def test_plan_update_uses_unambiguous_boolean_parameters():
    statement = str(payments_router.UPDATE_USER_PLAN_STATEMENT)

    assert statement.count(":plan") == 1
    assert ":is_free" in statement
    assert ":is_pro" in statement


@pytest.mark.asyncio
async def test_payment_success_resolves_canonical_subscription(monkeypatch):
    async def fake_retrieve(subscription_id: str):
        assert subscription_id == "789"
        return {
            "type": "subscriptions",
            "id": subscription_id,
            "attributes": {
                "status": "active",
                "store_id": 10,
                "variant_id": 20,
                "test_mode": True,
            },
        }

    monkeypatch.setattr(payments_router, "retrieve_subscription", fake_retrieve)

    subscription_id, attributes = await payments_router.resolve_subscription_event(
        "subscription_payment_success",
        {"type": "subscription-invoices", "id": "invoice-1"},
        {"status": "paid", "subscription_id": 789},
    )

    assert subscription_id == "789"
    assert attributes["status"] == "active"
    assert attributes["variant_id"] == 20


@pytest.fixture
def payment_config(monkeypatch):
    for key, value in {
        "LEMON_SQUEEZY_WEBHOOK_SECRET": "test-webhook-secret",
        "LEMON_SQUEEZY_API_KEY": "test-api-key",
        "LEMON_SQUEEZY_STORE_ID": "10",
        "LEMON_SQUEEZY_VARIANT_ID": "20",
        "LEMON_SQUEEZY_TEST_MODE": True,
        "FRONTEND_URL": "https://example.test",
    }.items():
        monkeypatch.setattr(payments_router.settings, key, value)


def webhook_payload():
    return {
        "meta": {
            "event_name": "subscription_created",
            "custom_data": {"user_id": "11111111-1111-4111-8111-111111111111"},
        },
        "data": {
            "type": "subscriptions", "id": "123",
            "attributes": {"store_id": 10, "variant_id": 20, "test_mode": True, "status": "active"},
        },
    }


def signed_request(payload):
    body = payload if isinstance(payload, bytes) else json.dumps(payload).encode()
    signature = hmac.new(b"test-webhook-secret", body, hashlib.sha256).hexdigest()
    request = Request({"type": "http", "headers": [(b"x-signature", signature.encode())]})
    request._body = body
    return request


@pytest.mark.asyncio
@pytest.mark.parametrize("part,value", [
    ("meta", None), ("meta", []), ("data", []), ("data", "invalid"),
    ("attributes", None), ("attributes", []), ("custom_data", []),
    ("event_name", []), ("event_name", ""),
])
async def test_malformed_webhooks_reject_before_database_access(payment_config, part, value):
    payload = webhook_payload()
    target = payload if part in {"meta", "data"} else payload["data"] if part == "attributes" else payload["meta"]
    target[part] = value
    db = AsyncMock()
    with pytest.raises(HTTPException) as error:
        await payments_router.lemon_squeezy_webhook(signed_request(payload), db)
    assert error.value.status_code == 400
    db.execute.assert_not_awaited()


@pytest.mark.asyncio
async def test_invalid_unicode_webhook_is_rejected(payment_config):
    with pytest.raises(HTTPException) as error:
        await payments_router.lemon_squeezy_webhook(signed_request(b"\xff"), AsyncMock())
    assert error.value.status_code == 400


@pytest.mark.asyncio
@pytest.mark.parametrize("signature", [b"wrong", b"\xff"])
async def test_bad_signature_is_rejected_before_database_access(payment_config, signature):
    request = Request({"type": "http", "headers": [(b"x-signature", signature)]})
    request._body = b"{}"
    db = AsyncMock()
    with pytest.raises(HTTPException) as error:
        await payments_router.lemon_squeezy_webhook(request, db)
    assert error.value.status_code == 401
    db.execute.assert_not_awaited()


@pytest.mark.asyncio
async def test_subscription_lookup_outage_returns_controlled_error(payment_config, monkeypatch):
    payload = webhook_payload()
    payload["meta"]["event_name"] = "subscription_payment_success"
    payload["data"]["type"] = "subscription-invoices"
    payload["data"]["attributes"]["subscription_id"] = 123
    monkeypatch.setattr(payments_router, "retrieve_subscription", AsyncMock(
        side_effect=payment_service.PaymentProviderError("Temporarily unavailable"),
    ))
    db = AsyncMock()
    with pytest.raises(HTTPException) as error:
        await payments_router.lemon_squeezy_webhook(signed_request(payload), db)
    assert error.value.status_code == 502
    db.execute.assert_not_awaited()


@pytest.mark.asyncio
@pytest.mark.parametrize("field,value", [
    ("store_id", None), ("store_id", 99), ("variant_id", None), ("variant_id", 99),
    ("test_mode", None), ("test_mode", "false"), ("test_mode", 1), ("test_mode", False),
])
async def test_unrelated_or_incomplete_webhooks_cannot_change_plan(payment_config, field, value):
    payload = webhook_payload()
    if value is None:
        payload["data"]["attributes"].pop(field)
    else:
        payload["data"]["attributes"][field] = value
    db = AsyncMock()
    result = await payments_router.lemon_squeezy_webhook(signed_request(payload), db)
    assert result == {"success": True, "ignored": True}
    db.execute.assert_not_awaited()


@pytest.mark.asyncio
@pytest.mark.parametrize("event,status,expected", [
    ("subscription_created", "active", "pro"),
    ("subscription_cancelled", "cancelled", "pro"),
    ("subscription_expired", "expired", "free"),
    ("subscription_resumed", "active", "pro"),
])
async def test_verified_subscription_event_updates_and_commits_plan(payment_config, event, status, expected):
    payload = webhook_payload()
    payload["meta"]["event_name"] = event
    payload["data"]["attributes"]["status"] = status
    db = AsyncMock()
    db.execute.side_effect = [
        SimpleNamespace(fetchone=lambda: SimpleNamespace(id="event-id")),
        SimpleNamespace(rowcount=1), None, None,
    ]
    result = await payments_router.lemon_squeezy_webhook(signed_request(payload), db)
    assert result == {"success": True}
    update = db.execute.await_args_list[1].args[1]
    assert update["plan"] == expected
    assert update["user_id"] == payload["meta"]["custom_data"]["user_id"]
    db.commit.assert_awaited_once()


@pytest.mark.asyncio
async def test_duplicate_webhook_does_not_update_plan(payment_config):
    db = AsyncMock()
    db.execute.return_value = SimpleNamespace(fetchone=lambda: None)
    result = await payments_router.lemon_squeezy_webhook(signed_request(webhook_payload()), db)
    assert result == {"success": True, "duplicate": True}
    assert db.execute.await_count == 1
    db.commit.assert_not_awaited()
    db.rollback.assert_awaited_once()


@pytest.mark.asyncio
@pytest.mark.parametrize("payload", [
    None, [], {"data": None}, {"data": []},
    {"data": {"attributes": None}}, {"data": {"attributes": []}},
    {"data": {"attributes": {"url": "https://"}}},
    {"data": {"attributes": {"url": "https://[invalid"}}},
])
async def test_invalid_checkout_response_raises_controlled_error(payment_config, monkeypatch, payload):
    client = AsyncMock()
    client.post.return_value = httpx.Response(
        200, json=payload, request=httpx.Request("POST", "https://example.test"),
    )
    context = AsyncMock()
    context.__aenter__.return_value = client
    monkeypatch.setattr(payment_service.httpx, "AsyncClient", MagicMock(return_value=context))
    with pytest.raises(payment_service.PaymentProviderError):
        await payment_service.create_pro_checkout({"id": "user", "email": "user@example.test", "display_name": "Test"})
