from datetime import timezone

import pytest

from app.api.v1.payments import router as payments_router


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
