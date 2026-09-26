from pydantic import BaseModel, Field, field_validator
from typing import Optional, List
from datetime import datetime, date


class ProjectCreate(BaseModel):
    name: str
    description: Optional[str] = None
    color: str = Field(default="#6366f1", max_length=20)

    @field_validator("name")
    @classmethod
    def validate_name(cls, v):
        v = v.strip()
        if not v: raise ValueError("Project name required")
        if len(v) > 200: raise ValueError("Name too long")
        return v


class ProjectUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=200)
    description: Optional[str] = None
    color: Optional[str] = Field(default=None, max_length=20)
    is_archived: Optional[bool] = None

    @field_validator("name")
    @classmethod
    def validate_name(cls, value):
        return ProjectCreate.validate_name(value) if value is not None else value


class ColumnCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)

    @field_validator("name")
    @classmethod
    def validate_name(cls, value):
        if not value.strip():
            raise ValueError("Column name required")
        return value.strip()


class TaskCreate(BaseModel):
    title: str
    description: Optional[str] = None
    status: str = Field(default="todo", min_length=1, max_length=100)
    priority: str = "medium"
    due_date: Optional[date] = None
    labels: List[str] = Field(default_factory=list)

    @field_validator("title")
    @classmethod
    def validate_title(cls, v):
        v = v.strip()
        if not v: raise ValueError("Task title required")
        if len(v) > 300: raise ValueError("Title too long")
        return v

    @field_validator("priority")
    @classmethod
    def validate_priority(cls, v):
        if v not in ["low", "medium", "high", "critical"]:
            raise ValueError("Priority must be low, medium, high, or critical")
        return v


class TaskUpdate(BaseModel):
    title: Optional[str] = Field(default=None, min_length=1, max_length=300)
    description: Optional[str] = None
    status: Optional[str] = Field(default=None, min_length=1, max_length=100)
    priority: Optional[str] = None
    due_date: Optional[date] = None
    position: Optional[float] = Field(default=None, allow_inf_nan=False)
    labels: Optional[List[str]] = None
    completed_at: Optional[datetime] = None

    @field_validator("title")
    @classmethod
    def validate_title(cls, value):
        return TaskCreate.validate_title(value) if value is not None else value

    @field_validator("priority")
    @classmethod
    def validate_priority(cls, value):
        return TaskCreate.validate_priority(value) if value is not None else value
