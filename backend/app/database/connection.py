import asyncio
import ssl
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

import structlog
from sqlalchemy import text
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.pool import AsyncAdaptedQueuePool

from app.config import get_settings
from app.models.base import Base

logger = structlog.get_logger(__name__)
settings = get_settings()


def is_supabase_host(url: str) -> bool:
    hostname = urlsplit(url).hostname or ""
    return hostname.endswith(".supabase.co") or hostname.endswith(".pooler.supabase.com")


def is_transaction_pooler(url: str) -> bool:
    parsed = urlsplit(url)
    return (parsed.hostname or "").endswith(".pooler.supabase.com") and parsed.port == 6543


def normalize_database_url(raw_url: str | None = None) -> str:
    """Build the asyncpg URL and remove query args asyncpg cannot consume."""
    url = (raw_url if raw_url is not None else settings.DATABASE_URL).strip()
    if url.startswith("postgresql://"):
        url = url.replace("postgresql://", "postgresql+asyncpg://", 1)
    elif url.startswith("postgres://"):
        url = url.replace("postgres://", "postgresql+asyncpg://", 1)

    parsed = urlsplit(url)
    query = dict(parse_qsl(parsed.query, keep_blank_values=True))
    query.pop("sslmode", None)
    query.pop("sslrootcert", None)
    if is_transaction_pooler(url):
        query.setdefault("prepared_statement_cache_size", "0")

    return urlunsplit(parsed._replace(query=urlencode(query)))


def build_database_url() -> str:
    """Builds the correct database URL for async SQLAlchemy."""
    return normalize_database_url()


def build_connect_args(raw_url: str | None = None) -> dict:
    url = raw_url or settings.DATABASE_URL
    parsed = urlsplit(url)
    query = dict(parse_qsl(parsed.query, keep_blank_values=True))
    sslmode = query.get("sslmode", "").lower()
    sslrootcert = query.get("sslrootcert") or settings.DB_SSL_ROOT_CERT.strip()

    connect_args = {
        "command_timeout": 60,
        "server_settings": {
            "application_name": "FlowDesk",
            "jit": "off",
        },
    }

    if sslmode == "disable":
        return connect_args

    if sslmode in {"verify-ca", "verify-full"}:
        context = ssl.create_default_context(cafile=sslrootcert or None)
        context.check_hostname = sslmode == "verify-full"
        connect_args["ssl"] = context
        return connect_args

    if is_supabase_host(url) or sslmode == "require":
        context = ssl.create_default_context()
        context.check_hostname = False
        context.verify_mode = ssl.CERT_NONE
        connect_args["ssl"] = context


    return connect_args


engine = create_async_engine(
    build_database_url(),

    # Avoid leaking query details outside debug environments.
    echo=settings.DEBUG,

    poolclass=AsyncAdaptedQueuePool,
    pool_size=settings.DB_POOL_SIZE,
    max_overflow=settings.DB_MAX_OVERFLOW,
    pool_pre_ping=True,
    pool_recycle=settings.DB_POOL_RECYCLE_SECONDS,
    pool_timeout=settings.DB_POOL_TIMEOUT,
    connect_args=build_connect_args(),
)


AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autocommit=False,
    autoflush=False,
)


async def get_db() -> AsyncSession:
    """FastAPI dependency that provides a database session."""
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception as error:
            await session.rollback()
            logger.error(
                "Database session error - rolling back",
                error=str(error),
                error_type=type(error).__name__,
            )
            raise
        finally:
            await session.close()


async def check_db_connection() -> bool:
    """Verifies database is reachable and responding."""
    max_retries = 3
    retry_delay = 2

    for attempt in range(1, max_retries + 1):
        try:
            async with AsyncSessionLocal() as session:
                result = await session.execute(text("SELECT 1 as health_check"))
                row = result.fetchone()
                if row and row[0] == 1:
                    logger.info(
                        "Database connection verified",
                        attempt=attempt,
                        status="healthy",
                    )
                    return True
        except Exception as error:
            logger.warning(
                "Database connection attempt failed",
                attempt=attempt,
                max_retries=max_retries,
                error=str(error),
            )
            if attempt < max_retries:
                await asyncio.sleep(retry_delay * attempt)

    logger.error("Database connection failed after all retries")
    return False


