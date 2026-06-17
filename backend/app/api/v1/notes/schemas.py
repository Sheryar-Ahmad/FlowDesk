from pydantic import BaseModel, Field, field_validator
from typing import Optional
from datetime import datetime


class NoteCreate(BaseModel):
    title: str
    content: dict = Field(default_factory=dict)
    content_text: str = Field(default="", max_length=1_000_000)

    @field_validator("title")
    @classmethod
    def validate_title(cls, v):
        v = v.strip()
        if not v:
            raise ValueError("Title required")
        if len(v) > 300:
            raise ValueError("Title too long")
        return v


class NoteUpdate(BaseModel):
    title: Optional[str] = None
    content: Optional[dict] = None
    content_text: Optional[str] = Field(default=None, max_length=1_000_000)
    word_count: Optional[int] = None


class NoteResponse(BaseModel):
    id: str
    user_id: str
    title: str
    content: dict
    content_text: str
    word_count: int
    created_at: datetime
    updated_at: datetime
