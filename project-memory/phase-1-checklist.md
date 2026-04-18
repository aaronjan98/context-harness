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
- [ ] Add message file write path
- [ ] Add active-thread read path
- [ ] Regenerate `exports/current.md` after writes
- [ ] Add minimal browser UI shell
- [ ] Add text input submission flow
- [ ] Add basic Markdown import with light speaker-pattern matching

## Current checkpoint
The backend can initialize and summarize a conversation, but it cannot yet read
or write actual message nodes.
