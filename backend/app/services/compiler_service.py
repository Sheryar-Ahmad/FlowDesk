from __future__ import annotations

import asyncio
import contextlib
import hashlib
import json
import os
import re
import signal
import shutil
import subprocess
import sys
import tempfile
import time
from collections import defaultdict
from dataclasses import dataclass, field
from typing import Any

import httpx
import structlog
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.constants import (
    COMPILER_MAX_OUTPUT_CHARS,
    COMPILER_TIMEOUT_SECONDS,
    FREE_TIER_COMPILER_FILE_LIMIT,
    FREE_TIER_COMPILER_RUNS_PER_DAY,
    PRO_TIER_COMPILER_FILE_LIMIT,
    PRO_TIER_COMPILER_RUNS_PER_DAY,
)

logger = structlog.get_logger(__name__)
settings = get_settings()

# ──────────────────────────────────────────────────────────────────────────
# CONFIG / LIMITS  (features 1-10: tunable enterprise limits)
# ──────────────────────────────────────────────────────────────────────────

MAX_CODE_LENGTH = 200_000          # 1. max source size
MAX_STDIN_LENGTH = 50_000          # 2. max stdin size
MAX_MEMORY_MB = 128                # 3. hard memory cap per run
MAX_CONCURRENT_RUNS_PER_USER = 2   # 4. per-user concurrency cap
MAX_GLOBAL_CONCURRENT_RUNS = 25    # 5. global concurrency cap (protects the box)
RUN_CACHE_TTL_SECONDS = 600        # 6. identical code+stdin → cached result
RUN_CACHE_MAX_ENTRIES = 2000       # 7. cache eviction bound
TRASH_RETENTION_DAYS = 30          # 8. soft-deleted files auto-purge window
MAX_VERSIONS_PER_FILE = 50         # 9. version history cap
TEST_CASE_MAX_COUNT = 25           # 10. bulk test-case ceiling

BANNED_IMPORT_PATTERNS = (         # 11. defense-in-depth import blocklist
    "os", "sys", "subprocess", "socket", "shutil", "ctypes",
    "multiprocessing", "threading", "importlib", "pickle", "marshal",
)

LANGUAGE_ALIASES = {                # 12. auto-normalize sloppy language input
    "py": "python", "py3": "python", "js": "javascript",
    "c++": "cpp",
}

# ──────────────────────────────────────────────────────────────────────────
# IN-MEMORY RUNTIME STATE  (features 13-17: concurrency + caching primitives)
# ──────────────────────────────────────────────────────────────────────────

_global_run_semaphore = asyncio.Semaphore(MAX_GLOBAL_CONCURRENT_RUNS)   # 13
_user_run_locks: dict[str, asyncio.Semaphore] = defaultdict(            # 14
    lambda: asyncio.Semaphore(MAX_CONCURRENT_RUNS_PER_USER)
)
_file_run_locks: dict[str, asyncio.Lock] = defaultdict(asyncio.Lock)    # 15 single-flight per file
_run_cache: dict[str, tuple[float, dict[str, Any]]] = {}                # 16 code-hash → (expiry, result)
_metrics = defaultdict(int)                                             # 17 prometheus-style counters


def _bump(metric: str) -> None:
    _metrics[metric] += 1


def get_runtime_metrics() -> dict[str, int]:  # 18. health/metrics endpoint feed
    return dict(_metrics)


def get_queue_stats() -> dict[str, Any]:  # 19. live load visibility
    return {
        "global_slots_free": _global_run_semaphore._value,
        "global_slots_total": MAX_GLOBAL_CONCURRENT_RUNS,
        "active_user_locks": len(_user_run_locks),
    }


# ──────────────────────────────────────────────────────────────────────────
# SANDBOX SCRIPT  (features 20-30: hardened execution environment)
# ──────────────────────────────────────────────────────────────────────────

PYTHON_SANDBOX = r"""
import ast
import io
import json
import os
import sys
import traceback

try:
    import resource
except Exception:
    resource = None

payload = json.loads(sys.stdin.readline())
source = payload.get("code", "")
stdin_value = payload.get("stdin", "")
args = payload.get("args", [])
memory_mb = payload.get("memory_mb", 128)

# 20. hard memory ceiling (RLIMIT_AS) — kills the interpreter before the OS OOM-killer has to
try:
    if resource is None:
        raise RuntimeError("resource module unavailable")
    resource.setrlimit(resource.RLIMIT_AS, (memory_mb * 1024 * 1024, memory_mb * 1024 * 1024))
except Exception:
    pass

# 21. cap open file descriptors (anti file-spam / fork-bomb mitigation)
try:
    if resource is None:
        raise RuntimeError("resource module unavailable")
    resource.setrlimit(resource.RLIMIT_NOFILE, (64, 64))
except Exception:
    pass

# 22. cap process/thread creation (defense in depth alongside the Guard below)
try:
    if resource is None:
        raise RuntimeError("resource module unavailable")
    resource.setrlimit(resource.RLIMIT_NPROC, (0, 0))
except Exception:
    pass

sys.setrecursionlimit(2000)  # 23. bounded recursion depth, friendlier than a hard segfault

allowed_modules = {
    "bisect", "collections", "datetime", "decimal", "fractions",
    "functools", "heapq", "itertools", "json", "math", "random",
    "re", "statistics", "string", "typing", "array", "queue",
    "copy", "operator", "textwrap", "enum", "dataclasses",
}

allowed_builtins = {
    "ArithmeticError": ArithmeticError, "AssertionError": AssertionError,
    "Exception": Exception, "IndexError": IndexError, "KeyError": KeyError,
    "LookupError": LookupError, "NameError": NameError, "RuntimeError": RuntimeError,
    "StopIteration": StopIteration, "TypeError": TypeError, "ValueError": ValueError,
    "ZeroDivisionError": ZeroDivisionError, "OverflowError": OverflowError,
    "NotImplementedError": NotImplementedError, "StopAsyncIteration": StopAsyncIteration,
    "abs": abs, "all": all, "any": any, "bool": bool, "chr": chr, "dict": dict,
    "divmod": divmod, "enumerate": enumerate, "filter": filter, "float": float,
    "format": format, "frozenset": frozenset, "hash": hash, "hex": hex, "input": input,
    "int": int, "isinstance": isinstance, "issubclass": issubclass, "iter": iter,
    "len": len, "list": list, "map": map, "max": max, "min": min, "next": next,
    "oct": oct, "ord": ord, "pow": pow, "print": print, "range": range, "repr": repr,
    "reversed": reversed, "round": round, "set": set, "slice": slice, "sorted": sorted,
    "str": str, "sum": sum, "tuple": tuple, "zip": zip, "complex": complex,
    "bytes": bytes, "bytearray": bytearray, "memoryview": memoryview,
}


def safe_import(name, globals=None, locals=None, fromlist=(), level=0):
    root_name = name.split(".", 1)[0]
    if level != 0 or root_name not in allowed_modules:
        raise ImportError(f"Module '{name}' is not available in the FlowDesk sandbox")
    return __import__(name, globals, locals, fromlist, level)


allowed_builtins["__import__"] = safe_import


class Guard(ast.NodeVisitor):
    blocked_names = {
        "breakpoint", "compile", "delattr", "eval", "exec", "getattr",
        "globals", "help", "locals", "open", "setattr", "vars",
        "__builtins__", "__import__", "exit", "quit",
    }

    def visit_Name(self, node):
        if node.id in self.blocked_names or node.id.startswith("__"):
            raise RuntimeError(f"Use of '{node.id}' is not allowed in the FlowDesk sandbox")
        self.generic_visit(node)

    def visit_Attribute(self, node):
        if node.attr.startswith("__"):
            raise RuntimeError("Dunder attribute access is not allowed in the FlowDesk sandbox")
        self.generic_visit(node)


sys.argv = ["main.py", *args]  # 24. command-line argument support

try:
    tree = ast.parse(source, filename="<flowdesk>", mode="exec")
    Guard().visit(tree)
    compiled = compile(tree, "<flowdesk>", "exec")
    globals_dict = {"__builtins__": allowed_builtins, "__name__": "__main__", "argv": list(args)}
    original_stdin = sys.stdin
    sys.stdin = io.StringIO(stdin_value)
    try:
        exec(compiled, globals_dict, globals_dict)
    finally:
        sys.stdin = original_stdin
except SystemExit as exc:
    code = exc.code if isinstance(exc.code, int) else (0 if exc.code is None else 1)
    raise SystemExit(code)
except RecursionError:
    print("RecursionError: maximum recursion depth exceeded", file=sys.stderr)
    raise SystemExit(1)
except MemoryError:
    print("MemoryError: process exceeded its sandbox memory limit", file=sys.stderr)
    raise SystemExit(1)
except Exception:
    traceback.print_exc(limit=8)
    raise SystemExit(1)

# 25. self-reported resource usage, fed back via stderr marker line
if resource is not None:
    usage = resource.getrusage(resource.RUSAGE_SELF)
    print(f"\x00FLOWDESK_RUSAGE\x00{usage.ru_maxrss}\x00{usage.ru_utime + usage.ru_stime}\x00", file=sys.stderr)
"""

