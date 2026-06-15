from pydantic import BaseModel, field_validator
from typing import Optional, List
from datetime import datetime
import re


SUPPORTED_LANGUAGES = [
    "python", "javascript", "typescript", "rust", "go",
    "java", "cpp", "c", "csharp", "php", "ruby", "swift",
    "kotlin", "sql", "html", "css", "bash", "shell",
    "json", "yaml", "markdown", "xml", "docker",
    "terraform", "graphql", "r", "scala", "haskell", "other"
]


class SnippetCreate(BaseModel):
    """Schema for creating a new snippet."""
    title: str
    code: str
    language: str
    description: Optional[str] = None
    tags: Optional[List[str]] = []
    is_public: bool = False
    collection_id: Optional[str] = None

    @field_validator("title")
    @classmethod
    def validate_title(cls, v):
        v = v.strip()
        if len(v) < 1:
            raise ValueError("Title is required")
        if len(v) > 200:
            raise ValueError("Title must not exceed 200 characters")
        # Block XSS attempts
        if re.search(r"<script|javascript:|on\w+=", v, re.IGNORECASE):
            raise ValueError("Invalid characters in title")
        return v

    @field_validator("code")
    @classmethod
    def validate_code(cls, v):
        if not v or not v.strip():
            raise ValueError("Code is required")
        if len(v) > 500000:
            raise ValueError("Code must not exceed 500KB")
        return v

    @field_validator("language")
    @classmethod
    def validate_language(cls, v):
        v = v.lower().strip()
        if v not in SUPPORTED_LANGUAGES:
            return "other"
        return v

    @field_validator("tags")
    @classmethod
    def validate_tags(cls, v):
        if not v:
            return []

        if len(v) > 10:
            raise ValueError("Maximum 10 tags allowed")
        cleaned = []
        for tag in v:
            tag = tag.strip().lower()

            if not re.match(r"^[\w\-]+$", tag):
                continue
            if len(tag) > 50:
                continue
            cleaned.append(tag)
        return list(set(cleaned))

    @field_validator("description")
    @classmethod
    def validate_description(cls, v):
        if not v:
            return None
        v = v.strip()
        if len(v) > 1000:
            raise ValueError("Description must not exceed 1000 characters")
        return v


class SnippetUpdate(BaseModel):
    """Schema for updating an existing snippet. All fields optional."""
    title: Optional[str] = None
    code: Optional[str] = None
    language: Optional[str] = None
    description: Optional[str] = None
    is_public: Optional[bool] = None
    is_pinned: Optional[bool] = None
    tags: Optional[List[str]] = None
    collection_id: Optional[str] = None


class SnippetResponse(BaseModel):
    """Schema for snippet data returned to frontend."""
    id: str
    user_id: str
    title: str
    code: str
    language: str
    description: Optional[str]
    is_public: bool
    is_pinned: bool
    use_count: int
    tags: List[str] = []
    created_at: datetime
    updated_at: datetime


class SnippetListResponse(BaseModel):
    """Schema for paginated list of snippets."""
    snippets: List[SnippetResponse]
    total: int
    page: int
    page_size: int
    has_more: bool


class SnippetSearchResponse(BaseModel):
    """Schema for search results."""
    snippets: List[SnippetResponse]
    total: int
    query: str
    search_time_ms: float
