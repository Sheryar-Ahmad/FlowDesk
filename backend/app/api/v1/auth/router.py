"""
router.py - Authentication Endpoints
-------------------------------------
Handles:
- User registration (with password hashing)
- User login (with verification)
- Token refresh
- Logout
- Email verification

All passwords are hashed with Argon2id before storage.
All inputs are validated and sanitized.
All actions are logged to audit_logs table.
"""

from fastapi import APIRouter, Depends, HTTPException, status, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from datetime import datetime, timezone, timedelta
import structlog
import uuid

from app.database.connection import get_db
from app.core.security.hashing import hash_password, verify_password
from app.core.security.jwt import create_access_token, create_refresh_token, hash_token
from app.core.security.sanitizer import (
    validate_email, 
    validate_display_name, 
    validate_password,
    is_safe_input
)
from app.core.middleware.rate_limiter import limiter, AUTH_LIMIT
from app.api.v1.auth.schemas import (
    RegisterRequest, 
    RegisterResponse, 
    LoginRequest, 
    LoginResponse,
    RefreshTokenRequest,
    RefreshTokenResponse
)

logger = structlog.get_logger(__name__)
router = APIRouter()


@router.post("/register", response_model=RegisterResponse)
@limiter.limit(AUTH_LIMIT)
async def register(
    request: Request,
    register_data: RegisterRequest,
    db: AsyncSession = Depends(get_db),
):
    """
    Register a new user account.
    
    Steps:
    1. Validate all inputs
    2. Check email not already used
    3. Hash password with Argon2id
    4. Insert into users table
    5. Log the action
    6. Return success with user ID
    """
    
    # Step 1: Sanitize and validate inputs
    clean_email = validate_email(register_data.email)
    if not clean_email:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid email format."
        )
    
    clean_name = validate_display_name(register_data.display_name)
    if not clean_name:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Display name must be 2-100 characters and contain only letters, numbers, spaces, and basic punctuation."
        )
    
    is_valid_pwd, pwd_error = validate_password(register_data.password)
    if not is_valid_pwd:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=pwd_error
        )
    
    # Extra security: check for injection attempts
    if not is_safe_input(clean_email) or not is_safe_input(clean_name):
        logger.warning("Potential injection attempt in registration", email=clean_email)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid characters in input."
        )
    
    # Step 2: Check if email already exists
    try:
        result = await db.execute(
            text("SELECT id FROM users WHERE email = :email AND deleted_at IS NULL"),
            {"email": clean_email}
        )
        existing_user = result.fetchone()
        
        if existing_user:
            logger.info("Registration attempt with existing email", email=clean_email)
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="An account with this email already exists. Please login instead."
            )
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Database error during email check", error=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Registration failed. Please try again."
        )
    
    # Step 3: Hash the password
    try:
        password_hash = hash_password(register_data.password)
    except Exception as e:
        logger.error("Password hashing failed", error=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Registration failed. Please try again."
        )
    
    # Step 4: Insert new user
    user_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc)
    
    try:
        await db.execute(
            text("""
                INSERT INTO users (
                    id, email, password_hash, display_name, plan, 
                    email_verified, created_at, updated_at
                ) VALUES (
                    :id, :email, :password_hash, :display_name, 'free',
                    false, :now, :now
                )
            """),
            {
                "id": user_id,
                "email": clean_email,
                "password_hash": password_hash,
                "display_name": clean_name,
                "now": now,
            }
        )
        
        # Step 5: Log the registration in audit_logs
        await db.execute(
            text("""
                INSERT INTO audit_logs (user_id, action, resource_type, ip_address, user_agent, created_at)
                VALUES (:user_id, 'user.register', 'user', :ip, :ua, :now)
            """),
            {
                "user_id": user_id,
                "ip": request.client.host if request.client else None,
                "ua": request.headers.get("user-agent", ""),
                "now": now,
            }
        )
        
        await db.commit()
        
        logger.info("User registered successfully", user_id=user_id, email=clean_email)
        
        return RegisterResponse(
            success=True,
            message="Account created successfully! Please login.",
            user_id=user_id,
            email=clean_email,
            display_name=clean_name,
            plan="free"
        )
        
    except Exception as e:
        await db.rollback()
        logger.error("User registration failed", error=str(e), email=clean_email)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Registration failed. Please try again later."
        )


