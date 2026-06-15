from __future__ import annotations

from datetime import date, datetime
from typing import Any
from uuid import UUID

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin, UUIDPrimaryKeyMixin


class Project(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "projects"
    __table_args__ = (Index("ix_projects_user_created", "user_id", "created_at"),)

    user_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    color: Mapped[str] = mapped_column(String(20), nullable=False, server_default=text("'#6366f1'"))
    is_archived: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("FALSE"))


class KanbanColumn(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "kanban_columns"
    __table_args__ = (
        UniqueConstraint("project_id", "name", name="kanban_column_name_per_project"),
        UniqueConstraint("project_id", "position", name="kanban_column_position_per_project"),
        Index("ix_kanban_columns_project_position", "project_id", "position"),
    )

    project_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("projects.id", ondelete="CASCADE"),
        nullable=False,
    )
    user_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    position: Mapped[int] = mapped_column(Integer, nullable=False)
    color: Mapped[str | None] = mapped_column(String(20))


class Task(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "tasks"
    __table_args__ = (
        CheckConstraint("priority IN ('low', 'medium', 'high', 'critical')", name="valid_priority"),
        Index("ix_tasks_project_status_position", "project_id", "status", "position"),
        Index("ix_tasks_user_due_date", "user_id", "due_date"),
    )

    project_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("projects.id", ondelete="CASCADE"),
        nullable=False,
    )
    user_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    title: Mapped[str] = mapped_column(String(300), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(100), nullable=False, server_default=text("'todo'"))
    priority: Mapped[str] = mapped_column(String(20), nullable=False, server_default=text("'medium'"))
    due_date: Mapped[date | None] = mapped_column(Date)
    position: Mapped[float] = mapped_column(Float, nullable=False, server_default=text("0"))
    labels: Mapped[list[Any]] = mapped_column(
        JSONB,
        nullable=False,
        server_default=text("'[]'::jsonb"),
    )
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class PomodoroSession(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "pomodoro_sessions"
    __table_args__ = (
        CheckConstraint("duration_minutes > 0 AND duration_minutes <= 1440", name="valid_duration"),
        Index("ix_pomodoro_user_date", "user_id", "session_date"),
    )

    user_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    duration_minutes: Mapped[int] = mapped_column(Integer, nullable=False)
    completed: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("TRUE"))
    session_date: Mapped[date] = mapped_column(Date, nullable=False, server_default=text("CURRENT_DATE"))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=text("CURRENT_TIMESTAMP"),
    )
