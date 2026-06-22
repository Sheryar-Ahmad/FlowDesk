from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, field_validator

from app.constants import COMPILER_MAX_CODE_CHARS, COMPILER_MAX_OUTPUT_CHARS, COMPILER_MAX_STDIN_CHARS


CompilerLanguage = Literal[
    "python",
    "javascript",
    "java",
    "cpp",
    "c",
    "html",
    "css",
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
    args: list[str] = Field(default_factory=list, max_length=32)
    use_cache: bool = True

    @field_validator("args")
    @classmethod
    def clean_args(cls, value: list[str]) -> list[str]:
        cleaned = [item.strip() for item in value if item.strip()]
        if any(len(item) > 200 for item in cleaned):
            raise ValueError("Each argument must be 200 characters or fewer.")
        return cleaned


class CompilerSavedRunRequest(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=200)
    language: CompilerLanguage | None = None
    code: str | None = Field(default=None, min_length=1, max_length=COMPILER_MAX_CODE_CHARS)
    stdin: str | None = Field(default=None, max_length=COMPILER_MAX_STDIN_CHARS)
    args: list[str] = Field(default_factory=list, max_length=32)
    use_cache: bool = True

    @field_validator("title")
    @classmethod
    def clean_title(cls, value: str | None) -> str | None:
        if value is None:
            return None
        title = " ".join(value.strip().split())
        if not title:
            raise ValueError("Title is required.")
        return title

    @field_validator("args")
    @classmethod
    def clean_args(cls, value: list[str]) -> list[str]:
        cleaned = [item.strip() for item in value if item.strip()]
        if any(len(item) > 200 for item in cleaned):
            raise ValueError("Each argument must be 200 characters or fewer.")
        return cleaned


class CompilerTestCase(BaseModel):
    stdin: str = Field(default="", max_length=COMPILER_MAX_STDIN_CHARS)
    expected: str = Field(default="", max_length=COMPILER_MAX_OUTPUT_CHARS)


class CompilerTestCaseRequest(BaseModel):
    language: CompilerLanguage
    code: str = Field(min_length=1, max_length=COMPILER_MAX_CODE_CHARS)
    test_cases: list[CompilerTestCase] = Field(min_length=1, max_length=25)


class CompilerRuntime(BaseModel):
    language: str
    label: str
    executable: bool
    reason: str | None = None
    queue: dict[str, int] | None = None


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
    memory_kb: int | None = None
    cpu_time_ms: int | None = None
    exit_signal: int | None = None
    warnings: list[str] = Field(default_factory=list)
    cached: bool = False


class CompilerRunEventResponse(BaseModel):
    id: str
    compiler_file_id: str | None
    language: str
    status: str
    duration_ms: int
    output_size: int
    created_at: datetime


class CompilerRunStatsResponse(BaseModel):
    total_runs: int
    successful_runs: int
    failed_runs: int
    timed_out_runs: int
    avg_duration_ms: float
    max_duration_ms: int