RUNTIME_LABELS = {
    "python": "Python 3 sandbox",
    "javascript": "JavaScript",
    "java": "Java",
    "cpp": "C++",
    "c": "C",
    "html": "HTML",
    "css": "CSS",
}

LOCAL_RUNTIME_COMMANDS = {
    "python": ("python",),
    "javascript": ("node",),
    "java": ("javac", "java"),
    "c": ("gcc",),
    "cpp": ("g++",),
}

FRONTEND_PREVIEW_LANGUAGES = {"html", "css"}

PISTON_LANGUAGE_MAP = {
    "javascript": ("javascript", "main.js"),
    "java": ("java", "Main.java"),
    "cpp": ("cpp", "main.cpp"),
    "c": ("c", "main.c"),
}


# ──────────────────────────────────────────────────────────────────────────
# DATA MODELS
# ──────────────────────────────────────────────────────────────────────────

@dataclass(frozen=True)
class RunResult:
    status: str
    stdout: str
    stderr: str
    exit_code: int | None
    duration_ms: int
    timed_out: bool = False
    truncated: bool = False
    message: str | None = None
    memory_kb: int | None = None        # 26. peak memory reporting
    cpu_time_ms: int | None = None      # 27. CPU vs wall time split
    cached: bool = False                # 28. cache-hit flag
    exit_signal: int | None = None      # 29. distinguishes killed-by-signal vs normal exit
    warnings: list[str] = field(default_factory=list)  # 30. static-analysis warnings

    @property
    def output(self) -> str:
        parts = []
        if self.stdout:
            parts.append(self.stdout)
        if self.stderr:
            parts.append(self.stderr)
        return "\n".join(parts).strip()


def _truncate(value: str, max_chars: int) -> tuple[str, bool]:
    if len(value) <= max_chars:
        return value, False
    suffix = "\n\n[Output truncated by FlowDesk for safety.]"
    return value[: max_chars - len(suffix)] + suffix, True


def _file_from_row(row: Any) -> dict[str, Any]:
    return {
        "id": str(row.id),
        "user_id": str(row.user_id),
        "title": row.title,
        "language": row.language,
        "code": row.code,
        "stdin": row.stdin or "",
        "output": row.output or "",
        "is_pinned": bool(row.is_pinned),
        "is_favorite": bool(getattr(row, "is_favorite", False)),   # 31. favorites distinct from pinned
        "folder_id": str(row.folder_id) if getattr(row, "folder_id", None) else None,  # 32. folders
        "tags": getattr(row, "tags", None) or [],                  # 33. tagging
        "run_count": int(row.run_count or 0),
        "last_run_at": row.last_run_at,
        "created_at": row.created_at,
        "updated_at": row.updated_at,
    }


def normalize_language(language: str) -> str:  # 34. tolerant language normalization
    lang = (language or "").strip().lower()
    return LANGUAGE_ALIASES.get(lang, lang)


def detect_language(code: str) -> str:  # 35. best-effort auto-detection for "paste & go"
    signals = {
        "python": (r"^\s*def \w+\(.*\):", r"^\s*import \w+", r"print\("),
        "javascript": (r"\bconsole\.log\(", r"\bfunction\s+\w+\(", r"=>"),
        "java": (r"\bpublic\s+class\b", r"\bSystem\.out\.println\("),
        "cpp": (r"#include\s*<", r"\bstd::", r"\bcout\s*<<"),
        "c": (r"#include\s*<stdio\.h>", r"\bprintf\("),
        "html": (r"<!doctype html", r"<html[\s>]", r"<body[\s>]"),
        "css": (r"^\s*[.#]?[a-zA-Z][\w-]*\s*\{", r":\s*[^;]+;"),
    }
    scores = {lang: sum(bool(re.search(p, code, re.M)) for p in pats) for lang, pats in signals.items()}
    best = max(scores, key=scores.get)
    return best if scores[best] > 0 else "python"


def scan_banned_imports(code: str) -> list[str]:  # 36. pre-execution static warning pass
    found = []
    for name in BANNED_IMPORT_PATTERNS:
        if re.search(rf"\bimport\s+{name}\b", code) or re.search(rf"\bfrom\s+{name}\b", code):
            found.append(name)
    return found


def estimate_complexity(code: str) -> dict[str, int]:  # 37. quick code-quality signal
    lines = [l for l in code.splitlines() if l.strip()]
    branch_keywords = ("if ", "elif ", "for ", "while ", "except", "and ", "or ")
    branches = sum(1 for l in lines for kw in branch_keywords if kw in l)
    return {
        "line_count": len(lines),
        "estimated_cyclomatic_complexity": branches + 1,
        "function_count": len(re.findall(r"^\s*def\s+\w+", code, re.M)),
    }


def hash_run(language: str, code: str, stdin: str, args: list[str] | None = None) -> str:  # 38. cache key
    payload = json.dumps(
        [language, code, stdin, args or []],
        ensure_ascii=False,
        separators=(",", ":"),
    ).encode("utf-8")
    return hashlib.sha256(payload).hexdigest()


def strip_ansi(text_value: str) -> str:  # 39. safe-for-display output sanitation
    return re.sub(r"\x1b\[[0-9;]*[mK]", "", text_value)


def local_runtime_missing(language: str) -> list[str]:
    return [command for command in LOCAL_RUNTIME_COMMANDS.get(language, ()) if not shutil.which(command)]


def has_local_runtime(language: str) -> bool:
    return language in LOCAL_RUNTIME_COMMANDS and not local_runtime_missing(language)


def local_runtime_reason(language: str) -> str | None:
    missing = local_runtime_missing(language)
    if not missing:
        if language == "java":
            return "Runs locally through the installed JDK with FlowDesk timeouts."
        if language == "c":
            return "Compiles locally with GCC and runs with FlowDesk timeouts."
        if language == "cpp":
            return "Compiles locally with G++ and runs with FlowDesk timeouts."
        if language == "javascript":
            return "Runs locally through Node.js with FlowDesk timeouts."
        return "Runs locally in the FlowDesk sandbox."
    if language in LOCAL_RUNTIME_COMMANDS:
        return f"Install {', '.join(missing)} on the backend, or configure COMPILER_PISTON_API_URL."
    return None


