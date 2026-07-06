"""Approved local tool execution for Context Forge."""

from __future__ import annotations

import asyncio
from collections.abc import AsyncGenerator
from dataclasses import dataclass
from enum import Enum
from pathlib import Path
import re
import shlex
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
_M = re.MULTILINE  # shorthand — all (^|...) patterns need this so ^ matches inside heredocs

CONFIRM_PATTERNS: tuple[tuple[re.Pattern[str], str], ...] = (
    (re.compile(r"(^|[;&|`]\s*)sudo(\s|$)", _M), "sudo requires password and approval"),
    (re.compile(r"(^|[;&|`]\s*)rm\s+", _M), "file deletion requires approval"),
    (re.compile(r"(^|[;&|`]\s*)rmdir\b", _M), "directory removal requires approval"),
    (re.compile(r"(^|[;&|`]\s*)mv\s+", _M), "file move requires approval"),
    (re.compile(r"(^|[;&|`]\s*)cp\s+", _M), "file copy requires approval"),
    (re.compile(r"(^|[;&|`]\s*)(?:touch|mkdir|ln)\s+", _M), "file creation requires approval"),
    (re.compile(r"(^|[;&|`]\s*)(?:chmod|chown)\b", _M), "permission change requires approval"),
    (re.compile(r"(?<!\S)>(?![>=])(?!\s*(?:/tmp/|/dev/null\b))"), "output redirection (overwrite) requires approval"),
    (re.compile(r"(^|[;&|`]\s*)tee\b(?!.*(?:--append|-a)\b)", _M), "tee without append requires approval"),
    (re.compile(r"\bgit\s+(?:commit|push|checkout|switch|merge|rebase|cherry-pick|stash\s+pop|branch\s+-[dD]|tag\s+-d)\b"), "git write operation requires approval"),
    (re.compile(r"\bgit\s+add\b"), "git add requires approval"),
    (re.compile(r"\b(?:pip|pip3|uv)\s+(?:install|uninstall|upgrade)\b"), "package install requires approval"),
    (re.compile(r"\b(?:npm|yarn|pnpm)\s+(?:install|uninstall|remove|update|ci)\b"), "package install requires approval"),
    (re.compile(r"(^|[;&|`]\s*)(?:apt|apt-get|dnf|yum|brew|nix-env|nix\s+profile)\s+", _M), "system package operation requires approval"),
    (re.compile(r"\b(?:kill|pkill|killall)\b"), "process termination requires approval"),
    (re.compile(r"\bdocker\s+(?:run|stop|start|rm|rmi|kill|compose\s+(?:up|down|rm))\b"), "docker mutation requires approval"),
    (re.compile(r"\bsystemctl\s+(?:start|stop|restart|enable|disable|daemon-reload|mask|unmask)\b"), "systemctl write operation requires approval"),
    (re.compile(r"\b(?:curl|wget)\s+.*(?:-o\s+|-O\b|--output\b)"), "download-to-file requires approval"),
    (re.compile(r"\bscp\b(?!.*\s+\S+:/tmp/)"), "scp requires approval"),
    (re.compile(r"\brsync\b"), "rsync requires approval"),
    (re.compile(r"\bdd\b"), "dd requires approval"),
)

DANGEROUS_COMMAND_PATTERNS: tuple[tuple[re.Pattern[str], str], ...] = (
    (
        re.compile(r"(^|[;&|]\s*)rm\s+-[^\n;&|]*[rR][^\n;&|]*[fF]?", _M),
        "recursive remove commands must be run manually",
    ),
    (
        re.compile(r"\bgit\s+reset\s+--hard\b"),
        "hard git resets must be run manually",
    ),
    (re.compile(r"\bmkfs(?:\.\w+)?\b"), "filesystem formatting is blocked"),
    (re.compile(r"\b(shutdown|reboot|poweroff)\b"), "power commands are blocked"),
)


