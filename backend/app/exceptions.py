"""
exceptions.py - Custom Error Messages for FlowDesk
"""

from fastapi import HTTPException, status


# --- Authentication Errors ---
class InvalidCredentialsError(HTTPException):
    """Raised when email or password is wrong during login."""
    def __init__(self):
        super().__init__(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password. Please try again.",
            headers={"WWW-Authenticate": "Bearer"},
        )


class AccountLockedError(HTTPException):
    """Raised when account is locked due to too many failed login attempts."""
    def __init__(self, minutes: int = 15):
        super().__init__(
            status_code=status.HTTP_423_LOCKED,
            detail=f"Account locked due to too many failed attempts. Try again in {minutes} minutes.",
        )


class TokenExpiredError(HTTPException):
    """Raised when JWT token has expired."""
    def __init__(self):
        super().__init__(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Your session has expired. Please login again.",
            headers={"WWW-Authenticate": "Bearer"},
        )


class InvalidTokenError(HTTPException):
    """Raised when JWT token is invalid or tampered with."""
    def __init__(self):
        super().__init__(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication token.",
            headers={"WWW-Authenticate": "Bearer"},
        )


class EmailNotVerifiedError(HTTPException):
    """Raised when user tries to login without verifying email."""
    def __init__(self):
        super().__init__(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Please verify your email address before logging in.",
        )


# --- User Errors ---
class UserNotFoundError(HTTPException):
    """Raised when a user cannot be found in the database."""
    def __init__(self):
        super().__init__(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found.",
        )


class EmailAlreadyExistsError(HTTPException):
    """Raised when someone tries to register with an email already in use."""
    def __init__(self):
        super().__init__(
            status_code=status.HTTP_409_CONFLICT,
            detail="An account with this email already exists.",
        )


# --- Resource Errors ---
class SnippetNotFoundError(HTTPException):
    """Raised when a snippet cannot be found."""
    def __init__(self):
        super().__init__(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Snippet not found.",
        )


class NoteNotFoundError(HTTPException):
    """Raised when a note cannot be found."""
    def __init__(self):
        super().__init__(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Note not found.",
        )


class TaskNotFoundError(HTTPException):
    """Raised when a task cannot be found."""
    def __init__(self):
        super().__init__(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Task not found.",
        )


# --- Permission Errors ---
class ForbiddenError(HTTPException):
    """Raised when user tries to access something that belongs to another user."""
    def __init__(self):
        super().__init__(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to access this resource.",
        )


# --- Free Tier Limit Errors ---
class FreeTierLimitError(HTTPException):
    """Raised when free user hits their usage limit."""
    def __init__(self, resource: str, limit: int):
        super().__init__(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail=f"Free tier limit reached: {limit} {resource} maximum. Upgrade to Pro for unlimited access.",
        )


# --- Validation Errors ---
class InvalidInputError(HTTPException):
    """Raised when user sends invalid data."""
    def __init__(self, message: str):
        super().__init__(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=message,
        )


# --- Server Errors ---
class DatabaseError(HTTPException):
    """Raised when database operation fails."""
    def __init__(self):
        super().__init__(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="A database error occurred. Please try again.",
        )


class AIServiceError(HTTPException):
    """Raised when all AI services are unavailable."""
    def __init__(self):
        super().__init__(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="AI service is temporarily unavailable. Please try again shortly.",
        )
