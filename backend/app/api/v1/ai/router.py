from typing import Annotated, List, Literal, Optional

from fastapi import APIRouter, Depends, Request, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from pydantic import BaseModel, Field, field_validator, model_validator
from datetime import datetime, timedelta, timezone
import structlog
import json

from app.database.connection import get_db
from app.core.middleware.auth_guard import get_current_user
from app.core.middleware.rate_limiter import limiter, AI_LIMIT
from app.constants import FREE_TIER_AI_MESSAGES_PER_DAY, PRO_TIER_AI_MESSAGES_PER_MONTH
from app.services.ai_service import AIUnavailableError, analyze_code, generate_session_title, build_context_from_history, smart_ai_router

logger = structlog.get_logger(__name__)
router = APIRouter(
    responses={
        400: {"description": "Bad request."},
        404: {"description": "Requested AI resource was not found."},
        500: {"description": "AI service error."},
    }
)

CurrentUser = Annotated[dict, Depends(get_current_user)]
DbSession = Annotated[AsyncSession, Depends(get_db)]
SESSION_NOT_FOUND = "Session not found."
SESSION_MESSAGE_LIMIT = 20
SESSION_LIMIT_MESSAGE = "This conversation has reached 20 messages. Start a new conversation."
AI_LIMIT_MESSAGE = "AI message limit reached. Upgrade or wait until your quota resets."


class Message(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=20000)

    @field_validator("content")
    @classmethod
    def require_content(cls, value):
        if not value.strip():
            raise ValueError("Message content is required.")
        return value


class ChatRequest(BaseModel):
    messages: List[Message] = Field(min_length=1, max_length=100)
    session_id: Optional[str] = None

    @model_validator(mode="after")
    def require_user_message(self):
        if self.messages[-1].role != "user":
            raise ValueError("The last message must be from the user.")
        return self


class AnalyzeRequest(BaseModel):
    code: str = Field(min_length=1, max_length=500000)
    language: str = Field(min_length=1, max_length=40)
    task: Literal["explain", "fix", "review", "optimize", "document", "test"] = "explain"


class NoteSummaryRequest(BaseModel):
    title: str = ""
    content: str = Field(min_length=1, max_length=1_000_000)


class TaskSubtasksRequest(BaseModel):
    title: str
    description: str = ""


class TaskPriorityItem(BaseModel):
    title: str
    due_date: Optional[str] = None
    priority: str = "medium"


class TaskPrioritizeRequest(BaseModel):
    tasks: List[TaskPriorityItem] = Field(min_length=1, max_length=20)


class SessionRename(BaseModel):
    title: str = Field(min_length=1, max_length=120)

    @field_validator("title")
    @classmethod
    def clean_title(cls, value: str) -> str:
        title = " ".join(value.split())
        if not title:
            raise ValueError("Session title is required.")
        return title


async def get_user_ai_data(db: AsyncSession, user_id: str) -> dict:
    """Gets user AI usage and context data."""
    result = await db.execute(
        text(
            """
            SELECT ai_messages_used_today, ai_messages_reset_at,
                   ai_messages_used_month, ai_messages_month_reset_at,
                   plan, display_name
            FROM users WHERE id=:uid
            """
        ),
        {"uid": user_id}
    )
    return result.fetchone()


def quota_limit(plan: str) -> int:
    return PRO_TIER_AI_MESSAGES_PER_MONTH if plan == "pro" else FREE_TIER_AI_MESSAGES_PER_DAY


def reserved_usage(reservation) -> int:
    if reservation.plan == "pro":
        return reservation.ai_messages_used_month or 0
    return reservation.ai_messages_used_today or 0


def usage_before_reservation(reservation) -> int:
    return max(0, reserved_usage(reservation) - 1)


def quota_remaining(reservation) -> int:
    return max(0, quota_limit(reservation.plan) - reserved_usage(reservation))


