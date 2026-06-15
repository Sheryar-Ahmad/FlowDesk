import pytest
from pydantic import ValidationError

from app.config import Settings


def test_production_requires_a_strong_secret():
    with pytest.raises(ValidationError, match="SECRET_KEY"):
        Settings(
            _env_file=None,
            DEBUG=False,
            SECRET_KEY="too-short",
            ALLOWED_ORIGINS=["https://flowdesk.pages.dev"],
            ALLOWED_HOSTS=["flowdesk-api.onrender.com"],
        )


def test_production_rejects_wildcard_cors():
    with pytest.raises(ValidationError, match="Wildcard CORS"):
        Settings(
            _env_file=None,
            DEBUG=False,
            SECRET_KEY="x" * 64,
            ALLOWED_ORIGINS=["*"],
            ALLOWED_HOSTS=["flowdesk-api.onrender.com"],
        )


def test_production_settings_accept_explicit_hosts_and_origins():
    settings = Settings(
        _env_file=None,
        DEBUG=False,
        SECRET_KEY="x" * 64,
        ALLOWED_ORIGINS=["https://flowdesk.pages.dev"],
        ALLOWED_HOSTS=["flowdesk-api.onrender.com"],
    )

    assert settings.DEBUG is False
    assert settings.ALLOWED_ORIGINS == ["https://flowdesk.pages.dev"]
    assert settings.ALLOWED_HOSTS == ["flowdesk-api.onrender.com"]
