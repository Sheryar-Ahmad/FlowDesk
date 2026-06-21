from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession
import structlog

from app.core.middleware.auth_guard import get_current_user
from app.database.connection import get_db


logger = structlog.get_logger(__name__)
router = APIRouter()


@router.get("/stats")
async def get_dashboard_stats(
    day: date = Query(default_factory=date.today),
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return the current user's dashboard counters in one query."""
    try:
        result = await db.execute(
            text(
                """
                SELECT
                    (
                        SELECT COALESCE(SUM(duration_minutes), 0)
                        FROM pomodoro_sessions
                        WHERE user_id = :uid
                          AND session_date = :day
                          AND completed = TRUE
                    ) AS focus_minutes_today,
                    (
                        SELECT COUNT(*)
                        FROM tasks
                        WHERE user_id = :uid
                          AND status = 'done'
                          AND completed_at IS NOT NULL
                          AND completed_at::date = :day
                    ) AS tasks_completed_today,
                    (
                        SELECT COUNT(*)
                        FROM snippets
                        WHERE user_id = :uid
                          AND deleted_at IS NULL
                          AND created_at::date = :day
                    ) AS snippets_saved_today,
                    (
                        SELECT COUNT(*)
                        FROM ai_sessions
                        WHERE user_id = :uid
                          AND created_at::date = :day
                    ) AS ai_sessions_today,
                    (
                        SELECT COUNT(*)
                        FROM snippets
                        WHERE user_id = :uid
                          AND deleted_at IS NULL
                    ) AS snippets_total,
                    (
                        SELECT COUNT(*)
                        FROM notes
                        WHERE user_id = :uid
                          AND deleted_at IS NULL
                    ) AS notes_total,
                    (
                        SELECT COUNT(*)
                        FROM tasks
                        WHERE user_id = :uid
                          AND status <> 'done'
                    ) AS open_tasks,
                    (
                        SELECT COUNT(*)
                        FROM compiler_files
                        WHERE user_id = :uid
                          AND deleted_at IS NULL
                    ) AS compiler_files_total
                """
            ),
            {"uid": current_user["id"], "day": day},
        )
        stats = result.one()
        return {
            "success": True,
            "day": day.isoformat(),
            "stats": {
                "focus_minutes_today": int(stats.focus_minutes_today or 0),
                "tasks_completed_today": int(stats.tasks_completed_today or 0),
                "snippets_saved_today": int(stats.snippets_saved_today or 0),
                "ai_sessions_today": int(stats.ai_sessions_today or 0),
                "snippets_total": int(stats.snippets_total or 0),
                "notes_total": int(stats.notes_total or 0),
                "open_tasks": int(stats.open_tasks or 0),
                "compiler_files_total": int(stats.compiler_files_total or 0),
            },
        }
    except Exception as exc:
        logger.error(
            "Dashboard stats error",
            user_id=current_user.get("id"),
            error=str(exc),
        )
        raise HTTPException(status_code=500, detail="Failed to load dashboard stats.") from exc
