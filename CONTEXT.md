# Context Forge

## Project
Single-user local conversation/context harness for AI agents and chats.

## Purpose
Context Forge is a file-first app for reading, writing, and reshaping AI
conversations across multiple models and tools. The repository is named
`context-harness`; Context Forge is the product name.

The core product is not a Claude-specific viewer. The core product is a
canonical conversation store that:

- keeps the conversation as the source of truth
- lets different agents continue the same thread
- supports clean Markdown export/import
- is designed for later branching, forking, graph view, and math-native input

## Current state
- Product definition is locked in at a high level
- Backend conversation foundation is implemented and tested
- Frontend scaffold is in place: React + Vite + TypeScript, API-backed sidebar
  and thread lifecycle controls are implemented and verified
- Phase 1 Markdown import backend/API is implemented; browser import UX and
  first assistant adapter boundary are not yet implemented

## Working model
- One conversation folder is the durable unit
- A conversation may contain mixed coding, math, and general discussion
- The app is the canonical writer of conversation data
- Other agents/tools may read exported thread context
- Branching and graph features are future phases, not v1

## Current priorities
- Keep backend behavior robust while preserving future branch/graph expansion
- Verify Markdown import against real copied transcripts
- Decide whether the next checkpoint is browser import UX or a mock assistant
  adapter boundary
- Keep the default canonical conversation store under
  `~/Documents/context-harness/conversations`
- Keep `MEMORY.md` and `project-memory/` current so future agents know the
  active phase and exact checkpoint
- Do not touch the UI unless the user explicitly asks; the user is building it

## Key files
- `MEMORY.md` — current project state and active planning pointers
- `specs/product-spec.md` — product-level spec across phases
- `project-memory/phase-roadmap.md` — phase-by-phase product direction
- `project-memory/phase-1-mvp.md` — current phase goal and scope
- `project-memory/phase-1-checklist.md` — exact implementation checkpoint
- `project-memory/storage-model.md` — canonical conversation file model
- `project-memory/decisions.md` — durable accepted product decisions
- `project-memory/frontend-architecture.md` — canonical frontend reference
- `project-memory/learned-lessons.md` — first-person project lessons suitable
  for interview/project explanations
- `project-memory/snippet-strategy.md` — cross-editor snippet system plan (Neovim, Obsidian, VSCodium, Context Forge)
- `memory/YYYY-MM-DD.md` — session logs

## Backend status
Implemented and tested:
- FastAPI app factory with injectable conversation store
- Canonical conversation folder creation in
  `~/Documents/context-harness/conversations`
- Conversation metadata persistence
- Canonical message append/write/read path
- Active-thread reconstruction from message parent links
- `exports/current.md` regeneration after writes
- Phase 1 API contract for list/create/get/rename/delete/thread/append
- Markdown import API for heading-based transcripts, `Speaker:` transcripts,
  and paragraph fallback
- Browser lifecycle verified against the real backend: empty state, explicit
  create, message submit, auto-title refresh, rename, delete, stale-route
  recovery, and Documents-backed storage
- Generated frontend OpenAPI TypeScript schema
- Backend unit tests and API integration tests

Still pending for Phase 1:
- Browser UX for importing pasted/copied Markdown transcripts
- First assistant adapter boundary, likely mock/local before provider-specific
  integration
- Any additional robustness improvements needed to support the user-built UI

## Environment
Managed with Nix flake:

```bash
nix develop
```

## Notes
- Product name: Context Forge
- Repo/category name: `context-harness`
- Do not revive Claude-specific MCP assumptions unless the spec explicitly calls
  for an adapter
- The backend is the current focus area for agents unless the user says otherwise