def _process_creation_flags() -> int:
    if os.name != "nt":
        return 0
    return getattr(subprocess, "CREATE_NEW_PROCESS_GROUP", 0) | getattr(subprocess, "CREATE_NO_WINDOW", 0)


def _decode_process_run(
    *,
    returncode: int | None,
    stdout_value: str,
    stderr_value: str,
    duration_ms: int,
    max_output: int,
    warnings: list[str] | None = None,
) -> RunResult:
    stdout = strip_ansi(stdout_value)
    stderr = strip_ansi(stderr_value)
    stdout, stdout_trunc = _truncate(stdout, max_output)
    stderr, stderr_trunc = _truncate(stderr, max_output)
    status = "success" if returncode == 0 else "error"
    _bump("runs_success" if status == "success" else "runs_error")
    return RunResult(
        status=status,
        stdout=stdout,
        stderr=stderr,
        exit_code=returncode,
        duration_ms=duration_ms,
        truncated=stdout_trunc or stderr_trunc,
        warnings=warnings or [],
    )


def _run_process_blocking(
    command: list[str],
    *,
    stdin: str,
    cwd: str,
    timeout_seconds: int,
    max_output: int,
    started: float,
    env: dict[str, str] | None = None,
    warnings: list[str] | None = None,
) -> RunResult:
    try:
        completed = subprocess.run(
            command,
            input=stdin,
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            cwd=cwd,
            env=env,
            timeout=timeout_seconds,
            check=False,
            encoding="utf-8",
            errors="replace",
            creationflags=_process_creation_flags(),
        )
    except subprocess.TimeoutExpired as exc:
        duration_ms = round((time.perf_counter() - started) * 1000)
        stdout, stdout_trunc = _truncate(strip_ansi(exc.stdout or ""), max_output)
        stderr, stderr_trunc = _truncate(strip_ansi(exc.stderr or ""), max_output)
        _bump("runs_timeout")
        return RunResult(
            status="timeout",
            stdout=stdout,
            stderr=stderr or f"Execution exceeded {timeout_seconds} seconds.",
            exit_code=None,
            duration_ms=duration_ms,
            timed_out=True,
            truncated=stdout_trunc or stderr_trunc,
            message="Execution timed out.",
            warnings=warnings or [],
        )

    return _decode_process_run(
        returncode=completed.returncode,
        stdout_value=completed.stdout,
        stderr_value=completed.stderr,
        duration_ms=round((time.perf_counter() - started) * 1000),
        max_output=max_output,
        warnings=warnings,
    )


# ──────────────────────────────────────────────────────────────────────────
# PLAN LIMITS
# ──────────────────────────────────────────────────────────────────────────

def file_limit_for_plan(plan: str) -> int:
    return PRO_TIER_COMPILER_FILE_LIMIT if plan == "pro" else FREE_TIER_COMPILER_FILE_LIMIT


def daily_run_limit_for_plan(plan: str) -> int:
    return PRO_TIER_COMPILER_RUNS_PER_DAY if plan == "pro" else FREE_TIER_COMPILER_RUNS_PER_DAY


def concurrent_run_limit_for_plan(plan: str) -> int:  # 40. pro gets more parallel runs
    return MAX_CONCURRENT_RUNS_PER_USER * 2 if plan == "pro" else MAX_CONCURRENT_RUNS_PER_USER


# ──────────────────────────────────────────────────────────────────────────
# CRUD: FILES  (features 41-55: organization, search, versioning, trash)
# ──────────────────────────────────────────────────────────────────────────

async def list_compiler_files(
    db: AsyncSession,
    user_id: str,
    *,
    page: int = 1,
    page_size: int = 20,
    language: str | None = None,
    search: str | None = None,
    folder_id: str | None = None,     # 41
    tag: str | None = None,           # 42
    favorites_only: bool = False,     # 43
    sort_by: str = "updated_at",      # 44. configurable sort
) -> dict[str, Any]:
    offset = (page - 1) * page_size
    clauses = ["user_id = :user_id", "deleted_at IS NULL"]
    params: dict[str, Any] = {"user_id": user_id, "limit": page_size, "offset": offset}

    if language:
        clauses.append("language = :language")
        params["language"] = language
    if search:
        # 45. full-text-ish search across title/code using ILIKE (swap for tsvector at scale)
        clauses.append("(title ILIKE :search OR code ILIKE :search)")
        params["search"] = f"%{search}%"
    if folder_id or tag or favorites_only:
        logger.info(
            "Compiler organization filters ignored until storage schema is added",
            folder_id=folder_id,
            tag=tag,
            favorites_only=favorites_only,
        )

    sort_column = sort_by if sort_by in {"updated_at", "created_at", "run_count", "title"} else "updated_at"
    where_sql = " AND ".join(clauses)

    result = await db.execute(
        text(
            f"""
            SELECT id, user_id, title, language, code, stdin, output, is_pinned,
                   run_count, last_run_at, created_at, updated_at
            FROM compiler_files
            WHERE {where_sql}
            ORDER BY is_pinned DESC, {sort_column} DESC
            LIMIT :limit OFFSET :offset
            """
        ),
        params,
    )
    total_result = await db.execute(
        text(f"SELECT COUNT(*) FROM compiler_files WHERE {where_sql}"),
        {k: v for k, v in params.items() if k not in {"limit", "offset"}},
    )
    total = int(total_result.scalar() or 0)
    return {
        "files": [_file_from_row(row) for row in result.fetchall()],
        "total": total,
        "page": page,
        "page_size": page_size,
        "has_more": offset + page_size < total,
    }


async def get_compiler_file(db: AsyncSession, file_id: str, user_id: str) -> dict[str, Any] | None:
    result = await db.execute(
        text(
            """
            SELECT id, user_id, title, language, code, stdin, output, is_pinned,
                   run_count, last_run_at, created_at, updated_at
            FROM compiler_files
            WHERE id = :file_id AND user_id = :user_id AND deleted_at IS NULL
            """
        ),
        {"file_id": file_id, "user_id": user_id},
    )
    row = result.fetchone()
    return _file_from_row(row) if row else None


async def count_compiler_files(db: AsyncSession, user_id: str) -> int:
    result = await db.execute(
        text("SELECT COUNT(*) FROM compiler_files WHERE user_id = :user_id AND deleted_at IS NULL"),
        {"user_id": user_id},
    )
    return int(result.scalar() or 0)


async def create_compiler_file(
    db: AsyncSession,
    user_id: str,
    plan: str,
    *,
    title: str,
    language: str,
    code: str,
    stdin: str = "",
    folder_id: str | None = None,
    tags: list[str] | None = None,
) -> dict[str, Any]:
    if len(code) > MAX_CODE_LENGTH:  # 46. input-size guardrail
        raise ValueError(f"Code exceeds the {MAX_CODE_LENGTH} character limit.")
    if len(stdin) > MAX_STDIN_LENGTH:
        raise ValueError(f"Stdin exceeds the {MAX_STDIN_LENGTH} character limit.")

    count = await count_compiler_files(db, user_id)
    limit = file_limit_for_plan(plan)
    if count >= limit:
        raise ValueError(f"Compiler file limit reached: {limit} files on your current plan.")

    language = normalize_language(language) or detect_language(code)  # 47. auto-detect fallback

    result = await db.execute(
        text(
            """
            INSERT INTO compiler_files (user_id, title, language, code, stdin)
            VALUES (:user_id, :title, :language, :code, :stdin)
            RETURNING id, user_id, title, language, code, stdin, output, is_pinned,
                      run_count, last_run_at, created_at, updated_at
            """
        ),
        {
            "user_id": user_id, "title": title, "language": language, "code": code,
            "stdin": stdin,
        },
    )
    row = result.fetchone()
    logger.info("Compiler file created", user_id=user_id, compiler_file_id=str(row.id))
    _bump("files_created")
    return _file_from_row(row)


