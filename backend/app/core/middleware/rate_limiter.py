"""
rate_limiter.py - Token Bucket Rate Limiting
---------------------------------------------
Rate limiting prevents abuse of our API.
Without it, one person could send millions of
requests and crash our server.

We use Token Bucket Algorithm:
- Each user gets a bucket with N tokens
- Each request uses 1 token
- Tokens refill over time
- When bucket empty - request rejected

Example:
- Login endpoint: 10 requests per minute per IP
- API endpoints: 100 requests per minute per user
- AI endpoint: 20 requests per day per user

This protects against:
- Brute force attacks
- DDoS attacks
- API abuse
- Scraping
"""

from slowapi import Limiter
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from fastapi import Request, Response
from fastapi.responses import JSONResponse
import structlog

logger = structlog.get_logger(__name__)

# Create limiter using IP address as the key
# This means limits are per IP address
limiter = Limiter(
    key_func=get_remote_address,
    default_limits=["200/minute"],
)


def rate_limit_exceeded_handler(request: Request, exc: RateLimitExceeded) -> Response:
    """
    Custom response when rate limit is exceeded.
    Returns clear error message with retry information.
    """
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


# --- Pre-defined rate limits for different endpoints ---

# Very strict - for login/register to prevent brute force
AUTH_LIMIT = "10/minute"

# Strict - for password reset
RESET_LIMIT = "5/hour"

# Standard - for regular API calls
API_LIMIT = "100/minute"

# AI limit - expensive operations
AI_LIMIT = "30/minute"

# Search limit
SEARCH_LIMIT = "60/minute"
