from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, field_validator

from app.constants import COMPILER_MAX_CODE_CHARS, COMPILER_MAX_STDIN_CHARS


CompilerLanguage = Literal[
    "python",
    "javascript",
    "typescript",
    "java",
    "cpp",
    "c",
    "go",
    "rust",
    "csharp",
    "php",
    "ruby",
    "sql",
    "bash",
]

SUPPORTED_COMPILER_LANGUAGES: set[str] = set(CompilerLanguage.__args__)


class CompilerFileCreate(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    language: CompilerLanguage
    code: str = Field(min_length=1, max_length=COMPILER_MAX_CODE_CHARS)
    stdin: str = Field(default="", max_length=COMPILER_MAX_STDIN_CHARS)

    @field_validator("title")
    @classmethod
    def clean_title(cls, value: str) -> str:
        title = " ".join(value.strip().split())
        if not title:
            raise ValueError("Title is required.")
        return title


class CompilerFileUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=200)
    language: CompilerLanguage | None = None
    code: str | None = Field(default=None, min_length=1, max_length=COMPILER_MAX_CODE_CHARS)
    stdin: str | None = Field(default=None, max_length=COMPILER_MAX_STDIN_CHARS)
    output: str | None = Field(default=None, max_length=20000)
    is_pinned: bool | None = None

    @field_validator("title")
    @classmethod
    def clean_title(cls, value: str | None) -> str | None:
        if value is None:
            return None
        title = " ".join(value.strip().split())
        if not title:
            raise ValueError("Title is required.")
        return title


class CompilerRunRequest(BaseModel):
    language: CompilerLanguage
    code: str = Field(min_length=1, max_length=COMPILER_MAX_CODE_CHARS)
    stdin: str = Field(default="", max_length=COMPILER_MAX_STDIN_CHARS)


class CompilerRuntime(BaseModel):
    language: str
    label: str
    executable: bool
    reason: str | None = None


class CompilerFileResponse(BaseModel):
    id: str
    user_id: str
    title: str
    language: str
    code: str
    stdin: str
    output: str
    is_pinned: bool
    run_count: int
    last_run_at: datetime | None
    created_at: datetime
    updated_at: datetime


class CompilerListResponse(BaseModel):
    files: list[CompilerFileResponse]
    total: int
    page: int
    page_size: int
    has_more: bool


class CompilerRunResponse(BaseModel):
    status: str
    stdout: str
    stderr: str
    output: str
    exit_code: int | None
    duration_ms: int
    timed_out: bool
    truncated: bool
    language: str
    message: str | None = None
