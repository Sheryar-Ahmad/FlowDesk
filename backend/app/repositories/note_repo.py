from __future__ import annotations

from typing import Sequence
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.note import Note, NoteVersion
from app.repositories.base import BaseRepository, coerce_uuid


class NoteRepository(BaseRepository[Note]):
    def __init__(self) -> None:
        super().__init__(Note)

    async def get_owned(
        self,
        session: AsyncSession,
        note_id: UUID | str,
        user_id: UUID | str,
    ) -> Note | None:
        result = await session.execute(
            select(Note).where(
                Note.id == coerce_uuid(note_id),
                Note.user_id == coerce_uuid(user_id),
                Note.deleted_at.is_(None),
            )
        )
        return result.scalar_one_or_none()

    async def count_active(self, session: AsyncSession, user_id: UUID | str) -> int:
        result = await session.execute(
            select(func.count(Note.id)).where(
                Note.user_id == coerce_uuid(user_id),
                Note.deleted_at.is_(None),
            )
        )
        return int(result.scalar_one())

    async def list_for_user(
        self,
        session: AsyncSession,
        user_id: UUID | str,
        *,
        limit: int = 50,
        offset: int = 0,
    ) -> Sequence[Note]:
        result = await session.execute(
            select(Note)
            .where(Note.user_id == coerce_uuid(user_id), Note.deleted_at.is_(None))
            .order_by(Note.updated_at.desc())
            .limit(limit)
            .offset(offset)
        )
        return result.scalars().all()

    async def versions(
        self,
        session: AsyncSession,
        note_id: UUID | str,
        *,
        limit: int = 20,
    ) -> Sequence[NoteVersion]:
        result = await session.execute(
            select(NoteVersion)
            .where(NoteVersion.note_id == coerce_uuid(note_id))
            .order_by(NoteVersion.version_number.desc())
            .limit(limit)
        )
        return result.scalars().all()


note_repository = NoteRepository()
