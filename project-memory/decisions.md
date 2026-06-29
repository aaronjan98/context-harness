# Durable Decisions

## Product shape
- The product is a local conversation workspace, not a Claude-specific display
  panel
- `Context Forge` is the product name
- `context-harness` is the repository/category name
- The conversation is the source of truth; the UI is a control surface over it
- The app is a local harness with a browser UI, not a hosted web app

## User model
- v1 is single-user
- A conversation may mix coding, math, and general discussion freely
- Conversations are not required to be linked to a repo or project

## Storage
- Canonical conversation data is file-first
- The app is the canonical writer of conversation files
- Canonical messages are individual Markdown files with YAML frontmatter
- The app reconstructs thread structure from message metadata
- Exports are public read surfaces, not the source of truth

## Agent participation
- External agents/tools may read exported conversation context
- External agents/tools should not directly write canonical message files
- The default context sent to an agent is the entire active thread
- Multi-agent replies remain in one visible linear thread by default

## Local capabilities
- Local file, directory, skill, import/export, and future shell/tool access is
  mediated by the backend
- The browser UI never receives raw filesystem or shell authority
- Capabilities must be explicitly configured so the app can be portable beyond
  AJ's NixOS machine
- Phase 1 does not implement arbitrary tool execution

## Import and export
- Markdown import should do light pattern matching for speaker turns
- Imported Markdown becomes a simple linear conversation
- Canonical message bodies may contain wiki-links like `[[note]]`
- v1 export keeps wiki-links simple; bundling linked files is deferred

## Editing
- Primary manipulation happens in the GUI, not by hand-editing canonical files
- GUI edits replace messages in place from the user's point of view
- The app should keep rollback history/snapshots for recovery

## Roadmap
- Graph view comes after forking work and after Vim/math-editor work
- Forking/branching is a future phase, not a v1 requirement
- Context lenses come with graph/navigation work, after the basic conversation
  and editing model is reliable
- Agent/web-chatbot bridging and controlled tool actions are Phase 5 concerns,
  not Phase 1 concerns

## Frontend architecture
- Framework: React 18 + Vite + TypeScript (not Next.js — SSR has no value for
  a local single-user SPA with a FastAPI backend)
- Routing: TanStack Router v1 with code-based route tree and Zod search param
  validation
- State: TanStack Query for server state, Zustand for ephemeral UI state, URL
  for navigation state — never duplicate state across layers
- Layout: react-resizable-panels, three-column push layout (sidebar | thread |
  graph panel), all edges drag-resizable, side panels collapsible
- Graph panel: opened via `?panel=graph` search param on conversation route,
  not a separate route — push behavior, not overlay
- API types: openapi-typescript generates src/api/schema.ts from FastAPI's
  /openapi.json — never hand-edit schema.ts, regenerate on backend changes
- Editor: stable EditorProps interface; Phase 1 = SimpleEditor (textarea,
  Ctrl+Enter), Phase 2 = RichEditor (CodeMirror + vim + KaTeX); swap is one
  line in features/editor/index.ts
- KaTeX display rendering wired in Phase 1 (message bubbles); input-side LaTeX
  preview deferred to Phase 2
- Graph transforms.ts written in Phase 1 as a pure function (Message[] →
  nodes + edges); React Flow canvas filled in Phase 4
- Real-time transport stub (realtime.ts) wired in providers now, implemented
  in Phase 5 with SSE/WebSocket → queryClient.invalidateQueries
