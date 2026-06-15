from __future__ import annotations

from typing import Sequence
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.ai_session import AISession
from app.repositories.base import BaseRepository, coerce_uuid


class AISessionRepository(BaseRepository[AISession]):
    def __init__(self) -> None:
        super().__init__(AISession)

    async def get_owned(
        self,
        session: AsyncSession,
        session_id: UUID | str,
        user_id: UUID | str,
    ) -> AISession | None:
        result = await session.execute(
            select(AISession).where(
                AISession.id == coerce_uuid(session_id),
                AISession.user_id == coerce_uuid(user_id),
            )
        )
        return result.scalar_one_or_none()

    async def recent_for_user(
        self,
        session: AsyncSession,
        user_id: UUID | str,
        *,
        limit: int = 50,
    ) -> Sequence[AISession]:
        result = await session.execute(
            select(AISession)
            .where(AISession.user_id == coerce_uuid(user_id))
            .order_by(AISession.updated_at.desc())
            .limit(limit)
        )
        return result.scalars().all()


ai_session_repository = AISessionRepository()
