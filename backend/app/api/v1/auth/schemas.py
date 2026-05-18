"""
schemas.py - Authentication Request/Response Models
-----------------------------------------------------
Defines what data the API accepts and returns.
Pydantic validates all incoming data automatically.
"""

from pydantic import BaseModel, EmailStr, Field, field_validator
from typing import Optional
from datetime import datetime
import re


class RegisterRequest(BaseModel):
    """What user sends when registering."""
    email: EmailStr = Field(..., description="User email address")
    password: str = Field(..., min_length=8, max_length=128, description="User password")
    display_name: str = Field(..., min_length=2, max_length=100, description="Display name")

    @field_validator("password")
    @classmethod
    def validate_password_strength(cls, v: str) -> str:
        """Validate password strength before even reaching backend."""
        if not re.search(r"[A-Z]", v):
            raise ValueError("Password must contain at least one uppercase letter")
        if not re.search(r"[a-z]", v):
            raise ValueError("Password must contain at least one lowercase letter")
        if not re.search(r"\d", v):
            raise ValueError("Password must contain at least one number")
        if not re.search(r"[!@#$%^&*(),.?\":{}|<>]", v):
            raise ValueError("Password must contain at least one special character")
        return v

    @field_validator("display_name")
    @classmethod
    def validate_display_name(cls, v: str) -> str:
        """Remove any dangerous characters from display name."""
        # Only allow letters, numbers, spaces, and basic punctuation
        cleaned = re.sub(r'[^a-zA-Z0-9\s\-_.]', '', v)
        if len(cleaned) < 2:
            raise ValueError("Display name must be at least 2 characters")
        return cleaned.strip()


class RegisterResponse(BaseModel):
    """What user receives after successful registration."""
    success: bool
    message: str
    user_id: str
    email: str
    display_name: str
    plan: str


class LoginRequest(BaseModel):
    """What user sends when logging in."""
    email: EmailStr
    password: str


class LoginResponse(BaseModel):
    """What user receives after successful login."""
    success: bool
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    user: dict


class RefreshTokenRequest(BaseModel):
    """What user sends to get new access token."""
    refresh_token: str


class RefreshTokenResponse(BaseModel):
    """What user receives after refreshing token."""
    access_token: str
    token_type: str = "bearer"


class UserResponse(BaseModel):
    """User data returned to frontend."""
    id: str
    email: str
    display_name: str
    plan: str
    email_verified: bool
    created_at: datetime