def parse_messages(value) -> list[dict]:
    if isinstance(value, str):
        try:
            value = json.loads(value)
        except (TypeError, json.JSONDecodeError):
            value = []
    if not isinstance(value, list):
        return []
    return [
        message
        for message in value
        if isinstance(message, dict)
        and message.get("role") in {"user", "assistant"}
        and isinstance(message.get("content"), str)
        and message["content"].strip()
    ]


async def load_session_messages(db: AsyncSession, session_id: str | None, user_id: str):
    if not session_id:
        return None, []

    result = await db.execute(
        text(
            """
            SELECT id, title, messages, message_count, tokens_used, model_used, created_at
            FROM ai_sessions
            WHERE id=:sid AND user_id=:uid
            """
        ),
        {"sid": session_id, "uid": user_id},
    )
    session_data = result.fetchone()
    if not session_data:
        raise HTTPException(status_code=404, detail=SESSION_NOT_FOUND)
    return session_data, parse_messages(session_data.messages)


async def load_recent_session_context(db: AsyncSession, user_id: str) -> list[dict]:
    result = await db.execute(
        text("SELECT messages FROM ai_sessions WHERE user_id=:uid ORDER BY updated_at DESC LIMIT 5"),
        {"uid": user_id},
    )
    return [{"messages": parse_messages(row.messages)} for row in result.fetchall()]


async def save_ai_session(
    db: AsyncSession,
    user_id: str,
    session_id: str | None,
    session_data,
    user_msg: dict,
    ai_msg: dict,
    tokens_used: int,
    model: str,
) -> tuple[str, str | None]:
    updated_messages = parse_messages(session_data.messages) + [user_msg, ai_msg] if session_data else [user_msg, ai_msg]
    session_title = session_data.title if session_data else None

    if session_id and session_data:
        result = await db.execute(
            text(
                """
                UPDATE ai_sessions
                SET messages=messages || CAST(:msgs AS jsonb), message_count=message_count+1,
                    tokens_used=tokens_used+:tokens, model_used=:model, updated_at=NOW()
                WHERE id=:sid AND user_id=:uid AND message_count < :session_limit
                RETURNING id
                """
            ),
            {
                "msgs": json.dumps([user_msg, ai_msg]),
                "model": model,
                "session_limit": SESSION_MESSAGE_LIMIT,
                "tokens": tokens_used,
                "sid": session_id,
                "uid": user_id,
            },
        )
        if not result.fetchone():
            raise HTTPException(status_code=409, detail=SESSION_LIMIT_MESSAGE)
        return session_id, session_title

    session_title = await generate_session_title([user_msg])
    result_insert = await db.execute(
        text(
            """
            INSERT INTO ai_sessions (user_id, title, messages, message_count, tokens_used, model_used)
            VALUES (:uid, :title, CAST(:msgs AS jsonb), 1, :tokens, :model)
            RETURNING id
            """
        ),
        {
            "uid": user_id,
            "title": session_title,
            "msgs": json.dumps(updated_messages),
            "tokens": tokens_used,
            "model": model,
        },
    )
    new_session = result_insert.fetchone()
    return str(new_session.id), session_title


def quota_window_expired(reset_at: datetime | None, now: datetime) -> bool:
    if reset_at is None:
        return True
    if reset_at.tzinfo is None:
        reset_at = reset_at.replace(tzinfo=timezone.utc)
    return (now - reset_at).total_seconds() >= 86400


