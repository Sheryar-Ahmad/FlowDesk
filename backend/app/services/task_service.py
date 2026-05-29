from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from typing import Optional, List
from datetime import datetime, timezone
import json
import structlog
from app.constants import FREE_TIER_PROJECT_LIMIT

logger = structlog.get_logger(__name__)


# --- Projects ----------------------------------------------------------------

async def create_project(db: AsyncSession, user_id: str, plan: str, name: str, description: str = None, color: str = "#6366f1") -> dict:
    if plan == "free":
        r = await db.execute(text("SELECT COUNT(*) FROM projects WHERE user_id=:u AND is_archived=FALSE"), {"u": user_id})
        if (r.scalar() or 0) >= FREE_TIER_PROJECT_LIMIT:
            raise ValueError(f"Free tier limit: {FREE_TIER_PROJECT_LIMIT} projects. Upgrade to Pro.")
    r = await db.execute(text("""
        INSERT INTO projects (user_id, name, description, color)
        VALUES (:u, :name, :desc, :color)
        RETURNING id, user_id, name, description, color, is_archived, created_at, updated_at
    """), {"u": user_id, "name": name, "desc": description, "color": color})
    p = r.fetchone()
    await db.commit()

    # Create default columns
    for i, col in enumerate(["To Do", "In Progress", "Done"]):
        await db.execute(text("INSERT INTO kanban_columns (project_id, user_id, name, position) VALUES (:pid, :uid, :name, :pos)"),
            {"pid": str(p.id), "uid": user_id, "name": col, "pos": i})
    await db.commit()
    logger.info("Project created", project_id=str(p.id))
    return _fmt_project(p)


async def get_projects(db: AsyncSession, user_id: str) -> list:
    r = await db.execute(text("SELECT id, user_id, name, description, color, is_archived, created_at, updated_at FROM projects WHERE user_id=:u ORDER BY created_at DESC"), {"u": user_id})
    return [_fmt_project(p) for p in r.fetchall()]


async def get_project_by_id(db: AsyncSession, project_id: str, user_id: str) -> Optional[dict]:
    r = await db.execute(text("SELECT id, user_id, name, description, color, is_archived, created_at, updated_at FROM projects WHERE id=:id AND user_id=:u"), {"id": project_id, "u": user_id})
    p = r.fetchone()
    return _fmt_project(p) if p else None


async def update_project(db: AsyncSession, project_id: str, user_id: str, updates: dict) -> Optional[dict]:
    fields, params = [], {"id": project_id, "u": user_id}
    for f in ["name", "description", "color", "is_archived"]:
        if f in updates and updates[f] is not None:
            fields.append(f"{f}=:{f}"); params[f] = updates[f]
    if not fields: return await get_project_by_id(db, project_id, user_id)
    fields.append("updated_at=NOW()")
    await db.execute(text(f"UPDATE projects SET {','.join(fields)} WHERE id=:id AND user_id=:u"), params)
    await db.commit()
    return await get_project_by_id(db, project_id, user_id)


async def delete_project(db: AsyncSession, project_id: str, user_id: str) -> bool:
    r = await db.execute(text("DELETE FROM projects WHERE id=:id AND user_id=:u"), {"id": project_id, "u": user_id})
    await db.commit()
    return r.rowcount > 0


# --- Columns -----------------------------------------------------------------

async def get_columns(db: AsyncSession, project_id: str, user_id: str) -> list:
    r = await db.execute(text("SELECT id, project_id, user_id, name, position, color FROM kanban_columns WHERE project_id=:pid AND user_id=:u ORDER BY position ASC"), {"pid": project_id, "u": user_id})
    return [{"id": str(c.id), "project_id": str(c.project_id), "name": c.name, "position": c.position, "color": c.color} for c in r.fetchall()]


