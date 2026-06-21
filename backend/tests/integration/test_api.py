from app.main import app


def test_core_routes_are_registered():
    paths = {route.path for route in app.routes}

    assert {
        "/health",
        "/api/v1/auth/register",
        "/api/v1/auth/login",
        "/api/v1/auth/google/start",
        "/api/v1/auth/google/callback",
        "/api/v1/auth/google/exchange",
        "/api/v1/dashboard/stats",
        "/api/v1/snippets/",
        "/api/v1/notes/",
        "/api/v1/tasks/projects",
        "/api/v1/ai/chat",
        "/api/v1/payments/checkout",
    } <= paths


def test_production_api_has_unique_operation_ids():
    operation_ids = [
        route.unique_id
        for route in app.routes
        if getattr(route, "unique_id", None)
    ]

    assert len(operation_ids) == len(set(operation_ids))
