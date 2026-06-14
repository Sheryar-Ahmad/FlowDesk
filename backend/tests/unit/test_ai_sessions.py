import asyncio

import pytest
from pydantic import ValidationError

from app.api.v1.ai.router import ChatRequest, SessionRename
from app.services.ai_service import generate_session_title


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
