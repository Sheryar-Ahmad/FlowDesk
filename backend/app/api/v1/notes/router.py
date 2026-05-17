"""
notes/router.py - Notes Endpoints
Handles: create, read, update, delete notes.
"""

from fastapi import APIRouter

router = APIRouter()

@router.get("/health")
async def notes_health():
    return {"status": "notes service running"}
