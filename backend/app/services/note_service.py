from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from typing import Optional
import structlog
import json
from app.constants import FREE_TIER_NOTE_LIMIT

logger = structlog.get_logger(__name__)


def _fmt(n) -> dict:
    content = n.content
    if isinstance(content, str):
        try: content = json.loads(content)
        except (TypeError, json.JSONDecodeError):
            content = {}
    return {"id": str(n.id), "user_id": str(n.user_id), "title": n.title, "content": content, "content_text": n.content_text or "", "word_count": n.word_count or 0, "created_at": n.created_at, "updated_at": n.updated_at}


async def create_note(db: AsyncSession, user_id: str, plan: str, title: str, content: Optional[dict] = None, content_text: str = "") -> dict:
    content = content or {}
    if plan == "free":
        r = await db.execute(text("SELECT COUNT(*) FROM notes WHERE user_id=:u AND deleted_at IS NULL"), {"u": user_id})
        if (r.scalar() or 0) >= FREE_TIER_NOTE_LIMIT:
            raise ValueError(f"Free tier limit: {FREE_TIER_NOTE_LIMIT} notes. Upgrade to Pro.")

    word_count = len(content_text.split()) if content_text.strip() else 0
    content_json = json.dumps(content)

    r = await db.execute(text("""
        INSERT INTO notes (user_id, title, content, content_text, word_count)
        VALUES (:uid, :title, CAST(:content AS jsonb), :ct, :wc)
        RETURNING id, user_id, title, content, content_text, word_count, created_at, updated_at
    """), {"uid": user_id, "title": title, "content": content_json, "ct": content_text, "wc": word_count})
    note = r.fetchone()
    await db.commit()

    await db.execute(text("INSERT INTO audit_logs (user_id, action, resource_type, resource_id, metadata) VALUES (:u,'note.create','note',:r,'{}')"), {"u": user_id, "r": str(note.id)})
    await db.commit()
    logger.info("Note created", user_id=user_id, note_id=str(note.id))
    return _fmt(note)


async def get_notes(db: AsyncSession, user_id: str, search: Optional[str] = None, page: int = 1, page_size: int = 50) -> dict:
    offset = (page - 1) * page_size
    if search and len(search) >= 2:
        r = await db.execute(text("SELECT id, user_id, title, content, content_text, word_count, created_at, updated_at FROM notes WHERE user_id=:u AND deleted_at IS NULL AND search_vector @@ plainto_tsquery('english',:s) ORDER BY updated_at DESC LIMIT :l OFFSET :o"), {"u": user_id, "s": search, "l": page_size, "o": offset})
        cr = await db.execute(text("SELECT COUNT(*) FROM notes WHERE user_id=:u AND deleted_at IS NULL AND search_vector @@ plainto_tsquery('english',:s)"), {"u": user_id, "s": search})
    else:
        r = await db.execute(text("SELECT id, user_id, title, content, content_text, word_count, created_at, updated_at FROM notes WHERE user_id=:u AND deleted_at IS NULL ORDER BY updated_at DESC LIMIT :l OFFSET :o"), {"u": user_id, "l": page_size, "o": offset})
        cr = await db.execute(text("SELECT COUNT(*) FROM notes WHERE user_id=:u AND deleted_at IS NULL"), {"u": user_id})
    notes = r.fetchall()
    total = cr.scalar() or 0
    return {"notes": [_fmt(n) for n in notes], "total": total, "page": page, "page_size": page_size}


async def get_note_by_id(db: AsyncSession, note_id: str, user_id: str) -> Optional[dict]:
    r = await db.execute(text("SELECT id, user_id, title, content, content_text, word_count, created_at, updated_at FROM notes WHERE id=:id AND user_id=:u AND deleted_at IS NULL"), {"id": note_id, "u": user_id})
    n = r.fetchone()
    return _fmt(n) if n else None


async def update_note(db: AsyncSession, note_id: str, user_id: str, updates: dict) -> Optional[dict]:
    fields, params = [], {"id": note_id, "u": user_id}
    if "title" in updates and updates["title"]:
        fields.append("title=:title"); params["title"] = updates["title"].strip()
    if "content" in updates:
        fields.append("content=CAST(:content AS jsonb)")
        params["content"] = json.dumps(updates["content"])
    if "content_text" in updates:
        ct = updates["content_text"]
        fields.append("content_text=:ct")
        fields.append("word_count=:wc")
        params["ct"] = ct
        params["wc"] = len(ct.split()) if ct.strip() else 0
    if not fields: return await get_note_by_id(db, note_id, user_id)
    fields.append("updated_at=NOW()")
    await db.execute(text(f"UPDATE notes SET {','.join(fields)} WHERE id=:id AND user_id=:u AND deleted_at IS NULL"), params)
    await db.commit()
    return await get_note_by_id(db, note_id, user_id)


async def delete_note(db: AsyncSession, note_id: str, user_id: str) -> bool:
    r = await db.execute(text("UPDATE notes SET deleted_at=NOW() WHERE id=:id AND user_id=:u AND deleted_at IS NULL"), {"id": note_id, "u": user_id})
    await db.commit()
    deleted = r.rowcount > 0
    if deleted:
        await db.execute(text("INSERT INTO audit_logs (user_id,action,resource_type,resource_id,metadata) VALUES (:u,'note.delete','note',:r,'{}')"), {"u": user_id, "r": note_id})
        await db.commit()
    return deleted


async def get_note_versions(db: AsyncSession, note_id: str, user_id: str) -> list:
    existing = await get_note_by_id(db, note_id, user_id)
    if not existing: return []
    r = await db.execute(text("SELECT version_number, title, created_at FROM note_versions WHERE note_id=:nid ORDER BY version_number DESC LIMIT 20"), {"nid": note_id})
    return [{"version": v.version_number, "title": v.title, "saved_at": v.created_at} for v in r.fetchall()]
