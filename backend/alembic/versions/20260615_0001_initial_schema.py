"""Create the initial FlowDesk schema.

Revision ID: 20260615_0001
Revises:
Create Date: 2026-06-15
"""
from typing import Sequence

from alembic import op

from app.models import Base


revision: str = "20260615_0001"
down_revision: str | Sequence[str] | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


UPDATED_AT_TABLES = (
    "users",
    "collections",
    "snippets",
    "notes",
    "projects",
    "kanban_columns",
    "tasks",
    "ai_sessions",
    "subscriptions",
)


def upgrade() -> None:
    bind = op.get_bind()
    op.execute("CREATE EXTENSION IF NOT EXISTS pgcrypto")
    Base.metadata.create_all(bind=bind, checkfirst=True)

    op.execute(
        """
        CREATE OR REPLACE FUNCTION flowdesk_set_updated_at()
        RETURNS TRIGGER AS $$
        BEGIN
            NEW.updated_at = CURRENT_TIMESTAMP;
            RETURN NEW;
        END;
        $$ LANGUAGE plpgsql
        """
    )
    for table_name in UPDATED_AT_TABLES:
        op.execute(
            f"""
            DROP TRIGGER IF EXISTS trg_{table_name}_updated_at ON {table_name};
            CREATE TRIGGER trg_{table_name}_updated_at
            BEFORE UPDATE ON {table_name}
            FOR EACH ROW
            EXECUTE FUNCTION flowdesk_set_updated_at()
            """
        )

    op.execute(
        """
        CREATE OR REPLACE FUNCTION flowdesk_capture_note_version()
        RETURNS TRIGGER AS $$
        BEGIN
            IF OLD.title IS DISTINCT FROM NEW.title
               OR OLD.content IS DISTINCT FROM NEW.content
               OR OLD.content_text IS DISTINCT FROM NEW.content_text THEN
                INSERT INTO note_versions (
                    note_id,
                    user_id,
                    version_number,
                    title,
                    content,
                    content_text,
                    word_count
                )
                VALUES (
                    OLD.id,
                    OLD.user_id,
                    COALESCE(
                        (
                            SELECT MAX(version_number) + 1
                            FROM note_versions
                            WHERE note_id = OLD.id
                        ),
                        1
                    ),
                    OLD.title,
                    OLD.content,
                    OLD.content_text,
                    OLD.word_count
                );
            END IF;
            RETURN NEW;
        END;
        $$ LANGUAGE plpgsql
        """
    )
    op.execute(
        """
        DROP TRIGGER IF EXISTS trg_notes_capture_version ON notes;
        CREATE TRIGGER trg_notes_capture_version
        BEFORE UPDATE ON notes
        FOR EACH ROW
        EXECUTE FUNCTION flowdesk_capture_note_version()
        """
    )


def downgrade() -> None:
    op.execute("DROP TRIGGER IF EXISTS trg_notes_capture_version ON notes")
    op.execute("DROP FUNCTION IF EXISTS flowdesk_capture_note_version")
    for table_name in reversed(UPDATED_AT_TABLES):
        op.execute(f"DROP TRIGGER IF EXISTS trg_{table_name}_updated_at ON {table_name}")
    op.execute("DROP FUNCTION IF EXISTS flowdesk_set_updated_at")
    Base.metadata.drop_all(bind=op.get_bind(), checkfirst=True)
