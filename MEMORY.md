# MEMORY.md

## Current state
The project is in product-definition and scaffolding mode. The old
Claude-specific display-panel plan has been retired in favor of a broader
`agent-display` direction.

## Active documents
- `specs/product-spec.md` — master product spec covering the overall product and
  phase roadmap
- `project-memory/phase-roadmap.md` — concise map of what each phase proves
- `project-memory/phase-1-mvp.md` — current near-term scope
- `project-memory/storage-model.md` — canonical conversation structure and file
  layout
- `project-memory/decisions.md` — durable accepted product decisions

## Working assumptions
- Single-user local app
- Canonical conversation data is file-first and app-written
- Messages live as individual Markdown files with frontmatter
- Conversations can mix coding, math, and general discussion
- Agents share context by reading exports, then sending new content back through
  the app

## Next planning step
Use the product spec and phase 1 mini-goal doc to scaffold the initial
implementation plan and decide the first code slice to build.

## Session logs
- `memory/2026-04-03.md` — original Claude-only project inception
- `memory/2026-04-17.md` — product reset toward `agent-display`
