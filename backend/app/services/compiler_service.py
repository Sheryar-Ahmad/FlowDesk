from __future__ import annotations

import asyncio
import json
import sys
import tempfile
import time
from dataclasses import dataclass
from typing import Any

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


PYTHON_SANDBOX = r"""
import ast
import io
import json
import sys
import traceback

payload = json.loads(sys.stdin.readline())
source = payload.get("code", "")
stdin_value = payload.get("stdin", "")

allowed_modules = {
    "bisect",
    "collections",
    "datetime",
    "decimal",
    "fractions",
    "functools",
    "heapq",
    "itertools",
    "json",
    "math",
    "random",
    "re",
    "statistics",
    "string",
    "typing",
}

allowed_builtins = {
    "ArithmeticError": ArithmeticError,
    "AssertionError": AssertionError,
    "Exception": Exception,
    "IndexError": IndexError,
    "KeyError": KeyError,
    "LookupError": LookupError,
    "NameError": NameError,
    "RuntimeError": RuntimeError,
    "StopIteration": StopIteration,
    "TypeError": TypeError,
    "ValueError": ValueError,
    "ZeroDivisionError": ZeroDivisionError,
    "abs": abs,
    "all": all,
    "any": any,
    "bool": bool,
    "chr": chr,
    "dict": dict,
    "divmod": divmod,
    "enumerate": enumerate,
    "filter": filter,
    "float": float,
    "format": format,
    "hash": hash,
    "hex": hex,
    "input": input,
    "int": int,
    "isinstance": isinstance,
    "issubclass": issubclass,
    "iter": iter,
    "len": len,
    "list": list,
    "map": map,
    "max": max,
    "min": min,
    "next": next,
    "oct": oct,
    "ord": ord,
    "pow": pow,
    "print": print,
    "range": range,
    "repr": repr,
    "reversed": reversed,
    "round": round,
    "set": set,
    "slice": slice,
    "sorted": sorted,
    "str": str,
    "sum": sum,
    "tuple": tuple,
    "zip": zip,
}


def safe_import(name, globals=None, locals=None, fromlist=(), level=0):
    root_name = name.split(".", 1)[0]
    if level != 0 or root_name not in allowed_modules:
        raise ImportError(f"Module '{name}' is not available in the FlowDesk sandbox")
    return __import__(name, globals, locals, fromlist, level)


allowed_builtins["__import__"] = safe_import


class Guard(ast.NodeVisitor):
    blocked_names = {
        "breakpoint",
        "compile",
        "delattr",
        "eval",
        "exec",
        "getattr",
        "globals",
        "help",
        "locals",
        "open",
        "setattr",
        "vars",
        "__builtins__",
        "__import__",
    }

    def visit_Name(self, node):
        if node.id in self.blocked_names or node.id.startswith("__"):
            raise RuntimeError(f"Use of '{node.id}' is not allowed in the FlowDesk sandbox")
        self.generic_visit(node)

    def visit_Attribute(self, node):
        if node.attr.startswith("__"):
            raise RuntimeError("Dunder attribute access is not allowed in the FlowDesk sandbox")
        self.generic_visit(node)


try:
    tree = ast.parse(source, filename="<flowdesk>", mode="exec")
    Guard().visit(tree)
    compiled = compile(tree, "<flowdesk>", "exec")
    globals_dict = {
        "__builtins__": allowed_builtins,
        "__name__": "__main__",
    }
    original_stdin = sys.stdin
    sys.stdin = io.StringIO(stdin_value)
    try:
        exec(compiled, globals_dict, globals_dict)
    finally:
        sys.stdin = original_stdin
except SystemExit as exc:
    code = exc.code if isinstance(exc.code, int) else 1
    raise SystemExit(code)
except Exception:
    traceback.print_exc(limit=8)
    raise SystemExit(1)
"""


EXECUTABLE_LANGUAGES = {
    "python": "Python 3 sandbox",
}


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
        "run_count": int(row.run_count or 0),
        "last_run_at": row.last_run_at,
        "created_at": row.created_at,
        "updated_at": row.updated_at,
    }


def file_limit_for_plan(plan: str) -> int:
    return PRO_TIER_COMPILER_FILE_LIMIT if plan == "pro" else FREE_TIER_COMPILER_FILE_LIMIT


def daily_run_limit_for_plan(plan: str) -> int:
    return PRO_TIER_COMPILER_RUNS_PER_DAY if plan == "pro" else FREE_TIER_COMPILER_RUNS_PER_DAY


