from __future__ import annotations

from datetime import datetime, timezone
from typing import Any


ACTIVE = "active"
SUSPENDED = "suspended"
BANNED = "banned"


def normalize_account_status(value: Any) -> str:
    status = str(value or ACTIVE).strip().lower()
    if status in {ACTIVE, SUSPENDED, BANNED}:
        return status
    return ACTIVE


def utc_datetime(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def account_is_blocked(
    status: Any,
    suspended_until: datetime | None,
    *,
    now: datetime | None = None,
) -> bool:
    account_status = normalize_account_status(status)
    if account_status == BANNED:
        return True
    if account_status != SUSPENDED:
        return False
    if suspended_until is None:
        return True
    current_time = utc_datetime(now or datetime.now(timezone.utc))
    return utc_datetime(suspended_until) > current_time


def blocked_account_message(status: Any, suspended_until: datetime | None) -> str:
    account_status = normalize_account_status(status)
    if account_status == BANNED:
        return "This account has been disabled. Contact support if you believe this is a mistake."
    if account_status == SUSPENDED:
        if suspended_until is None:
            return "This account is temporarily suspended. Contact support for help."
        return f"This account is temporarily suspended until {utc_datetime(suspended_until).isoformat()}."
    return "This account is restricted. Contact support for help."
