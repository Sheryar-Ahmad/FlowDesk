from functools import lru_cache

from pydantic import field_validator
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """All FlowDesk application settings loaded from .env file."""


    APP_NAME: str = "FlowDesk"
    APP_VERSION: str = "1.0.0"
    DEBUG: bool = True


    SECRET_KEY: str = "change-this-to-a-random-secret-key"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 15
    REFRESH_TOKEN_EXPIRE_DAYS: int = 30
    ALGORITHM: str = "HS256"


    DATABASE_URL: str = "postgresql://user:password@localhost/flowdesk"
    SUPABASE_URL: str = "https://your-project.supabase.co"
    SUPABASE_KEY: str = ""
    SUPABASE_SECRET: str = ""


    GROQ_API_KEY: str = ""
    GEMINI_API_KEY: str = ""
    MISTRAL_API_KEY: str = ""
    OLLAMA_BASE_URL: str = "http://localhost:11434"


    RESEND_API_KEY: str = ""
    FROM_EMAIL: str = "noreply@flowdesk.app"


    REDIS_URL: str = "redis://localhost:6379"


    LEMON_SQUEEZY_API_KEY: str = ""
    LEMON_SQUEEZY_WEBHOOK_SECRET: str = ""
    LEMON_SQUEEZY_STORE_ID: str = ""
    LEMON_SQUEEZY_VARIANT_ID: str = ""
    LEMON_SQUEEZY_TEST_MODE: bool = False
    FRONTEND_URL: str = "http://localhost:5173"


    SENTRY_DSN: str = ""


    ALLOWED_ORIGINS: list = ["http://localhost:5173", "https://flowdesk.vercel.app"]

    @field_validator("DEBUG", mode="before")
    @classmethod
    def parse_debug_mode(cls, value):
        if isinstance(value, bool):
            return value
        if isinstance(value, str):
            normalized = value.strip().lower()
            if normalized in {"1", "true", "yes", "on", "debug", "development"}:
                return True
            if normalized in {"0", "false", "no", "off", "release", "production"}:
                return False
        return value

    model_config = {"env_file": ".env", "case_sensitive": True, "extra": "ignore"}


@lru_cache()
def get_settings() -> Settings:
    """Returns cached settings - loaded only once, not on every request."""
    return Settings()