async def update_compiler_file(
    db: AsyncSession,
    file_id: str,
    user_id: str,
    updates: dict[str, Any],
    *,
    snapshot_version: bool = True,  # 48. auto version snapshot on edit
) -> dict[str, Any] | None:
    allowed_fields = {
        "title", "language", "code", "stdin", "output", "is_pinned",
    }
    values = {key: value for key, value in updates.items() if key in allowed_fields}
    if not values:
        return await get_compiler_file(db, file_id, user_id)

    if "code" in values and snapshot_version:
        logger.info("Compiler version snapshot skipped; version table is not enabled yet", file_id=file_id)

    assignments = ", ".join(f"{key} = :{key}" for key in values)
    result = await db.execute(
        text(
            f"""
            UPDATE compiler_files
            SET {assignments}, updated_at = CURRENT_TIMESTAMP
            WHERE id = :file_id AND user_id = :user_id AND deleted_at IS NULL
            RETURNING id, user_id, title, language, code, stdin, output, is_pinned,
                      run_count, last_run_at, created_at, updated_at
            """
        ),
        {**values, "file_id": file_id, "user_id": user_id},
    )
    row = result.fetchone()
    return _file_from_row(row) if row else None


async def _snapshot_version(db: AsyncSession, file_id: str, user_id: str) -> None:
    raise NotImplementedError("Compiler file versions need a migration before they can be enabled.")
    """49. version history — keep last MAX_VERSIONS_PER_FILE snapshots per file."""


async def list_file_versions(db: AsyncSession, file_id: str, user_id: str) -> list[dict[str, Any]]:  # 50
    raise NotImplementedError("Compiler file versions need a migration before they can be enabled.")


async def restore_file_version(db: AsyncSession, file_id: str, user_id: str, version_id: str) -> dict[str, Any] | None:  # 51
    raise NotImplementedError("Compiler file versions need a migration before they can be enabled.")


def diff_versions(old_code: str, new_code: str) -> list[str]:  # 52. lightweight unified diff
    import difflib
    return list(difflib.unified_diff(old_code.splitlines(), new_code.splitlines(), lineterm=""))


async def delete_compiler_file(db: AsyncSession, file_id: str, user_id: str) -> bool:
    result = await db.execute(
        text(
            """
            UPDATE compiler_files
            SET deleted_at = CURRENT_TIMESTAMP
            WHERE id = :file_id AND user_id = :user_id AND deleted_at IS NULL
            RETURNING id
            """
        ),
        {"file_id": file_id, "user_id": user_id},
    )
    return result.fetchone() is not None


async def restore_compiler_file(db: AsyncSession, file_id: str, user_id: str) -> bool:  # 53. undo-delete
    result = await db.execute(
        text(
            """
            UPDATE compiler_files
            SET deleted_at = NULL
            WHERE id = :file_id AND user_id = :user_id AND deleted_at IS NOT NULL
            RETURNING id
            """
        ),
        {"file_id": file_id, "user_id": user_id},
    )
    return result.fetchone() is not None


async def purge_expired_trash(db: AsyncSession) -> int:  # 54. background job target
    result = await db.execute(
        text(
            """
            DELETE FROM compiler_files
            WHERE deleted_at IS NOT NULL
              AND deleted_at < CURRENT_TIMESTAMP - (:days || ' days')::interval
            RETURNING id
            """
        ),
        {"days": TRASH_RETENTION_DAYS},
    )
    purged = len(result.fetchall())
    if purged:
        logger.info("Trash purged", count=purged)
    return purged


def export_file_as_text(file: dict[str, Any]) -> str:  # 55. one-click export
    return file["code"]


# ──────────────────────────────────────────────────────────────────────────
# RUN HISTORY / QUOTAS  (features 56-62)
# ──────────────────────────────────────────────────────────────────────────

async def count_runs_today(db: AsyncSession, user_id: str) -> int:
    try:
        result = await db.execute(
            text(
                """
                SELECT COUNT(*) FROM compiler_run_events
                WHERE user_id = :user_id AND created_at >= date_trunc('day', CURRENT_TIMESTAMP)
                """
            ),
            {"user_id": user_id},
        )
        return int(result.scalar() or 0)
    except Exception as exc:
        logger.warning("Compiler run quota check skipped", user_id=user_id, error=str(exc))
        with contextlib.suppress(Exception):
            await db.rollback()
        return 0


async def record_run_event(
    db: AsyncSession,
    *,
    user_id: str,
    compiler_file_id: str | None,
    language: str,
    status: str,
    duration_ms: int,
    output_size: int,
    memory_kb: int | None = None,
    cached: bool = False,
) -> None:
    await db.execute(
        text(
            """
            INSERT INTO compiler_run_events (
                user_id, compiler_file_id, language, status, duration_ms, output_size
            )
            VALUES (
                :user_id, :compiler_file_id, :language, :status, :duration_ms, :output_size
            )
            """
        ),
        {
            "user_id": user_id, "compiler_file_id": compiler_file_id, "language": language,
            "status": status, "duration_ms": duration_ms, "output_size": output_size,
        },
    )


async def safe_record_run_event(db: AsyncSession, **kwargs: Any) -> None:
    try:
        await record_run_event(db, **kwargs)
    except Exception as exc:
        logger.warning("Compiler run history write skipped", error=str(exc))
        with contextlib.suppress(Exception):
            await db.rollback()


async def get_run_history(db: AsyncSession, user_id: str, *, limit: int = 50) -> list[dict[str, Any]]:  # 56
    try:
        result = await db.execute(
            text(
                """
                SELECT id, compiler_file_id, language, status, duration_ms, output_size,
                       created_at
                FROM compiler_run_events
                WHERE user_id = :user_id
                ORDER BY created_at DESC
                LIMIT :limit
                """
            ),
            {"user_id": user_id, "limit": limit},
        )
        return [dict(r._mapping) for r in result.fetchall()]
    except Exception as exc:
        logger.warning("Compiler run history unavailable", user_id=user_id, error=str(exc))
        with contextlib.suppress(Exception):
            await db.rollback()
        return []


async def get_run_stats(db: AsyncSession, user_id: str) -> dict[str, Any]:  # 57. dashboard analytics
    empty_stats = {
        "total_runs": 0,
        "successful_runs": 0,
        "failed_runs": 0,
        "timed_out_runs": 0,
        "avg_duration_ms": 0.0,
        "max_duration_ms": 0,
    }
    try:
        result = await db.execute(
            text(
                """
                SELECT
                    COUNT(*) AS total_runs,
                    COUNT(*) FILTER (WHERE status = 'success') AS successful_runs,
                    COUNT(*) FILTER (WHERE status = 'error') AS failed_runs,
                    COUNT(*) FILTER (WHERE status = 'timeout') AS timed_out_runs,
                    COALESCE(AVG(duration_ms), 0) AS avg_duration_ms,
                    COALESCE(MAX(duration_ms), 0) AS max_duration_ms
                FROM compiler_run_events
                WHERE user_id = :user_id
                  AND created_at >= CURRENT_TIMESTAMP - INTERVAL '30 days'
                """
            ),
            {"user_id": user_id},
        )
        row = result.fetchone()
    except Exception as exc:
        logger.warning("Compiler run stats unavailable", user_id=user_id, error=str(exc))
        with contextlib.suppress(Exception):
            await db.rollback()
        return empty_stats
    if not row:
        return empty_stats
    values = row._mapping
    return {
        "total_runs": int(values["total_runs"] or 0),
        "successful_runs": int(values["successful_runs"] or 0),
        "failed_runs": int(values["failed_runs"] or 0),
        "timed_out_runs": int(values["timed_out_runs"] or 0),
        "avg_duration_ms": float(values["avg_duration_ms"] or 0),
        "max_duration_ms": int(values["max_duration_ms"] or 0),
    }


