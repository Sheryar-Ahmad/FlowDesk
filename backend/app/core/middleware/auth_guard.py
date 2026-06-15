from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, text
from typing import Optional
import structlog

from app.database.connection import get_db
from app.core.security.jwt import verify_access_token
from app.config import get_settings

logger = structlog.get_logger(__name__)
settings = get_settings()


security = HTTPBearer(auto_error=False)


class TokenData:
    """Holds the verified token data for the current request."""
    def __init__(self, user_id: str, email: str, plan: str):
        self.user_id = user_id
        self.email = email
        self.plan = plan


async def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Main authentication dependency."""

    if not credentials:
        logger.warning("Request with no authentication token")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required. Please login.",
            headers={"WWW-Authenticate": "Bearer"},
        )


    token = credentials.credentials
    payload = verify_access_token(token)
    if not payload:
        logger.warning("Request with invalid or expired token")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token. Please login again.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token payload.",
            headers={"WWW-Authenticate": "Bearer"},
        )


    try:
        result = await db.execute(
            text("""
                SELECT id, email, display_name, plan, email_verified,
                       locked_until, deleted_at, failed_login_count
                FROM users
                WHERE id = :user_id
            """),
            {"user_id": user_id}
        )
        user = result.fetchone()
    except Exception as e:
        logger.error("Database error in auth guard", error=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Authentication service error.",
        )


    if not user:
        logger.warning("Token for non-existent user", user_id=user_id)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User account not found.",
        )


    if user.deleted_at is not None:
        logger.warning("Deleted user attempting access", user_id=user_id)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="This account has been deleted.",
        )


    from datetime import datetime, timezone
    if user.locked_until and user.locked_until > datetime.now(timezone.utc):
        logger.warning("Locked user attempting access", user_id=user_id)
        raise HTTPException(
            status_code=status.HTTP_423_LOCKED,
            detail="Account is temporarily locked. Please try again later.",
        )


    return {
        "id": str(user.id),
        "email": user.email,
        "display_name": user.display_name,
        "plan": user.plan,
        "email_verified": user.email_verified,
    }


async def get_current_verified_user(
    current_user: dict = Depends(get_current_user),
) -> dict:
    """Same as get_current_user but also requires email verification."""
    if not current_user.get("email_verified"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Please verify your email address to access this feature.",
        )
    return current_user


async def get_pro_user(
    current_user: dict = Depends(get_current_verified_user),
) -> dict:
    """Requires user to be on Pro plan."""
    if current_user.get("plan") != "pro":
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail="This feature requires a Pro subscription. Upgrade at flowdesk.app/billing",
        )
    return current_user


def check_resource_ownership(resource_user_id: str, current_user_id: str) -> None:
    """Verifies that the current user owns the resource they are trying to access."""
    if str(resource_user_id) != str(current_user_id):
        logger.warning(
            "Unauthorized resource access attempt",
            resource_owner=resource_user_id,
            requester=current_user_id,
        )
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to access this resource.",
        )
