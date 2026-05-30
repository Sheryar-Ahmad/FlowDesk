"""
ai/router.py - AI Assistant API Endpoints
------------------------------------------
BACKEND FILE
"""

from fastapi import APIRouter, Depends, Request, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from pydantic import BaseModel
from typing import List
from datetime import datetime, timezone
import structlog

from app.database.connection import get_db
from app.core.middleware.auth_guard import get_current_user
from app.core.middleware.rate_limiter import limiter, AI_LIMIT
from app.services.ai_service import chat_with_ai, analyze_code

logger = structlog.get_logger(__name__)
router = APIRouter()


class Message(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    messages: List[Message]


class AnalyzeRequest(BaseModel):
    code: str
    language: str
    task: str = "explain"


@router.post("/chat")
@limiter.limit(AI_LIMIT)
async def chat(
    request: Request,
    body: ChatRequest,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Chat with AI assistant.
    Free tier: 20 messages per day.
    Pro tier: unlimited.
    """
    try:
        # Get usage count for today
        result = await db.execute(
            text("SELECT ai_messages_used_today, ai_messages_reset_at FROM users WHERE id=:uid"),
            {"uid": current_user["id"]}
        )
        user_data = result.fetchone()
        
        # Reset count if new day
        now = datetime.now(timezone.utc)
        messages_used = user_data.ai_messages_used_today or 0
        
        if user_data.ai_messages_reset_at:
            reset_at = user_data.ai_messages_reset_at
            if hasattr(reset_at, 'tzinfo') and reset_at.tzinfo is None:
                from datetime import timezone as tz
                reset_at = reset_at.replace(tzinfo=timezone.utc)
            if (now - reset_at).days >= 1:
                messages_used = 0
                await db.execute(
                    text("UPDATE users SET ai_messages_used_today=0, ai_messages_reset_at=:now WHERE id=:uid"),
                    {"now": now, "uid": current_user["id"]}
                )
                await db.commit()

        # Call AI
        messages = [{"role": m.role, "content": m.content} for m in body.messages]
        result_ai = await chat_with_ai(messages, current_user["plan"], messages_used)

        # Increment usage count
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
            "messages_remaining": remaining,
        }

    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error("AI chat error", error=str(e))
        raise HTTPException(status_code=500, detail="AI service error.")


@router.post("/analyze")
@limiter.limit(AI_LIMIT)
async def analyze(
    request: Request,
    body: AnalyzeRequest,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Analyze code - explain, fix, review, optimize, document."""
    try:
        response = await analyze_code(body.code, body.language, body.task)
        return {"success": True, "response": response}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error("AI analyze error", error=str(e))
        raise HTTPException(status_code=500, detail="AI analysis failed.")


@router.get("/usage")
async def get_usage(
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get AI usage stats for current user."""
    result = await db.execute(
        text("SELECT ai_messages_used_today, plan FROM users WHERE id=:uid"),
        {"uid": current_user["id"]}
    )
    user = result.fetchone()
    used = user.ai_messages_used_today or 0
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