def daily_run_limit_for_plan_(plan: str) -> int:  # alias kept for backward compat
    return daily_run_limit_for_plan(plan)


# ──────────────────────────────────────────────────────────────────────────
# RUNTIME LISTING
# ──────────────────────────────────────────────────────────────────────────

def list_runtimes() -> list[dict[str, Any]]:
    execution_enabled = bool(settings.COMPILER_EXECUTION_ENABLED)
    external_runner_enabled = bool(settings.COMPILER_PISTON_API_URL.strip())
    base = []
    for language, label in RUNTIME_LABELS.items():
        is_preview = language in FRONTEND_PREVIEW_LANGUAGES
        is_local = has_local_runtime(language)
        is_external = language in PISTON_LANGUAGE_MAP and external_runner_enabled
        is_executable = is_preview or (execution_enabled and (is_local or is_external))
        reason = None
        if is_preview:
            reason = "Preview renders instantly in the browser."
        elif (language in LOCAL_RUNTIME_COMMANDS or language in PISTON_LANGUAGE_MAP) and not execution_enabled:
            reason = "Compiler execution is disabled on this server."
        elif is_local:
            reason = local_runtime_reason(language)
        elif is_external:
            reason = "Runs through the configured isolated language runner."
        else:
            reason = local_runtime_reason(language)
        if reason is None and not is_local:
            reason = "Editing and saving are available. Running this language needs COMPILER_PISTON_API_URL."
        base.append({
            "language": language,
            "label": label,
            "executable": is_executable,
            "reason": reason,
        })

    for entry in base:  # 58. live queue depth surfaced per runtime
        entry["queue"] = get_queue_stats() if entry["executable"] and entry["language"] not in FRONTEND_PREVIEW_LANGUAGES else None
    return base


# ──────────────────────────────────────────────────────────────────────────
# EXECUTION ENGINE  (features 59-72: the actual "fast and not lagging" part)
# ──────────────────────────────────────────────────────────────────────────

def _preexec_new_group():  # 59. own process group so timeout kills children too, not just the parent
    os.setsid()


def _decode_python_run(
    *,
    returncode: int | None,
    stdout_bytes: bytes | None,
    stderr_bytes: bytes | None,
    duration_ms: int,
    warnings: list[str],
    max_output: int,
) -> RunResult:
    stdout = (stdout_bytes or b"").decode("utf-8", errors="replace")
    stderr_raw = (stderr_bytes or b"").decode("utf-8", errors="replace")

    memory_kb, cpu_time_ms = None, None
    match = re.search(r"\x00FLOWDESK_RUSAGE\x00(\d+)\x00([\d.]+)\x00", stderr_raw)
    if match:
        memory_kb = int(match.group(1))
        cpu_time_ms = round(float(match.group(2)) * 1000)
        stderr_raw = stderr_raw[: match.start()] + stderr_raw[match.end():]

    stdout = strip_ansi(stdout)
    stderr_raw = strip_ansi(stderr_raw)
    stdout, stdout_trunc = _truncate(stdout, max_output)
    stderr, stderr_trunc = _truncate(stderr_raw, max_output)

    exit_signal = -returncode if returncode and returncode < 0 else None
    status = "success" if returncode == 0 else "error"
    _bump("runs_success" if status == "success" else "runs_error")

    return RunResult(
        status=status,
        stdout=stdout,
        stderr=stderr,
        exit_code=returncode,
        duration_ms=duration_ms,
        truncated=stdout_trunc or stderr_trunc,
        memory_kb=memory_kb,
        cpu_time_ms=cpu_time_ms,
        exit_signal=exit_signal,
        warnings=warnings,
    )


def _execute_python_blocking(
    *,
    payload: str,
    warnings: list[str],
    started: float,
    max_output: int,
    timeout_seconds: int,
) -> RunResult:
    creation_flags = getattr(subprocess, "CREATE_NEW_PROCESS_GROUP", 0) | getattr(subprocess, "CREATE_NO_WINDOW", 0)
    with tempfile.TemporaryDirectory(prefix="flowdesk-compiler-") as temp_dir:
        try:
            completed = subprocess.run(
                [sys.executable, "-I", "-S", "-c", PYTHON_SANDBOX],
                input=payload.encode("utf-8"),
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                cwd=temp_dir,
                env={"PYTHONIOENCODING": "utf-8", "PYTHONUTF8": "1"},
                timeout=timeout_seconds,
                check=False,
                creationflags=creation_flags,
            )
        except subprocess.TimeoutExpired as exc:
            duration_ms = round((time.perf_counter() - started) * 1000)
            stdout = (exc.stdout or b"").decode("utf-8", errors="replace")
            stderr = (exc.stderr or b"").decode("utf-8", errors="replace")
            stdout, stdout_trunc = _truncate(stdout, max_output)
            stderr, stderr_trunc = _truncate(stderr, max_output)
            _bump("runs_timeout")
            return RunResult(
                status="timeout",
                stdout=stdout,
                stderr=stderr or f"Execution exceeded {timeout_seconds} seconds.",
                exit_code=None,
                duration_ms=duration_ms,
                timed_out=True,
                truncated=stdout_trunc or stderr_trunc,
                message="Execution timed out.",
                warnings=warnings,
            )

    duration_ms = round((time.perf_counter() - started) * 1000)
    return _decode_python_run(
        returncode=completed.returncode,
        stdout_bytes=completed.stdout,
        stderr_bytes=completed.stderr,
        duration_ms=duration_ms,
        warnings=warnings,
        max_output=max_output,
    )


async def _execute_python(code: str, stdin: str, *, args: list[str] | None = None) -> RunResult:
    started = time.perf_counter()
    max_output = min(settings.COMPILER_MAX_OUTPUT_CHARS, COMPILER_MAX_OUTPUT_CHARS)
    timeout_seconds = min(settings.COMPILER_TIMEOUT_SECONDS, COMPILER_TIMEOUT_SECONDS)
    payload = json.dumps(
        {"code": code, "stdin": stdin, "args": args or [], "memory_mb": MAX_MEMORY_MB},
        ensure_ascii=False,
    ) + "\n"

    warnings = []
    banned = scan_banned_imports(code)  # 60. pre-flight static warning (execution still sandbox-enforced)
    if banned:
        warnings.append(f"Imports flagged by static scan: {', '.join(banned)} (blocked at runtime).")

    if os.name == "nt":
        return await asyncio.to_thread(
            _execute_python_blocking,
            payload=payload,
            warnings=warnings,
            started=started,
            max_output=max_output,
            timeout_seconds=timeout_seconds,
        )

    with tempfile.TemporaryDirectory(prefix="flowdesk-compiler-") as temp_dir:
        process = await asyncio.create_subprocess_exec(
            sys.executable, "-I", "-S", "-c", PYTHON_SANDBOX,
            stdin=asyncio.subprocess.PIPE,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            cwd=temp_dir,
            env={"PYTHONIOENCODING": "utf-8", "PYTHONUTF8": "1"},
            preexec_fn=_preexec_new_group if os.name != "nt" else None,  # 61. portable group-kill setup
        )
        try:
            stdout_bytes, stderr_bytes = await asyncio.wait_for(
                process.communicate(payload.encode("utf-8")), timeout=timeout_seconds
            )
        except TimeoutError:
            with contextlib.suppress(ProcessLookupError):
                if os.name != "nt":
                    os.killpg(os.getpgid(process.pid), signal.SIGKILL)  # 62. kill whole process group
                else:
                    process.kill()
            stdout_bytes, stderr_bytes = await process.communicate()
            duration_ms = round((time.perf_counter() - started) * 1000)
            stdout = stdout_bytes.decode("utf-8", errors="replace")
            stderr = stderr_bytes.decode("utf-8", errors="replace")
            stdout, stdout_trunc = _truncate(stdout, max_output)
            stderr, stderr_trunc = _truncate(stderr, max_output)
            _bump("runs_timeout")
            return RunResult(
                status="timeout", stdout=stdout,
                stderr=stderr or f"Execution exceeded {timeout_seconds} seconds.",
                exit_code=None, duration_ms=duration_ms, timed_out=True,
                truncated=stdout_trunc or stderr_trunc,
                message="Execution timed out.", warnings=warnings,
            )

    duration_ms = round((time.perf_counter() - started) * 1000)
    return _decode_python_run(
        returncode=process.returncode,
        stdout_bytes=stdout_bytes,
        stderr_bytes=stderr_bytes,
        duration_ms=duration_ms,
        warnings=warnings,
        max_output=max_output,
    )


