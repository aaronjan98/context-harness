"""Approved local tool execution for Context Forge."""

from __future__ import annotations

import asyncio
from collections.abc import AsyncGenerator
from dataclasses import dataclass
from enum import Enum
from pathlib import Path
import re
import subprocess
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    pass


class ToolExecutionError(ValueError):
    """Raised when a requested tool call is invalid or blocked."""


class CommandTier(str, Enum):
    SAFE = "safe"       # auto-run without approval
    CONFIRM = "confirm" # requires approval; Pushbullet notification sent if configured
    BLOCKED = "blocked" # never run


@dataclass(frozen=True)
class TerminalExecutionResult:
    """Captured result from one terminal command."""

    cwd: str
    command: str
    reason: str
    exit_code: int
    stdout: str
    stderr: str


# Commands that modify filesystem, packages, processes, or git history.
# These require explicit user approval (Pushbullet notification sent).
CONFIRM_PATTERNS: tuple[tuple[re.Pattern[str], str], ...] = (
    (re.compile(r"(^|[;&|`]\s*)rm\s+"), "file deletion requires approval"),
    (re.compile(r"(^|[;&|`]\s*)rmdir\b"), "directory removal requires approval"),
    (re.compile(r"(^|[;&|`]\s*)mv\s+"), "file move requires approval"),
    (re.compile(r"(^|[;&|`]\s*)cp\s+"), "file copy requires approval"),
    (re.compile(r"(^|[;&|`]\s*)(?:touch|mkdir|ln)\s+"), "file creation requires approval"),
    (re.compile(r"(^|[;&|`]\s*)(?:chmod|chown)\b"), "permission change requires approval"),
    (re.compile(r"(?<![>])>(?![>=])"), "output redirection (overwrite) requires approval"),
    (re.compile(r"(^|[;&|`]\s*)tee\b(?!.*(?:--append|-a)\b)"), "tee without append requires approval"),
    (re.compile(r"\bgit\s+(?:commit|push|checkout|switch|merge|rebase|cherry-pick|stash\s+pop|branch\s+-[dD]|tag\s+-d)\b"), "git write operation requires approval"),
    (re.compile(r"\bgit\s+add\b"), "git add requires approval"),
    (re.compile(r"\b(?:pip|pip3|uv)\s+(?:install|uninstall|upgrade)\b"), "package install requires approval"),
    (re.compile(r"\b(?:npm|yarn|pnpm)\s+(?:install|uninstall|remove|update|ci)\b"), "package install requires approval"),
    (re.compile(r"\b(?:apt|apt-get|dnf|yum|brew|nix-env|nix\s+profile)\s+"), "system package operation requires approval"),
    (re.compile(r"\b(?:kill|pkill|killall)\b"), "process termination requires approval"),
    (re.compile(r"\bdocker\s+(?:run|stop|start|rm|rmi|kill|exec|compose\s+(?:up|down|rm))\b"), "docker mutation requires approval"),
    (re.compile(r"\bsystemctl\s+(?:start|stop|restart|enable|disable|daemon-reload|mask|unmask)\b"), "systemctl write operation requires approval"),
    (re.compile(r"\b(?:curl|wget)\s+.*(?:-o\s+|-O\b|--output\b)"), "download-to-file requires approval"),
    (re.compile(r"\bssh\b.*(?:[;&|`]|$)"), "SSH commands require approval"),
    (re.compile(r"\bscp\b"), "scp requires approval"),
    (re.compile(r"\brsync\b"), "rsync requires approval"),
    (re.compile(r"\bdd\b"), "dd requires approval"),
)

DANGEROUS_COMMAND_PATTERNS: tuple[tuple[re.Pattern[str], str], ...] = (
    (re.compile(r"(^|[;&|]\s*)sudo(\s|$)"), "sudo commands must be run manually"),
    (
        re.compile(r"(^|[;&|]\s*)rm\s+-[^\n;&|]*[rR][^\n;&|]*[fF]?"),
        "recursive remove commands must be run manually",
    ),
    (
        re.compile(r"\bgit\s+reset\s+--hard\b"),
        "hard git resets must be run manually",
    ),
    (re.compile(r"\bmkfs(?:\.\w+)?\b"), "filesystem formatting is blocked"),
    (re.compile(r"\b(shutdown|reboot|poweroff)\b"), "power commands are blocked"),
)


def classify_command(command: str) -> tuple[CommandTier, str]:
    """Return the approval tier and reason for a proposed command.

    Tier order: BLOCKED > CONFIRM > SAFE.
    Blocked commands are never run.
    Confirm commands require user approval; a Pushbullet notification is sent
    when a token is configured.
    Safe commands are auto-run without interaction.
    """
    for pattern, message in DANGEROUS_COMMAND_PATTERNS:
        if pattern.search(command):
            return CommandTier.BLOCKED, message
    for pattern, message in CONFIRM_PATTERNS:
        if pattern.search(command):
            return CommandTier.CONFIRM, message
    return CommandTier.SAFE, "read-only command"


async def send_pushbullet_notification(
    token: str,
    title: str,
    body: str,
) -> None:
    """POST a note push to Pushbullet. Silently ignores errors."""
    try:
        import httpx
        async with httpx.AsyncClient(timeout=8.0) as client:
            await client.post(
                "https://api.pushbullet.com/v2/pushes",
                headers={"Access-Token": token},
                json={"type": "note", "title": title, "body": body},
            )
    except Exception:
        pass


