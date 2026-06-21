from __future__ import annotations

from datetime import datetime
from uuid import UUID

from sqlalchemy import Boolean, CheckConstraint, DateTime, ForeignKey, Index, Integer, String, Text, text
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, SoftDeleteMixin, TimestampMixin, UUIDPrimaryKeyMixin


class CompilerFile(UUIDPrimaryKeyMixin, TimestampMixin, SoftDeleteMixin, Base):
    __tablename__ = "compiler_files"
    __table_args__ = (
        CheckConstraint("run_count >= 0", name="compiler_file_run_count_nonnegative"),
        Index("ix_compiler_files_user_updated", "user_id", "updated_at"),
        Index("ix_compiler_files_user_language", "user_id", "language"),
        Index("ix_compiler_files_user_pinned", "user_id", "is_pinned"),
    )

    user_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    language: Mapped[str] = mapped_column(String(40), nullable=False)
    code: Mapped[str] = mapped_column(Text, nullable=False)
    stdin: Mapped[str] = mapped_column(Text, nullable=False, server_default=text("''"))
    output: Mapped[str] = mapped_column(Text, nullable=False, server_default=text("''"))
    is_pinned: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("FALSE"))
    run_count: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text("0"))
    last_run_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class CompilerRunEvent(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "compiler_run_events"
    __table_args__ = (
        CheckConstraint(
            "status IN ('success', 'error', 'timeout', 'rejected', 'unsupported', 'disabled')",
            name="compiler_run_valid_status",
        ),
        CheckConstraint("duration_ms >= 0", name="compiler_run_duration_nonnegative"),
        CheckConstraint("output_size >= 0", name="compiler_run_output_size_nonnegative"),
        Index("ix_compiler_run_events_user_created", "user_id", "created_at"),
        Index("ix_compiler_run_events_file_created", "compiler_file_id", "created_at"),
    )

    user_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    compiler_file_id: Mapped[UUID | None] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("compiler_files.id", ondelete="SET NULL"),
    )
    language: Mapped[str] = mapped_column(String(40), nullable=False)
    status: Mapped[str] = mapped_column(String(40), nullable=False)
    duration_ms: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text("0"))
    output_size: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text("0"))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=text("CURRENT_TIMESTAMP"),
    )