# SSH flags that consume the next token as their argument (single-char flags only)
_SSH_ARG_FLAGS = frozenset("bcDEeFIiJLlmopQRSWw")
_SSH_RE = re.compile(r"(^|[;&|`]\s*)ssh\b")


def _parse_ssh_remote(command: str) -> str | None:
    """Extract the remote command from a `ssh [flags] host cmd` invocation."""
    try:
        tokens = shlex.split(command)
        if not tokens or tokens[0] != "ssh":
            return None
        i = 1
        while i < len(tokens):
            tok = tokens[i]
            if tok == "--":
                i += 1
                break
            if tok.startswith("-") and len(tok) > 1:
                if tok[1] in _SSH_ARG_FLAGS and len(tok) == 2:
                    i += 2
                else:
                    i += 1
            else:
                i += 1  # skip hostname
                break
        if i >= len(tokens):
            return None
        remote = tokens[i:]
        return remote[0] if len(remote) == 1 else " ".join(remote)
    except ValueError:
        pass

    # Fallback for complex shell quoting shlex can't tokenise: strip
    # 'ssh [flags] host' from the raw string and return the rest.
    rest = re.sub(r"^ssh\s+", "", command.strip())
    while rest.startswith("-"):
        m = re.match(r"(-\S+)\s*", rest)
        if not m:
            break
        flag, rest = m.group(1), rest[m.end():]
        if len(flag) == 2 and flag[1] in _SSH_ARG_FLAGS:
            m2 = re.match(r"\S+\s*", rest)
            if m2:
                rest = rest[m2.end():]
    m = re.match(r"\S+\s*(.*)", rest, re.DOTALL)
    if not m or not m.group(1).strip():
        return None
    return m.group(1).strip()


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

    # SSH is a transport layer — classify by what it actually runs remotely.
    # For compound commands, split on shell operators and classify each segment.
    if _SSH_RE.search(command):
        segments = re.split(r"&&|(?<![;&|])[;&|](?![;&|])", command)
        worst_tier = CommandTier.SAFE
        worst_reason = "read-only command"
        for seg in segments:
            seg = seg.strip()
            if not seg:
                continue
            if seg.startswith("ssh"):
                remote = _parse_ssh_remote(seg)
                if remote:
                    t, r = classify_command(remote)
                    seg_tier, seg_reason = t, f"(via ssh) {r}"
                else:
                    seg_tier, seg_reason = CommandTier.CONFIRM, "SSH command requires approval"
            else:
                seg_tier, seg_reason = classify_command(seg)
            if list(CommandTier).index(seg_tier) > list(CommandTier).index(worst_tier):
                worst_tier = seg_tier
                worst_reason = seg_reason
            if worst_tier == CommandTier.BLOCKED:
                break
        return worst_tier, worst_reason

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


def _apply_sudo_password(command: str, sudo_password: str) -> tuple[str, str | None]:
    """Return (modified_command, stdin_input) with sudo -S substituted in."""
    modified = re.sub(r'\bsudo\b', 'sudo -S -p ""', command)
    stdin_input = (sudo_password + '\n') * 20
    return modified, stdin_input