@router.post("/login", response_model=LoginResponse)
@limiter.limit(AUTH_LIMIT)
async def login(
    request: Request,
    login_data: LoginRequest,
    db: AsyncSession = Depends(get_db),
):
    """
    Login existing user.
    
    Steps:
    1. Validate email
    2. Find user in database
    3. Check if account is locked
    4. Verify password with Argon2id
    5. Track failed attempts
    6. Create JWT tokens
    7. Log the login
    8. Return tokens
    """
    
    # Step 1: Clean email
    clean_email = validate_email(login_data.email)
    if not clean_email:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid email format."
        )
    
    # Step 2: Find user
    try:
        result = await db.execute(
            text("""
                SELECT id, email, display_name, password_hash, plan, 
                       email_verified, failed_login_count, locked_until, deleted_at
                FROM users 
                WHERE email = :email AND deleted_at IS NULL
            """),
            {"email": clean_email}
        )
        user = result.fetchone()
        
        if not user:
            logger.info("Login attempt with non-existent email", email=clean_email)
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid email or password."
            )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Database error during login", error=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Login failed. Please try again."
        )
    
    # Step 3: Check if account is locked
    now = datetime.now(timezone.utc)
    if user.locked_until and user.locked_until > now:
        remaining = int((user.locked_until - now).total_seconds() / 60)
        raise HTTPException(
            status_code=status.HTTP_423_LOCKED,
            detail=f"Account is locked. Please try again in {remaining} minutes."
        )
    
    # Step 4: Verify password
    password_valid = verify_password(login_data.password, user.password_hash)
    
    # Step 5: Track failed attempts
    if not password_valid:
        new_failed_count = (user.failed_login_count or 0) + 1
        
        # Lock account after 5 failed attempts
        lock_until = None
        if new_failed_count >= 5:
            lock_until = now.replace(tzinfo=timezone.utc) + timedelta(minutes=15)
            logger.warning("Account locked due to too many failures", user_id=user.id)
        
        await db.execute(
            text("""
                UPDATE users 
                SET failed_login_count = :count, locked_until = :locked
                WHERE id = :id
            """),
            {"count": new_failed_count, "locked": lock_until, "id": user.id}
        )
        await db.commit()
        
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password."
        )
    
    # Reset failed login count on successful login
    await db.execute(
        text("""
            UPDATE users 
            SET failed_login_count = 0, locked_until = NULL, last_login_at = :now, last_login_ip = :ip
            WHERE id = :id
        """),
        {"now": now, "ip": request.client.host if request.client else None, "id": user.id}
    )
    
    # Step 6: Create tokens
    access_token = create_access_token(user.id, user.email, user.plan)
    raw_refresh_token, refresh_token_hash = create_refresh_token()
    
    # Store refresh token in database
    refresh_expires = now.replace(tzinfo=timezone.utc) + timedelta(days=30)
    await db.execute(
        text("""
            INSERT INTO refresh_tokens (user_id, token_hash, expires_at, ip_address, user_agent, created_at)
            VALUES (:user_id, :hash, :expires, :ip, :ua, :now)
        """),
        {
            "user_id": user.id,
            "hash": refresh_token_hash,
            "expires": refresh_expires,
            "ip": request.client.host if request.client else None,
            "ua": request.headers.get("user-agent", ""),
            "now": now,
        }
    )
    
    # Step 7: Log the login
    await db.execute(
        text("""
            INSERT INTO audit_logs (user_id, action, resource_type, ip_address, user_agent, created_at)
            VALUES (:user_id, 'user.login', 'user', :ip, :ua, :now)
        """),
        {
            "user_id": user.id,
            "ip": request.client.host if request.client else None,
            "ua": request.headers.get("user-agent", ""),
            "now": now,
        }
    )
    
    await db.commit()
    
    logger.info("User logged in successfully", user_id=user.id, email=user.email)
    
    return LoginResponse(
        success=True,
        access_token=access_token,
        refresh_token=raw_refresh_token,
        user={
            "id": user.id,
            "email": user.email,
            "display_name": user.display_name,
            "plan": user.plan,
            "email_verified": user.email_verified,
        }
    )


@router.post("/refresh")
@limiter.limit("20/minute")
async def refresh_token(
    request: Request,
    refresh_data: RefreshTokenRequest,
    db: AsyncSession = Depends(get_db),
):
    """
    Get a new access token using a refresh token.
    """
    from datetime import timedelta
    
    token_hash = hash_token(refresh_data.refresh_token)
    now = datetime.now(timezone.utc)
    
    try:
        result = await db.execute(
            text("""
                SELECT rt.user_id, u.email, u.plan, rt.expires_at, rt.is_revoked
                FROM refresh_tokens rt
                JOIN users u ON rt.user_id = u.id
                WHERE rt.token_hash = :hash AND rt.is_revoked = FALSE
            """),
            {"hash": token_hash}
        )
        token_data = result.fetchone()
        
        if not token_data or token_data.expires_at < now:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid or expired refresh token."
            )
        
        # Create new access token
        new_access_token = create_access_token(token_data.user_id, token_data.email, token_data.plan)
        
        return RefreshTokenResponse(
            access_token=new_access_token
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Token refresh failed", error=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to refresh token."
        )


@router.post("/logout")
async def logout(
    request: Request,
    refresh_token: str,
    db: AsyncSession = Depends(get_db),
):
    """
    Logout user by revoking their refresh token.
    """
    token_hash = hash_token(refresh_token)
    
    try:
        result = await db.execute(
            text("""
                UPDATE refresh_tokens 
                SET is_revoked = TRUE, revoked_at = :now, revoked_reason = 'user_logout'
                WHERE token_hash = :hash
                RETURNING user_id
            """),
            {"hash": token_hash, "now": datetime.now(timezone.utc)}
        )
        revoked = result.fetchone()
        
        if revoked:
            await db.commit()
            logger.info("User logged out", user_id=revoked.user_id)
        
        return {"success": True, "message": "Logged out successfully"}
        
    except Exception as e:
        await db.rollback()
        logger.error("Logout failed", error=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Logout failed."
        )


@router.get("/health")
async def auth_health():
    """Check if auth service is running."""
    return {"status": "auth service running"}
