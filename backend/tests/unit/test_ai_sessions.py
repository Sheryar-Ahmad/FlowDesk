import asyncio

import pytest
from pydantic import ValidationError

from app.api.v1.ai.router import ChatRequest, SessionRename
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
    assert result["model_used"] == "google/gemini-2.0-flash"
