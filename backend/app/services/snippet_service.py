from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from datetime import datetime, timezone
from typing import Optional, List
import time
import structlog

from app.constants import FREE_TIER_SNIPPET_LIMIT

logger = structlog.get_logger(__name__)


async def get_user_snippet_count(db: AsyncSession, user_id: str) -> int:
    """Returns total active snippets for a user."""
    result = await db.execute(
        text("SELECT COUNT(*) FROM snippets WHERE user_id = :user_id AND deleted_at IS NULL"),
        {"user_id": user_id}
    )
    return result.scalar() or 0


async def create_snippet(
    db: AsyncSession,
    user_id: str,
    plan: str,
    title: str,
    code: str,
    language: str,
    description: Optional[str] = None,
    tags: Optional[List[str]] = None,
    is_public: bool = False,
    collection_id: Optional[str] = None,
) -> dict:
    """Creates a new snippet."""


    if plan == "free":
        count = await get_user_snippet_count(db, user_id)
        if count >= FREE_TIER_SNIPPET_LIMIT:
            raise ValueError(f"Free tier limit reached: {FREE_TIER_SNIPPET_LIMIT} snippets maximum. Upgrade to Pro for unlimited snippets.")


    result = await db.execute(
        text("""
            INSERT INTO snippets (user_id, title, code, language, description, is_public, collection_id)
            VALUES (:user_id, :title, :code, :language, :description, :is_public, :collection_id)
            RETURNING id, user_id, title, code, language, description, is_public,
                      is_pinned, use_count, created_at, updated_at
        """),
        {
            "user_id": user_id,
            "title": title,
            "code": code,
            "language": language,
            "description": description,
            "is_public": is_public,
            "collection_id": collection_id,
        }
    )
    snippet = result.fetchone()
    await db.commit()


    saved_tags = []
    if tags:
        for tag_name in tags:

            tag_result = await db.execute(
                text("""
                    INSERT INTO tags (user_id, name)
                    VALUES (:user_id, :name)
                    ON CONFLICT (user_id, name) DO UPDATE SET name = EXCLUDED.name
                    RETURNING id, name
                """),
                {"user_id": user_id, "name": tag_name}
            )
            tag = tag_result.fetchone()
            await db.commit()


            await db.execute(
                text("""
                    INSERT INTO snippet_tags (snippet_id, tag_id)
                    VALUES (:snippet_id, :tag_id)
                    ON CONFLICT DO NOTHING
                """),
                {"snippet_id": str(snippet.id), "tag_id": str(tag.id)}
            )
            await db.commit()
            saved_tags.append(tag.name)


    await db.execute(
        text("""
            INSERT INTO audit_logs (user_id, action, resource_type, resource_id, metadata)
            VALUES (:user_id, :action, :resource_type, :resource_id, :metadata)
        """),
        {
            "user_id": user_id,
            "action": "snippet.create",
            "resource_type": "snippet",
            "resource_id": str(snippet.id),
            "metadata": "{}",
        }
    )
    await db.commit()

    logger.info("Snippet created", user_id=user_id, snippet_id=str(snippet.id))

    return {
        "id": str(snippet.id),
        "user_id": str(snippet.user_id),
        "title": snippet.title,
        "code": snippet.code,
        "language": snippet.language,
        "description": snippet.description,
        "is_public": snippet.is_public,
        "is_pinned": snippet.is_pinned,
        "use_count": snippet.use_count,
        "tags": saved_tags,
        "created_at": snippet.created_at,
        "updated_at": snippet.updated_at,
    }


