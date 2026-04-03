# v1 — Read-Only Display Panel

## Overview

A local display panel for Claude Code conversations. Claude Code pushes every
message (both user and assistant) to a FastAPI server via an MCP tool. The
browser renders the full conversation as a chat thread with proper LaTeX and
syntax-highlighted code — making it easy to read math-heavy responses and copy
content cleanly.

This is a **read-only display panel**. There is no chat input in this version.

---

## Goals

- Render the full Claude Code conversation history in a clean chat UI
- Make LaTeX and code blocks readable and easy to copy
- Integrate seamlessly via MCP so pushing is automatic, not manual

---

## Architecture

```
Claude Code (CLI)
    └── MCP tool: push_message(role, content)
            └── POST → FastAPI server (localhost:5050)
                    └── WebSocket broadcast → Browser
                                └── Renders markdown + LaTeX + code
```

**Components:**
- `server/main.py` — FastAPI app: HTTP endpoint + WebSocket broadcaster
- `server/mcp_server.py` — MCP server exposing `push_message` tool
- `static/index.html` — Single-page chat UI
- `static/app.js` — WebSocket client, rendering logic
- `static/style.css` — Dark theme styles

---

## MCP Integration

An MCP server runs alongside the FastAPI server and exposes one tool:

```
push_message(role: str, content: str)
```

- `role`: `"user"` or `"assistant"`
- `content`: raw markdown string (may contain LaTeX and code blocks)

Claude Code is configured (via `~/.claude/settings.json`) to load this MCP
server at startup. A global instruction in `~/.claude/CLAUDE.md` tells Claude
to call `push_message` automatically at the end of every response and after
every user turn is received.

The MCP server forwards the message to the FastAPI server via internal HTTP,
which then broadcasts it to all connected browser clients over WebSocket.

---

## UI

### Layout
- Full-height dark theme single page
- Conversation thread centered on the page (max-width ~800px)
- Messages appear as chat blocks:
  - User messages: right-aligned, muted accent color
  - Assistant messages: left-aligned, dark card background

### Rendering
- Markdown rendered via **markdown-it**
- LaTeX rendered via **MathJax 3**
  - Inline math: `$...$`
  - Display math: `$$...$$`
- Code blocks syntax highlighted via **highlight.js**

### Copy Buttons
- Each code block: copy button at top-right corner (copies raw code)
- Each math display block: copy button at top-right corner (copies raw LaTeX source)
- Bottom of page: "Copy conversation" button (copies full conversation as plain markdown)

### Scrolling
- No auto-scroll
- Fixed "↓ Jump to bottom" button (bottom-right corner) that scrolls to latest message

### Theme
- Dark background (~`#1a1a1a`)
- One Dark syntax highlight theme
- Monospace font for code, sans-serif for prose

---

## API

### `POST /message`
Receives a message from the MCP server.

```json
{ "role": "user" | "assistant", "content": "raw markdown string" }
```

Appends to in-memory conversation history and broadcasts to all WebSocket clients.

### `GET /history`
Returns the full conversation history as a JSON array. Used by the browser on
initial page load to populate the thread before WebSocket takes over.

### `WS /ws`
WebSocket endpoint. Broadcasts new messages to all connected clients in real-time.

---

## Conversation State

Stored in-memory (Python list) for this version. Resets when the server
restarts. No persistence to disk in v1.

---

## Out of Scope (Future Versions)

- Chat input / sending messages from the browser
- Vim-like input with latex-suite shortcuts (CodeMirror 6)
- Persistent conversation history
- Claude API key in the server (browser-side chat without CLI)
- Node.js / full SPA rewrite
- Multiple conversation threads
