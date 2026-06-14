from pydantic import BaseModel, Field, field_validator
from typing import Optional, List
from datetime import datetime, date


class ProjectCreate(BaseModel):
    name: str
    description: Optional[str] = None
    color: str = "#6366f1"

    @field_validator("name")
    @classmethod
    def validate_name(cls, v):
        v = v.strip()
        if not v: raise ValueError("Project name required")
        if len(v) > 200: raise ValueError("Name too long")
        return v


class ProjectUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    color: Optional[str] = None
    is_archived: Optional[bool] = None


class TaskCreate(BaseModel):
    title: str
    description: Optional[str] = None
    status: str = "todo"
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
            return "medium"
        return v


class TaskUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    status: Optional[str] = None
    priority: Optional[str] = None
    due_date: Optional[date] = None
    position: Optional[float] = None
    labels: Optional[List[str]] = None
    completed_at: Optional[datetime] = None
