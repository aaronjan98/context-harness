# 2026-07-03 — SSE Streaming & Tool Card UX

## What was worked on

Continued building out the Context Forge tool execution flow while using it live
for a TAA Navidrome/Lidarr workflow (Cult of Luna playlist creation). Several UX
issues surfaced through real use and were fixed in the same session.

## Changes made (commit 2d30b7c)

### SSE streaming for tool execution
- Replaced the blocking `subprocess.run` endpoint with a streaming `POST .../tool-executions/stream`
- Backend: `asyncio.create_subprocess_shell` with a queue-based stdout/stderr drain;
  yields event dicts `{type, chunk}` / `{type: exit, code, stdout, stderr}` / `{type: done}`
- Frontend: `streamToolExecution()` async generator using `fetch` + `ReadableStream` reader
- Tool card shows a live log panel (scrolling `<pre>`) with a spinner and elapsed-seconds counter while running
- On completion, thread queries are invalidated and a status banner shows exit code

### contextforge-tool fence detection fix
- Regex was `contextforge-tool\s*\n` — broke when chatbot emitted `contextforge-tool id="..."`
- Fixed to `contextforge-tool[^\n]*\n` to tolerate any extra attributes on the opening fence line

### Copy-for-chatbot button
- Auto-copy after Run was silently failing on Wayland (async context, no user gesture)
- Added ⎘ per-message copy button (hover-revealed, copies raw `msg.content`)
- Added "Copy for chatbot" button on tool result messages (`role=tool, agent=contextforge`)
  that parses command + stdout from the stored markdown and formats:
  `Command:\n```bash\n...\n```\nResult:\n```text\n...\n```\n` (+ Stderr section if non-empty, exit code if non-zero)
- `parseChatbotCopy()` uses dynamic-fence regex to match `format_terminal_result_markdown` output

### Configurable timeout
- `ToolExecutionRequest` gains `timeout_seconds: int = 300` (max 3600)
- Wired through both streaming and non-streaming endpoints
- Tool card edit view shows a numeric timeout input; read-only view shows `Ns`
- Chatbot JSON that omits `timeout_seconds` defaults to 300s in the parser
- Motivation: Navidrome full scan + SQLite over SSH was hitting the old 120s default

## Key decisions

- Kept the old non-streaming `POST .../tool-executions` endpoint intact for tests
- No auto-copy after Run — the "Copy for chatbot" button is the reliable path (user gesture)
- Python scripts via SSH will appear in one burst (block-buffered); user should add `python3 -u` if they want line-by-line streaming

## Open questions / next steps

- The chatbot's system prompt / tool protocol might be worth revisiting once the TAA
  Navidrome workflow is complete, so it generates better `timeout_seconds` values for
  long-running commands
- Consider whether to display stderr in a different color in the live stream log
- Lidarr integration for the Cult of Luna TAA playlist is still in progress
