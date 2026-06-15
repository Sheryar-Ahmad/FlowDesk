from __future__ import annotations

from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import User
from app.repositories.base import BaseRepository, coerce_uuid


class UserRepository(BaseRepository[User]):
    def __init__(self) -> None:
        super().__init__(User)

    async def get_active(self, session: AsyncSession, user_id: UUID | str) -> User | None:
        result = await session.execute(
            select(User).where(User.id == coerce_uuid(user_id), User.deleted_at.is_(None))
        )
        return result.scalar_one_or_none()

    async def get_by_email(self, session: AsyncSession, email: str) -> User | None:
        result = await session.execute(
            select(User).where(
                func.lower(User.email) == email.strip().lower(),
                User.deleted_at.is_(None),
            )
        )
        return result.scalar_one_or_none()

    async def email_exists(self, session: AsyncSession, email: str) -> bool:
        result = await session.execute(
            select(User.id).where(
                func.lower(User.email) == email.strip().lower(),
                User.deleted_at.is_(None),
            )
        )
        return result.scalar_one_or_none() is not None


user_repository = UserRepository()
