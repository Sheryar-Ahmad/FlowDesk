from datetime import date
from types import SimpleNamespace

import pytest

from app.api.v1.dashboard.router import get_dashboard_stats


class FakeResult:
    def one(self):
        return SimpleNamespace(
            focus_minutes_today=75,
            tasks_completed_today=3,
            snippets_saved_today=2,
            ai_sessions_today=4,
            snippets_total=12,
            notes_total=8,
            open_tasks=5,
        )


class FakeDatabase:
    def __init__(self):
        self.params = None

    async def execute(self, _statement, params):
        self.params = params
        return FakeResult()


@pytest.mark.asyncio
async def test_dashboard_stats_returns_all_counters():
    database = FakeDatabase()
    requested_day = date(2026, 6, 14)

    response = await get_dashboard_stats(
        day=requested_day,
        current_user={"id": "user-123"},
        db=database,
    )

    assert database.params == {"uid": "user-123", "day": requested_day}
    assert response == {
        "success": True,
        "day": "2026-06-14",
        "stats": {
            "focus_minutes_today": 75,
            "tasks_completed_today": 3,
            "snippets_saved_today": 2,
            "ai_sessions_today": 4,
            "snippets_total": 12,
            "notes_total": 8,
            "open_tasks": 5,
        },
    }
