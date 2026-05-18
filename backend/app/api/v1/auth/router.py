"""
auth/router.py - Authentication API Endpoints
-----------------------------------------------
These are the actual URLs that frontend calls.

Endpoints:
POST /api/v1/auth/register  - Create new account
POST /api/v1/auth/login     - Login to account
POST /api/v1/auth/logout    - Logout
POST /api/v1/auth/refresh   - Get new access token
GET  /api/v1/auth/me        - Get current user info
"""

from fastapi import APIRouter, Depends, Request, Response, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
import structlog

from app.database.connection import get_db
from app.api.v1.auth.schemas import (
    RegisterRequest,
    LoginRequest,
    TokenResponse,
    RefreshRequest,
)
from app.services.auth_service import register_user, login_user, logout_user
from app.core.middleware.auth_guard import get_current_user
from app.core.middleware.rate_limiter import limiter, AUTH_LIMIT

logger = structlog.get_logger(__name__)
router = APIRouter()


@router.post("/register", status_code=status.HTTP_201_CREATED)
@limiter.limit(AUTH_LIMIT)
async def register(
    request: Request,
    body: RegisterRequest,
    db: AsyncSession = Depends(get_db),
):
    """
    Creates a new FlowDesk account.

    Rate limited: 10 requests per minute per IP.
    Validates: email format, password strength.
    Returns: access token + user data.
    """
    try:
        ip_address = request.client.host if request.client else None

        result = await register_user(
            db=db,
            email=body.email,
            password=body.password,
            display_name=body.display_name,
            ip_address=ip_address,
        )

        # Set refresh token in httpOnly cookie
        # httpOnly = JavaScript cannot read it (XSS protection)
        response = Response()
        response = Response(
            content=str({
                "success": True,
                "access_token": result["access_token"],
                "token_type": result["token_type"],
                "user": result["user"],
            }),
        )

        logger.info("Registration successful", email=body.email)

        return {
            "success": True,
            "access_token": result["access_token"],
            "token_type": result["token_type"],
            "user": result["user"],
            "message": "Account created successfully. Please verify your email.",
        }

    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )
    except Exception as e:
        logger.error("Registration error", error=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Registration failed. Please try again.",
        )


@router.post("/login")
@limiter.limit(AUTH_LIMIT)
async def login(
    request: Request,
    body: LoginRequest,
    db: AsyncSession = Depends(get_db),
):
    """
    Authenticates user and returns JWT tokens.

    Rate limited: 10 requests per minute per IP.
    Security: locks account after 5 failed attempts.
    Returns: access token + user data.
    """
    try:
        ip_address = request.client.host if request.client else None

        result = await login_user(
            db=db,
            email=body.email,
            password=body.password,
            ip_address=ip_address,
        )

        logger.info("Login successful", email=body.email)

        return {
            "success": True,
            "access_token": result["access_token"],
            "token_type": result["token_type"],
            "user": result["user"],
        }

    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=str(e),
        )
    except Exception as e:
        logger.error("Login error", error=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Login failed. Please try again.",
        )


@router.post("/logout")
async def logout(
    request: Request,
    body: RefreshRequest,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Logs out user by revoking refresh token.
    Requires valid access token.
    """
    try:
        ip_address = request.client.host if request.client else None

        await logout_user(
            db=db,
            user_id=current_user["id"],
            refresh_token=body.refresh_token,
            ip_address=ip_address,
        )

        return {"success": True, "message": "Logged out successfully."}

    except Exception as e:
        logger.error("Logout error", error=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Logout failed.",
        )


@router.get("/me")
async def get_me(
    current_user: dict = Depends(get_current_user),
):
    """
    Returns current logged in user data.
    Requires valid access token.
    Used by frontend to check if user is logged in.
    """
    return {
        "success": True,
        "user": current_user,
    }


@router.get("/health")
async def auth_health():
    """Check auth service is running."""
    return {"status": "auth service running"}
