from sqlalchemy import Computed

from app.models import Base


EXPECTED_TABLES = {
    "ai_sessions",
    "audit_logs",
    "collections",
    "email_verification_tokens",
    "kanban_columns",
    "note_versions",
    "notes",
    "password_reset_tokens",
    "payment_webhook_events",
    "pomodoro_sessions",
    "projects",
    "refresh_tokens",
    "snippet_tags",
    "snippets",
    "subscriptions",
    "tags",
    "tasks",
    "users",
}


def test_metadata_contains_complete_application_schema():
    assert set(Base.metadata.tables) == EXPECTED_TABLES


def test_raw_sql_service_columns_exist():
    required_columns = {
        "users": {
            "email",
            "password_hash",
            "display_name",
            "email_verified",
            "plan",
            "failed_login_count",
            "locked_until",
            "last_login_at",
            "last_login_ip",
            "ai_messages_used_today",
            "ai_messages_reset_at",
            "deleted_at",
        },
        "snippets": {
            "user_id",
            "title",
            "code",
            "language",
            "description",
            "is_public",
            "is_pinned",
            "use_count",
            "search_vector",
            "deleted_at",
        },
        "notes": {
            "user_id",
            "title",
            "content",
            "content_text",
            "word_count",
            "search_vector",
            "deleted_at",
        },
        "tasks": {
            "project_id",
            "user_id",
            "title",
            "status",
            "priority",
            "due_date",
            "position",
            "labels",
            "completed_at",
        },
        "ai_sessions": {
            "user_id",
            "title",
            "messages",
            "message_count",
            "tokens_used",
            "model_used",
        },
    }

    for table_name, columns in required_columns.items():
        assert columns <= set(Base.metadata.tables[table_name].columns.keys())


def test_search_vectors_are_database_generated():
    assert isinstance(Base.metadata.tables["snippets"].c.search_vector.computed, Computed)
    assert isinstance(Base.metadata.tables["notes"].c.search_vector.computed, Computed)


def test_user_owned_tables_have_cascading_foreign_keys():
    for table_name in {
        "ai_sessions",
        "collections",
        "notes",
        "pomodoro_sessions",
        "projects",
        "refresh_tokens",
        "snippets",
        "subscriptions",
        "tags",
        "tasks",
    }:
        user_id = Base.metadata.tables[table_name].c.user_id
        foreign_key = next(iter(user_id.foreign_keys))
        assert foreign_key.target_fullname == "users.id"
        assert foreign_key.ondelete == "CASCADE"
