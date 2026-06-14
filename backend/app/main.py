"""
main.py - FlowDesk Backend Entry Point
----------------------------------------
Heart of the entire backend.
Starts server, connects database, adds all
security layers, and routes all requests.
"""

import sentry_sdk
import structlog
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from fastapi.exceptions import RequestValidationError
from sqlalchemy.exc import SQLAlchemyError
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from contextlib import asynccontextmanager

from app.config import get_settings
from app.api.router import api_router
from app.database.connection import (
    check_db_connection,
    close_db_connection,
    ensure_database_schema,
)
from app.core.middleware.rate_limiter import limiter, rate_limit_exceeded_handler
from app.core.middleware.error_handler import (
    validation_exception_handler,
    sqlalchemy_exception_handler,
    general_exception_handler,
)

settings = get_settings()
logger = structlog.get_logger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup and shutdown events."""

    # --- STARTUP ---
    logger.info(
        "Starting FlowDesk",
        version=settings.APP_VERSION,
        debug=settings.DEBUG,
    )

    # Verify database connection
    db_healthy = await check_db_connection()
    if not db_healthy:
        logger.error("Database connection failed on startup")
    else:
        logger.info("Database connected successfully")
        try:
            await ensure_database_schema()
        except Exception as error:
            logger.error("Database schema upgrade failed", error=str(error))

    # Initialize Sentry error monitoring
    if settings.SENTRY_DSN:
        sentry_sdk.init(
            dsn=settings.SENTRY_DSN,
            traces_sample_rate=0.1,
            profiles_sample_rate=0.1,
            environment="production" if not settings.DEBUG else "development",
        )
        logger.info("Sentry monitoring initialized")

    yield

    # --- SHUTDOWN ---
    logger.info("Shutting down FlowDesk")
    await close_db_connection()
    logger.info("FlowDesk shutdown complete")


# Create FastAPI app
app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    description="The Unified Developer Workspace API",
    docs_url="/docs" if settings.DEBUG else None,
    redoc_url="/redoc" if settings.DEBUG else None,
    lifespan=lifespan,
)

# --- Attach rate limiter to app ---
app.state.limiter = limiter

# --- Exception Handlers ---
app.add_exception_handler(RateLimitExceeded, rate_limit_exceeded_handler)
app.add_exception_handler(RequestValidationError, validation_exception_handler)
app.add_exception_handler(SQLAlchemyError, sqlalchemy_exception_handler)
app.add_exception_handler(Exception, general_exception_handler)

# --- Security Middleware ---
if not settings.DEBUG:
    app.add_middleware(
        TrustedHostMiddleware,
        allowed_hosts=["flowdesk.app", "*.flowdesk.app", "localhost"],
    )

# --- CORS Middleware ---
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allow_headers=["*"],
    expose_headers=["X-Request-ID"],
)

# --- Connect All Routes ---
app.include_router(api_router, prefix="/api")


# --- Health Check ---
@app.get("/health", tags=["System"])
async def health_check():
    """
    Health check endpoint.
    UptimeRobot pings this every 5 minutes.
    """
    db_healthy = await check_db_connection()
    return {
        "status": "healthy" if db_healthy else "degraded",
        "app": settings.APP_NAME,
        "version": settings.APP_VERSION,
        "database": "connected" if db_healthy else "disconnected",
    }


# --- Root ---
@app.get("/", tags=["System"])
async def root():
    """API root endpoint."""
    return {
        "message": f"Welcome to {settings.APP_NAME} API",
        "version": settings.APP_VERSION,
        "docs": "/docs" if settings.DEBUG else "disabled in production",
        "health": "/health",
    }
