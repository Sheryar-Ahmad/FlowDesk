from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy.ext.asyncio import AsyncSession
import structlog

from app.api.v1.compiler.schemas import (
    CompilerFileCreate,
    CompilerFileUpdate,
    CompilerRunRequest,
)
from app.core.middleware.auth_guard import get_current_user
from app.core.middleware.rate_limiter import COMPILER_LIMIT, limiter
from app.database.connection import get_db
from app.services.compiler_service import (
    create_compiler_file,
    delete_compiler_file,
    get_compiler_file,
    list_compiler_files,
    list_runtimes,
    run_code,
    run_compiler_file,
    update_compiler_file,
)


logger = structlog.get_logger(__name__)
router = APIRouter()


@router.get("/health")
async def compiler_health():
    return {"status": "compiler service running"}


@router.get("/runtimes")
@limiter.limit(COMPILER_LIMIT)
async def runtimes(
    request: Request,
    current_user: dict = Depends(get_current_user),
):
    return {"success": True, "runtimes": list_runtimes()}


@router.get("/")
@limiter.limit(COMPILER_LIMIT)
async def list_files(
    request: Request,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    language: str | None = Query(None),
    search: str | None = Query(None, min_length=2, max_length=120),
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await list_compiler_files(
        db,
        current_user["id"],
        page=page,
        page_size=page_size,
        language=language,
        search=search,
    )
    return {"success": True, **result}


@router.post("/", status_code=status.HTTP_201_CREATED)
@limiter.limit(COMPILER_LIMIT)
async def create_file(
    request: Request,
    body: CompilerFileCreate,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    try:
        file = await create_compiler_file(
            db,
            current_user["id"],
            current_user["plan"],
            title=body.title,
            language=body.language,
            code=body.code,
            stdin=body.stdin,
        )
        return {"success": True, "file": file}
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    except Exception as exc:
        logger.error("Create compiler file error", user_id=current_user.get("id"), error=str(exc))
        raise HTTPException(status_code=500, detail="Failed to create compiler file.") from exc


@router.get("/{file_id}")
@limiter.limit(COMPILER_LIMIT)
async def get_file(
    request: Request,
    file_id: str,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    file = await get_compiler_file(db, file_id, current_user["id"])
    if not file:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Compiler file not found.")
    return {"success": True, "file": file}


@router.put("/{file_id}")
@limiter.limit(COMPILER_LIMIT)
async def update_file(
    request: Request,
    file_id: str,
    body: CompilerFileUpdate,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    file = await update_compiler_file(
        db,
        file_id,
        current_user["id"],
        body.model_dump(exclude_none=True),
    )
    if not file:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Compiler file not found.")
    return {"success": True, "file": file}


@router.delete("/{file_id}")
@limiter.limit(COMPILER_LIMIT)
async def delete_file(
    request: Request,
    file_id: str,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    deleted = await delete_compiler_file(db, file_id, current_user["id"])
    if not deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Compiler file not found.")
    return {"success": True, "message": "Compiler file deleted successfully."}


@router.post("/run")
@limiter.limit(COMPILER_LIMIT)
async def run_inline(
    request: Request,
    body: CompilerRunRequest,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    try:
        result = await run_code(
            db,
            current_user["id"],
            current_user["plan"],
            language=body.language,
            code=body.code,
            stdin=body.stdin,
        )
        return {"success": True, "result": result}
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail=str(exc)) from exc
    except Exception as exc:
        logger.error("Compiler inline run error", user_id=current_user.get("id"), error=str(exc))
        raise HTTPException(status_code=500, detail="Failed to run code.") from exc


@router.post("/{file_id}/run")
@limiter.limit(COMPILER_LIMIT)
async def run_saved_file(
    request: Request,
    file_id: str,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    try:
        result = await run_compiler_file(db, current_user["id"], current_user["plan"], file_id)
        if not result:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Compiler file not found.")
        return {"success": True, "result": result}
    except HTTPException:
        raise
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail=str(exc)) from exc
    except Exception as exc:
        logger.error("Compiler saved run error", user_id=current_user.get("id"), file_id=file_id, error=str(exc))
        raise HTTPException(status_code=500, detail="Failed to run compiler file.") from exc