async def _execute_javascript(code: str, stdin: str, *, args: list[str] | None = None) -> RunResult:
    node_path = shutil.which("node")
    if not node_path:
        return RunResult(
            status="unsupported",
            stdout="",
            stderr="",
            exit_code=None,
            duration_ms=0,
            message="JavaScript needs Node.js installed on the backend.",
        )

    started = time.perf_counter()
    timeout_seconds = min(settings.COMPILER_TIMEOUT_SECONDS, COMPILER_TIMEOUT_SECONDS)
    max_output = min(settings.COMPILER_MAX_OUTPUT_CHARS, COMPILER_MAX_OUTPUT_CHARS)
    with tempfile.TemporaryDirectory(prefix="flowdesk-node-") as temp_dir:
        source_path = os.path.join(temp_dir, "main.js")
        with open(source_path, "w", encoding="utf-8", newline="\n") as source_file:
            source_file.write(code)
        return await asyncio.to_thread(
            _run_process_blocking,
            [node_path, source_path, *(args or [])],
            stdin=stdin,
            cwd=temp_dir,
            timeout_seconds=timeout_seconds,
            max_output=max_output,
            started=started,
            env={**os.environ, "NO_COLOR": "1"},
        )


def _detect_java_main_class(code: str) -> str:
    public_match = re.search(r"\bpublic\s+class\s+([A-Za-z_$][\w$]*)", code)
    if public_match:
        return public_match.group(1)
    class_match = re.search(r"\bclass\s+([A-Za-z_$][\w$]*)", code)
    return class_match.group(1) if class_match else "Main"


def _compile_java(
    javac_path: str,
    source_path: str,
    *,
    temp_dir: str,
    timeout_seconds: int,
    max_output: int,
    started: float,
) -> RunResult:
    release_command = [javac_path, "-encoding", "UTF-8", "--release", "8", source_path]
    result = _run_process_blocking(
        release_command,
        stdin="",
        cwd=temp_dir,
        timeout_seconds=timeout_seconds,
        max_output=max_output,
        started=started,
        warnings=["Compiled with Java 8 bytecode for broad runtime compatibility."],
    )
    if result.status == "error" and "invalid flag: --release" in result.output.lower():
        return _run_process_blocking(
            [javac_path, "-encoding", "UTF-8", source_path],
            stdin="",
            cwd=temp_dir,
            timeout_seconds=timeout_seconds,
            max_output=max_output,
            started=started,
        )
    return result


async def _execute_java(code: str, stdin: str, *, args: list[str] | None = None) -> RunResult:
    javac_path = shutil.which("javac")
    java_path = shutil.which("java")
    missing = [name for name, path in (("javac", javac_path), ("java", java_path)) if not path]
    if missing:
        return RunResult(
            status="unsupported",
            stdout="",
            stderr="",
            exit_code=None,
            duration_ms=0,
            message=f"Java needs {', '.join(missing)} installed on the backend.",
        )

    started = time.perf_counter()
    timeout_seconds = min(settings.COMPILER_TIMEOUT_SECONDS, COMPILER_TIMEOUT_SECONDS)
    max_output = min(settings.COMPILER_MAX_OUTPUT_CHARS, COMPILER_MAX_OUTPUT_CHARS)
    main_class = _detect_java_main_class(code)
    with tempfile.TemporaryDirectory(prefix="flowdesk-java-") as temp_dir:
        source_path = os.path.join(temp_dir, f"{main_class}.java")
        with open(source_path, "w", encoding="utf-8", newline="\n") as source_file:
            source_file.write(code)

        compile_result = await asyncio.to_thread(
            _compile_java,
            javac_path,
            source_path,
            temp_dir=temp_dir,
            timeout_seconds=timeout_seconds,
            max_output=max_output,
            started=started,
        )
        if compile_result.status != "success":
            return RunResult(
                status=compile_result.status,
                stdout=compile_result.stdout,
                stderr=compile_result.stderr,
                exit_code=compile_result.exit_code,
                duration_ms=compile_result.duration_ms,
                timed_out=compile_result.timed_out,
                truncated=compile_result.truncated,
                message=compile_result.message or "Java compilation failed.",
                warnings=compile_result.warnings,
            )

        run_started = time.perf_counter()
        return await asyncio.to_thread(
            _run_process_blocking,
            [java_path, "-cp", temp_dir, main_class, *(args or [])],
            stdin=stdin,
            cwd=temp_dir,
            timeout_seconds=timeout_seconds,
            max_output=max_output,
            started=run_started,
            env={**os.environ, "NO_COLOR": "1"},
            warnings=compile_result.warnings,
        )


def _executable_path(temp_dir: str, stem: str) -> str:
    suffix = ".exe" if os.name == "nt" else ""
    return os.path.join(temp_dir, f"{stem}{suffix}")