async def create_column(db: AsyncSession, project_id: str, user_id: str, name: str) -> dict:
    r = await db.execute(text("SELECT COALESCE(MAX(position), -1)+1 FROM kanban_columns WHERE project_id=:pid"), {"pid": project_id})
    pos = r.scalar() or 0
    r = await db.execute(text("INSERT INTO kanban_columns (project_id, user_id, name, position) VALUES (:pid, :uid, :name, :pos) RETURNING id, project_id, user_id, name, position, color"), {"pid": project_id, "uid": user_id, "name": name, "pos": pos})
    c = r.fetchone()
    await db.commit()
    return {"id": str(c.id), "project_id": str(c.project_id), "name": c.name, "position": c.position, "color": c.color}


# --- Tasks -------------------------------------------------------------------

async def create_task(db: AsyncSession, project_id: str, user_id: str, title: str, status: str = "todo", priority: str = "medium", description: str = None, due_date=None, labels: list = []) -> dict:
    r = await db.execute(text("SELECT COALESCE(MAX(position), -1)+1 FROM tasks WHERE project_id=:pid AND status=:s"), {"pid": project_id, "s": status})
    pos = r.scalar() or 0
    r = await db.execute(text("""
        INSERT INTO tasks (project_id, user_id, title, description, status, priority, due_date, position, labels)
        VALUES (:pid, :uid, :title, :desc, :status, :priority, :due, :pos, CAST(:labels AS jsonb))
        RETURNING id, project_id, user_id, title, description, status, priority, due_date, position, labels, created_at, updated_at, completed_at
    """), {"pid": project_id, "uid": user_id, "title": title, "desc": description, "status": status, "priority": priority, "due": due_date, "pos": pos, "labels": json.dumps(labels)})
    t = r.fetchone()
    await db.commit()
    logger.info("Task created", task_id=str(t.id))
    return _fmt_task(t)


async def get_tasks(db: AsyncSession, project_id: str, user_id: str) -> list:
    r = await db.execute(text("SELECT id, project_id, user_id, title, description, status, priority, due_date, position, labels, created_at, updated_at, completed_at FROM tasks WHERE project_id=:pid AND user_id=:u ORDER BY status, position ASC"), {"pid": project_id, "u": user_id})
    return [_fmt_task(t) for t in r.fetchall()]


async def update_task(db: AsyncSession, task_id: str, user_id: str, updates: dict) -> Optional[dict]:
    fields, params = [], {"id": task_id, "u": user_id}
    for f in ["title", "description", "status", "priority", "position", "due_date"]:
        if f in updates and updates[f] is not None:
            fields.append(f"{f}=:{f}"); params[f] = updates[f]
    if "labels" in updates:
        fields.append("labels=CAST(:labels AS jsonb)")
        params["labels"] = json.dumps(updates["labels"])
    if "status" in updates and updates["status"] == "done":
        fields.append("completed_at=NOW()")
    if not fields: return None
    fields.append("updated_at=NOW()")
    await db.execute(text(f"UPDATE tasks SET {','.join(fields)} WHERE id=:id AND user_id=:u"), params)
    await db.commit()
    r = await db.execute(text("SELECT id, project_id, user_id, title, description, status, priority, due_date, position, labels, created_at, updated_at, completed_at FROM tasks WHERE id=:id"), {"id": task_id})
    t = r.fetchone()
    return _fmt_task(t) if t else None


async def delete_task(db: AsyncSession, task_id: str, user_id: str) -> bool:
    r = await db.execute(text("DELETE FROM tasks WHERE id=:id AND user_id=:u"), {"id": task_id, "u": user_id})
    await db.commit()
    return r.rowcount > 0


# --- Formatters --------------------------------------------------------------

def _fmt_project(p) -> dict:
    return {"id": str(p.id), "user_id": str(p.user_id), "name": p.name, "description": p.description, "color": p.color, "is_archived": p.is_archived, "created_at": p.created_at, "updated_at": p.updated_at}


def _fmt_task(t) -> dict:
    labels = t.labels
    if isinstance(labels, str):
        try: labels = json.loads(labels)
        except: labels = []
    return {"id": str(t.id), "project_id": str(t.project_id), "user_id": str(t.user_id), "title": t.title, "description": t.description, "status": t.status, "priority": t.priority, "due_date": str(t.due_date) if t.due_date else None, "position": t.position, "labels": labels or [], "created_at": t.created_at, "updated_at": t.updated_at, "completed_at": t.completed_at}
