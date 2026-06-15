from __future__ import annotations

from typing import Any, Generic, Sequence, TypeVar
from uuid import UUID

from sqlalchemy import Select, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.base import Base


ModelT = TypeVar("ModelT", bound=Base)


def coerce_uuid(value: UUID | str) -> UUID:
    return value if isinstance(value, UUID) else UUID(str(value))


class BaseRepository(Generic[ModelT]):
    model: type[ModelT]

    def __init__(self, model: type[ModelT]) -> None:
        self.model = model

    async def get(self, session: AsyncSession, entity_id: UUID | str) -> ModelT | None:
        return await session.get(self.model, coerce_uuid(entity_id))

    async def add(self, session: AsyncSession, entity: ModelT) -> ModelT:
        session.add(entity)
        await session.flush()
        await session.refresh(entity)
        return entity

    async def delete(self, session: AsyncSession, entity: ModelT) -> None:
        await session.delete(entity)
        await session.flush()

    async def list(
        self,
        session: AsyncSession,
        *,
        statement: Select[tuple[ModelT]] | None = None,
        limit: int = 100,
        offset: int = 0,
    ) -> Sequence[ModelT]:
        query = statement if statement is not None else select(self.model)
        result = await session.execute(query.limit(limit).offset(offset))
        return result.scalars().all()

    async def update_fields(
        self,
        session: AsyncSession,
        entity: ModelT,
        values: dict[str, Any],
    ) -> ModelT:
        for field, value in values.items():
            if not hasattr(entity, field):
                raise ValueError(f"{self.model.__name__} has no field named {field}.")
            setattr(entity, field, value)
        await session.flush()
        await session.refresh(entity)
        return entity