def execute_terminal_command(
    *,
    cwd: str,
    command: str,
    reason: str,
    timeout_seconds: int = 60,
    sudo_password: str | None = None,
) -> TerminalExecutionResult:
    """Run an explicitly approved terminal command and capture output."""
    validate_terminal_exec(cwd=cwd, command=command, reason=reason)
    expanded_cwd = Path(cwd).expanduser()

    stdin_input: str | None = None
    if sudo_password and re.search(r'\bsudo\b', command):
        command, stdin_input = _apply_sudo_password(command, sudo_password)

    try:
        completed = subprocess.run(
            command,
            cwd=expanded_cwd,
            shell=True,
            text=True,
            capture_output=True,
            timeout=timeout_seconds,
            check=False,
            input=stdin_input,
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
    sudo_password: str | None = None,
) -> AsyncGenerator[dict[str, object], None]:
    """Async generator yielding event dicts from a running command.

    Event shapes:
      {'type': 'stdout', 'chunk': str}
      {'type': 'stderr', 'chunk': str}
      {'type': 'exit',   'code': int, 'stdout': str, 'stderr': str}
    """
    expanded_cwd = Path(cwd).expanduser()

    stdin_bytes: bytes | None = None
    if sudo_password and re.search(r'\bsudo\b', command):
        command, stdin_str = _apply_sudo_password(command, sudo_password)
        stdin_bytes = stdin_str.encode()

    process = await asyncio.create_subprocess_shell(
        command,
        cwd=str(expanded_cwd),
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
        stdin=asyncio.subprocess.PIPE if stdin_bytes else None,
    )

    if stdin_bytes and process.stdin:
        process.stdin.write(stdin_bytes)
        await process.stdin.drain()
        process.stdin.close()

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
        try:
            process.kill()
        except ProcessLookupError:
            pass
        for task in tasks:
            task.cancel()
        stderr_buf.append(f"\nCommand timed out after {timeout_seconds}s.\n")
        yield {"type": "stderr", "chunk": f"\nCommand timed out after {timeout_seconds}s.\n"}
    else:
        await asyncio.gather(*tasks, return_exceptions=True)

    # After kill, SSH subprocesses may keep the local client alive waiting for the
    # remote to close. Cap the wait so the stream always terminates promptly.
    try:
        exit_code = await asyncio.wait_for(process.wait(), timeout=5.0)
    except asyncio.TimeoutError:
        try:
            process.kill()
        except ProcessLookupError:
            pass
        exit_code = -1

    yield {
        "type": "exit",
        "code": exit_code,
        "stdout": "".join(stdout_buf),
        "stderr": "".join(stderr_buf),
    }


STDOUT_INLINE_LIMIT = 10_000
_HEAD_CHARS = 3_000
_TAIL_CHARS = 1_000


def format_terminal_result_markdown(
    *,
    source_message_id: str,
    result: TerminalExecutionResult,
    log_dir: Path | None = None,
) -> str:
    """Render a terminal execution result as a durable tool message.

    When stdout exceeds STDOUT_INLINE_LIMIT and log_dir is provided, the full
    output is written to a log file and only a head+tail preview is inlined.
    """
    stdout_raw = result.stdout.rstrip() or "(no stdout)"
    stderr = result.stderr.rstrip() or "(no stderr)"

    stdout_log_note = ""
    if log_dir is not None and len(stdout_raw) > STDOUT_INLINE_LIMIT:
        log_dir.mkdir(parents=True, exist_ok=True)
        log_path = log_dir / f"{source_message_id}-stdout.log"
        log_path.write_text(stdout_raw, encoding="utf-8")
        omitted = len(stdout_raw) - (_HEAD_CHARS + _TAIL_CHARS)
        stdout_display = (
            f"{stdout_raw[:_HEAD_CHARS]}\n\n"
            f"[... {omitted:,} characters omitted — full output at {log_path} ...]\n\n"
            f"{stdout_raw[-_TAIL_CHARS:]}"
        )
        stdout_log_note = f" (truncated — full output at `{log_path}`)"
    else:
        stdout_display = stdout_raw

    cwd_block = fenced_block("text", result.cwd)
    command_block = fenced_block("bash", result.command)
    stdout_block = fenced_block("text", stdout_display)
    stderr_block = fenced_block("text", stderr)
    return f"""Context Forge executed a requested terminal command.

Requesting message: `{source_message_id}`
Reason: {result.reason}

Working directory:
{cwd_block}

Command:
{command_block}

Exit code: `{result.exit_code}`

Stdout:{stdout_log_note}
{stdout_block}

Stderr:
{stderr_block}"""


def fenced_block(language: str, content: str) -> str:
    """Return a Markdown fence that cannot be closed by the content."""
    longest_run = max((len(match.group(0)) for match in re.finditer(r"`+", content)), default=0)
    fence = "`" * max(3, longest_run + 1)
    return f"{fence}{language}\n{content}\n{fence}"
