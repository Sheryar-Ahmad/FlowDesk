from slowapi import Limiter
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from fastapi import Request, Response
from fastapi.responses import JSONResponse
import structlog

logger = structlog.get_logger(__name__)

# SlowAPI keys these burst limits by client IP.
limiter = Limiter(
    key_func=get_remote_address,
    default_limits=["200/minute"],
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


AUTH_LIMIT = "10/minute"


RESET_LIMIT = "5/hour"


API_LIMIT = "100/minute"


AI_LIMIT = "30/minute"


SEARCH_LIMIT = "60/minute"


COMPILER_LIMIT = "20/minute"
