"""
main.py - FlowDesk Backend Entry Point
----------------------------------------
This is the heart of the entire backend.
Starts the server, connects database,
adds security middleware, and routes all requests.
"""

import sentry_sdk
import structlog
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from contextlib import asynccontextmanager

from app.config import get_settings
from app.api.router import api_router
from app.database.connection import check_db_connection, close_db_connection

settings = get_settings()
logger = structlog.get_logger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Startup and shutdown events.
    startup: verify database, initialize monitoring
    shutdown: close connections cleanly
    """
    # --- STARTUP ---
    logger.info(
        "Starting FlowDesk",
        version=settings.APP_VERSION,
        debug=settings.DEBUG,
    )

    # Check database connection
    db_healthy = await check_db_connection()
    if not db_healthy:
        logger.error("Database connection failed on startup")
    else:
        logger.info("Database connected successfully")

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

# --- Security Middleware ---
# Only allow requests from our own domains
if not settings.DEBUG:
    app.add_middleware(
        TrustedHostMiddleware,
        allowed_hosts=["flowdesk.app", "*.flowdesk.app", "localhost"],
    )

# --- CORS Middleware ---
# Controls which websites can talk to our API
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
    UptimeRobot calls this every 5 minutes.
    Returns healthy status and version info.
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
