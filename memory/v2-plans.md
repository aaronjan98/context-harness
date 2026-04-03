---
name: v2 and beyond — planned future directions
description: Specific technology recommendations for future versions of claude-display
type: project
---

## v2 — Shared Conversation (CLI + Browser)

Full two-way chat: both Claude Code CLI and the browser talk to the same local
server, which maintains a shared conversation history.

**Missing from v1 that v2 needs:**
- Chat input in the browser
- Persistent conversation state (SQLite recommended)
- Claude API key stored in server `.env`

## v3 — Full Frontend (Dev Container)

A rich browser interface with vim-like input and latex-suite shortcuts for
typing math equations. Use a **dev container** (`.devcontainer/`) for this
version rather than extending the Nix flake.

**Why dev container for v3:**
- Heavy npm dependency tree (Vite, CodeMirror 6, plugins) is painful to
  Nix-ify and not worth the maintenance burden for a personal tool
- Dev containers give a clean, reproducible Node.js environment without
  fighting nixpkgs packaging lag
- Docker is available on the NixOS host; dev containers work alongside flakes

**Specific tech for v3 frontend:**
- **CodeMirror 6** — vim mode built-in, fully extensible keymap
- **latex-suite shortcuts** — implement as custom CodeMirror keymap
  (e.g. `ff` → `\frac{}{}`, `__` → `_{}`, `^^` → `^{}`)
- **Vite** — frontend build tool
- Backend can stay FastAPI (Python) or be rewritten in Node/Express

**Dev container setup for v3:**
- Add `.devcontainer/devcontainer.json` pointing to a Node.js base image
- Keep `flake.nix` for the Python backend dev shell
- Frontend dev happens inside the container; backend dev in `nix develop`
