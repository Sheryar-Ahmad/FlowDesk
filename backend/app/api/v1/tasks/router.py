from fastapi import APIRouter, Depends, Request, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
import structlog

from app.database.connection import get_db
from app.core.middleware.auth_guard import get_current_user
from app.core.middleware.rate_limiter import limiter, API_LIMIT
from app.api.v1.tasks.schemas import ProjectCreate, ProjectUpdate, TaskCreate, TaskUpdate
from app.services.task_service import (
    create_project, get_projects, get_project_by_id, update_project, delete_project,
    get_columns, create_column, create_task, get_tasks, update_task, delete_task
)

logger = structlog.get_logger(__name__)
router = APIRouter()


@router.post("/projects", status_code=201)
@limiter.limit(API_LIMIT)
async def create_proj(request: Request, body: ProjectCreate, current_user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    try:
        project = await create_project(db, current_user["id"], current_user["plan"], body.name, body.description, body.color)
        return {"success": True, "project": project}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/projects")
@limiter.limit(API_LIMIT)
async def list_projects(request: Request, current_user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    projects = await get_projects(db, current_user["id"])
    return {"success": True, "projects": projects}


@router.get("/projects/{project_id}")
@limiter.limit(API_LIMIT)
async def get_proj(request: Request, project_id: str, current_user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    project = await get_project_by_id(db, project_id, current_user["id"])
    if not project: raise HTTPException(status_code=404, detail="Project not found.")
    return {"success": True, "project": project}


@router.put("/projects/{project_id}")
@limiter.limit(API_LIMIT)
async def update_proj(request: Request, project_id: str, body: ProjectUpdate, current_user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    project = await update_project(db, project_id, current_user["id"], body.model_dump(exclude_none=True))
    if not project: raise HTTPException(status_code=404, detail="Project not found.")
    return {"success": True, "project": project}


@router.delete("/projects/{project_id}")
@limiter.limit(API_LIMIT)
async def delete_proj(request: Request, project_id: str, current_user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    deleted = await delete_project(db, project_id, current_user["id"])
    if not deleted: raise HTTPException(status_code=404, detail="Project not found.")
    return {"success": True, "message": "Project deleted."}


@router.get("/projects/{project_id}/columns")
@limiter.limit(API_LIMIT)
async def list_columns(request: Request, project_id: str, current_user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    columns = await get_columns(db, project_id, current_user["id"])
    return {"success": True, "columns": columns}


@router.post("/projects/{project_id}/columns", status_code=201)
@limiter.limit(API_LIMIT)
async def add_column(request: Request, project_id: str, body: dict, current_user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    name = str(body.get("name", "")).strip()
    if not name:
        raise HTTPException(status_code=400, detail="Column name required.")
    if len(name) > 100:
        raise HTTPException(status_code=400, detail="Column name too long.")
    try:
        column = await create_column(db, project_id, current_user["id"], name)
        return {"success": True, "column": column}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/projects/{project_id}/tasks")
@limiter.limit(API_LIMIT)
async def list_tasks(request: Request, project_id: str, current_user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    tasks = await get_tasks(db, project_id, current_user["id"])
    return {"success": True, "tasks": tasks}


@router.post("/projects/{project_id}/tasks", status_code=201)
@limiter.limit(API_LIMIT)
async def create_t(request: Request, project_id: str, body: TaskCreate, current_user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    try:
        task = await create_task(db, project_id, current_user["id"], body.title, body.status, body.priority, body.description, body.due_date, body.labels)
        return {"success": True, "task": task}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error("Create task error", error=str(e))
        raise HTTPException(status_code=500, detail="Failed to create task.")


@router.put("/tasks/{task_id}")
@limiter.limit(API_LIMIT)
async def update_t(request: Request, task_id: str, body: TaskUpdate, current_user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    task = await update_task(db, task_id, current_user["id"], body.model_dump(exclude_unset=True))
    if not task: raise HTTPException(status_code=404, detail="Task not found.")
    return {"success": True, "task": task}


@router.delete("/tasks/{task_id}")
@limiter.limit(API_LIMIT)
async def delete_t(request: Request, task_id: str, current_user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    deleted = await delete_task(db, task_id, current_user["id"])
    if not deleted: raise HTTPException(status_code=404, detail="Task not found.")
    return {"success": True, "message": "Task deleted."}


@router.get("/health")
async def tasks_health():
    return {"status": "tasks service running"}
