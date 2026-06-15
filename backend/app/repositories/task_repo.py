from __future__ import annotations

from typing import Sequence
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.task import KanbanColumn, Project, Task
from app.repositories.base import BaseRepository, coerce_uuid


class ProjectRepository(BaseRepository[Project]):
    def __init__(self) -> None:
        super().__init__(Project)

    async def get_owned(
        self,
        session: AsyncSession,
        project_id: UUID | str,
        user_id: UUID | str,
    ) -> Project | None:
        result = await session.execute(
            select(Project).where(
                Project.id == coerce_uuid(project_id),
                Project.user_id == coerce_uuid(user_id),
            )
        )
        return result.scalar_one_or_none()

    async def list_for_user(
        self,
        session: AsyncSession,
        user_id: UUID | str,
    ) -> Sequence[Project]:
        result = await session.execute(
            select(Project)
            .where(Project.user_id == coerce_uuid(user_id))
            .order_by(Project.created_at.desc())
        )
        return result.scalars().all()


class TaskRepository(BaseRepository[Task]):
    def __init__(self) -> None:
        super().__init__(Task)

    async def get_owned(
        self,
        session: AsyncSession,
        task_id: UUID | str,
        user_id: UUID | str,
    ) -> Task | None:
        result = await session.execute(
            select(Task).where(
                Task.id == coerce_uuid(task_id),
                Task.user_id == coerce_uuid(user_id),
            )
        )
        return result.scalar_one_or_none()

    async def list_for_project(
        self,
        session: AsyncSession,
        project_id: UUID | str,
        user_id: UUID | str,
    ) -> Sequence[Task]:
        result = await session.execute(
            select(Task)
            .where(
                Task.project_id == coerce_uuid(project_id),
                Task.user_id == coerce_uuid(user_id),
            )
            .order_by(Task.status, Task.position)
        )
        return result.scalars().all()

    async def columns_for_project(
        self,
        session: AsyncSession,
        project_id: UUID | str,
        user_id: UUID | str,
    ) -> Sequence[KanbanColumn]:
        result = await session.execute(
            select(KanbanColumn)
            .where(
                KanbanColumn.project_id == coerce_uuid(project_id),
                KanbanColumn.user_id == coerce_uuid(user_id),
            )
            .order_by(KanbanColumn.position)
        )
        return result.scalars().all()


project_repository = ProjectRepository()
task_repository = TaskRepository()
