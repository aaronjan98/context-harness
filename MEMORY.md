# MEMORY.md

## Current state
The project is in early implementation, not just planning. The old
Claude-specific display-panel plan has been retired in favor of a broader
Context Forge direction. Context Forge is a local conversation/context harness:
a local backend with a browser UI, not a hosted web app. The backend
conversation foundation is now in place and tested.

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
- frontend architecture plan (all checkpoints agreed with user)
- frontend scaffold: config files, all feature stubs, API layer, store, shared
  components (see project-memory/frontend-architecture.md)
- aligned Phase 1 frontend/backend API contract with generated OpenAPI types
- frontend production build passes
- live browser/backend lifecycle verified: empty state, explicit create,
  message submit, auto-title refresh, rename, delete, stale-route recovery, and
  Documents-backed storage
- backend Markdown import implemented for heading-based transcripts,
  `Speaker:` transcripts, and paragraph fallback

Current focus:
- decide whether the next Phase 1 checkpoint is a small import UI or a mock
  assistant adapter boundary
- keep canonical conversation storage under
  `~/Documents/context-harness/conversations`
- backend robustness to support the live frontend

Explicit boundary:
- backend changes must preserve future support for branching, graph view, and
  multi-agent workflows
- browser UI must not receive raw filesystem or shell authority; future local
  capabilities are mediated by backend APIs
- frontend feature slice discipline: features must not import from each other

## Working assumptions
- Single-user local app
- Canonical conversation data is file-first and app-written
- Messages live as individual Markdown files with frontmatter
- Canonical conversation files live under
  `~/Documents/context-harness/conversations`, not under `~/Repositories`
- Conversations can mix coding, math, and general discussion
- Agents share context by reading exports, then sending new content back through
  the app
- Local files, directories, skills, imports/exports, and future tool actions are
  configured backend capabilities, not browser powers

## Next steps
- Verify Markdown import against a real copied transcript.
- Choose the next checkpoint: a small browser import surface, or a mock
  assistant adapter that proves the in-app AI reply loop.

## Active documents
- `project-memory/frontend-architecture.md` — canonical frontend reference for
  any agent; covers stack, routing, layout, state layers, API client, editor
  abstraction, graph readiness, and future considerations

## Session logs
- `memory/2026-04-03.md` — original Claude-only project inception
- `memory/2026-04-17.md` — product reset toward `agent-display`
- `memory/2026-04-18.md` — backend foundation, testing, and current checkpoint
- `memory/2026-04-18b.md` — frontend architecture planning and scaffold
