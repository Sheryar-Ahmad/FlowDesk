from __future__ import annotations

import shutil
import sys
import time
from unittest.mock import AsyncMock

import pytest

from app.services import compiler_service


@pytest.mark.asyncio
async def test_python_classes_and_static_methods_execute():
    result = await compiler_service._execute_python(
        """
class Student:
    def __init__(self, name):
        self.name = name

    @staticmethod
    def label():
        return "Student"

print(Student.label(), Student("FlowDesk").name)
""".strip(),
        "",
    )

    assert result.status == "success"
    assert result.exit_code == 0
    assert result.stdout.strip() == "Student FlowDesk"
    assert result.stderr == ""


@pytest.mark.asyncio
async def test_run_code_returns_stdout_in_output(monkeypatch):
    monkeypatch.setattr(compiler_service, "count_runs_today", AsyncMock(return_value=0))
    monkeypatch.setattr(compiler_service, "safe_record_run_event", AsyncMock())

    result = await compiler_service.run_code(
        AsyncMock(),
        "compiler-output-test-user",
        "free",
        language="python",
        code='print("visible-output")',
        stdin="",
        use_cache=False,
    )

    assert result["status"] == "success"
    assert result["exit_code"] == 0
    assert result["stdout"].strip() == "visible-output"
    assert result["output"].strip() == "visible-output"


@pytest.mark.asyncio
async def test_javascript_stdin_reaches_program():
    if not shutil.which("node"):
        pytest.skip("Node.js is not installed in this environment.")

    result = await compiler_service._execute_javascript(
        """
let value = "";
process.stdin.on("data", chunk => value += chunk);
process.stdin.on("end", () => console.log(`Hello ${value.trim()}`));
""".strip(),
        "FlowDesk\n",
    )

    assert result.status == "success"
    assert result.exit_code == 0
    assert result.stdout.strip() == "Hello FlowDesk"


@pytest.mark.asyncio
async def test_java_package_compiles_and_runs():
    if not shutil.which("javac") or not shutil.which("java"):
        pytest.skip("A Java compiler and runtime are not installed in this environment.")

    result = await compiler_service._execute_java(
        """
package demo.school;

public class Main {
    public static void main(String[] args) {
        System.out.println("package-output");
    }
}
""".strip(),
        "",
    )

    assert result.status == "success"
    assert result.exit_code == 0
    assert result.stdout.strip() == "package-output"


@pytest.mark.asyncio
async def test_c_program_compiles_and_runs():
    if not shutil.which("gcc"):
        pytest.skip("GCC is not installed in this environment.")

    result = await compiler_service._execute_compiled_c_family(
        language="c",
        code="""
#include <stdio.h>

int main(void) {
    printf("c-output\\n");
    return 0;
}
""".strip(),
        stdin="",
    )

    assert result.status == "success"
    assert result.exit_code == 0
    assert result.stdout.strip() == "c-output"


@pytest.mark.asyncio
async def test_cpp_program_compiles_and_runs():
    if not shutil.which("g++"):
        pytest.skip("G++ is not installed in this environment.")

    result = await compiler_service._execute_compiled_c_family(
        language="cpp",
        code="""
#include <iostream>

int main() {
    std::cout << "cpp-output\\n";
    return 0;
}
""".strip(),
        stdin="",
    )

    assert result.status == "success"
    assert result.exit_code == 0
    assert result.stdout.strip() == "cpp-output"


def test_successful_process_can_include_stderr_without_becoming_an_error():
    result = compiler_service._decode_process_run(
        returncode=0,
        stdout_value="program-output\n",
        stderr_value="compiler warning\n",
        duration_ms=12,
        max_output=1000,
    )

    assert result.status == "success"
    assert result.output == "program-output\n\ncompiler warning"


def test_compiler_environment_does_not_inherit_application_secrets(monkeypatch, tmp_path):
    monkeypatch.setenv("DEEPSEEK_API_KEY", "secret-value")
    monkeypatch.setenv("LEMON_SQUEEZY_WEBHOOK_SECRET", "secret-value")

    env = compiler_service._compiler_process_env(str(tmp_path))

    assert "DEEPSEEK_API_KEY" not in env
    assert "LEMON_SQUEEZY_WEBHOOK_SECRET" not in env
    assert env["HOME"] == str(tmp_path)
    assert "PATH" in env


def test_process_timeout_returns_terminal_output_instead_of_raising(tmp_path):
    result = compiler_service._run_process_blocking(
        [
            sys.executable,
            "-c",
            'import time; print("started", flush=True); time.sleep(5)',
        ],
        stdin="",
        cwd=str(tmp_path),
        timeout_seconds=0.5,
        max_output=1000,
        started=time.perf_counter(),
        env=compiler_service._compiler_process_env(str(tmp_path)),
    )

    assert result.status == "timeout"
    assert result.timed_out is True
    assert "started" in result.stdout
    assert "Execution exceeded" in result.stderr
