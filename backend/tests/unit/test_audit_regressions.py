from datetime import date, datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import httpx
import pytest
from fastapi import HTTPException
from pydantic import ValidationError

from app import main
from app.api.v1.ai import router as ai
from app.api.v1.notes.schemas import NoteUpdate
from app.api.v1.snippets.schemas import SnippetUpdate
from app.api.v1.tasks.schemas import ColumnCreate, ProjectUpdate, TaskUpdate
from app.api.v1.timer.router import get_stats
from app.services import ai_service, compiler_service, snippet_service


@pytest.mark.parametrize("schema, payload", [
    (NoteUpdate, {"title": "   "}),
    (NoteUpdate, {"title": "x" * 301}),
    (SnippetUpdate, {"code": " "}),
    (SnippetUpdate, {"title": "x" * 201}),
    (ProjectUpdate, {"name": " "}),
    (TaskUpdate, {"priority": "urgent"}),
    (TaskUpdate, {"position": float("inf")}),
    (ColumnCreate, {"name": {"invalid": "object"}}),
    (ai.ChatRequest, {"messages": [{"role": "assistant", "content": "hello"}]}),
    (ai.ChatRequest, {"messages": [{"role": "user", "content": "   "}]}),
])
def test_invalid_updates_are_rejected_before_database_access(schema, payload):
    with pytest.raises(ValidationError):
        schema(**payload)


@pytest.mark.asyncio
async def test_groq_uses_async_client_and_returns_response(monkeypatch):
    client = AsyncMock()
    client.chat.completions.create.return_value = SimpleNamespace(
        choices=[SimpleNamespace(message=SimpleNamespace(content="Working"))],
        usage=SimpleNamespace(total_tokens=7),
    )
    context = AsyncMock()
    context.__aenter__.return_value = client
    monkeypatch.setattr(ai_service, "AsyncGroq", MagicMock(return_value=context))
    monkeypatch.setattr(ai_service.settings, "GROQ_API_KEY", "test-key")
    result = await ai_service.chat_with_ai([{"role": "user", "content": "Hello"}], "free", 0)
    assert result["response"] == "Working"
    assert result["tokens_used"] == 7
    client.chat.completions.create.assert_awaited_once()


@pytest.mark.asyncio
async def test_every_provider_failure_is_clean(monkeypatch):
    for name in ("chat_with_ai", "chat_with_gemini", "chat_with_mistral"):
        monkeypatch.setattr(ai_service, name, AsyncMock(side_effect=RuntimeError("private-provider-detail")))
    with pytest.raises(ai_service.AIUnavailableError, match="temporarily unavailable") as error:
        await ai_service.smart_ai_router([{"role": "user", "content": "Hello"}], "free", 0)
    assert "private-provider-detail" not in str(error.value)
    ai_service.chat_with_mistral.assert_awaited_once()


@pytest.mark.asyncio
async def test_gemini_and_mistral_parse_http_responses(monkeypatch):
    responses = [
        {"candidates": [{"content": {"parts": [{"text": "Gemini reply"}]}}],
         "usageMetadata": {"totalTokenCount": 3}},
        {"choices": [{"message": {"content": "Mistral reply"}}], "usage": {"total_tokens": 4}},
    ]
    client = AsyncMock()
    client.post.side_effect = [httpx.Response(200, json=data, request=httpx.Request("POST", "https://example.test")) for data in responses]
    context = AsyncMock()
    context.__aenter__.return_value = client
    monkeypatch.setattr(ai_service.httpx, "AsyncClient", MagicMock(return_value=context))
    monkeypatch.setattr(ai_service.settings, "GEMINI_API_KEY", "test-key")
    monkeypatch.setattr(ai_service.settings, "MISTRAL_API_KEY", "test-key")
    messages = [{"role": "user", "content": "Hello"}]
    assert (await ai_service.chat_with_gemini(messages))["response"] == "Gemini reply"
    assert (await ai_service.chat_with_mistral(messages))["response"] == "Mistral reply"