async def get_snippets(
    db: AsyncSession,
    user_id: str,
    page: int = 1,
    page_size: int = 20,
    language: Optional[str] = None,
    search: Optional[str] = None,
) -> dict:
    """Returns paginated list of user snippets."""
    start_time = time.time()
    offset = (page - 1) * page_size


    if search:
        # Full text search using PostgreSQL GIN index
        query = text("""
            SELECT s.id, s.user_id, s.title, s.code, s.language,
                   s.description, s.is_public, s.is_pinned, s.use_count,
                   s.created_at, s.updated_at,
                   COALESCE(array_agg(t.name) FILTER (WHERE t.name IS NOT NULL), ARRAY[]::text[]) as tags
            FROM snippets s
            LEFT JOIN snippet_tags st ON s.id = st.snippet_id
            LEFT JOIN tags t ON st.tag_id = t.id
            WHERE s.user_id = :user_id
            AND s.deleted_at IS NULL
            AND s.search_vector @@ plainto_tsquery('english', :search)
            GROUP BY s.id
            ORDER BY ts_rank(s.search_vector, plainto_tsquery('english', :search)) DESC
            LIMIT :limit OFFSET :offset
        """)
        count_query = text("""
            SELECT COUNT(*) FROM snippets
            WHERE user_id = :user_id
            AND deleted_at IS NULL
            AND search_vector @@ plainto_tsquery('english', :search)
        """)
        params = {"user_id": user_id, "search": search, "limit": page_size, "offset": offset}
        count_params = {"user_id": user_id, "search": search}
    elif language:
        query = text("""
            SELECT s.id, s.user_id, s.title, s.code, s.language,
                   s.description, s.is_public, s.is_pinned, s.use_count,
                   s.created_at, s.updated_at,
                   COALESCE(array_agg(t.name) FILTER (WHERE t.name IS NOT NULL), ARRAY[]::text[]) as tags
            FROM snippets s
            LEFT JOIN snippet_tags st ON s.id = st.snippet_id
            LEFT JOIN tags t ON st.tag_id = t.id
            WHERE s.user_id = :user_id
            AND s.deleted_at IS NULL
            AND s.language = :language
            GROUP BY s.id
            ORDER BY s.is_pinned DESC, s.updated_at DESC
            LIMIT :limit OFFSET :offset
        """)
        count_query = text("""
            SELECT COUNT(*) FROM snippets
            WHERE user_id = :user_id AND deleted_at IS NULL AND language = :language
        """)
        params = {"user_id": user_id, "language": language, "limit": page_size, "offset": offset}
        count_params = {"user_id": user_id, "language": language}
    else:
        query = text("""
            SELECT s.id, s.user_id, s.title, s.code, s.language,
                   s.description, s.is_public, s.is_pinned, s.use_count,
                   s.created_at, s.updated_at,
                   COALESCE(array_agg(t.name) FILTER (WHERE t.name IS NOT NULL), ARRAY[]::text[]) as tags
            FROM snippets s
            LEFT JOIN snippet_tags st ON s.id = st.snippet_id
            LEFT JOIN tags t ON st.tag_id = t.id
            WHERE s.user_id = :user_id AND s.deleted_at IS NULL
            GROUP BY s.id
            ORDER BY s.is_pinned DESC, s.updated_at DESC
            LIMIT :limit OFFSET :offset
        """)
        count_query = text("""
            SELECT COUNT(*) FROM snippets
            WHERE user_id = :user_id AND deleted_at IS NULL
        """)
        params = {"user_id": user_id, "limit": page_size, "offset": offset}
        count_params = {"user_id": user_id}

    result = await db.execute(query, params)
    snippets = result.fetchall()

    count_result = await db.execute(count_query, count_params)
    total = count_result.scalar() or 0

    search_time = (time.time() - start_time) * 1000

    return {
        "snippets": [
            {
                "id": str(s.id),
                "user_id": str(s.user_id),
                "title": s.title,
                "code": s.code,
                "language": s.language,
                "description": s.description,
                "is_public": s.is_public,
                "is_pinned": s.is_pinned,
                "use_count": s.use_count,
                "tags": list(s.tags) if s.tags else [],
                "created_at": s.created_at,
                "updated_at": s.updated_at,
            }
            for s in snippets
        ],
        "total": total,
        "page": page,
        "page_size": page_size,
        "has_more": (offset + page_size) < total,
        "search_time_ms": round(search_time, 2),
    }


