"""
main.py - The Heart of FlowDesk Backend
-----------------------------------------
This is the entry point of the entire backend.
When the server starts, this file runs first.
It creates the FastAPI app, adds all middleware,
connects all routes, and starts listening for requests.
"""

import sentry_sdk
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

from app.config import get_settings
from app.api.router import api_router

# Load settings from .env file
settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Runs on startup and shutdown.
    startup: connect to database, initialize cache
    shutdown: close connections cleanly
    """
    # --- STARTUP ---
    print(f"Starting {settings.APP_NAME} v{settings.APP_VERSION}")

    # Initialize Sentry error monitoring (free tier)
    if settings.SENTRY_DSN:
        sentry_sdk.init(
            dsn=settings.SENTRY_DSN,
            traces_sample_rate=0.1,  # Track 10% of requests for performance
            profiles_sample_rate=0.1,
        )
        print("Sentry monitoring initialized")

    yield  # App runs here

    # --- SHUTDOWN ---
    print(f"{settings.APP_NAME} shutting down cleanly")


# Create the FastAPI application
app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    description="The Unified Developer Workspace API",
    # Hide API docs in production for security
    docs_url="/docs" if settings.DEBUG else None,
    redoc_url="/redoc" if settings.DEBUG else None,
    lifespan=lifespan,
)

# --- CORS Middleware ---
# CORS tells the browser which websites are allowed to talk to our API.
# Without this, the frontend cannot connect to the backend.
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "PATCH"],
    allow_headers=["*"],
)

# --- Connect All API Routes ---
# This connects all our endpoints (auth, snippets, notes, tasks, AI)
app.include_router(api_router, prefix="/api")


# --- Health Check Endpoint ---
@app.get("/health")
async def health_check():
    """
    Simple endpoint to check if the server is running.
    UptimeRobot calls this every 5 minutes to verify uptime.
    Returns 200 OK if everything is working.
    """
    return {
        "status": "healthy",
        "app": settings.APP_NAME,
        "version": settings.APP_VERSION,
    }


# --- Root Endpoint ---
@app.get("/")
async def root():
    """Welcome message for the API root."""
    return {
        "message": "Welcome to FlowDesk API",
        "docs": "/docs",
        "health": "/health",
    }
