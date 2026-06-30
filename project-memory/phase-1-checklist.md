# Phase 1 Checklist

## Purpose
Concrete sub-tasks for the current implementation phase. This is the tactical
checklist under `project-memory/phase-1-mvp.md`.

## Checklist
- [x] Scaffold backend package and storage boundary
- [x] Set the default conversation store location to
      `~/Documents/context-harness/conversations`
- [x] Add initial backend scaffold documentation
- [x] Add conversation create/load API skeleton
- [x] Add proper YAML dependency in `flake.nix`
- [x] Replace temporary flat metadata parsing with proper YAML parsing
- [x] Add message file write path
- [x] Add active-thread read path
- [x] Regenerate `exports/current.md` after writes
- [x] Add initial backend unit and API integration tests
- [x] Add frontend architecture plan and React/Vite scaffold
- [x] Align frontend API calls with the backend `/api` namespace
- [x] Align frontend/backend API contract
- [x] Regenerate frontend OpenAPI types from the backend
- [x] Add/update backend tests for the Phase 1 API contract
- [x] Wire frontend API calls to the aligned backend contract
- [x] Verify frontend production build with generated API types
- [x] Verify minimal browser UI shell against the real backend
- [x] Verify text input submission flow against the real backend
- [x] Add conversation rename and delete lifecycle controls
- [x] Prevent implicit conversation creation on stale read routes
- [ ] Add basic Markdown import with light speaker-pattern matching

## Current checkpoint
The backend can now append canonical message nodes, read the active thread,
regenerate the current Markdown export, list conversations, rename
conversations, delete conversations, and expose typed response models through
OpenAPI. API integration tests cover the current Phase 1 contract.

The real browser/backend loop has been manually verified: empty state, explicit
conversation creation from the sidebar, message submission, sidebar auto-title
refresh, rename, delete, stale-route recovery, and storage under
`~/Documents/context-harness/conversations`.

The next checkpoint is basic Markdown import with light speaker-pattern
matching.

Phase 1 should keep local capability work out of scope beyond preserving the
backend as the only authority that will eventually mediate configured files,
skills, directories, imports, exports, and approved tool actions.
