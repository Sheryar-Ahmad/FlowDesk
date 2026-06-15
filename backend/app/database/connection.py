from sqlalchemy.ext.asyncio import (
    create_async_engine,
    AsyncSession,
    async_sessionmaker,
)
from sqlalchemy import text
from sqlalchemy.pool import AsyncAdaptedQueuePool
import asyncio
import structlog
from app.config import get_settings
from app.models.base import Base

logger = structlog.get_logger(__name__)
settings = get_settings()

def build_database_url() -> str:
    """Builds the correct database URL for async SQLAlchemy."""
    url = settings.DATABASE_URL
    if url.startswith("postgresql://"):
        url = url.replace("postgresql://", "postgresql+asyncpg://", 1)
    elif url.startswith("postgres://"):
        url = url.replace("postgres://", "postgresql+asyncpg://", 1)
    return url


engine = create_async_engine(
    build_database_url(),

    # Avoid leaking query details outside debug environments.
    echo=settings.DEBUG,

    poolclass=AsyncAdaptedQueuePool,
    pool_size=10,
    max_overflow=20,
    pool_pre_ping=True,
    pool_recycle=3600,
    pool_timeout=30,


    connect_args={
        "command_timeout": 60,
        "server_settings": {
            "application_name": "FlowDesk",
            "jit": "off",
        },
    },
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