async def reserve_ai_message(db: AsyncSession, user_id: str):
    """Atomically reserves one AI request before contacting a provider."""
    now = datetime.now(timezone.utc)
    window_start = now - timedelta(days=1)
    monthly_reset_at = now + timedelta(days=30)
    result = await db.execute(
        text("""
            UPDATE users
            SET ai_messages_used_today = CASE
                    WHEN plan = 'pro' THEN ai_messages_used_today
                    WHEN ai_messages_reset_at IS NULL OR ai_messages_reset_at <= :window_start
                        THEN 1
                    ELSE ai_messages_used_today + 1
                END,
                ai_messages_reset_at = CASE
                    WHEN plan = 'pro' THEN ai_messages_reset_at
                    WHEN ai_messages_reset_at IS NULL OR ai_messages_reset_at <= :window_start
                        THEN :now
                    ELSE ai_messages_reset_at
                END,
                ai_messages_used_month = CASE
                    WHEN plan <> 'pro' THEN ai_messages_used_month
                    WHEN ai_messages_month_reset_at IS NULL OR ai_messages_month_reset_at <= :now
                        THEN 1
                    ELSE ai_messages_used_month + 1
                END,
                ai_messages_month_reset_at = CASE
                    WHEN plan <> 'pro' THEN ai_messages_month_reset_at
                    WHEN ai_messages_month_reset_at IS NULL OR ai_messages_month_reset_at <= :now
                        THEN :monthly_reset_at
                    ELSE ai_messages_month_reset_at
                END
            WHERE id = :uid
              AND (
                  (
                      plan = 'pro'
                      AND CASE
                          WHEN ai_messages_month_reset_at IS NULL OR ai_messages_month_reset_at <= :now
                              THEN 0
                          ELSE ai_messages_used_month
                      END < :pro_limit
                  )
                  OR (
                      plan <> 'pro'
                      AND CASE
                          WHEN ai_messages_reset_at IS NULL OR ai_messages_reset_at <= :window_start
                              THEN 0
                          ELSE ai_messages_used_today
                      END < :free_limit
                  )
              )
            RETURNING ai_messages_used_today, ai_messages_reset_at,
                      ai_messages_used_month, ai_messages_month_reset_at,
                      plan, display_name
        """),
        {
            "uid": user_id,
            "now": now,
            "window_start": window_start,
            "monthly_reset_at": monthly_reset_at,
            "free_limit": FREE_TIER_AI_MESSAGES_PER_DAY,
            "pro_limit": PRO_TIER_AI_MESSAGES_PER_MONTH,
        },
    )
    reservation = result.fetchone()
    if not reservation:
        raise ValueError(AI_LIMIT_MESSAGE)
    await db.commit()
    return reservation


async def refund_ai_message(db: AsyncSession, user_id: str, reservation) -> None:
    """Returns a reserved request when every provider fails."""
    await db.execute(
        text("""
            UPDATE users
            SET ai_messages_used_today = CASE
                    WHEN plan = 'pro' THEN ai_messages_used_today
                    ELSE GREATEST(ai_messages_used_today - 1, 0)
                END,
                ai_messages_used_month = CASE
                    WHEN plan = 'pro' THEN GREATEST(ai_messages_used_month - 1, 0)
                    ELSE ai_messages_used_month
                END
            WHERE id = :uid AND plan = :reserved_plan
              AND ((plan = 'pro' AND ai_messages_month_reset_at IS NOT DISTINCT FROM :month_reset)
                   OR (plan <> 'pro' AND ai_messages_reset_at IS NOT DISTINCT FROM :day_reset))
        """),
        {"uid": user_id, "reserved_plan": reservation.plan,
         "month_reset": reservation.ai_messages_month_reset_at,
         "day_reset": reservation.ai_messages_reset_at},
    )
    await db.commit()


async def run_one_shot_ai(
    db: AsyncSession,
    current_user: dict,
    prompt: str,
    task_name: str,
) -> dict:
    """Run a metered AI request without creating a chat session."""
    reservation = await reserve_ai_message(db, current_user["id"])
    messages_used = usage_before_reservation(reservation)
    context = {
        "name": reservation.display_name or current_user.get("display_name", "Developer"),
        "task": task_name,
    }
    try:
        result_ai = await smart_ai_router(
            messages=[{"role": "user", "content": prompt}],
            user_plan=reservation.plan,
            ai_messages_used=messages_used,
            user_context=context,
            session_messages=[],
        )
    except Exception:
        await refund_ai_message(db, current_user["id"], reservation)
        raise
    return {
        "success": True,
        "response": result_ai["response"],
        "tokens_used": result_ai["tokens_used"],
        "model": result_ai["model"],
        "messages_remaining": quota_remaining(reservation),
        "messages_limit": quota_limit(reservation.plan),
    }


