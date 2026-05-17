"""
ai/router.py - AI Assistant Endpoints
Handles: AI chat, code explanation, bug finding.
"""

from fastapi import APIRouter

router = APIRouter()

@router.get("/health")
async def ai_health():
    return {"status": "ai service running"}
