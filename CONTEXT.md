# agent-display

## Project
Single-user local conversation workspace for AI agents and chats.

## Purpose
`agent-display` is a file-first app for reading, writing, and reshaping AI
conversations across multiple models and tools.

The core product is not a Claude-specific viewer. The core product is a
canonical conversation store that:

- keeps the conversation as the source of truth
- lets different agents continue the same thread
- supports clean Markdown export/import
- is designed for later branching, forking, graph view, and math-native input

## Current state
- Planning and spec stage
- No implementation yet beyond the original scaffold
- Product direction has shifted away from the old Claude-only display panel

## Working model
- One `conversation/` folder is the durable unit
- A conversation may contain mixed coding, math, and general discussion
- The app is the canonical writer of conversation data
- Other agents/tools may read exported thread context
- Branching and graph features are future phases, not v1

## Current priorities
- Lock the product definition
- Define the storage model and import/export behavior
- Break the work into explicit phases with mini-goals in `project-memory/`
- Keep `MEMORY.md` current so future agents know which planning docs are active

## Key files
- `MEMORY.md` — current project state and active planning pointers
- `specs/product-spec.md` — product-level spec across phases
- `project-memory/` — durable mini-goals, roadmap, and design decisions
- `memory/YYYY-MM-DD.md` — session logs

## Environment
Managed with Nix flake:

```bash
nix develop
```

## Notes
- The repo directory and product are both named `agent-display`
- Do not revive Claude-specific MCP assumptions unless the spec explicitly calls
  for an adapter
