"""
ai/router.py - Ultimate AI API with Memory & History
BACKEND FILE
"""

from fastapi import APIRouter, Depends, Request, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime, timezone
import structlog
import json

from app.database.connection import get_db
from app.core.middleware.auth_guard import get_current_user
from app.core.middleware.rate_limiter import limiter, AI_LIMIT
from app.services.ai_service import chat_with_ai, analyze_code, generate_session_title, build_context_from_history, smart_ai_router

logger = structlog.get_logger(__name__)
router = APIRouter()


class Message(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    messages: List[Message]
    session_id: Optional[str] = None


class AnalyzeRequest(BaseModel):
    code: str
    language: str
    task: str = "explain"


class NoteSummaryRequest(BaseModel):
    title: str = ""
    content: str


class TaskSubtasksRequest(BaseModel):
    title: str
    description: str = ""


class TaskPriorityItem(BaseModel):
    title: str
    due_date: Optional[str] = None
    priority: str = "medium"


class TaskPrioritizeRequest(BaseModel):
    tasks: List[TaskPriorityItem]


class SessionCreate(BaseModel):
    title: Optional[str] = "New Conversation"


async def get_user_ai_data(db: AsyncSession, user_id: str) -> dict:
    """Gets user AI usage and context data."""
    result = await db.execute(
        text("SELECT ai_messages_used_today, ai_messages_reset_at, plan, display_name FROM users WHERE id=:uid"),
        {"uid": user_id}
    )
    return result.fetchone()


async def reset_daily_limit_if_needed(db: AsyncSession, user_id: str, user_data) -> int:
    """Resets daily limit if new day."""
    now = datetime.now(timezone.utc)
    messages_used = user_data.ai_messages_used_today or 0
    reset_at = user_data.ai_messages_reset_at

    # Auto reset every 24 hours
    if reset_at:
        if hasattr(reset_at, "tzinfo") and reset_at.tzinfo is None:
            reset_at = reset_at.replace(tzinfo=timezone.utc)
        if (now - reset_at).total_seconds() >= 86400:
            messages_used = 0
            await db.execute(
                text("UPDATE users SET ai_messages_used_today=0, ai_messages_reset_at=NOW() WHERE id=:uid"),
                {"uid": user_id}
            )
            await db.commit()
            logger.info("AI daily limit auto-reset", user_id=user_id)
    else:
        # First time — set reset timestamp
        await db.execute(
            text("UPDATE users SET ai_messages_reset_at=NOW() WHERE id=:uid AND ai_messages_reset_at IS NULL"),
            {"uid": user_id}
        )
        await db.commit()

    return messages_used


async def run_one_shot_ai(
    db: AsyncSession,
    current_user: dict,
    prompt: str,
    task_name: str,
) -> dict:
    """Run a metered AI request without creating a chat session."""
    user_data = await get_user_ai_data(db, current_user["id"])
    messages_used = await reset_daily_limit_if_needed(db, current_user["id"], user_data)
    context = {
        "name": user_data.display_name or current_user.get("display_name", "Developer"),
        "task": task_name,
    }
    result_ai = await smart_ai_router(
        messages=[{"role": "user", "content": prompt}],
        user_plan=current_user["plan"],
        ai_messages_used=messages_used,
        user_context=context,
        session_messages=[],
    )
    await db.execute(
        text("UPDATE users SET ai_messages_used_today=ai_messages_used_today+1 WHERE id=:uid"),
        {"uid": current_user["id"]},
    )
    await db.commit()
    remaining = "unlimited" if current_user["plan"] == "pro" else max(0, 20 - messages_used - 1)
    return {
        "success": True,
        "response": result_ai["response"],
        "tokens_used": result_ai["tokens_used"],
        "model": result_ai["model"],
        "messages_remaining": remaining,
    }


def parse_subtasks(raw_response: str) -> List[str]:
    cleaned = raw_response.replace("```json", "").replace("```", "").strip()
    try:
        start = cleaned.index("[")
        end = cleaned.rindex("]") + 1
        parsed = json.loads(cleaned[start:end])
        if isinstance(parsed, list):
            return [str(item).strip() for item in parsed if str(item).strip()][:5]
    except (ValueError, json.JSONDecodeError):
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
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Chat with AI. Supports persistent sessions with memory.
    """
    try:
        user_data = await get_user_ai_data(db, current_user["id"])
        messages_used = await reset_daily_limit_if_needed(db, current_user["id"], user_data)

        # Get or create session
        session_id = body.session_id
        session_messages = []
        session_data = None

        if session_id:
            # Load existing session messages for memory
            result = await db.execute(
                text("SELECT id, messages, message_count, tokens_used, model_used, created_at FROM ai_sessions WHERE id=:sid AND user_id=:uid"),
                {"sid": session_id, "uid": current_user["id"]}
            )
            session_data = result.fetchone()
            if session_data:
                stored = session_data.messages
                if isinstance(stored, str):
                    try: stored = json.loads(stored)
                    except: stored = []
                session_messages = stored if isinstance(stored, list) else []

        # Get past sessions for context building
        past_result = await db.execute(
            text("SELECT messages FROM ai_sessions WHERE user_id=:uid ORDER BY updated_at DESC LIMIT 5"),
            {"uid": current_user["id"]}
        )
        past_sessions = []
        for row in past_result.fetchall():
            msgs = row.messages
            if isinstance(msgs, str):
                try: msgs = json.loads(msgs)
                except: msgs = []
            past_sessions.append({"messages": msgs})

        # Build user context from history
        context = build_context_from_history(past_sessions)
        context["name"] = user_data.display_name or current_user.get("display_name", "Developer")

        # Prepare messages
        new_messages = [{"role": m.role, "content": m.content} for m in body.messages]

        # For memory: combine session history with new messages
        if session_messages:
            all_messages = session_messages + [new_messages[-1]]  # Add only latest message
        else:
            all_messages = new_messages

# Call AI with full context - Groq first, Gemini fallback
        try:
            result_ai = await smart_ai_router(
                messages=all_messages,
                user_plan=current_user["plan"],
                ai_messages_used=messages_used,
                user_context=context,
                session_messages=session_messages,
            )
        except ValueError as groq_err:
            if "429" in str(groq_err) or "rate_limit" in str(groq_err).lower():
                logger.warning("Groq limit reached, switching to Gemini fallback")
                from app.services.ai_service import chat_with_gemini
                result_ai = await chat_with_gemini(all_messages, context)
            else:
                raise groq_err

        # Update session with new messages
        ai_msg = {"role": "assistant", "content": result_ai["response"]}
        user_msg = new_messages[-1]

        updated_messages = session_messages + [user_msg, ai_msg]

        if session_id and session_data:
            # Update existing session
            await db.execute(
                text("""
                    UPDATE ai_sessions
                    SET messages=CAST(:msgs AS jsonb), message_count=message_count+1,
                        tokens_used=tokens_used+:tokens, updated_at=NOW()
                    WHERE id=:sid AND user_id=:uid
                """),
                {
                    "msgs": json.dumps(updated_messages),
                    "tokens": result_ai["tokens_used"],
                    "sid": session_id, "uid": current_user["id"]
                }
            )
        else:
            # Create new session
            title = await generate_session_title(new_messages)
            result_insert = await db.execute(
                text("""
                    INSERT INTO ai_sessions (user_id, messages, message_count, tokens_used, model_used)
                    VALUES (:uid, CAST(:msgs AS jsonb), 1, :tokens, :model)
                    RETURNING id
                """),
                {
                    "uid": current_user["id"],
                    "msgs": json.dumps(updated_messages),
                    "tokens": result_ai["tokens_used"],
                    "model": result_ai["model"]
                }
            )
            new_session = result_insert.fetchone()
            session_id = str(new_session.id)

            # Update title separately
            await db.execute(
                text("UPDATE ai_sessions SET model_used=:model WHERE id=:sid"),
                {"model": result_ai["model"], "sid": session_id}
            )

        # Increment usage
        await db.execute(
            text("UPDATE users SET ai_messages_used_today=ai_messages_used_today+1 WHERE id=:uid"),
            {"uid": current_user["id"]}
        )
        await db.commit()

        remaining = "unlimited" if current_user["plan"] == "pro" else max(0, 20 - messages_used - 1)

        return {
            "success": True,
            "response": result_ai["response"],
            "tokens_used": result_ai["tokens_used"],
            "model": result_ai["model"],
            "intent": result_ai.get("intent", "general"),
            "session_id": session_id,
            "messages_remaining": remaining,
        }

    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error("AI chat error", error=str(e))
        raise HTTPException(status_code=500, detail="AI service error.")


@router.get("/sessions")
async def get_sessions(
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get all AI chat sessions for current user."""
    result = await db.execute(
        text("""
            SELECT id, model_used, message_count, tokens_used, created_at, updated_at
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
                "title": f"Chat • {s.created_at.strftime('%b %d, %H:%M') if s.created_at else 'New Chat'}",
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
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get a specific session with all messages."""
    result = await db.execute(
        text("SELECT id, messages, message_count, tokens_used, model_used, created_at FROM ai_sessions WHERE id=:sid AND user_id=:uid"),
        {"sid": session_id, "uid": current_user["id"]}
    )
    session = result.fetchone()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found.")

    messages = session.messages
    if isinstance(messages, str):
        try: messages = json.loads(messages)
        except: messages = []

    return {
        "success": True,
        "session": {
            "id": str(session.id),
            "messages": messages,
            "message_count": session.message_count,
            "tokens_used": session.tokens_used,
            "model": session.model_used,
            "created_at": session.created_at,
        }
    }


@router.delete("/sessions/{session_id}")
async def delete_session(
    session_id: str,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete a chat session."""
    await db.execute(
        text("DELETE FROM ai_sessions WHERE id=:sid AND user_id=:uid"),
        {"sid": session_id, "uid": current_user["id"]}
    )
    await db.commit()
    return {"success": True, "message": "Session deleted."}


@router.post("/analyze")
@limiter.limit(AI_LIMIT)
async def analyze(
    request: Request,
    body: AnalyzeRequest,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Analyze code - explain, fix, review, optimize, document, test."""
    try:
        response = await analyze_code(body.code, body.language, body.task)
        return {"success": True, "response": response}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error("Analyze error", error=str(e))
        raise HTTPException(status_code=500, detail="Analysis failed.")


@router.post("/summarize")
@limiter.limit(AI_LIMIT)
async def summarize_note(
    request: Request,
    body: NoteSummaryRequest,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
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
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error("Note summarize error", error=str(e))
        raise HTTPException(status_code=500, detail="Note summarization failed.")


@router.post("/task-subtasks")
@limiter.limit(AI_LIMIT)
async def suggest_task_subtasks(
    request: Request,
    body: TaskSubtasksRequest,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
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
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error("Task subtasks error", error=str(e))
        raise HTTPException(status_code=500, detail="Subtask generation failed.")


@router.post("/task-prioritize")
@limiter.limit(AI_LIMIT)
async def prioritize_tasks(
    request: Request,
    body: TaskPrioritizeRequest,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
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
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error("Task prioritization error", error=str(e))
        raise HTTPException(status_code=500, detail="Task prioritization failed.")


@router.get("/usage")
async def get_usage(
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get AI usage stats."""
    now = datetime.now(timezone.utc)
    result = await db.execute(
        text("SELECT ai_messages_used_today, ai_messages_reset_at, plan FROM users WHERE id=:uid"),
        {"uid": current_user["id"]}
    )
    user = result.fetchone()
    used = user.ai_messages_used_today or 0

    # Auto reset check
    if user.ai_messages_reset_at:
        reset_at = user.ai_messages_reset_at
        if hasattr(reset_at, "tzinfo") and reset_at.tzinfo is None:
            reset_at = reset_at.replace(tzinfo=timezone.utc)
        if (now - reset_at).total_seconds() >= 86400:
            used = 0
            await db.execute(
                text("UPDATE users SET ai_messages_used_today=0, ai_messages_reset_at=NOW() WHERE id=:uid"),
                {"uid": current_user["id"]}
            )
            await db.commit()

    return {
        "success": True,
        "used_today": used,
        "limit": "unlimited" if user.plan == "pro" else 20,
        "remaining": "unlimited" if user.plan == "pro" else max(0, 20 - used),
        "plan": user.plan,
    }


@router.get("/health")
async def ai_health():
    return {"status": "ai service running"}