def validate_terminal_exec(*, cwd: str, command: str, reason: str) -> None:
    """Validate one requested terminal execution before approval/run."""
    if not cwd.strip():
        raise ToolExecutionError("cwd is required")
    if not command.strip():
        raise ToolExecutionError("command is required")
    if not reason.strip():
        raise ToolExecutionError("reason is required")

    expanded_cwd = Path(cwd).expanduser()
    if not expanded_cwd.exists() or not expanded_cwd.is_dir():
        raise ToolExecutionError(f"cwd does not exist or is not a directory: {cwd}")

    for pattern, message in DANGEROUS_COMMAND_PATTERNS:
        if pattern.search(command):
            raise ToolExecutionError(message)


def execute_terminal_command(
    *,
    cwd: str,
    command: str,
    reason: str,
    timeout_seconds: int = 60,
) -> TerminalExecutionResult:
    """Run an explicitly approved terminal command and capture output."""
    validate_terminal_exec(cwd=cwd, command=command, reason=reason)
    expanded_cwd = Path(cwd).expanduser()

    try:
        completed = subprocess.run(
            command,
            cwd=expanded_cwd,
            shell=True,
            text=True,
            capture_output=True,
            timeout=timeout_seconds,
            check=False,
        )
    except subprocess.TimeoutExpired as error:
        stdout = error.stdout if isinstance(error.stdout, str) else ""
        stderr = error.stderr if isinstance(error.stderr, str) else ""
        timeout_message = f"Command timed out after {timeout_seconds} seconds."
        stderr = f"{stderr}\n{timeout_message}".strip()
        return TerminalExecutionResult(
            cwd=str(expanded_cwd),
            command=command,
            reason=reason,
            exit_code=124,
            stdout=stdout,
            stderr=stderr,
        )

    return TerminalExecutionResult(
        cwd=str(expanded_cwd),
        command=command,
        reason=reason,
        exit_code=completed.returncode,
        stdout=completed.stdout,
        stderr=completed.stderr,
    )


async def stream_terminal_command(
    *,
    cwd: str,
    command: str,
    timeout_seconds: int = 120,
) -> AsyncGenerator[dict[str, object], None]:
    """Async generator yielding event dicts from a running command.

    Event shapes:
      {'type': 'stdout', 'chunk': str}
      {'type': 'stderr', 'chunk': str}
      {'type': 'exit',   'code': int, 'stdout': str, 'stderr': str}
    """
    expanded_cwd = Path(cwd).expanduser()
    process = await asyncio.create_subprocess_shell(
        command,
        cwd=str(expanded_cwd),
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )

    queue: asyncio.Queue[tuple[str, str | None]] = asyncio.Queue()
    stdout_buf: list[str] = []
    stderr_buf: list[str] = []

    async def drain(
        stream: asyncio.StreamReader,
        tag: str,
        buf: list[str],
    ) -> None:
        async for raw in stream:
            chunk = raw.decode("utf-8", errors="replace")
            buf.append(chunk)
            await queue.put((tag, chunk))
        await queue.put((f"_done_{tag}", None))

    tasks = [
        asyncio.create_task(drain(process.stdout, "stdout", stdout_buf)),
        asyncio.create_task(drain(process.stderr, "stderr", stderr_buf)),
    ]

    timed_out = False
    done = 0
    deadline = asyncio.get_event_loop().time() + timeout_seconds
    while done < 2:
        remaining = deadline - asyncio.get_event_loop().time()
        if remaining <= 0:
            timed_out = True
            break
        try:
            tag, chunk = await asyncio.wait_for(queue.get(), timeout=min(remaining, 5.0))
        except asyncio.TimeoutError:
            continue
        if tag.startswith("_done_"):
            done += 1
        else:
            yield {"type": tag, "chunk": chunk}

    if timed_out:
        process.kill()
        for task in tasks:
            task.cancel()
        stderr_buf.append(f"\nCommand timed out after {timeout_seconds}s.\n")
        yield {"type": "stderr", "chunk": f"\nCommand timed out after {timeout_seconds}s.\n"}
    else:
        await asyncio.gather(*tasks, return_exceptions=True)

    exit_code = await process.wait()
    yield {
        "type": "exit",
        "code": exit_code,
        "stdout": "".join(stdout_buf),
        "stderr": "".join(stderr_buf),
    }


def format_terminal_result_markdown(
    *,
    source_message_id: str,
    result: TerminalExecutionResult,
) -> str:
    """Render a terminal execution result as a durable tool message."""
    stdout = result.stdout.rstrip() or "(no stdout)"
    stderr = result.stderr.rstrip() or "(no stderr)"
    cwd_block = fenced_block("text", result.cwd)
    command_block = fenced_block("bash", result.command)
    stdout_block = fenced_block("text", stdout)
    stderr_block = fenced_block("text", stderr)
    return f"""Context Forge executed a requested terminal command.

Requesting message: `{source_message_id}`
Reason: {result.reason}

Working directory:
{cwd_block}

Command:
{command_block}

Exit code: `{result.exit_code}`

Stdout:
{stdout_block}

Stderr:
{stderr_block}"""


def fenced_block(language: str, content: str) -> str:
    """Return a Markdown fence that cannot be closed by the content."""
    longest_run = max((len(match.group(0)) for match in re.finditer(r"`+", content)), default=0)
    fence = "`" * max(3, longest_run + 1)
    return f"{fence}{language}\n{content}\n{fence}"