def parse_subtasks(raw_response: str) -> List[str]:
    cleaned = raw_response.replace("```json", "").replace("```", "").strip()
    try:
        start = cleaned.index("[")
        end = cleaned.rindex("]") + 1
        parsed = json.loads(cleaned[start:end])
        if isinstance(parsed, list):
            return [str(item).strip() for item in parsed if str(item).strip()][:5]
    except ValueError:
        pass
    return [
        line.strip().lstrip("-*0123456789.) ").strip()
        for line in cleaned.splitlines()
        if line.strip().lstrip("-*0123456789.) ").strip()
    ][:5]


@router.post("/chat")
@limiter.limit(AI_LIMIT)
async def chat(
    request: Request,
    body: ChatRequest,
    current_user: CurrentUser,
    db: DbSession,
):
    """
    Chat with AI. Supports persistent sessions with memory.
    """
    try:
        session_id = body.session_id
        session_data, session_messages = await load_session_messages(db, session_id, current_user["id"])
        if session_data and session_data.message_count >= SESSION_MESSAGE_LIMIT:
            raise HTTPException(status_code=409, detail=SESSION_LIMIT_MESSAGE)
        past_sessions = await load_recent_session_context(db, current_user["id"])
        reservation = await reserve_ai_message(db, current_user["id"])
        messages_used = usage_before_reservation(reservation)
        context = build_context_from_history(past_sessions)
        context["name"] = reservation.display_name or current_user.get("display_name", "Developer")


        new_messages = [{"role": m.role, "content": m.content} for m in body.messages]


        if session_messages:
            all_messages = session_messages + [new_messages[-1]]
        else:
            all_messages = new_messages

        try:
            result_ai = await smart_ai_router(
                messages=all_messages,
                user_plan=reservation.plan,
                ai_messages_used=messages_used,
                user_context=context,
                session_messages=session_messages,
            )
        except Exception:
            await refund_ai_message(db, current_user["id"], reservation)
            raise


        user_msg = new_messages[-1]
        ai_msg = {"role": "assistant", "content": result_ai["response"]}
        try:
            session_id, session_title = await save_ai_session(
                db=db,
                user_id=current_user["id"],
                session_id=session_id,
                session_data=session_data,
                user_msg=user_msg,
                ai_msg=ai_msg,
                tokens_used=result_ai["tokens_used"],
                model=result_ai["model"],
            )
            await db.commit()
        except Exception:
            await db.rollback()
            await refund_ai_message(db, current_user["id"], reservation)
            raise


        return {
            "success": True,
            "response": result_ai["response"],
            "tokens_used": result_ai["tokens_used"],
            "model": result_ai["model"],
            "intent": result_ai.get("intent", "general"),
            "session_id": session_id,
            "session_title": session_title,
            "messages_remaining": quota_remaining(reservation),
            "messages_limit": quota_limit(reservation.plan),
        }

    except HTTPException:
        raise
    except ValueError as e:
        raise HTTPException(status_code=503 if isinstance(e, AIUnavailableError) else 400, detail=str(e))
    except Exception as e:
        logger.error("AI chat error", error=str(e))
        raise HTTPException(status_code=500, detail="AI service error.")


@router.get("/sessions")
async def get_sessions(
    current_user: CurrentUser,
    db: DbSession,
):
    """Get all AI chat sessions for current user."""
    result = await db.execute(
        text("""
            SELECT id, title, model_used, message_count, tokens_used, created_at, updated_at
            FROM ai_sessions WHERE user_id=:uid
            ORDER BY updated_at DESC LIMIT 50
        """),
        {"uid": current_user["id"]}
    )
    sessions = result.fetchall()
    return {
        "success": True,
        "sessions": [
            {
                "id": str(s.id),
                "title": s.title or "New Conversation",
                "model": s.model_used,
                "message_count": s.message_count,
                "tokens_used": s.tokens_used,
                "created_at": s.created_at,
                "updated_at": s.updated_at,
            }
            for s in sessions
        ]
    }


