"""
payments/router.py - Payment Endpoints
Handles: subscription, billing, webhooks.
"""

from fastapi import APIRouter

router = APIRouter()

@router.get("/health")
async def payments_health():
    return {"status": "payments service running"}
