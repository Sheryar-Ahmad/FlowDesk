"""
tasks/router.py - Task Board Endpoints
Handles: projects, tasks, kanban columns.
"""

from fastapi import APIRouter

router = APIRouter()

@router.get("/health")
async def tasks_health():
    return {"status": "tasks service running"}
