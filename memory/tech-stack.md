---
name: Tech stack decisions
description: Why we chose FastAPI, MCP, and MathJax for v1
type: project
---

**FastAPI over Node.js** — user is more comfortable with Python; backend logic
is trivial (proxy + WebSockets + serve static files) so no meaningful advantage
to Node for v1. Node remains an option for v2 if the frontend grows into a full
SPA with CodeMirror 6.

**Why:** switching to Node later is low-cost (~100 lines of backend rewrite,
frontend stays identical).

**MCP over curl/HTTP** — user wants seamless, automatic pushing of every
message without manual triggers. MCP registers `push_message` as a native
Claude Code tool, allowing CLAUDE.md to instruct automatic calls.

**Why:** curl would require Claude to remember to push; MCP makes it part of
Claude's default behavior.

**MathJax 3 over KaTeX** — more complete LaTeX support. KaTeX misses commands
common in differential equations coursework (e.g. some environments,
`\boldsymbol`). MathJax 3 is fast enough for this use case.

**Port: 5050** — chosen to avoid common conflicts (3000, 8080, 8000, etc.).

**Nix flake over requirements.txt** — user is on NixOS; pip without a venv is
painful on NixOS. All required packages (`mcp` 1.15.0, `fastapi`, `uvicorn`,
`httpx`, `websockets`) confirmed present in nixpkgs unstable. Follows same
pattern as school/scientific_computing flake.
