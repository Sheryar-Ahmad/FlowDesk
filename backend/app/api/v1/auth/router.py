"""
auth/router.py - Authentication Endpoints
Handles: register, login, logout, password reset.
"""

from fastapi import APIRouter

router = APIRouter()

@router.get("/health")
async def auth_health():
    """Check auth service is running."""
    return {"status": "auth service running"}
