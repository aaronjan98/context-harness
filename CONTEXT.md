# claude-display

A local display panel for Claude Code conversations. Claude Code pushes every
message to a FastAPI server via an MCP tool. The browser renders the full
conversation as a chat thread with proper LaTeX and syntax-highlighted code.

## Status
- [ ] v1: Read-only display panel (in progress)

## Architecture

```
Claude Code (CLI)
    └── MCP tool: push_message(role, content)
            └── POST → FastAPI server (localhost:8080)
                    └── WebSocket broadcast → Browser
```

## File Structure

```
claude-display/
├── CONTEXT.md
├── specs/
│   └── v1-display-panel.md
├── memory/
│   ├── MEMORY.md
│   └── YYYY-MM-DD.md
├── notes/
├── server/
│   ├── main.py         — FastAPI app
│   └── mcp_server.py   — MCP server
└── static/
    ├── index.html
    ├── app.js
    └── style.css
```

## Environment

Managed via Nix flake. Enter the dev shell before running anything:

```bash
nix develop
```

Packages provided: `python312`, `fastapi`, `uvicorn`, `httpx`, `mcp`, `websockets`

## Running

```bash
uvicorn server.main:app --port 5050 --reload
python server/mcp_server.py
```

Browser: http://localhost:5050

## MCP Configuration (one-time setup)

See `notes/mcp-setup.md` for:
- How to register the MCP server in `~/.claude/settings.json`
- What to add to `~/.claude/CLAUDE.md` to auto-push every message

## Working Instructions
- Spec lives in specs/v1-display-panel.md — consult before making changes
- Log each session in memory/YYYY-MM-DD.md
- Durable decisions (tech choices, architecture changes) go in memory/MEMORY.md
