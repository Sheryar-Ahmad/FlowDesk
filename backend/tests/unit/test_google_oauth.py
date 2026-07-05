from starlette.requests import Request

from app.api.v1.auth import router as auth_router


def make_request() -> Request:
    return Request(
        {
            "type": "http",
            "method": "GET",
            "path": "/api/v1/auth/google/start",
            "headers": [(b"host", b"localhost")],
            "scheme": "http",
            "server": ("localhost", 8000),
            "client": ("testclient", 50000),
        }
    )


def test_google_state_cookie_secure_follows_redirect_uri_scheme(monkeypatch):
    monkeypatch.setattr(
        auth_router.settings,
        "GOOGLE_REDIRECT_URI",
        "http://localhost:8000/api/v1/auth/google/callback",
    )
    assert auth_router.google_state_cookie_secure(make_request()) is False

    monkeypatch.setattr(
        auth_router.settings,
        "GOOGLE_REDIRECT_URI",
        "https://api.example.com/api/v1/auth/google/callback",
    )
    assert auth_router.google_state_cookie_secure(make_request()) is True
