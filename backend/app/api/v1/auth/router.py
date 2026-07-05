import base64
import hashlib
import hmac
import json
import secrets
import time
from urllib.parse import urlencode, urlsplit

import httpx
from fastapi import APIRouter, Depends, Request, HTTPException, Query, status
from fastapi.responses import RedirectResponse
from sqlalchemy.ext.asyncio import AsyncSession
import structlog

from app.config import get_settings
from app.database.connection import get_db
from app.api.v1.auth.schemas import (
    GoogleExchangeRequest,
    RegisterRequest,
    LoginRequest,
    RefreshRequest,
)
from app.services.auth_service import (
    create_oauth_handoff_code,
    exchange_oauth_handoff_code,
    login_user,
    logout_user,
    refresh_access_token,
    register_user,
    upsert_google_user,
)
from app.core.middleware.auth_guard import get_current_user
from app.core.middleware.rate_limiter import limiter, AUTH_LIMIT

logger = structlog.get_logger(__name__)
router = APIRouter()
settings = get_settings()

GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
GOOGLE_USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo"
GOOGLE_STATE_COOKIE = "flowdesk_google_oauth_state"
GOOGLE_STATE_TTL_SECONDS = 600


def google_oauth_configured() -> bool:
    return bool(settings.GOOGLE_CLIENT_ID.strip() and settings.GOOGLE_CLIENT_SECRET.strip())


def safe_next_path(next_path: str | None) -> str:
    if not next_path or not next_path.startswith("/") or next_path.startswith("//"):
        return "/dashboard"
    return next_path[:300]


def frontend_url(path: str, params: dict[str, str] | None = None) -> str:
    url = f"{settings.FRONTEND_URL.rstrip('/')}{path}"
    if params:
        return f"{url}?{urlencode(params)}"
    return url


def base64url_encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).decode().rstrip("=")


def base64url_decode(data: str) -> bytes:
    padding = "=" * (-len(data) % 4)
    return base64.urlsafe_b64decode(f"{data}{padding}")


def sign_google_state(payload: dict) -> str:
    encoded = base64url_encode(json.dumps(payload, separators=(",", ":")).encode())
    signature = hmac.new(
        settings.SECRET_KEY.encode(),
        encoded.encode(),
        hashlib.sha256,
    ).digest()
    return f"{encoded}.{base64url_encode(signature)}"


def read_google_state(state: str) -> dict:
    try:
        encoded, supplied_signature = state.split(".", 1)
    except ValueError as exc:
        raise ValueError("Invalid Google sign-in state.") from exc

    expected_signature = base64url_encode(
        hmac.new(settings.SECRET_KEY.encode(), encoded.encode(), hashlib.sha256).digest()
    )
    if not hmac.compare_digest(expected_signature, supplied_signature):
        raise ValueError("Invalid Google sign-in state.")

    try:
        payload = json.loads(base64url_decode(encoded))
    except (ValueError, json.JSONDecodeError) as exc:
        raise ValueError("Invalid Google sign-in state.") from exc

    if not isinstance(payload, dict) or int(payload.get("exp", 0)) < int(time.time()):
        raise ValueError("Google sign-in state expired.")
    return payload


def google_redirect_uri(request: Request) -> str:
    configured = settings.GOOGLE_REDIRECT_URI.strip()
    if configured:
        return configured
    return str(request.url_for("google_callback"))


def google_state_cookie_secure(request: Request) -> bool:
    return urlsplit(google_redirect_uri(request)).scheme == "https"


async def exchange_google_authorization_code(code: str, redirect_uri: str) -> str:
    async with httpx.AsyncClient(timeout=15) as client:
        response = await client.post(
            GOOGLE_TOKEN_URL,
            data={
                "code": code,
                "client_id": settings.GOOGLE_CLIENT_ID,
                "client_secret": settings.GOOGLE_CLIENT_SECRET,
                "redirect_uri": redirect_uri,
                "grant_type": "authorization_code",
            },
            headers={"Accept": "application/json"},
        )
        response.raise_for_status()
        payload = response.json()

    access_token = payload.get("access_token")
    if not isinstance(access_token, str) or not access_token:
        raise ValueError("Google did not return an access token.")
    return access_token


async def fetch_google_profile(access_token: str) -> dict:
    async with httpx.AsyncClient(timeout=15) as client:
        response = await client.get(
            GOOGLE_USERINFO_URL,
            headers={
                "Accept": "application/json",
                "Authorization": f"Bearer {access_token}",
            },
        )
        response.raise_for_status()
        payload = response.json()
    if not isinstance(payload, dict):
        raise ValueError("Google returned an invalid profile.")
    return payload


def oauth_error_redirect(message: str) -> RedirectResponse:
    response = RedirectResponse(
        frontend_url("/auth/callback", {"oauth_error": message}),
        status_code=status.HTTP_302_FOUND,
    )
    response.delete_cookie(GOOGLE_STATE_COOKIE)
    return response


