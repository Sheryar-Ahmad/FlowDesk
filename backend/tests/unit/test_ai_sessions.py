import asyncio
from types import SimpleNamespace

import pytest
from pydantic import ValidationError

from app.api.v1.ai.router import ChatRequest, SessionRename
from app.api.v1.ai import router as ai_router
from app.services import ai_service
from app.services.ai_service import extract_ai_text, generate_session_title, require_ai_text


def test_session_title_uses_first_user_message():
    title = asyncio.run(
        generate_session_title(
            [
                {
                    "role": "user",
                    "content": "Can you fix the login redirect and mobile layout please?",
                }
            ]
        )
    )

    assert title == "Can you fix the login redirect and mobile..."


def test_session_title_falls_back_for_empty_content():
    title = asyncio.run(generate_session_title([{"role": "assistant", "content": "Hello"}]))

    assert title == "New Conversation"


def test_session_rename_normalizes_whitespace():
    request = SessionRename(title="  Rename   this chat  ")

    assert request.title == "Rename this chat"


@pytest.mark.parametrize("title", ["", "   ", "x" * 121])
def test_session_rename_rejects_invalid_titles(title):
    with pytest.raises(ValidationError):
        SessionRename(title=title)


def test_chat_request_requires_a_message():
    with pytest.raises(ValidationError):
        ChatRequest(messages=[])


def test_pro_quota_is_numeric_and_monthly():
    reservation = SimpleNamespace(
        plan="pro",
        ai_messages_used_today=0,
        ai_messages_used_month=499,
    )

    assert ai_router.quota_limit("pro") == 500
    assert ai_router.quota_remaining(reservation) == 1


def test_extract_ai_text_supports_provider_content_parts():
    assert extract_ai_text([{"text": "First"}, {"content": "Second"}]) == "First\nSecond"


@pytest.mark.parametrize("content", [None, "", "   ", []])
def test_require_ai_text_rejects_empty_provider_responses(content):
    with pytest.raises(ValueError, match="empty response"):
        require_ai_text(content, "Test provider")


def test_smart_router_falls_back_after_empty_provider_response(monkeypatch):
    async def empty_groq(**_kwargs):
        return {"response": "   ", "tokens_used": 0, "model": "groq", "intent": "general"}

    async def working_gemini(_messages, _context):
        return {"response": "Fallback worked", "tokens_used": 3, "model": "gemini", "intent": "general"}

    monkeypatch.setattr(ai_service, "chat_with_ai", empty_groq)
    monkeypatch.setattr(ai_service, "chat_with_gemini", working_gemini)

    result = asyncio.run(
        ai_service.smart_ai_router(
            messages=[{"role": "user", "content": "Hello"}],
            user_plan="free",
            ai_messages_used=0,
        )
    )

    assert result["response"] == "Fallback worked"
    assert result["model_used"] == f"google/{ai_service.settings.GEMINI_MODEL}"


@pytest.mark.parametrize("hours, expired", [(23.999, False), (24, True), (48, True)])
def test_rolling_quota_window(hours, expired):
    from datetime import datetime, timedelta, timezone
    now = datetime(2026, 9, 26, 12, tzinfo=timezone.utc)
    assert ai_router.quota_window_expired(now - timedelta(hours=hours), now) is expired


def test_missing_reset_starts_a_new_window():
    from datetime import datetime, timezone
    assert ai_router.quota_window_expired(None, datetime.now(timezone.utc))
