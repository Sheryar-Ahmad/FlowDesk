from __future__ import annotations

from typing import Any
from uuid import UUID

from sqlalchemy import CheckConstraint, ForeignKey, Index, Integer, String, text
from sqlalchemy.dialects.postgresql import JSONB, UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin, UUIDPrimaryKeyMixin


class AISession(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "ai_sessions"
    __table_args__ = (
        CheckConstraint("message_count >= 0", name="message_count_nonnegative"),
        CheckConstraint("tokens_used >= 0", name="tokens_used_nonnegative"),
        Index("ix_ai_sessions_user_updated", "user_id", "updated_at"),
    )

    user_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    title: Mapped[str] = mapped_column(String(120), nullable=False, server_default=text("'New Conversation'"))
    messages: Mapped[list[dict[str, Any]]] = mapped_column(
        JSONB,
        nullable=False,
        server_default=text("'[]'::jsonb"),
    )
    message_count: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text("0"))
    tokens_used: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text("0"))
    model_used: Mapped[str | None] = mapped_column(String(120))