async def _execute_compiled_c_family(
    *,
    language: str,
    code: str,
    stdin: str,
    args: list[str] | None = None,
) -> RunResult:
    compiler_name = "gcc" if language == "c" else "g++"
    compiler_path = shutil.which(compiler_name)
    if not compiler_path:
        label = "GCC" if language == "c" else "G++"
        return RunResult(
            status="unsupported",
            stdout="",
            stderr="",
            exit_code=None,
            duration_ms=0,
            message=f"{language.upper()} needs {label} installed on the backend.",
        )

    started = time.perf_counter()
    timeout_seconds = min(settings.COMPILER_TIMEOUT_SECONDS, COMPILER_TIMEOUT_SECONDS)
    max_output = min(settings.COMPILER_MAX_OUTPUT_CHARS, COMPILER_MAX_OUTPUT_CHARS)
    extension = "c" if language == "c" else "cpp"
    standard = "c11" if language == "c" else "c++17"

    with tempfile.TemporaryDirectory(prefix=f"flowdesk-{language}-") as temp_dir:
        source_path = os.path.join(temp_dir, f"main.{extension}")
        executable_path = _executable_path(temp_dir, "main")
        with open(source_path, "w", encoding="utf-8", newline="\n") as source_file:
            source_file.write(code)

        compile_result = await asyncio.to_thread(
            _run_process_blocking,
            [
                compiler_path,
                source_path,
                "-std=" + standard,
                "-O2",
                "-pipe",
                "-Wall",
                "-Wextra",
                "-o",
                executable_path,
            ],
            stdin="",
            cwd=temp_dir,
            timeout_seconds=timeout_seconds,
            max_output=max_output,
            started=started,
        )
        if compile_result.status != "success":
            return RunResult(
                status=compile_result.status,
                stdout=compile_result.stdout,
                stderr=compile_result.stderr,
                exit_code=compile_result.exit_code,
                duration_ms=compile_result.duration_ms,
                timed_out=compile_result.timed_out,
                truncated=compile_result.truncated,
                message=compile_result.message or f"{language.upper()} compilation failed.",
                warnings=compile_result.warnings,
            )

        run_started = time.perf_counter()
        run_result = await asyncio.to_thread(
            _run_process_blocking,
            [executable_path, *(args or [])],
            stdin=stdin,
            cwd=temp_dir,
            timeout_seconds=timeout_seconds,
            max_output=max_output,
            started=run_started,
            env={**os.environ, "NO_COLOR": "1"},
            warnings=compile_result.warnings,
        )
        stdout, stdout_trunc = _truncate(
            "\n".join(part for part in [compile_result.stdout.strip(), run_result.stdout.strip()] if part),
            max_output,
        )
        stderr, stderr_trunc = _truncate(
            "\n".join(part for part in [compile_result.stderr.strip(), run_result.stderr.strip()] if part),
            max_output,
        )
        return RunResult(
            status=run_result.status,
            stdout=stdout,
            stderr=stderr,
            exit_code=run_result.exit_code,
            duration_ms=round((time.perf_counter() - started) * 1000),
            timed_out=run_result.timed_out,
            truncated=compile_result.truncated or run_result.truncated or stdout_trunc or stderr_trunc,
            message=run_result.message,
            memory_kb=run_result.memory_kb,
            cpu_time_ms=run_result.cpu_time_ms,
            exit_signal=run_result.exit_signal,
            warnings=[*compile_result.warnings, *run_result.warnings],
        )


async def _execute_external_runner(language: str, code: str, stdin: str) -> RunResult:
    started = time.perf_counter()
    runner_url = settings.COMPILER_PISTON_API_URL.strip().rstrip("/")
    runtime = PISTON_LANGUAGE_MAP.get(language)
    if not runner_url or not runtime:
        return RunResult(
            status="unsupported",
            stdout="",
            stderr="",
            exit_code=None,
            duration_ms=0,
            message=f"{language} execution needs a configured isolated runner.",
        )

    piston_language, filename = runtime
    timeout_seconds = min(settings.COMPILER_TIMEOUT_SECONDS, COMPILER_TIMEOUT_SECONDS)
    memory_limit = MAX_MEMORY_MB * 1024 * 1024
    payload = {
        "language": piston_language,
        "version": "*",
        "files": [{"name": filename, "content": code}],
        "stdin": stdin,
        "compile_timeout": timeout_seconds * 1000,
        "run_timeout": timeout_seconds * 1000,
        "compile_memory_limit": memory_limit,
        "run_memory_limit": memory_limit,
    }

    try:
        async with httpx.AsyncClient(timeout=timeout_seconds + 10) as client:
            response = await client.post(f"{runner_url}/api/v2/execute", json=payload)
            response.raise_for_status()
            data = response.json()
    except httpx.HTTPError as exc:
        logger.warning("External compiler runner failed", language=language, error=str(exc))
        duration_ms = round((time.perf_counter() - started) * 1000)
        return RunResult(
            status="error",
            stdout="",
            stderr="",
            exit_code=None,
            duration_ms=duration_ms,
            message="The external compiler runner is unavailable right now.",
        )

    compile_result = data.get("compile") or {}
    run_result = data.get("run") or {}
    stdout = "\n".join(
        part for part in [
            str(compile_result.get("stdout") or "").strip(),
            str(run_result.get("stdout") or "").strip(),
        ] if part
    )
    stderr = "\n".join(
        part for part in [
            str(compile_result.get("stderr") or "").strip(),
            str(run_result.get("stderr") or "").strip(),
        ] if part
    )
    stdout = strip_ansi(stdout)
    stderr = strip_ansi(stderr)
    stdout, stdout_trunc = _truncate(stdout, min(settings.COMPILER_MAX_OUTPUT_CHARS, COMPILER_MAX_OUTPUT_CHARS))
    stderr, stderr_trunc = _truncate(stderr, min(settings.COMPILER_MAX_OUTPUT_CHARS, COMPILER_MAX_OUTPUT_CHARS))

    compile_code = compile_result.get("code")
    run_code_value = run_result.get("code")
    exit_code = run_code_value if run_code_value is not None else compile_code
    status = "success" if exit_code in {0, None} else "error"
    if compile_code not in {0, None}:
        status = "error"

    return RunResult(
        status=status,
        stdout=stdout,
        stderr=stderr,
        exit_code=exit_code if isinstance(exit_code, int) else None,
        duration_ms=round((time.perf_counter() - started) * 1000),
        truncated=stdout_trunc or stderr_trunc,
        message=None if status == "success" else "Code finished with errors.",
    )


async def run_code(
    db: AsyncSession,
    user_id: str,
    plan: str,
    *,
    language: str,
    code: str,
    stdin: str,
    compiler_file_id: str | None = None,
    args: list[str] | None = None,      # 66. CLI args support exposed end-to-end
    use_cache: bool = True,             # 67. opt-out switch for forced fresh runs
) -> dict[str, Any]:
    if len(code) > MAX_CODE_LENGTH:
        raise ValueError(f"Code exceeds the {MAX_CODE_LENGTH} character limit.")
    if len(stdin) > MAX_STDIN_LENGTH:
        raise ValueError(f"Stdin exceeds the {MAX_STDIN_LENGTH} character limit.")

    runs_today = await count_runs_today(db, user_id)
    run_limit = daily_run_limit_for_plan(plan)
    if runs_today >= run_limit:
        raise ValueError(f"Daily compiler run limit reached: {run_limit} runs on your current plan.")

    language = normalize_language(language)

    # 68. result cache — identical code+stdin within TTL skips re-execution entirely (huge latency win)
    cache_key = hash_run(language, code, stdin, args)
    if use_cache and cache_key in _run_cache:
        expiry, cached_result = _run_cache[cache_key]
        if expiry > time.time():
            _bump("cache_hits")
            result = {**cached_result, "cached": True}
            await safe_record_run_event(
                db, user_id=user_id, compiler_file_id=compiler_file_id, language=language,
                status=result["status"], duration_ms=0, output_size=len(result["output"]), cached=True,
            )
            return result
        del _run_cache[cache_key]

    # 69. two-tier concurrency gate: global box protection + per-user fairness
    user_lock = _user_run_locks[user_id]
    async with _global_run_semaphore, user_lock:
        if not settings.COMPILER_EXECUTION_ENABLED:
            result = RunResult(status="disabled", stdout="", stderr="", exit_code=None, duration_ms=0,
                                message="Compiler execution is disabled on this server.")
        elif language == "python":
            result = await _execute_python(code, stdin, args=args)
        elif language == "javascript" and has_local_runtime("javascript"):
            result = await _execute_javascript(code, stdin, args=args)
        elif language == "java" and has_local_runtime("java"):
            result = await _execute_java(code, stdin, args=args)
        elif language in {"c", "cpp"} and has_local_runtime(language):
            result = await _execute_compiled_c_family(language=language, code=code, stdin=stdin, args=args)
        elif language in PISTON_LANGUAGE_MAP and settings.COMPILER_PISTON_API_URL.strip():
            result = await _execute_external_runner(language, code, stdin)
        else:
            result = RunResult(status="unsupported", stdout="", stderr="", exit_code=None, duration_ms=0,
                                message=local_runtime_reason(language) or f"{language} execution needs a configured isolated runner.")

    output = result.output
    await safe_record_run_event(
        db, user_id=user_id, compiler_file_id=compiler_file_id, language=language,
        status=result.status, duration_ms=result.duration_ms, output_size=len(output),
        memory_kb=result.memory_kb, cached=False,
    )

    response = {
        "status": result.status, "stdout": result.stdout, "stderr": result.stderr,
        "output": output, "exit_code": result.exit_code, "duration_ms": result.duration_ms,
        "timed_out": result.timed_out, "truncated": result.truncated, "language": language,
        "message": result.message, "memory_kb": result.memory_kb, "cpu_time_ms": result.cpu_time_ms,
        "exit_signal": result.exit_signal, "warnings": result.warnings, "cached": False,
    }

    # 70. populate cache only for clean, deterministic-looking runs (not timeouts)
    if use_cache and result.status in {"success", "error"}:
        if len(_run_cache) >= RUN_CACHE_MAX_ENTRIES:  # 71. simple eviction to bound memory
            _run_cache.pop(next(iter(_run_cache)))
        _run_cache[cache_key] = (time.time() + RUN_CACHE_TTL_SECONDS, response)

    return response


