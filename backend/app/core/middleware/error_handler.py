"""
error_handler.py - Global Error Handler
-----------------------------------------
Catches ALL errors in the application and returns
clean, safe error messages to users.

Why this matters:
- Without this, Python errors show stack traces
- Stack traces reveal our code structure to attackers
- This hides internal details while logging everything

Security rule:
- Users see: clean, helpful error message
- We see: full error details in logs
- Attackers see: nothing useful
"""

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
    """
    Handles validation errors from Pydantic.
    When user sends wrong data format.
    
    Example: sending text where number expected.
    """
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
    """
    Handles database errors.
    Never exposes database details to users.
    """
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
    """
    Catches any unhandled exception.
    Last line of defense.
    Logs full details, returns safe message to user.
    """
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
