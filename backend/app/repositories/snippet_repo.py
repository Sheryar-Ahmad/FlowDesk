from __future__ import annotations

from typing import Sequence
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.snippet import Snippet
from app.repositories.base import BaseRepository, coerce_uuid


class SnippetRepository(BaseRepository[Snippet]):
    def __init__(self) -> None:
        super().__init__(Snippet)

    async def get_owned(
        self,
        session: AsyncSession,
        snippet_id: UUID | str,
        user_id: UUID | str,
    ) -> Snippet | None:
        result = await session.execute(
            select(Snippet).where(
                Snippet.id == coerce_uuid(snippet_id),
                Snippet.user_id == coerce_uuid(user_id),
                Snippet.deleted_at.is_(None),
            )
        )
        return result.scalar_one_or_none()

    async def count_active(self, session: AsyncSession, user_id: UUID | str) -> int:
        result = await session.execute(
            select(func.count(Snippet.id)).where(
                Snippet.user_id == coerce_uuid(user_id),
                Snippet.deleted_at.is_(None),
            )
        )
        return int(result.scalar_one())

    async def list_for_user(
        self,
        session: AsyncSession,
        user_id: UUID | str,
        *,
        language: str | None = None,
        limit: int = 50,
        offset: int = 0,
    ) -> Sequence[Snippet]:
        query = select(Snippet).where(
            Snippet.user_id == coerce_uuid(user_id),
            Snippet.deleted_at.is_(None),
        )
        if language:
            query = query.where(Snippet.language == language)
        query = query.order_by(Snippet.is_pinned.desc(), Snippet.updated_at.desc())
        result = await session.execute(query.limit(limit).offset(offset))
        return result.scalars().all()


snippet_repository = SnippetRepository()
