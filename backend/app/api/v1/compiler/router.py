from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy.ext.asyncio import AsyncSession
import structlog

from app.api.v1.compiler.schemas import (
    CompilerFileCreate,
    CompilerFileUpdate,
    CompilerRunRequest,
    CompilerSavedRunRequest,
    CompilerTestCaseRequest,
)
from app.config import get_settings
from app.core.middleware.auth_guard import get_current_user
from app.core.middleware.rate_limiter import COMPILER_LIMIT, COMPILER_RUN_LIMIT, limiter
from app.database.connection import get_db
from app.services.compiler_service import (
    create_compiler_file,
    delete_compiler_file,
    duplicate_file,
    get_compiler_file,
    get_run_history,
    get_run_stats,
    list_compiler_files,
    list_runtimes,
    run_code,
    run_compiler_file,
    run_test_cases,
    update_compiler_file,
)


logger = structlog.get_logger(__name__)
router = APIRouter()
settings = get_settings()


def compiler_value_error_status(exc: ValueError) -> int:
    message = str(exc).lower()
    if "limit reached" in message:
        return status.HTTP_429_TOO_MANY_REQUESTS
    return status.HTTP_400_BAD_REQUEST


def compiler_internal_error_detail(exc: Exception, fallback: str) -> str:
    if settings.DEBUG:
        message = str(exc).strip()
        if message:
            return message[:800]
        return exc.__class__.__name__
    return fallback


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
        raise HTTPException(status_code=compiler_value_error_status(exc), detail=str(exc)) from exc
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


@router.post("/files/{file_id}/duplicate", status_code=status.HTTP_201_CREATED)
@limiter.limit(COMPILER_LIMIT)
async def duplicate_saved_file(
    request: Request,
    file_id: str,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    try:
        file = await duplicate_file(db, file_id, current_user["id"], current_user["plan"])
        if not file:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Compiler file not found.")
        return {"success": True, "file": file}
    except HTTPException:
        raise
    except ValueError as exc:
        raise HTTPException(status_code=compiler_value_error_status(exc), detail=str(exc)) from exc
    except Exception as exc:
        logger.error("Duplicate compiler file error", user_id=current_user.get("id"), file_id=file_id, error=str(exc))
        raise HTTPException(status_code=500, detail="Failed to duplicate compiler file.") from exc


@router.get("/runs/history")
@limiter.limit(COMPILER_LIMIT)
async def run_history(
    request: Request,
    limit: int = Query(50, ge=1, le=200),
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    events = await get_run_history(db, current_user["id"], limit=limit)
    return {"success": True, "events": events}


@router.get("/runs/stats")
@limiter.limit(COMPILER_LIMIT)
async def run_stats(
    request: Request,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    stats_data = await get_run_stats(db, current_user["id"])
    return {"success": True, "stats": stats_data}


@router.post("/run")
@limiter.limit(COMPILER_RUN_LIMIT)
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
            args=body.args,
            use_cache=body.use_cache,
        )
        return {"success": True, "result": result}
    except ValueError as exc:
        raise HTTPException(status_code=compiler_value_error_status(exc), detail=str(exc)) from exc
    except Exception as exc:
        logger.error("Compiler inline run error", user_id=current_user.get("id"), error=str(exc))
        detail = compiler_internal_error_detail(exc, "Failed to run code.")
        raise HTTPException(status_code=500, detail=detail) from exc


@router.post("/test-cases")
@limiter.limit(COMPILER_RUN_LIMIT)
async def run_compiler_test_cases(
    request: Request,
    body: CompilerTestCaseRequest,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    try:
        result = await run_test_cases(
            db,
            current_user["id"],
            current_user["plan"],
            language=body.language,
            code=body.code,
            test_cases=[case.model_dump() for case in body.test_cases],
        )
        return {"success": True, "result": result}
    except ValueError as exc:
        raise HTTPException(status_code=compiler_value_error_status(exc), detail=str(exc)) from exc
    except Exception as exc:
        logger.error("Compiler test case run error", user_id=current_user.get("id"), error=str(exc))
        detail = compiler_internal_error_detail(exc, "Failed to run compiler test cases.")
        raise HTTPException(status_code=500, detail=detail) from exc


@router.post("/{file_id}/run")
@limiter.limit(COMPILER_RUN_LIMIT)
async def run_saved_file(
    request: Request,
    file_id: str,
    body: CompilerSavedRunRequest | None = None,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    try:
        result = await run_compiler_file(
            db,
            current_user["id"],
            current_user["plan"],
            file_id,
            title=body.title if body else None,
            language=body.language if body else None,
            code=body.code if body else None,
            stdin=body.stdin if body else None,
            args=body.args if body else None,
            use_cache=body.use_cache if body else True,
        )
        if not result:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Compiler file not found.")
        return {"success": True, "result": result}
    except HTTPException:
        raise
    except ValueError as exc:
        raise HTTPException(status_code=compiler_value_error_status(exc), detail=str(exc)) from exc
    except Exception as exc:
        logger.error("Compiler saved run error", user_id=current_user.get("id"), file_id=file_id, error=str(exc))
        detail = compiler_internal_error_detail(exc, "Failed to run compiler file.")
        raise HTTPException(status_code=500, detail=detail) from exc