@pytest.mark.asyncio
async def test_failed_one_shot_refunds_reservation(monkeypatch):
    reservation = SimpleNamespace(plan="free", ai_messages_used_today=1, display_name="Test")
    monkeypatch.setattr(ai, "reserve_ai_message", AsyncMock(return_value=reservation))
    monkeypatch.setattr(ai, "refund_ai_message", AsyncMock())
    monkeypatch.setattr(ai, "smart_ai_router", AsyncMock(side_effect=ai_service.AIUnavailableError("Unavailable")))
    db = AsyncMock()
    with pytest.raises(ai_service.AIUnavailableError):
        await ai.run_one_shot_ai(db, {"id": "user"}, "Hello", "test")
    ai.refund_ai_message.assert_awaited_once_with(db, "user", reservation)


@pytest.mark.asyncio
async def test_session_save_rejects_concurrent_cap_or_deletion():
    db = AsyncMock()
    db.execute.return_value = MagicMock(fetchone=MagicMock(return_value=None))
    with pytest.raises(HTTPException) as error:
        await ai.save_ai_session(db, "user", "session", SimpleNamespace(messages=[], title="Test"),
                                 {"role": "user", "content": "hello"},
                                 {"role": "assistant", "content": "reply"}, 3, "test")
    assert error.value.status_code == 409
    db.commit.assert_not_awaited()


@pytest.mark.asyncio
async def test_usage_read_does_not_reset_concurrent_reservations():
    now = datetime.now(timezone.utc)
    row = SimpleNamespace(plan="pro", ai_messages_used_today=5, ai_messages_used_month=500,
                          ai_messages_reset_at=now, ai_messages_month_reset_at=now - timedelta(days=1))
    db = AsyncMock()
    db.execute.return_value = MagicMock(fetchone=MagicMock(return_value=row))
    result = await ai.get_usage({"id": "user"}, db)
    assert result["remaining"] == 500
    assert result["reset_at"] > now
    assert db.execute.await_count == 1
    db.commit.assert_not_awaited()


@pytest.mark.asyncio
async def test_timer_stats_binds_a_date():
    db = AsyncMock()
    db.execute.side_effect = [
        MagicMock(fetchone=MagicMock(return_value=SimpleNamespace(sessions=0, minutes=0))),
        MagicMock(fetchone=MagicMock(return_value=SimpleNamespace(total_sessions=0, total_minutes=0))),
        MagicMock(fetchall=MagicMock(return_value=[])),
    ]
    assert (await get_stats({"id": "user"}, db))["streak"] == 0
    assert isinstance(db.execute.call_args_list[0].args[1]["today"], date)


@pytest.mark.asyncio
async def test_tag_only_update_persists_and_commits(monkeypatch):
    monkeypatch.setattr(snippet_service, "get_snippet_by_id", AsyncMock(return_value={"id": "snippet"}))
    db = AsyncMock()
    db.execute.return_value = MagicMock(scalar=MagicMock(return_value="tag-id"))
    await snippet_service.update_snippet(db, "snippet", "user", {"tags": ["python"]})
    parameters = [call.args[1] for call in db.execute.call_args_list]
    assert {"sid": "snippet", "tid": "tag-id"} in parameters
    db.commit.assert_awaited_once()


@pytest.mark.asyncio
async def test_production_compiler_does_not_run_on_api_host(monkeypatch):
    monkeypatch.setattr(compiler_service.settings, "DEBUG", False)
    monkeypatch.setattr(compiler_service.settings, "COMPILER_PISTON_API_URL", "")
    monkeypatch.setattr(compiler_service, "count_runs_today", AsyncMock(return_value=0))
    monkeypatch.setattr(compiler_service, "_execute_python", AsyncMock())
    result = await compiler_service.run_code(AsyncMock(), "user", "free", language="python", code="print(1)", stdin="")
    assert result["status"] == "disabled"
    compiler_service._execute_python.assert_not_awaited()


@pytest.mark.asyncio
@pytest.mark.parametrize("fails, status", [(False, 200), (True, 503)])
async def test_database_ping_has_truthful_status_without_auth(monkeypatch, fails, status):
    connection = AsyncMock()
    if fails:
        connection.execute.side_effect = RuntimeError("private-database-detail")
    context = AsyncMock()
    context.__aenter__.return_value = connection
    monkeypatch.setattr(main, "engine", SimpleNamespace(connect=lambda: context))
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=main.app), base_url="http://localhost") as client:
        response = await client.get("/health/ping-db")
    assert response.status_code == status
    assert "private-database-detail" not in response.text
    if not fails:
        assert response.json()["status"] == "ok"
        assert datetime.fromisoformat(response.json()["timestamp"]).tzinfo is not None
