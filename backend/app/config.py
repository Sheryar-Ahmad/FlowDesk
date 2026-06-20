import secrets
from functools import lru_cache

from pydantic import field_validator, model_validator
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """All FlowDesk application settings loaded from .env file."""


    APP_NAME: str = "FlowDesk"
    APP_VERSION: str = "1.0.0"
    DEBUG: bool = True


    SECRET_KEY: str = ""
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 15
    REFRESH_TOKEN_EXPIRE_DAYS: int = 30
    ALGORITHM: str = "HS256"


    DATABASE_URL: str = ""
    DB_POOL_SIZE: int = 5
    DB_MAX_OVERFLOW: int = 5
    DB_POOL_TIMEOUT: int = 30
    DB_POOL_RECYCLE_SECONDS: int = 1800
    DB_SSL_ROOT_CERT: str = ""
    SUPABASE_URL: str = "https://your-project.supabase.co"
    SUPABASE_KEY: str = ""
    SUPABASE_SECRET: str = ""


    GROQ_API_KEY: str = ""
    DEEPSEEK_API_KEY: str = ""
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


    ALLOWED_ORIGINS: list[str] = ["http://localhost:5173", "https://flowdesk.vercel.app"]
    ALLOWED_HOSTS: list[str] = [
        "localhost",
        "127.0.0.1",
        "flowdesk.app",
        "*.flowdesk.app",
        "*.onrender.com",
    ]

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

    @model_validator(mode="after")
    def validate_production_security(self):
        if not self.SECRET_KEY.strip() and self.DEBUG:
            self.SECRET_KEY = secrets.token_urlsafe(48)
        if not self.DEBUG:
            secret = self.SECRET_KEY.strip()
            if len(secret) < 32:
                raise ValueError("SECRET_KEY must contain at least 32 random characters in production.")
            if not self.DATABASE_URL.strip():
                raise ValueError("DATABASE_URL is required in production.")
            if not self.ALLOWED_ORIGINS:
                raise ValueError("ALLOWED_ORIGINS must contain at least one frontend origin in production.")
            if "*" in self.ALLOWED_ORIGINS:
                raise ValueError("Wildcard CORS origins are not allowed in production.")
            if not self.ALLOWED_HOSTS:
                raise ValueError("ALLOWED_HOSTS must contain at least one API hostname in production.")
        return self

    @field_validator("DB_POOL_SIZE", "DB_MAX_OVERFLOW", "DB_POOL_TIMEOUT", "DB_POOL_RECYCLE_SECONDS")
    @classmethod
    def validate_database_pool_numbers(cls, value: int) -> int:
        if value < 0:
            raise ValueError("Database pool settings cannot be negative.")
        return value

    model_config = {"env_file": ".env", "case_sensitive": True, "extra": "ignore"}


@lru_cache()
def get_settings() -> Settings:
    """Returns cached settings - loaded only once, not on every request."""
    return Settings()
