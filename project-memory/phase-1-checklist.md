# Phase 1 Checklist

## Purpose
Concrete sub-tasks for the current implementation phase. This is the tactical
checklist under `project-memory/phase-1-mvp.md`.

## Checklist
- [x] Scaffold backend package and storage boundary
- [x] Set the default conversation store location to `~/Repositories/conversations`
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
- [ ] Align frontend/backend API contract
- [ ] Regenerate frontend OpenAPI types from the backend
- [ ] Add/update backend tests for the Phase 1 API contract
- [ ] Wire frontend API calls to the aligned backend contract
- [ ] Verify minimal browser UI shell against the real backend
- [ ] Verify text input submission flow against the real backend
- [ ] Add basic Markdown import with light speaker-pattern matching

## Current checkpoint
The backend can now append canonical message nodes, read the active thread, and
regenerate the current Markdown export. Initial unit and API integration tests
now cover this behavior.

The frontend scaffold exists. Its API layer now uses the backend `/api`
namespace, but the full Phase 1 API contract is not complete yet. The next
checkpoint is to add the missing backend/frontend contract pieces before adding
more UI behavior.

Phase 1 should keep local capability work out of scope beyond preserving the
backend as the only authority that will eventually mediate configured files,
skills, directories, imports, exports, and approved tool actions.
