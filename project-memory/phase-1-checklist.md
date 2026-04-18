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
- [ ] Add minimal browser UI shell
- [ ] Add text input submission flow
- [ ] Add basic Markdown import with light speaker-pattern matching

## Current checkpoint
The backend can now append canonical message nodes, read the active thread, and
regenerate the current Markdown export. Initial unit and API integration tests
now cover this behavior. The next backend task is Markdown import work; the next
overall product task is the UI shell, which will be handled separately.