async def ensure_database_schema() -> None:
    """Apply small idempotent schema upgrades required by the current app."""
    async with AsyncSessionLocal() as session:
        await session.execute(text("CREATE EXTENSION IF NOT EXISTS pgcrypto"))
        await session.execute(
            text(
                """
                ALTER TABLE IF EXISTS ai_sessions
                ADD COLUMN IF NOT EXISTS title VARCHAR(120)
                """
            )
        )
        await session.execute(
            text(
                """
                UPDATE ai_sessions
                SET title = COALESCE(
                    NULLIF(
                        LEFT(
                            REGEXP_REPLACE(
                                BTRIM(COALESCE(messages->0->>'content', '')),
                                '\\s+',
                                ' ',
                                'g'
                            ),
                            80
                        ),
                        ''
                    ),
                    'New Conversation'
                )
                WHERE title IS NULL OR BTRIM(title) = ''
                """
            )
        )
        await session.execute(
            text(
                """
                ALTER TABLE IF EXISTS users
                ADD COLUMN IF NOT EXISTS ai_messages_used_month INTEGER NOT NULL DEFAULT 0
                """
            )
        )
        await session.execute(
            text(
                """
                ALTER TABLE IF EXISTS users
                ADD COLUMN IF NOT EXISTS ai_messages_month_reset_at TIMESTAMPTZ
                """
            )
        )
        await session.execute(
            text(
                """
                DO $$
                BEGIN
                    IF NOT EXISTS (
                        SELECT 1
                        FROM pg_constraint
                        WHERE conname = 'ai_monthly_usage_nonnegative'
                    ) THEN
                        ALTER TABLE users
                        ADD CONSTRAINT ai_monthly_usage_nonnegative
                        CHECK (ai_messages_used_month >= 0);
                    END IF;
                END $$;
                """
            )
        )
        await session.execute(
            text(
                """
                ALTER TABLE IF EXISTS users
                    ADD COLUMN IF NOT EXISTS google_sub VARCHAR(255),
                    ADD COLUMN IF NOT EXISTS auth_provider VARCHAR(40) NOT NULL DEFAULT 'password'
                """
            )
        )
        await session.execute(
            text(
                """
                CREATE UNIQUE INDEX IF NOT EXISTS ix_users_google_sub
                ON users (google_sub)
                WHERE google_sub IS NOT NULL AND deleted_at IS NULL
                """
            )
        )
        await session.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS oauth_handoff_codes (
                    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    code_hash VARCHAR(64) NOT NULL,
                    expires_at TIMESTAMPTZ NOT NULL,
                    used_at TIMESTAMPTZ,
                    ip_address INET,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
                )
                """
            )
        )
        await session.execute(
            text(
                """
                CREATE UNIQUE INDEX IF NOT EXISTS ix_oauth_handoff_code_hash
                ON oauth_handoff_codes (code_hash)
                """
            )
        )
        await session.execute(
            text(
                """
                CREATE INDEX IF NOT EXISTS ix_oauth_handoff_user_expires
                ON oauth_handoff_codes (user_id, expires_at)
                """
            )
        )
        await session.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS compiler_files (
                    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    title VARCHAR(200) NOT NULL,
                    language VARCHAR(40) NOT NULL,
                    code TEXT NOT NULL,
                    stdin TEXT NOT NULL DEFAULT '',
                    output TEXT NOT NULL DEFAULT '',
                    is_pinned BOOLEAN NOT NULL DEFAULT FALSE,
                    run_count INTEGER NOT NULL DEFAULT 0,
                    last_run_at TIMESTAMPTZ,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    deleted_at TIMESTAMPTZ
                )
                """
            )
        )
        await session.execute(
            text(
                """
                ALTER TABLE IF EXISTS compiler_files
                    ADD COLUMN IF NOT EXISTS stdin TEXT NOT NULL DEFAULT '',
                    ADD COLUMN IF NOT EXISTS output TEXT NOT NULL DEFAULT '',
                    ADD COLUMN IF NOT EXISTS is_pinned BOOLEAN NOT NULL DEFAULT FALSE,
                    ADD COLUMN IF NOT EXISTS run_count INTEGER NOT NULL DEFAULT 0,
                    ADD COLUMN IF NOT EXISTS last_run_at TIMESTAMPTZ,
                    ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ
                """
            )
        )
        await session.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS compiler_run_events (
                    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    compiler_file_id UUID REFERENCES compiler_files(id) ON DELETE SET NULL,
                    language VARCHAR(40) NOT NULL,
                    status VARCHAR(40) NOT NULL,
                    duration_ms INTEGER NOT NULL DEFAULT 0,
                    output_size INTEGER NOT NULL DEFAULT 0,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
                )
                """
            )
        )
        await session.execute(text("CREATE INDEX IF NOT EXISTS ix_compiler_files_user_updated ON compiler_files (user_id, updated_at)"))
        await session.execute(text("CREATE INDEX IF NOT EXISTS ix_compiler_files_user_language ON compiler_files (user_id, language)"))
        await session.execute(text("CREATE INDEX IF NOT EXISTS ix_compiler_files_user_pinned ON compiler_files (user_id, is_pinned)"))
        await session.execute(text("CREATE INDEX IF NOT EXISTS ix_compiler_run_events_user_created ON compiler_run_events (user_id, created_at)"))
        await session.execute(text("CREATE INDEX IF NOT EXISTS ix_compiler_run_events_file_created ON compiler_run_events (compiler_file_id, created_at)"))
        await session.commit()
    logger.info("Database schema upgrades verified")


async def get_db_stats() -> dict:
    """Returns database connection pool statistics."""
    pool = engine.pool
    return {
        "pool_size": pool.size(),
        "checked_in": pool.checkedin(),
        "checked_out": pool.checkedout(),
        "overflow": pool.overflow(),
        "invalid": pool.invalid(),
    }


async def close_db_connection() -> None:
    """Gracefully closes all database connections."""
    await engine.dispose()
    logger.info("Database connections closed gracefully")
