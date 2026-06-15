from fastapi import Request, status
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
from sqlalchemy.exc import SQLAlchemyError
import structlog
import traceback

logger = structlog.get_logger(__name__)


async def validation_exception_handler(
    request: Request,
    exc: RequestValidationError,
) -> JSONResponse:
    """Handles validation errors from Pydantic."""
    errors = []
    for error in exc.errors():
        field = " -> ".join(str(loc) for loc in error["loc"])
        errors.append({
            "field": field,
            "message": error["msg"],
            "type": error["type"],
        })

    logger.warning(
        "Validation error",
        path=str(request.url),
        errors=errors,
    )

    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        content={
            "error": "Validation failed",
            "detail": "The data you sent is invalid.",
            "errors": errors,
        },
    )


async def sqlalchemy_exception_handler(
    request: Request,
    exc: SQLAlchemyError,
) -> JSONResponse:
    """Handles database errors."""
    logger.error(
        "Database error",
        path=str(request.url),
        error=str(exc),
        traceback=traceback.format_exc(),
    )

    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={
            "error": "Database error",
            "detail": "A database error occurred. Our team has been notified.",
        },
    )


async def general_exception_handler(
    request: Request,
    exc: Exception,
) -> JSONResponse:
    """Catches any unhandled exception."""
    logger.error(
        "Unhandled exception",
        path=str(request.url),
        method=request.method,
        error=str(exc),
        error_type=type(exc).__name__,
        traceback=traceback.format_exc(),
    )

    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={
            "error": "Internal server error",
            "detail": "Something went wrong. Our team has been notified.",
        },
    )
