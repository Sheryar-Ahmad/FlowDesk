from fastapi import APIRouter, Depends, Request, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Optional
import structlog

from app.database.connection import get_db
from app.core.middleware.auth_guard import get_current_user
from app.core.middleware.rate_limiter import limiter, API_LIMIT
from app.api.v1.snippets.schemas import SnippetCreate, SnippetUpdate
from app.services.snippet_service import (
    create_snippet, get_snippets, get_snippet_by_id,
    update_snippet, delete_snippet, increment_use_count
)

logger = structlog.get_logger(__name__)
router = APIRouter()


@router.post("/", status_code=status.HTTP_201_CREATED)
@limiter.limit(API_LIMIT)
async def create(
    request: Request,
    body: SnippetCreate,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Creates a new code snippet."""
    try:
        snippet = await create_snippet(
            db=db,
            user_id=current_user["id"],
            plan=current_user["plan"],
            title=body.title,
            code=body.code,
            language=body.language,
            description=body.description,
            tags=body.tags,
            is_public=body.is_public,
            collection_id=body.collection_id,
        )
        return {"success": True, "snippet": snippet}
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except Exception as e:
        logger.error("Create snippet error", error=str(e))
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to create snippet.")


@router.get("/")
@limiter.limit(API_LIMIT)
async def list_snippets(
    request: Request,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    language: Optional[str] = Query(None),
    search: Optional[str] = Query(None, min_length=2),
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Returns paginated list of user snippets."""
    result = await get_snippets(
        db=db,
        user_id=current_user["id"],
        page=page,
        page_size=page_size,
        language=language,
        search=search,
    )
    return {"success": True, **result}


@router.get("/{snippet_id}")
@limiter.limit(API_LIMIT)
async def get_one(
    request: Request,
    snippet_id: str,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Returns a single snippet by ID."""
    snippet = await get_snippet_by_id(db, snippet_id, current_user["id"])
    if not snippet:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Snippet not found.")
    return {"success": True, "snippet": snippet}


@router.put("/{snippet_id}")
@limiter.limit(API_LIMIT)
async def update(
    request: Request,
    snippet_id: str,
    body: SnippetUpdate,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Updates an existing snippet."""
    snippet = await update_snippet(
        db=db,
        snippet_id=snippet_id,
        user_id=current_user["id"],
        updates=body.model_dump(exclude_none=True),
    )
    if not snippet:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Snippet not found.")
    return {"success": True, "snippet": snippet}


@router.delete("/{snippet_id}")
@limiter.limit(API_LIMIT)
async def delete(
    request: Request,
    snippet_id: str,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Soft deletes a snippet. Recoverable for 30 days."""
    deleted = await delete_snippet(db, snippet_id, current_user["id"])
    if not deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Snippet not found.")
    return {"success": True, "message": "Snippet deleted successfully."}


@router.post("/{snippet_id}/copy")
@limiter.limit(API_LIMIT)
async def copy_snippet(
    request: Request,
    snippet_id: str,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Tracks when user copies a snippet."""
    await increment_use_count(db, snippet_id, current_user["id"])
    return {"success": True, "message": "Usage tracked."}


@router.get("/health")
async def snippets_health():
    return {"status": "snippets service running"}
