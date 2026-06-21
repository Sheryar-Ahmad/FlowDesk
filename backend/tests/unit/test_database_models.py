from sqlalchemy import Computed

from app.models import Base


EXPECTED_TABLES = {
    "ai_sessions",
    "audit_logs",
    "collections",
    "compiler_files",
    "compiler_run_events",
    "email_verification_tokens",
    "kanban_columns",
    "note_versions",
    "notes",
    "oauth_handoff_codes",
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
            "google_sub",
            "auth_provider",
            "display_name",
            "email_verified",
            "plan",
            "account_status",
            "suspended_until",
            "suspension_reason",
            "failed_login_count",
            "locked_until",
            "last_login_at",
            "last_login_ip",
            "ai_messages_used_today",
            "ai_messages_reset_at",
            "ai_messages_used_month",
            "ai_messages_month_reset_at",
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
        "oauth_handoff_codes": {
            "user_id",
            "code_hash",
            "expires_at",
            "used_at",
            "ip_address",
        },
        "compiler_files": {
            "user_id",
            "title",
            "language",
            "code",
            "stdin",
            "output",
            "is_pinned",
            "run_count",
            "last_run_at",
            "deleted_at",
        },
        "compiler_run_events": {
            "user_id",
            "compiler_file_id",
            "language",
            "status",
            "duration_ms",
            "output_size",
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
        "compiler_files",
        "compiler_run_events",
        "notes",
        "oauth_handoff_codes",
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
