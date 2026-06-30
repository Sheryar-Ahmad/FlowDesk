from slowapi import Limiter
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from fastapi import Request, Response
from fastapi.responses import JSONResponse
import structlog

from app.config import get_settings

logger = structlog.get_logger(__name__)
settings = get_settings()

# SlowAPI keys these burst limits by client IP.
limiter = Limiter(
    key_func=get_remote_address,
    default_limits=[settings.RATE_LIMIT_DEFAULT],
)


def rate_limit_exceeded_handler(request: Request, exc: RateLimitExceeded) -> Response:
    """Custom response when rate limit is exceeded."""
    logger.warning(
        "Rate limit exceeded",
        ip=get_remote_address(request),
        path=request.url.path,
        limit=str(exc.limit),
    )
    return JSONResponse(
        status_code=429,
        content={
            "error": "Too many requests",
            "detail": f"Rate limit exceeded. Please wait before trying again.",
            "retry_after": "60 seconds",
        },
        headers={"Retry-After": "60"},
    )


AUTH_LIMIT = settings.RATE_LIMIT_AUTH


RESET_LIMIT = settings.RATE_LIMIT_PASSWORD_RESET


API_LIMIT = settings.RATE_LIMIT_API


AI_LIMIT = settings.RATE_LIMIT_AI


SEARCH_LIMIT = settings.RATE_LIMIT_SEARCH


COMPILER_LIMIT = settings.RATE_LIMIT_COMPILER


COMPILER_RUN_LIMIT = settings.RATE_LIMIT_COMPILER_RUN
