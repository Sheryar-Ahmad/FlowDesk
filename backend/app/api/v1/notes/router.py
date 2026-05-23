"""
notes/router.py - Notes API Endpoints
Full CRUD + version history + search.
Every endpoint authenticated and rate limited.
"""

from fastapi import APIRouter, Depends, Request, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Optional
import structlog

from app.database.connection import get_db
from app.core.middleware.auth_guard import get_current_user
from app.core.middleware.rate_limiter import limiter, API_LIMIT
from app.api.v1.notes.schemas import NoteCreate, NoteUpdate
from app.services.note_service import (
    create_note, get_notes, get_note_by_id,
    update_note, delete_note, get_note_versions
)

logger = structlog.get_logger(__name__)
router = APIRouter()


@router.post("/", status_code=status.HTTP_201_CREATED)
@limiter.limit(API_LIMIT)
async def create(request: Request, body: NoteCreate, current_user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    try:
        note = await create_note(db, current_user["id"], current_user["plan"], body.title, body.content, body.content_text)
        return {"success": True, "note": note}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error("Create note error", error=str(e))
        raise HTTPException(status_code=500, detail="Failed to create note.")


@router.get("/")
@limiter.limit(API_LIMIT)
async def list_notes(request: Request, page: int = Query(1, ge=1), page_size: int = Query(50, ge=1, le=100), search: Optional[str] = Query(None), current_user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await get_notes(db, current_user["id"], search, page, page_size)
    return {"success": True, **result}


@router.get("/{note_id}")
@limiter.limit(API_LIMIT)
async def get_one(request: Request, note_id: str, current_user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    note = await get_note_by_id(db, note_id, current_user["id"])
    if not note:
        raise HTTPException(status_code=404, detail="Note not found.")
    return {"success": True, "note": note}


@router.put("/{note_id}")
@limiter.limit(API_LIMIT)
async def update(request: Request, note_id: str, body: NoteUpdate, current_user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    note = await update_note(db, note_id, current_user["id"], body.model_dump(exclude_none=True))
    if not note:
        raise HTTPException(status_code=404, detail="Note not found.")
    return {"success": True, "note": note}


@router.delete("/{note_id}")
@limiter.limit(API_LIMIT)
async def delete(request: Request, note_id: str, current_user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    deleted = await delete_note(db, note_id, current_user["id"])
    if not deleted:
        raise HTTPException(status_code=404, detail="Note not found.")
    return {"success": True, "message": "Note deleted."}


@router.get("/{note_id}/versions")
@limiter.limit(API_LIMIT)
async def versions(request: Request, note_id: str, current_user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    v = await get_note_versions(db, note_id, current_user["id"])
    return {"success": True, "versions": v}


@router.get("/health")
async def notes_health():
    return {"status": "notes service running"}