async def get_snippet_by_id(
    db: AsyncSession,
    snippet_id: str,
    user_id: str,
) -> Optional[dict]:
    """Returns a single snippet by ID."""
    result = await db.execute(
        text("""
            SELECT s.id, s.user_id, s.title, s.code, s.language,
                   s.description, s.is_public, s.is_pinned, s.use_count,
                   s.created_at, s.updated_at,
                   COALESCE(array_agg(t.name) FILTER (WHERE t.name IS NOT NULL), ARRAY[]::text[]) as tags
            FROM snippets s
            LEFT JOIN snippet_tags st ON s.id = st.snippet_id
            LEFT JOIN tags t ON st.tag_id = t.id
            WHERE s.id = :snippet_id AND s.user_id = :user_id AND s.deleted_at IS NULL
            GROUP BY s.id
        """),
        {"snippet_id": snippet_id, "user_id": user_id}
    )
    s = result.fetchone()
    if not s:
        return None

    return {
        "id": str(s.id),
        "user_id": str(s.user_id),
        "title": s.title,
        "code": s.code,
        "language": s.language,
        "description": s.description,
        "is_public": s.is_public,
        "is_pinned": s.is_pinned,
        "use_count": s.use_count,
        "tags": list(s.tags) if s.tags else [],
        "created_at": s.created_at,
        "updated_at": s.updated_at,
    }


async def update_snippet(
    db: AsyncSession,
    snippet_id: str,
    user_id: str,
    updates: dict,
) -> Optional[dict]:
    """Updates a snippet."""

    existing = await get_snippet_by_id(db, snippet_id, user_id)
    if not existing:
        return None


    update_fields = []
    params = {"snippet_id": snippet_id, "user_id": user_id}

    for field in ["title", "code", "language", "description", "is_public", "is_pinned"]:
        if field in updates and updates[field] is not None:
            update_fields.append(f"{field} = :{field}")
            params[field] = updates[field]

    if not update_fields:
        return existing

    update_fields.append("updated_at = NOW()")
    query = text(f"""
        UPDATE snippets
        SET {", ".join(update_fields)}
        WHERE id = :snippet_id AND user_id = :user_id AND deleted_at IS NULL
    """)
    await db.execute(query, params)
    await db.commit()

    logger.info("Snippet updated", snippet_id=snippet_id, user_id=user_id)
    return await get_snippet_by_id(db, snippet_id, user_id)


async def delete_snippet(
    db: AsyncSession,
    snippet_id: str,
    user_id: str,
) -> bool:
    """Soft deletes a snippet."""
    result = await db.execute(
        text("""
            UPDATE snippets
            SET deleted_at = NOW()
            WHERE id = :snippet_id AND user_id = :user_id AND deleted_at IS NULL
        """),
        {"snippet_id": snippet_id, "user_id": user_id}
    )
    await db.commit()

    deleted = result.rowcount > 0
    if deleted:
        await db.execute(
            text("""
                INSERT INTO audit_logs (user_id, action, resource_type, resource_id, metadata)
                VALUES (:user_id, :action, :resource_type, :resource_id, :metadata)
            """),
            {
                "user_id": user_id,
                "action": "snippet.delete",
                "resource_type": "snippet",
                "resource_id": snippet_id,
                "metadata": "{}",
            }
        )
        await db.commit()
        logger.info("Snippet deleted", snippet_id=snippet_id, user_id=user_id)

    return deleted


async def increment_use_count(
    db: AsyncSession,
    snippet_id: str,
    user_id: str,
) -> bool:
    """Increments use_count when snippet is copied."""
    result = await db.execute(
        text("""
            UPDATE snippets
            SET use_count = use_count + 1
            WHERE id = :snippet_id AND user_id = :user_id AND deleted_at IS NULL
        """),
        {"snippet_id": snippet_id, "user_id": user_id}
    )
    await db.commit()
    return result.rowcount > 0