async def list_compiler_files(
    db: AsyncSession,
    user_id: str,
    *,
    page: int = 1,
    page_size: int = 20,
    language: str | None = None,
    search: str | None = None,
) -> dict[str, Any]:
    offset = (page - 1) * page_size
    clauses = ["user_id = :user_id", "deleted_at IS NULL"]
    params: dict[str, Any] = {
        "user_id": user_id,
        "limit": page_size,
        "offset": offset,
    }
    if language:
        clauses.append("language = :language")
        params["language"] = language
    if search:
        clauses.append("(title ILIKE :search OR code ILIKE :search)")
        params["search"] = f"%{search}%"

    where_sql = " AND ".join(clauses)
    result = await db.execute(
        text(
            f"""
            SELECT id, user_id, title, language, code, stdin, output, is_pinned,
                   run_count, last_run_at, created_at, updated_at
            FROM compiler_files
            WHERE {where_sql}
            ORDER BY is_pinned DESC, updated_at DESC
            LIMIT :limit OFFSET :offset
            """
        ),
        params,
    )
    total_result = await db.execute(
        text(f"SELECT COUNT(*) FROM compiler_files WHERE {where_sql}"),
        {key: value for key, value in params.items() if key not in {"limit", "offset"}},
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
            WHERE id = :file_id
              AND user_id = :user_id
              AND deleted_at IS NULL
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
) -> dict[str, Any]:
    count = await count_compiler_files(db, user_id)
    limit = file_limit_for_plan(plan)
    if count >= limit:
        raise ValueError(f"Compiler file limit reached: {limit} files on your current plan.")

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
            "user_id": user_id,
            "title": title,
            "language": language,
            "code": code,
            "stdin": stdin,
        },
    )
    row = result.fetchone()
    logger.info("Compiler file created", user_id=user_id, compiler_file_id=str(row.id))
    return _file_from_row(row)


async def update_compiler_file(
    db: AsyncSession,
    file_id: str,
    user_id: str,
    updates: dict[str, Any],
) -> dict[str, Any] | None:
    allowed_fields = {"title", "language", "code", "stdin", "output", "is_pinned"}
    values = {key: value for key, value in updates.items() if key in allowed_fields}
    if not values:
        return await get_compiler_file(db, file_id, user_id)

    assignments = ", ".join(f"{key} = :{key}" for key in values)
    result = await db.execute(
        text(
            f"""
            UPDATE compiler_files
            SET {assignments}
            WHERE id = :file_id
              AND user_id = :user_id
              AND deleted_at IS NULL
            RETURNING id, user_id, title, language, code, stdin, output, is_pinned,
                      run_count, last_run_at, created_at, updated_at
            """
        ),
        {**values, "file_id": file_id, "user_id": user_id},
    )
    row = result.fetchone()
    return _file_from_row(row) if row else None


async def delete_compiler_file(db: AsyncSession, file_id: str, user_id: str) -> bool:
    result = await db.execute(
        text(
            """
            UPDATE compiler_files
            SET deleted_at = CURRENT_TIMESTAMP
            WHERE id = :file_id
              AND user_id = :user_id
              AND deleted_at IS NULL
            RETURNING id
            """
        ),
        {"file_id": file_id, "user_id": user_id},
    )
    return result.fetchone() is not None


async def count_runs_today(db: AsyncSession, user_id: str) -> int:
    result = await db.execute(
        text(
            """
            SELECT COUNT(*)
            FROM compiler_run_events
            WHERE user_id = :user_id
              AND created_at >= date_trunc('day', CURRENT_TIMESTAMP)
            """
        ),
        {"user_id": user_id},
    )
    return int(result.scalar() or 0)


async def record_run_event(
    db: AsyncSession,
    *,
    user_id: str,
    compiler_file_id: str | None,
    language: str,
    status: str,
    duration_ms: int,
    output_size: int,
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
            "user_id": user_id,
            "compiler_file_id": compiler_file_id,
            "language": language,
            "status": status,
            "duration_ms": duration_ms,
            "output_size": output_size,
        },
    )


def list_runtimes() -> list[dict[str, Any]]:
    executable = bool(settings.COMPILER_EXECUTION_ENABLED)
    disabled_reason = None if executable else "Compiler execution is disabled on this server."
    return [
        {
            "language": "python",
            "label": EXECUTABLE_LANGUAGES["python"],
            "executable": executable,
            "reason": disabled_reason,
        },
        {
            "language": "javascript",
            "label": "JavaScript",
            "executable": False,
            "reason": "JavaScript needs a separate sandbox runner before production use.",
        },
        {
            "language": "typescript",
            "label": "TypeScript",
            "executable": False,
            "reason": "TypeScript needs a separate sandbox runner before production use.",
        },
        {
            "language": "java",
            "label": "Java",
            "executable": False,
            "reason": "Compiled languages are saved now and will run when an isolated runner is attached.",
        },
        {
            "language": "cpp",
            "label": "C++",
            "executable": False,
            "reason": "Compiled languages are saved now and will run when an isolated runner is attached.",
        },
        {
            "language": "c",
            "label": "C",
            "executable": False,
            "reason": "Compiled languages are saved now and will run when an isolated runner is attached.",
        },
        {
            "language": "go",
            "label": "Go",
            "executable": False,
            "reason": "Compiled languages are saved now and will run when an isolated runner is attached.",
        },
        {
            "language": "rust",
            "label": "Rust",
            "executable": False,
            "reason": "Compiled languages are saved now and will run when an isolated runner is attached.",
        },
    ]


