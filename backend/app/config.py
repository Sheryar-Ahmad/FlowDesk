"""
config.py - Application Settings
Every secret comes from .env file - never hardcoded in code.
"""

from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    """All FlowDesk application settings loaded from .env file."""

    # --- App Info ---
    APP_NAME: str = "FlowDesk"
    APP_VERSION: str = "1.0.0"
    DEBUG: bool = True

    # --- Security ---
    SECRET_KEY: str = "change-this-to-a-random-secret-key"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 15
    REFRESH_TOKEN_EXPIRE_DAYS: int = 30
    ALGORITHM: str = "HS256"

    # --- Database ---
    DATABASE_URL: str = "postgresql://user:password@localhost/flowdesk"
    SUPABASE_URL: str = "https://your-project.supabase.co"
    SUPABASE_KEY: str = ""
    SUPABASE_SECRET: str = ""

    # --- AI Services ---
    GROQ_API_KEY: str = ""
    GEMINI_API_KEY: str = ""
    MISTRAL_API_KEY: str = ""
    OLLAMA_BASE_URL: str = "http://localhost:11434"

    # --- Email ---
    RESEND_API_KEY: str = ""
    FROM_EMAIL: str = "noreply@flowdesk.app"

    # --- Redis ---
    REDIS_URL: str = "redis://localhost:6379"

    # --- Payments ---
    LEMON_SQUEEZY_API_KEY: str = ""
    LEMON_SQUEEZY_WEBHOOK_SECRET: str = ""

    # --- Monitoring ---
    SENTRY_DSN: str = ""

    # --- CORS ---
    ALLOWED_ORIGINS: list = ["http://localhost:5173", "https://flowdesk.vercel.app"]

    model_config = {"env_file": ".env", "case_sensitive": True, "extra": "ignore"}


@lru_cache()
def get_settings() -> Settings:
    """Returns cached settings - loaded only once, not on every request."""
    return Settings()
