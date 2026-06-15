from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from datetime import datetime, timezone, timedelta
from typing import Optional
import structlog

from app.core.security.hashing import hash_password, verify_password, needs_rehash
from app.core.security.jwt import create_access_token, create_refresh_token, hash_token
from app.config import get_settings
from app.constants import MAX_FAILED_LOGIN_ATTEMPTS, ACCOUNT_LOCK_DURATION_MINUTES

logger = structlog.get_logger(__name__)
settings = get_settings()


async def register_user(
    db: AsyncSession,
    email: str,
    password: str,
    display_name: str,
    ip_address: str = None,
) -> dict:
    """Creates a new user account."""


    existing = await db.execute(
        text("SELECT id FROM users WHERE email = :email AND deleted_at IS NULL"),
        {"email": email.lower().strip()}
    )
    if existing.fetchone():
        logger.warning("Registration attempt with existing email", email=email)
        raise ValueError("An account with this email already exists.")


    password_hashed = hash_password(password)


    result = await db.execute(
        text("""
            INSERT INTO users (email, password_hash, display_name, email_verified, plan)
            VALUES (:email, :password_hash, :display_name, :email_verified, :plan)
            RETURNING id, email, display_name, plan, created_at
        """),
        {
            "email": email.lower().strip(),
            "password_hash": password_hashed,
            "display_name": display_name.strip(),
            "email_verified": False,
            "plan": "free",
        }
    )
    user = result.fetchone()
    await db.commit()

    logger.info(
        "New user registered",
        user_id=str(user.id),
        email=email,
    )


    access_token = create_access_token(
        user_id=str(user.id),
        email=user.email,
        plan=user.plan,
    )
    raw_refresh_token, refresh_token_hash = create_refresh_token()


    expires_at = datetime.now(timezone.utc) + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
    await db.execute(
        text("""
            INSERT INTO refresh_tokens (user_id, token_hash, expires_at, ip_address)
            VALUES (:user_id, :token_hash, :expires_at, :ip_address)
        """),
        {
            "user_id": str(user.id),
            "token_hash": refresh_token_hash,
            "expires_at": expires_at,
            "ip_address": ip_address,
        }
    )
    await db.commit()


    await db.execute(
        text("""
            INSERT INTO audit_logs (user_id, action, resource_type, ip_address, metadata)
            VALUES (:user_id, :action, :resource_type, :ip_address, :metadata)
        """),
        {
            "user_id": str(user.id),
            "action": "auth.register",
            "resource_type": "user",
            "ip_address": ip_address,
            "metadata": "{}",
        }
    )
    await db.commit()


    return {
        "access_token": access_token,
        "refresh_token": raw_refresh_token,
        "token_type": "bearer",
        "user": {
            "id": str(user.id),
            "email": user.email,
            "display_name": user.display_name,
            "plan": user.plan,
            "email_verified": False,
        }
    }


async def login_user(
    db: AsyncSession,
    email: str,
    password: str,
    ip_address: str = None,
) -> dict:
    """Authenticates a user and returns tokens."""


    result = await db.execute(
        text("""
            SELECT id, email, display_name, password_hash, plan,
                   email_verified, failed_login_count, locked_until, deleted_at
            FROM users
            WHERE email = :email AND deleted_at IS NULL
        """),
        {"email": email.lower().strip()}
    )
    user = result.fetchone()

    # Generic error - do not reveal if email exists or not
    if not user:
        logger.warning("Login attempt for non-existent email", email=email)
        raise ValueError("Invalid email or password.")


    now = datetime.now(timezone.utc)
    if user.locked_until and user.locked_until > now:
        minutes_left = int((user.locked_until - now).total_seconds() / 60) + 1
        logger.warning("Login attempt on locked account", user_id=str(user.id))
        raise ValueError(f"Account locked. Try again in {minutes_left} minutes.")


    if not verify_password(password, user.password_hash):

        new_count = (user.failed_login_count or 0) + 1
        locked_until = None

        if new_count >= MAX_FAILED_LOGIN_ATTEMPTS:
            locked_until = now + timedelta(minutes=ACCOUNT_LOCK_DURATION_MINUTES)
            logger.warning(
                "Account locked after failed attempts",
                user_id=str(user.id),
                attempts=new_count,
            )

        await db.execute(
            text("""
                UPDATE users
                SET failed_login_count = :count, locked_until = :locked_until
                WHERE id = :user_id
            """),
            {
                "count": new_count,
                "locked_until": locked_until,
                "user_id": str(user.id),
            }
        )
        await db.commit()


        await db.execute(
            text("""
                INSERT INTO audit_logs (user_id, action, ip_address, metadata)
                VALUES (:user_id, :action, :ip_address, :metadata)
            """),
            {
                "user_id": str(user.id),
                "action": "auth.login_failed",
                "ip_address": ip_address,
                "metadata": "{}",
            }
        )
        await db.commit()

        raise ValueError("Invalid email or password.")


    await db.execute(
        text("""
            UPDATE users
            SET failed_login_count = 0,
                locked_until = NULL,
                last_login_at = :now,
                last_login_ip = :ip
            WHERE id = :user_id
        """),
        {
            "now": now,
            "ip": ip_address,
            "user_id": str(user.id),
        }
    )
    await db.commit()


    access_token = create_access_token(
        user_id=str(user.id),
        email=user.email,
        plan=user.plan,
    )
    raw_refresh_token, refresh_token_hash = create_refresh_token()


    expires_at = now + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
    await db.execute(
        text("""
            INSERT INTO refresh_tokens (user_id, token_hash, expires_at, ip_address)
            VALUES (:user_id, :token_hash, :expires_at, :ip_address)
        """),
        {
            "user_id": str(user.id),
            "token_hash": refresh_token_hash,
            "expires_at": expires_at,
            "ip_address": ip_address,
        }
    )
    await db.commit()


    await db.execute(
        text("""
            INSERT INTO audit_logs (user_id, action, ip_address, metadata)
            VALUES (:user_id, :action, :ip_address, :metadata)
        """),
        {
            "user_id": str(user.id),
            "action": "auth.login_success",
            "ip_address": ip_address,
            "metadata": "{}",
        }
    )
    await db.commit()

    logger.info("User logged in successfully", user_id=str(user.id))


    return {
        "access_token": access_token,
        "refresh_token": raw_refresh_token,
        "token_type": "bearer",
        "user": {
            "id": str(user.id),
            "email": user.email,
            "display_name": user.display_name,
            "plan": user.plan,
            "email_verified": user.email_verified,
        }
    }


async def logout_user(
    db: AsyncSession,
    user_id: str,
    refresh_token: str,
    ip_address: str = None,
) -> bool:
    """Logs out user by revoking refresh token."""
    token_hash = hash_token(refresh_token)

    await db.execute(
        text("""
            UPDATE refresh_tokens
            SET is_revoked = TRUE, revoked_at = :now, revoked_reason = :reason
            WHERE user_id = :user_id AND token_hash = :token_hash
        """),
        {
            "now": datetime.now(timezone.utc),
            "reason": "user_logout",
            "user_id": user_id,
            "token_hash": token_hash,
        }
    )
    await db.commit()

    await db.execute(
        text("""
            INSERT INTO audit_logs (user_id, action, ip_address, metadata)
            VALUES (:user_id, :action, :ip_address, :metadata)
        """),
        {
            "user_id": user_id,
            "action": "auth.logout",
            "ip_address": ip_address,
            "metadata": "{}",
        }
    )
    await db.commit()

    logger.info("User logged out", user_id=user_id)
    return True
