import re
import html
from typing import Optional
import structlog

logger = structlog.get_logger(__name__)


SAFE_TEXT_PATTERN = re.compile(r"^[\w\s\-.,!?@#$%^&*()\[\]{}<>:;\"\'`~+=|/\\]+$")
SAFE_NAME_PATTERN = re.compile(r"^[\w\s\-.,]+$")
SAFE_TAG_PATTERN = re.compile(r"^[\w\-]+$")
EMAIL_PATTERN = re.compile(r"^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$")
URL_PATTERN = re.compile(
    r"^https?://"
    r"(?:(?:[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?\.)+[A-Z]{2,6}\.?|"
    r"localhost|"
    r"\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})"
    r"(?::\d+)?"
    r"(?:/?|[/?]\S+)$",
    re.IGNORECASE,
)


SQL_INJECTION_PATTERNS = [
    r"(\bUNION\b.*\bSELECT\b)",
    r"(\bDROP\b.*\bTABLE\b)",
    r"(\bDELETE\b.*\bFROM\b)",
    r"(\bINSERT\b.*\bINTO\b)",
    r"(\bEXEC\b|\bEXECUTE\b)",
    r"(--|\#|\/\*|\*\/)",
    r"(\bOR\b\s+\d+\s*=\s*\d+)",
    r"(\bAND\b\s+\d+\s*=\s*\d+)",
    r"(xp_cmdshell|sp_executesql)",
]

XSS_PATTERNS = [
    r"<script[^>]*>.*?</script>",
    r"javascript:",
    r"on\w+\s*=",
    r"<iframe[^>]*>",
    r"<object[^>]*>",
    r"<embed[^>]*>",
    r"vbscript:",
    r"data:text/html",
]


def sanitize_string(value: str, max_length: int = 1000) -> str:
    """Trims, escapes, and bounds free-form text."""
    if not value:
        return ""
    value = value.strip()
    value = html.escape(value, quote=True)
    return value[:max_length]


def validate_email(email: str) -> Optional[str]:
    """Validates email format."""
    if not email:
        return None
    email = email.strip().lower()
    if len(email) > 255:
        return None
    if not EMAIL_PATTERN.match(email):
        return None
    return email


def validate_password(password: str) -> tuple[bool, str]:
    """Validates password strength."""
    if len(password) < 8:
        return False, "Password must be at least 8 characters long."
    if len(password) > 128:
        return False, "Password must not exceed 128 characters."
    if not re.search(r"[A-Z]", password):
        return False, "Password must contain at least one uppercase letter."
    if not re.search(r"[a-z]", password):
        return False, "Password must contain at least one lowercase letter."
    if not re.search(r"\d", password):
        return False, "Password must contain at least one number."
    if not re.search(r"[!@#$%^&*(),.?\":{}|<>]", password):
        return False, "Password must contain at least one special character."
    return True, ""


def validate_display_name(name: str) -> Optional[str]:
    """Validates display name."""
    if not name:
        return None
    name = name.strip()
    if len(name) < 2:
        return None
    if len(name) > 100:
        return None
    if not SAFE_NAME_PATTERN.match(name):
        return None
    return name


def validate_snippet_title(title: str) -> Optional[str]:
    """Validates snippet title."""
    if not title:
        return None
    title = title.strip()
    if len(title) < 1:
        return None
    if len(title) > 200:
        return None
    return sanitize_string(title, 200)


def validate_tag(tag: str) -> Optional[str]:
    """Validates tag name."""
    if not tag:
        return None
    tag = tag.strip().lower()
    if len(tag) > 50:
        return None
    if not SAFE_TAG_PATTERN.match(tag):
        return None
    return tag


def check_sql_injection(value: str) -> bool:
    """Checks if value contains SQL injection patterns."""
    value_upper = value.upper()
    for pattern in SQL_INJECTION_PATTERNS:
        if re.search(pattern, value_upper, re.IGNORECASE):
            logger.warning(
                "SQL injection attempt detected",
                pattern=pattern,
                value_preview=value[:50],
            )
            return True
    return False


def check_xss(value: str) -> bool:
    """Checks if value contains XSS attack patterns."""
    for pattern in XSS_PATTERNS:
        if re.search(pattern, value, re.IGNORECASE):
            logger.warning(
                "XSS attempt detected",
                pattern=pattern,
                value_preview=value[:50],
            )
            return True
    return False


def is_safe_input(value: str) -> bool:
    """Master safety check."""
    if check_sql_injection(value):
        return False
    if check_xss(value):
        return False
    return True