async def _execute_python(code: str, stdin: str) -> RunResult:
    started = time.perf_counter()
    max_output = min(settings.COMPILER_MAX_OUTPUT_CHARS, COMPILER_MAX_OUTPUT_CHARS)
    timeout_seconds = min(settings.COMPILER_TIMEOUT_SECONDS, COMPILER_TIMEOUT_SECONDS)
    payload = json.dumps({"code": code, "stdin": stdin}, ensure_ascii=False) + "\n"

    with tempfile.TemporaryDirectory(prefix="flowdesk-compiler-") as temp_dir:
        process = await asyncio.create_subprocess_exec(
            sys.executable,
            "-I",
            "-S",
            "-c",
            PYTHON_SANDBOX,
            stdin=asyncio.subprocess.PIPE,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            cwd=temp_dir,
            env={
                "PYTHONIOENCODING": "utf-8",
                "PYTHONUTF8": "1",
            },
        )
        try:
            stdout_bytes, stderr_bytes = await asyncio.wait_for(
                process.communicate(payload.encode("utf-8")),
                timeout=timeout_seconds,
            )
        except TimeoutError:
            process.kill()
            stdout_bytes, stderr_bytes = await process.communicate()
            duration_ms = round((time.perf_counter() - started) * 1000)
            stdout = stdout_bytes.decode("utf-8", errors="replace")
            stderr = stderr_bytes.decode("utf-8", errors="replace")
            stdout, stdout_truncated = _truncate(stdout, max_output)
            stderr, stderr_truncated = _truncate(stderr, max_output)
            return RunResult(
                status="timeout",
                stdout=stdout,
                stderr=stderr or f"Execution exceeded {timeout_seconds} seconds.",
                exit_code=None,
                duration_ms=duration_ms,
                timed_out=True,
                truncated=stdout_truncated or stderr_truncated,
                message="Execution timed out.",
            )

    duration_ms = round((time.perf_counter() - started) * 1000)
    stdout = stdout_bytes.decode("utf-8", errors="replace")
    stderr = stderr_bytes.decode("utf-8", errors="replace")
    stdout, stdout_truncated = _truncate(stdout, max_output)
    stderr, stderr_truncated = _truncate(stderr, max_output)
    status = "success" if process.returncode == 0 else "error"
    return RunResult(
        status=status,
        stdout=stdout,
        stderr=stderr,
        exit_code=process.returncode,
        duration_ms=duration_ms,
        truncated=stdout_truncated or stderr_truncated,
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
) -> dict[str, Any]:
    runs_today = await count_runs_today(db, user_id)
    run_limit = daily_run_limit_for_plan(plan)
    if runs_today >= run_limit:
        raise ValueError(f"Daily compiler run limit reached: {run_limit} runs on your current plan.")

    if not settings.COMPILER_EXECUTION_ENABLED:
        result = RunResult(
            status="disabled",
            stdout="",
            stderr="",
            exit_code=None,
            duration_ms=0,
            message="Compiler execution is disabled on this server.",
        )
    elif language == "python":
        result = await _execute_python(code, stdin)
    else:
        result = RunResult(
            status="unsupported",
            stdout="",
            stderr="",
            exit_code=None,
            duration_ms=0,
            message=f"{language} execution requires a separate isolated runner.",
        )

    output = result.output
    await record_run_event(
        db,
        user_id=user_id,
        compiler_file_id=compiler_file_id,
        language=language,
        status=result.status,
        duration_ms=result.duration_ms,
        output_size=len(output),
    )
    return {
        "status": result.status,
        "stdout": result.stdout,
        "stderr": result.stderr,
        "output": output,
        "exit_code": result.exit_code,
        "duration_ms": result.duration_ms,
        "timed_out": result.timed_out,
        "truncated": result.truncated,
        "language": language,
        "message": result.message,
    }


async def run_compiler_file(
    db: AsyncSession,
    user_id: str,
    plan: str,
    file_id: str,
) -> dict[str, Any] | None:
    file = await get_compiler_file(db, file_id, user_id)
    if not file:
        return None

    result = await run_code(
        db,
        user_id,
        plan,
        language=file["language"],
        code=file["code"],
        stdin=file["stdin"],
        compiler_file_id=file_id,
    )
    await db.execute(
        text(
            """
            UPDATE compiler_files
            SET output = :output,
                run_count = run_count + 1,
                last_run_at = CURRENT_TIMESTAMP
            WHERE id = :file_id
              AND user_id = :user_id
              AND deleted_at IS NULL
            """
        ),
        {"file_id": file_id, "user_id": user_id, "output": result["output"]},
    )
    return result
