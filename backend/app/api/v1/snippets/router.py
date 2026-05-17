"""
snippets/router.py - Snippet Endpoints
Handles: create, read, update, delete, search snippets.
"""

from fastapi import APIRouter

router = APIRouter()

@router.get("/health")
async def snippets_health():
    """Check snippets service is running."""
    return {"status": "snippets service running"}