@router.get("/sessions/{session_id}")
async def get_session(
    session_id: str,
    current_user: CurrentUser,
    db: DbSession,
):
    """Get a specific session with all messages."""
    result = await db.execute(
        text("SELECT id, title, messages, message_count, tokens_used, model_used, created_at FROM ai_sessions WHERE id=:sid AND user_id=:uid"),
        {"sid": session_id, "uid": current_user["id"]}
    )
    session = result.fetchone()
    if not session:
        raise HTTPException(status_code=404, detail=SESSION_NOT_FOUND)

    messages = parse_messages(session.messages)

    return {
        "success": True,
        "session": {
            "id": str(session.id),
            "title": session.title or "New Conversation",
            "messages": messages,
            "message_count": session.message_count,
            "tokens_used": session.tokens_used,
            "model": session.model_used,
            "created_at": session.created_at,
        }
    }


@router.patch("/sessions/{session_id}")
async def rename_session(
    session_id: str,
    body: SessionRename,
    current_user: CurrentUser,
    db: DbSession,
):
    """Rename one of the current user's AI chat sessions."""
    result = await db.execute(
        text(
            """
            UPDATE ai_sessions
            SET title=:title, updated_at=NOW()
            WHERE id=:sid AND user_id=:uid
            RETURNING id, title, updated_at
            """
        ),
        {
            "title": body.title,
            "sid": session_id,
            "uid": current_user["id"],
        },
    )
    session = result.fetchone()
    if not session:
        raise HTTPException(status_code=404, detail=SESSION_NOT_FOUND)
    await db.commit()
    return {
        "success": True,
        "session": {
            "id": str(session.id),
            "title": session.title,
            "updated_at": session.updated_at,
        },
    }


@router.delete("/sessions/{session_id}")
async def delete_session(
    session_id: str,
    current_user: CurrentUser,
    db: DbSession,
):
    """Delete a chat session."""
    result = await db.execute(
        text("DELETE FROM ai_sessions WHERE id=:sid AND user_id=:uid RETURNING id"),
        {"sid": session_id, "uid": current_user["id"]}
    )
    if not result.fetchone():
        raise HTTPException(status_code=404, detail=SESSION_NOT_FOUND)
    await db.commit()
    return {"success": True, "message": "Session deleted."}


@router.post("/analyze")
@limiter.limit(AI_LIMIT)
async def analyze(
    request: Request,
    body: AnalyzeRequest,
    current_user: CurrentUser,
    db: DbSession,
):
    """Analyze code - explain, fix, review, optimize, document, test."""
    reservation = None
    try:
        reservation = await reserve_ai_message(db, current_user["id"])
        response = await analyze_code(
            body.code,
            body.language,
            body.task,
            user_plan=reservation.plan,
            ai_messages_used=usage_before_reservation(reservation),
        )
        return {
            "success": True,
            "response": response,
            "messages_remaining": quota_remaining(reservation),
            "messages_limit": quota_limit(reservation.plan),
        }
    except ValueError as e:
        if reservation is not None:
            await refund_ai_message(db, current_user["id"], reservation)
        raise HTTPException(status_code=503 if isinstance(e, AIUnavailableError) else 400, detail=str(e))
    except Exception as e:
        if reservation is not None:
            await refund_ai_message(db, current_user["id"], reservation)
        logger.error("Analyze error", error=str(e))
        raise HTTPException(status_code=500, detail="Analysis failed.")


@router.post("/summarize")
@limiter.limit(AI_LIMIT)
async def summarize_note(
    request: Request,
    body: NoteSummaryRequest,
    current_user: CurrentUser,
    db: DbSession,
):
    """Summarize a note without creating an AI chat session."""
    content = body.content.strip()
    if not content:
        raise HTTPException(status_code=400, detail="Note content is required.")

    try:
        prompt = (
            "Summarize this developer note in 3 to 5 concise bullet points. "
            "Return only the bullet points, with no heading or preamble.\n\n"
            f"Title: {body.title.strip() or 'Untitled Note'}\n\n"
            f"Note:\n{content[:12000]}"
        )
        return await run_one_shot_ai(db, current_user, prompt, "note_summary")
    except ValueError as e:
        raise HTTPException(status_code=503 if isinstance(e, AIUnavailableError) else 400, detail=str(e))
    except Exception as e:
        logger.error("Note summarize error", error=str(e))
        raise HTTPException(status_code=500, detail="Note summarization failed.")