@router.post("/register", status_code=status.HTTP_201_CREATED)
@limiter.limit(AUTH_LIMIT)
async def register(
    request: Request,
    body: RegisterRequest,
    db: AsyncSession = Depends(get_db),
):
    """Creates a new FlowDesk account."""
    try:
        ip_address = request.client.host if request.client else None

        result = await register_user(
            db=db,
            email=body.email,
            password=body.password,
            display_name=body.display_name,
            ip_address=ip_address,
        )

        logger.info("Registration successful", email=body.email)

        return {
            "success": True,
            "access_token": result["access_token"],
            "refresh_token": result["refresh_token"],
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
    """Authenticates user and returns JWT tokens."""
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
            "refresh_token": result["refresh_token"],
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


@router.post("/refresh")
@limiter.limit(AUTH_LIMIT)
async def refresh(
    request: Request,
    body: RefreshRequest,
    db: AsyncSession = Depends(get_db),
):
    """Rotates a valid refresh token and returns a fresh session."""
    try:
        ip_address = request.client.host if request.client else None
        result = await refresh_access_token(
            db=db,
            refresh_token=body.refresh_token,
            ip_address=ip_address,
        )
        return {"success": True, **result}
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=str(exc),
        ) from exc
    except Exception as exc:
        logger.error("Token refresh error", error=str(exc))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Session refresh failed. Please sign in again.",
        ) from exc


@router.get("/google/start")
@limiter.limit(AUTH_LIMIT)
async def google_start(
    request: Request,
    next_path: str = Query("/dashboard", alias="next"),
):
    """Starts the Google OAuth flow."""
    if not google_oauth_configured():
        return oauth_error_redirect("Google sign-in is not configured yet.")

    next_url = safe_next_path(next_path)
    nonce = secrets.token_urlsafe(32)
    state_token = sign_google_state({
        "nonce": nonce,
        "next": next_url,
        "exp": int(time.time()) + GOOGLE_STATE_TTL_SECONDS,
    })
    params = {
        "client_id": settings.GOOGLE_CLIENT_ID,
        "redirect_uri": google_redirect_uri(request),
        "response_type": "code",
        "scope": "openid email profile",
        "state": state_token,
        "access_type": "online",
        "prompt": "select_account",
    }
    response = RedirectResponse(
        f"{GOOGLE_AUTH_URL}?{urlencode(params)}",
        status_code=status.HTTP_302_FOUND,
    )
    response.set_cookie(
        GOOGLE_STATE_COOKIE,
        nonce,
        max_age=GOOGLE_STATE_TTL_SECONDS,
        httponly=True,
        secure=google_state_cookie_secure(request),
        samesite="lax",
    )
    return response


@router.get("/google/callback", name="google_callback")
@limiter.limit(AUTH_LIMIT)
async def google_callback(
    request: Request,
    code: str | None = None,
    state: str | None = None,
    error: str | None = None,
    db: AsyncSession = Depends(get_db),
):
    """Handles Google's OAuth callback and returns a one-time handoff code."""
    if error:
        logger.warning("Google OAuth returned an error", error=error)
        return oauth_error_redirect("Google sign-in was cancelled.")
    if not code or not state:
        return oauth_error_redirect("Google sign-in did not complete.")

    try:
        state_payload = read_google_state(state)
        cookie_nonce = request.cookies.get(GOOGLE_STATE_COOKIE)
        if not cookie_nonce or cookie_nonce != state_payload.get("nonce"):
            raise ValueError("Google sign-in state did not match this browser.")

        access_token = await exchange_google_authorization_code(code, google_redirect_uri(request))
        profile = await fetch_google_profile(access_token)
        ip_address = request.client.host if request.client else None
        user = await upsert_google_user(db, profile=profile, ip_address=ip_address)
        handoff_code = await create_oauth_handoff_code(
            db,
            user_id=user["id"],
            ip_address=ip_address,
        )
        response = RedirectResponse(
            frontend_url(
                "/auth/callback",
                {
                    "code": handoff_code,
                    "next": safe_next_path(str(state_payload.get("next") or "/dashboard")),
                },
            ),
            status_code=status.HTTP_302_FOUND,
        )
        response.delete_cookie(GOOGLE_STATE_COOKIE)
        return response
    except httpx.HTTPError as exc:
        logger.warning("Google OAuth HTTP request failed", error=str(exc))
        return oauth_error_redirect("Google sign-in failed. Please try again.")
    except ValueError as exc:
        logger.warning("Google OAuth validation failed", error=str(exc))
        return oauth_error_redirect(str(exc))
    except Exception as exc:
        logger.error("Google OAuth callback failed", error=str(exc))
        return oauth_error_redirect("Google sign-in failed. Please try again.")


@router.post("/google/exchange")
@limiter.limit(AUTH_LIMIT)
async def google_exchange(
    request: Request,
    body: GoogleExchangeRequest,
    db: AsyncSession = Depends(get_db),
):
    """Exchanges a one-time Google handoff code for a FlowDesk session."""
    try:
        ip_address = request.client.host if request.client else None
        result = await exchange_oauth_handoff_code(
            db=db,
            code=body.code,
            ip_address=ip_address,
        )
        return {"success": True, **result}
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=str(exc),
        ) from exc
    except Exception as exc:
        logger.error("Google OAuth exchange failed", error=str(exc))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Google sign-in failed. Please try again.",
        ) from exc


@router.post("/logout")
async def logout(
    request: Request,
    body: RefreshRequest,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Logs out user by revoking refresh token."""
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
    """Returns current logged in user data."""
    return {
        "success": True,
        "user": current_user,
    }


@router.get("/health")
async def auth_health():
    """Check auth service is running."""
    return {"status": "auth service running"}
