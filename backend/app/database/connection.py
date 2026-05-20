"""
connection.py -  Database Connection
------------------------------------------------
Handles all database connections for FlowDesk.
Features:
- Connection pooling for high performance
- Automatic retry on connection failure
- Health checks
- Structured logging
- Graceful shutdown
"""

from sqlalchemy.ext.asyncio import (
    create_async_engine,
    AsyncSession,
    async_sessionmaker,
)
from sqlalchemy.orm import DeclarativeBase
from sqlalchemy import text, event
from sqlalchemy.pool import AsyncAdaptedQueuePool
import asyncio
import structlog
from app.config import get_settings

logger = structlog.get_logger(__name__)
settings = get_settings()


class Base(DeclarativeBase):
    """
    Base class for all database models.
    Every table model inherits from this.
    Provides common functionality to all models.
    """
    pass


def build_database_url() -> str:
    """
    Builds the correct database URL for async SQLAlchemy.
    SQLAlchemy needs asyncpg driver for async operations.
    Changes postgresql:// to postgresql+asyncpg://
    """
    url = settings.DATABASE_URL
    if url.startswith("postgresql://"):
        url = url.replace("postgresql://", "postgresql+asyncpg://", 1)
    elif url.startswith("postgres://"):
        url = url.replace("postgres://", "postgresql+asyncpg://", 1)
    return url


# --- Create async engine with enterprise settings ---
engine = create_async_engine(
    build_database_url(),

    # Show SQL queries in debug mode only
    echo=settings.DEBUG,

    # Connection pool settings for high performance
    poolclass=AsyncAdaptedQueuePool,
    pool_size=10,
    max_overflow=20,
    pool_pre_ping=True,
    pool_recycle=3600,
    pool_timeout=30,

    # Connection arguments for PostgreSQL
    connect_args={
        "command_timeout": 60,
        "server_settings": {
            "application_name": "FlowDesk",
            "jit": "off",
        },
    },
)


# --- Session factory ---
AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autocommit=False,
    autoflush=False,
)


async def get_db() -> AsyncSession:
    """
    FastAPI dependency that provides a database session.
    
    Usage in endpoints:
        async def my_endpoint(db: AsyncSession = Depends(get_db)):
    
    - Automatically opens session before request
    - Commits if everything succeeds
    - Rolls back if any error occurs
    - Always closes session when done
    """
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
    """
    Verifies database is reachable and responding.
    Called on app startup.
    Retries 3 times before giving up.
    """
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


async def get_db_stats() -> dict:
    """
    Returns database connection pool statistics.
    Used for monitoring and health dashboard.
    """
    pool = engine.pool
    return {
        "pool_size": pool.size(),
        "checked_in": pool.checkedin(),
        "checked_out": pool.checkedout(),
        "overflow": pool.overflow(),
        "invalid": pool.invalid(),
    }


async def close_db_connection() -> None:
    """
    Gracefully closes all database connections.
    Called on app shutdown to prevent connection leaks.
    """
    await engine.dispose()
    logger.info("Database connections closed gracefully")
