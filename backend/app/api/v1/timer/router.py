from fastapi import APIRouter, Depends, Request, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from pydantic import BaseModel
from typing import Optional
from datetime import date, timedelta
import structlog

from app.database.connection import get_db
from app.core.middleware.auth_guard import get_current_user
from app.core.middleware.rate_limiter import limiter, API_LIMIT

logger = structlog.get_logger(__name__)
router = APIRouter()


class SessionCreate(BaseModel):
    duration_minutes: int
    completed: bool = True
    session_date: Optional[str] = None


@router.post("/sessions", status_code=201)
@limiter.limit(API_LIMIT)
async def create_session(
    request: Request,
    body: SessionCreate,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    try:
        session_date = body.session_date or str(date.today())
        await db.execute(
            text("INSERT INTO pomodoro_sessions (user_id, duration_minutes, completed, session_date) VALUES (:uid, :duration, :completed, :session_date)"),
            {"uid": current_user["id"], "duration": body.duration_minutes, "completed": body.completed, "session_date": session_date}
        )
        await db.commit()
        return {"success": True, "message": "Session saved."}
    except Exception as e:
        logger.error("Save session error", error=str(e))
        raise HTTPException(status_code=500, detail="Failed to save session.")


@router.get("/stats")
async def get_stats(
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    try:
        today = str(date.today())
        r1 = await db.execute(
            text("SELECT COUNT(*) as sessions, COALESCE(SUM(duration_minutes), 0) as minutes FROM pomodoro_sessions WHERE user_id=:uid AND session_date=:today AND completed=TRUE"),
            {"uid": current_user["id"], "today": today}
        )
        today_stats = r1.fetchone()

        r2 = await db.execute(
            text("SELECT COUNT(*) as total_sessions, COALESCE(SUM(duration_minutes), 0) as total_minutes FROM pomodoro_sessions WHERE user_id=:uid AND completed=TRUE"),
            {"uid": current_user["id"]}
        )
        total_stats = r2.fetchone()

        r3 = await db.execute(
            text("SELECT DISTINCT session_date FROM pomodoro_sessions WHERE user_id=:uid AND completed=TRUE ORDER BY session_date DESC LIMIT 30"),
            {"uid": current_user["id"]}
        )
        dates = [str(row.session_date) for row in r3.fetchall()]
        streak = 0
        check_date = date.today()
        for d in dates:
            if d == str(check_date):
                streak += 1
                check_date -= timedelta(days=1)
            else:
                break

        return {
            "success": True,
            "today": {"sessions": today_stats.sessions, "minutes": today_stats.minutes},
            "total": {"sessions": total_stats.total_sessions, "minutes": total_stats.total_minutes},
            "streak": streak,
        }
    except Exception as e:
        logger.error("Stats error", error=str(e))
        raise HTTPException(status_code=500, detail="Failed to get stats.")


@router.get("/health")
async def timer_health():
    return {"status": "timer service running"}
