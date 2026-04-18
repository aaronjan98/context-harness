# MEMORY.md

## Current state
The project is in early implementation, not just planning. The old
Claude-specific display-panel plan has been retired in favor of a broader
`agent-display` direction, and the backend conversation foundation is now in
place and tested.

## Active documents
- `specs/product-spec.md` — master product spec covering the overall product and
  phase roadmap
- `project-memory/phase-roadmap.md` — concise map of what each phase proves
- `project-memory/phase-1-mvp.md` — current near-term scope
- `project-memory/phase-1-checklist.md` — concrete implementation checklist for
  the current phase
- `project-memory/storage-model.md` — canonical conversation structure and file
  layout
- `project-memory/decisions.md` — durable accepted product decisions

## Current checkpoint
Completed:
- product spec and phase roadmap
- canonical storage model
- backend conversation create/load/append/thread/export flow
- initial backend unit and API integration tests

Current focus:
- backend robustness
- remaining Phase 1 backend feature: Markdown import
- keeping agent-facing docs accurate while the user builds the UI separately

Explicit boundary:
- do not work on the UI unless the user asks
- backend changes should preserve future support for branching, graph view, and
  multi-agent workflows

## Working assumptions
- Single-user local app
- Canonical conversation data is file-first and app-written
- Messages live as individual Markdown files with frontmatter
- Conversations can mix coding, math, and general discussion
- Agents share context by reading exports, then sending new content back through
  the app

## Next backend step
Implement Markdown import with light speaker-pattern matching and keep the
existing storage/API behavior tested as the backend grows.

## Session logs
- `memory/2026-04-03.md` — original Claude-only project inception
- `memory/2026-04-17.md` — product reset toward `agent-display`
- `memory/2026-04-18.md` — backend foundation, testing, and current checkpoint