async def run_compiler_file(
    db: AsyncSession,
    user_id: str,
    plan: str,
    file_id: str,
    *,
    title: str | None = None,
    language: str | None = None,
    code: str | None = None,
    stdin: str | None = None,
    args: list[str] | None = None,
    use_cache: bool = True,
) -> dict[str, Any] | None:
    file = await get_compiler_file(db, file_id, user_id)
    if not file:
        return None

    lock_key = f"{user_id}:{file_id}"
    async with _file_run_locks[lock_key]:  # 72. single-flight: same file can't double-run concurrently
        run_title = title if title is not None else file["title"]
        run_language = language if language is not None else file["language"]
        source_code = code if code is not None else file["code"]
        run_stdin = stdin if stdin is not None else file["stdin"]
        result = await run_code(
            db, user_id, plan,
            language=run_language, code=source_code, stdin=run_stdin,
            compiler_file_id=file_id, args=args, use_cache=use_cache,
        )
        try:
            await db.execute(
                text(
                    """
                    UPDATE compiler_files
                    SET title = :title,
                        language = :language,
                        code = :code,
                        stdin = :stdin,
                        output = :output,
                        run_count = run_count + 1,
                        last_run_at = CURRENT_TIMESTAMP,
                        updated_at = CURRENT_TIMESTAMP
                    WHERE id = :file_id AND user_id = :user_id AND deleted_at IS NULL
                    """
                ),
                {
                    "file_id": file_id,
                    "user_id": user_id,
                    "title": run_title,
                    "language": normalize_language(run_language),
                    "code": source_code,
                    "stdin": run_stdin,
                    "output": result["output"],
                },
            )
        except Exception as exc:
            logger.warning("Compiler file output update skipped", file_id=file_id, error=str(exc))
            with contextlib.suppress(Exception):
                await db.rollback()
    return result


# ──────────────────────────────────────────────────────────────────────────
# TEST-CASE RUNNER  (features 73-77: grading / TA-style bulk execution)
# ──────────────────────────────────────────────────────────────────────────

async def run_test_cases(
    db: AsyncSession,
    user_id: str,
    plan: str,
    *,
    language: str,
    code: str,
    test_cases: list[dict[str, str]],  # [{"stdin": "...", "expected": "..."}]
) -> dict[str, Any]:
    if len(test_cases) > TEST_CASE_MAX_COUNT:  # 73. bulk-run ceiling
        raise ValueError(f"At most {TEST_CASE_MAX_COUNT} test cases per batch.")

    results = []
    passed = 0
    for i, case in enumerate(test_cases):
        run_result = await run_code(
            db, user_id, plan, language=language, code=code,
            stdin=case.get("stdin", ""), use_cache=True,
        )
        expected = case.get("expected", "")
        actual = run_result["stdout"].strip()
        ok = actual == expected.strip()  # 74. exact-match grading
        passed += int(ok)
        results.append({                  # 75. per-case breakdown for UI rendering
            "index": i, "passed": ok, "expected": expected, "actual": actual,
            "stderr": run_result["stderr"], "duration_ms": run_result["duration_ms"],
        })

    return {
        "total": len(test_cases),
        "passed": passed,                 # 76. summary score
        "failed": len(test_cases) - passed,
        "pass_rate": round(passed / len(test_cases), 4) if test_cases else 0,
        "results": results,
        "complexity": estimate_complexity(code),  # 77. bundled static analysis
    }


# ──────────────────────────────────────────────────────────────────────────
# SHARING / FOLDERS / TAGS  (features 78-85)
# ──────────────────────────────────────────────────────────────────────────

async def create_share_link(db: AsyncSession, file_id: str, user_id: str) -> dict[str, Any] | None:  # 78
    raise NotImplementedError("Compiler sharing needs a migration before it can be enabled.")


async def revoke_share_link(db: AsyncSession, file_id: str, user_id: str) -> bool:  # 79
    raise NotImplementedError("Compiler sharing needs a migration before it can be enabled.")


async def get_shared_file(db: AsyncSession, share_token: str) -> dict[str, Any] | None:  # 80. read-only public view
    raise NotImplementedError("Compiler sharing needs a migration before it can be enabled.")


async def create_folder(db: AsyncSession, user_id: str, name: str, parent_id: str | None = None) -> dict[str, Any]:  # 81
    raise NotImplementedError("Compiler folders need a migration before they can be enabled.")


async def list_folders(db: AsyncSession, user_id: str) -> list[dict[str, Any]]:  # 82
    raise NotImplementedError("Compiler folders need a migration before they can be enabled.")


async def add_tag(db: AsyncSession, file_id: str, user_id: str, tag: str) -> dict[str, Any] | None:  # 83
    raise NotImplementedError("Compiler tags need a migration before they can be enabled.")


async def remove_tag(db: AsyncSession, file_id: str, user_id: str, tag: str) -> dict[str, Any] | None:  # 84
    raise NotImplementedError("Compiler tags need a migration before they can be enabled.")


async def duplicate_file(db: AsyncSession, file_id: str, user_id: str, plan: str) -> dict[str, Any] | None:  # 85
    original = await get_compiler_file(db, file_id, user_id)
    if not original:
        return None
    return await create_compiler_file(
        db, user_id, plan,
        title=f"{original['title']} (copy)", language=original["language"],
        code=original["code"], stdin=original["stdin"],
    )


# ──────────────────────────────────────────────────────────────────────────
# ADMIN / HEALTH  (features 86-90)
# ──────────────────────────────────────────────────────────────────────────

async def health_check() -> dict[str, Any]:  # 86. liveness/readiness payload
    return {
        "compiler_enabled": bool(settings.COMPILER_EXECUTION_ENABLED),
        "queue": get_queue_stats(),
        "metrics": get_runtime_metrics(),
        "cache_entries": len(_run_cache),
    }


def clear_run_cache() -> int:  # 87. manual cache flush (admin action)
    count = len(_run_cache)
    _run_cache.clear()
    return count


def reset_metrics() -> None:  # 88. metrics rollover
    _metrics.clear()


async def admin_force_unlock_file(file_id: str, user_id: str) -> None:  # 89. unstick a stuck single-flight lock
    _file_run_locks.pop(f"{user_id}:{file_id}", None)


def estimate_cost_ms(plan: str, runs_today: int) -> dict[str, Any]:  # 90. simple usage/limit projection for UI
    limit = daily_run_limit_for_plan(plan)
    return {
        "runs_today": runs_today,
        "limit": limit,
        "remaining": max(limit - runs_today, 0),
        "percent_used": round(min(runs_today / limit, 1.0) * 100, 1) if limit else 0,
    }
