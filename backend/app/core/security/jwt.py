"""
jwt.py - JSON Web Token Management
-------------------------------------
JWT tokens are like temporary ID cards for users.
When user logs in, we give them two tokens:

1. ACCESS TOKEN (15 minutes)
   - Used for every API request
   - Short lived for security
   - If stolen, expires quickly

2. REFRESH TOKEN (30 days)
   - Used only to get new access token
   - Stored in httpOnly cookie
   - JavaScript cannot read it (XSS protection)

How it works:
   User logs in -> gets access + refresh token
   Access token expires -> use refresh token to get new one
   Refresh token expires -> user must login again
"""

import jwt
import secrets
import hashlib
from datetime import datetime, timedelta, timezone
from typing import Optional
import structlog

from app.config import get_settings

logger = structlog.get_logger(__name__)
settings = get_settings()


def create_access_token(user_id: str, email: str, plan: str = "free") -> str:
    """
    Creates a short-lived access token (15 minutes).
    
    Contains:
    - user_id: who this token belongs to
    - email: user email
    - plan: free or pro
    - exp: when it expires
    - iat: when it was created
    - type: access (to distinguish from refresh)
    """
    now = datetime.now(timezone.utc)
    expire = now + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)

    payload = {
        "sub": str(user_id),
        "email": email,
        "plan": plan,
        "type": "access",
        "iat": now,
        "exp": expire,
    }

    token = jwt.encode(
        payload,
        settings.SECRET_KEY,
        algorithm=settings.ALGORITHM,
    )

    logger.info(
        "Access token created",
        user_id=user_id,
        expires_at=expire.isoformat(),
    )

    return token


def create_refresh_token() -> tuple[str, str]:
    """
    Creates a long-lived refresh token (30 days).
    
    Returns tuple of:
    - raw_token: sent to user (stored in httpOnly cookie)
    - token_hash: stored in database (never store raw token)
    
    We hash the refresh token before storing in database.
    If database is breached, attacker cannot use the hashes.
    """
    raw_token = secrets.token_urlsafe(64)
    token_hash = hashlib.sha256(raw_token.encode()).hexdigest()

    return raw_token, token_hash


def verify_access_token(token: str) -> Optional[dict]:
    """
    Verifies access token and returns payload if valid.
    
    Returns None if:
    - Token is expired
    - Token is tampered with
    - Token is invalid format
    """
    try:
        payload = jwt.decode(
            token,
            settings.SECRET_KEY,
            algorithms=[settings.ALGORITHM],
        )

        # Make sure this is an access token not refresh
        if payload.get("type") != "access":
            logger.warning("Wrong token type used as access token")
            return None

        return payload

    except jwt.ExpiredSignatureError:
        logger.info("Access token expired")
        return None
    except jwt.InvalidTokenError as e:
        logger.warning("Invalid access token", error=str(e))
        return None


def hash_token(raw_token: str) -> str:
    """
    Hashes a raw token using SHA256.
    Used to verify refresh tokens stored in database.
    """
    return hashlib.sha256(raw_token.encode()).hexdigest()


def extract_token_from_header(authorization: str) -> Optional[str]:
    """
    Extracts JWT token from Authorization header.
    
    Header format: "Bearer eyJhbGciOiJ..."
    Returns just the token part.
    """
    if not authorization:
        return None
    parts = authorization.split(" ")
    if len(parts) != 2 or parts[0].lower() != "bearer":
        return None
    return parts[1]
