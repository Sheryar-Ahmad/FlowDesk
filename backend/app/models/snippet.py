from __future__ import annotations

from uuid import UUID

from sqlalchemy import Boolean, Computed, ForeignKey, Index, Integer, String, Text, text
from sqlalchemy.dialects.postgresql import TSVECTOR, UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, SoftDeleteMixin, TimestampMixin, UUIDPrimaryKeyMixin


class Snippet(UUIDPrimaryKeyMixin, TimestampMixin, SoftDeleteMixin, Base):
    __tablename__ = "snippets"
    __table_args__ = (
        Index("ix_snippets_user_updated", "user_id", "updated_at"),
        Index("ix_snippets_user_language", "user_id", "language"),
        Index("ix_snippets_public", "is_public", postgresql_where=text("is_public = TRUE AND deleted_at IS NULL")),
        Index("ix_snippets_search_vector", "search_vector", postgresql_using="gin"),
    )

    user_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    collection_id: Mapped[UUID | None] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("collections.id", ondelete="SET NULL"),
    )
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    code: Mapped[str] = mapped_column(Text, nullable=False)
    language: Mapped[str] = mapped_column(String(50), nullable=False, server_default=text("'other'"))
    description: Mapped[str | None] = mapped_column(Text)
    is_public: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("FALSE"))
    is_pinned: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("FALSE"))
    use_count: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text("0"))
    search_vector: Mapped[str] = mapped_column(
        TSVECTOR,
        Computed(
            "to_tsvector('english', "
            "coalesce(title, '') || ' ' || coalesce(description, '') || ' ' || "
            "coalesce(language, '') || ' ' || coalesce(code, ''))",
            persisted=True,
        ),
    )