@router.post("/task-subtasks")
@limiter.limit(AI_LIMIT)
async def suggest_task_subtasks(
    request: Request,
    body: TaskSubtasksRequest,
    current_user: CurrentUser,
    db: DbSession,
):
    """Generate actionable subtasks for a task."""
    title = body.title.strip()
    if not title:
        raise HTTPException(status_code=400, detail="Task title is required.")
    prompt = (
        "Break this developer task into 3 to 5 specific, actionable subtasks. "
        "Return only a JSON array of strings.\n\n"
        f"Task: {title[:500]}\n"
        f"Description: {body.description.strip()[:4000]}"
    )
    try:
        result = await run_one_shot_ai(db, current_user, prompt, "task_subtasks")
        result["subtasks"] = parse_subtasks(result["response"])
        return result
    except ValueError as e:
        raise HTTPException(status_code=503 if isinstance(e, AIUnavailableError) else 400, detail=str(e))
    except Exception as e:
        logger.error("Task subtasks error", error=str(e))
        raise HTTPException(status_code=500, detail="Subtask generation failed.")


@router.post("/task-prioritize")
@limiter.limit(AI_LIMIT)
async def prioritize_tasks(
    request: Request,
    body: TaskPrioritizeRequest,
    current_user: CurrentUser,
    db: DbSession,
):
    """Recommend what the user should work on next."""
    if not body.tasks:
        raise HTTPException(status_code=400, detail="At least one task is required.")
    task_data = [item.model_dump() for item in body.tasks[:20]]
    prompt = (
        "Analyze these open tasks and recommend what to work on first today. "
        "Consider due dates and priority. Respond in 2 to 3 concise sentences.\n\n"
        f"Tasks: {json.dumps(task_data)}"
    )
    try:
        return await run_one_shot_ai(db, current_user, prompt, "task_prioritization")
    except ValueError as e:
        raise HTTPException(status_code=503 if isinstance(e, AIUnavailableError) else 400, detail=str(e))
    except Exception as e:
        logger.error("Task prioritization error", error=str(e))
        raise HTTPException(status_code=500, detail="Task prioritization failed.")


@router.get("/usage")
async def get_usage(
    current_user: CurrentUser,
    db: DbSession,
):
    """Get AI usage stats."""
    now = datetime.now(timezone.utc)
    result = await db.execute(
        text("""
            SELECT ai_messages_used_today, ai_messages_reset_at,
                   ai_messages_used_month, ai_messages_month_reset_at, plan
            FROM users WHERE id=:uid
        """),
        {"uid": current_user["id"]},
    )
    user = result.fetchone()
    if user is None:
        raise HTTPException(status_code=404, detail="User not found.")
    used_today = user.ai_messages_used_today or 0
    used_month = user.ai_messages_used_month or 0
    # Reads must not reset counters: that can erase a concurrent reservation.
    if user.plan == "pro":
        reset_at = user.ai_messages_month_reset_at
        if reset_at is not None and reset_at.tzinfo is None:
            reset_at = reset_at.replace(tzinfo=timezone.utc)
        if reset_at is None or reset_at <= now:
            used_month = 0
            reset_at = now + timedelta(days=30)
    else:
        window_start = user.ai_messages_reset_at
        if quota_window_expired(window_start, now):
            used_today = 0
            reset_at = now + timedelta(days=1)
        else:
            if window_start.tzinfo is None:
                window_start = window_start.replace(tzinfo=timezone.utc)
            reset_at = window_start + timedelta(days=1)
    return {
        "success": True,
        "used_today": used_today,
        "used_month": used_month,
        "limit": quota_limit(user.plan),
        "remaining": max(0, quota_limit(user.plan) - (used_month if user.plan == "pro" else used_today)),
        "reset_at": reset_at,
        "plan": user.plan,
    }



@router.get("/health")
async def ai_health():
    return {"status": "ai service running"}
