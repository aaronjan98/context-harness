# Session Log - 2026-06-29 agent-cli-bridge

Time: 2026-06-29 08:03:00 PDT

## What was worked on
- Reopened the project after a break and reoriented around the current
  `agent-display` / Context Forge state.
- Confirmed the backend foundation exists and is tested, while the frontend is
  scaffolded but not yet integrated with the backend API contract.
- Clarified the product identity as Context Forge: a local
  conversation/context harness where "Context is everything."
- Renamed the public product direction from a display panel into a local app
  that owns durable conversation state, exports, future context lenses, and
  future mediated capabilities.
- Added the durable decision that agent integration should start with a CLI
  bridge before MCP or a full custom runtime.

## Key project state found
- Backend implemented:
  - FastAPI app factory and routes for conversation creation, loading, active
    thread reconstruction, and message append.
  - File-first `ConversationStore`.
  - Per-message Markdown files with YAML frontmatter.
  - `exports/current.md` regeneration after writes.
  - Backend unit and API integration tests.
- Frontend scaffold implemented:
  - React + Vite + TypeScript.
  - TanStack Router route tree.
  - TanStack Query provider.
  - Conversation sidebar, thread view, simple editor, graph placeholder, KaTeX
    message renderer, Zustand UI store, and API layer stubs.
- Important drift:
  - Backend routes currently live under `/api/...`.
  - Frontend API calls currently assume `/conversations...`.
  - Frontend generated OpenAPI schema is empty and API calls use `as never`.
  - Backend has no conversation list endpoint yet.
  - Backend append payload currently requires `agent`; frontend sends only
    `role` and `content`.

## Product identity clarified
- Context Forge is not primarily an agent workflow engine like Archon.
- Archon-style tools own deterministic coding workflows such as plan,
  implement, validate, review, and produce PRs.
- Context Forge owns the conversation/context layer underneath AI work:
  conversation state, branches, exports, edits, context lenses, and handoff.
- The product is best described as:
  - a local conversation/context harness
  - a local app with a browser UI
  - a backend-owned conversation store and future local capability layer
- The repository/category name is `context-harness`; the product name is
  `Context Forge`; the tagline is "Context is everything."

## Phase interpretation after reopening
- Phase 1 remains the conversation MVP:
  - align frontend/backend API contract
  - create/open conversations
  - render a thread
  - submit messages
  - persist canonical files
  - regenerate Markdown exports
  - add basic Markdown import later in the phase
- Phase 2 is math-native input:
  - Vim-style editor
  - Obsidian-compatible LaTeX shortcuts
  - structured/bullet-heavy writing support as ergonomics, not automated context
    selection yet
- Phase 3 is conversation surgery:
  - clone, edit, insert, delete, rollback, and fork conversations safely
- Phase 4 is context lenses and graph navigation:
  - branch graph
  - full-thread, branch-only, summary, or topic-focused exports
  - deliberate context drilling instead of sending all prior messages every time
- Phase 5 is agent and web-chatbot bridge:
  - CLI bridge first
  - later MCP/runtime adapters
  - controlled tool-action workflows with user approval

## Local app and launcher direction
- The React frontend is the control surface, not evidence that Context Forge is
  a hosted web app.
- The FastAPI backend is the local authority that owns conversation state,
  file access, imports/exports, and future capabilities.
- Development can use manual commands:
  - `nix develop`
  - `uvicorn server.main:app --reload --port 8000`
  - frontend dev server from `frontend/`
- Product workflow should eventually be a launcher command:
  - `context-forge`
  - starts or reuses the local backend
  - serves or opens the frontend
  - opens a browser/app window
  - avoids duplicate server instances
  - writes logs/PID files somewhere predictable
- A fuzzel desktop entry can later call the same launcher command.
- A native wrapper such as Tauri/Electron can be considered later, but should
  not precede a stable conversation model and backend API.

## Local capability boundary
- The browser UI must never receive raw filesystem or shell authority.
- Future access to local files, zettelkasten notes, project directories,
  skills, imports/exports, and shell/tool actions must be mediated by backend
  APIs.
- Capabilities should be configured paths/features so the project can remain
  portable beyond AJ's NixOS machine.
- Phase 1 should not implement arbitrary local tool execution.

## Agent CLI bridge decision
- The first real agent integration should be a small CLI bridge.
- The bridge should support workflows like:
  - `context-forge export <conversation-id>`
  - `context-forge append <conversation-id> --role assistant --agent codex`
  - `context-forge import-response <conversation-id> response.md`
  - `context-forge open <conversation-id>`
- This lets Claude Code, Codex, scripts, and web-chatbot workflows participate
  without native integration.
- Agents should read exported context and append replies through the app/CLI
  instead of directly mutating canonical message files.
- MCP can be added later as a convenience adapter for agents that support it.
- A custom agent runtime can be layered later, but Context Forge should remain
  the conversation/context source of truth.

## claw-code-parity inspection
- Inspected `/home/aj/Repositories/experiment/claw-code-parity` only as an
  experimental reference.
- The repo demonstrates an agent runtime/harness shape:
  - CLI REPL and prompt mode
  - tools such as bash, file read/write/edit, grep/glob, web search/fetch
  - permission enforcement
  - session persistence
  - MCP, LSP, plugin, skills, and mock parity harness concepts
- The useful lesson is the runtime boundary: tools, permissions, sessions, and
  agent execution belong in an agent runtime layer.
- Context Forge should not absorb that whole runtime in Phase 1.
- Durable rule: borrow patterns from `claw-code-parity` cautiously, but keep
  Context Forge focused on conversation/context ownership.

## Git/repo operations completed during the reopened work
- Added root `README.md` with the Context Forge product vision.
- Added GitHub remote:
  - `hub git@github.com:aaronjan98/context-harness.git`
- Pushed `main` to GitHub.
- Renamed Forgejo web repo from `aj/claude-display` to `aj/context-harness`.
- User renamed homelab/local bare repos so remotes can use
  `context-harness.git`.
- Commits created:
  - `87b7135 document Context Forge product vision`
  - `677e2de define Context Forge capability boundary`

## Open questions
- Exact Phase 1 API contract needs to be finalized before implementation.
- Decide whether the frontend should call `/api/conversations...` directly or
  use a relative `/api` base with Vite proxy.
- Decide how the Phase 1 backend should expose conversation listing.
- Decide whether append should default `agent` server-side for user messages.
- Decide when to add the first `context-forge` launcher/CLI entrypoint.

## Next steps
- Commit this session note and the durable CLI bridge note.
- Begin Phase 1 API alignment as the next implementation checkpoint.
- For the API checkpoint, explain each route/payload change before editing so
  the user can see why it exists and how it supports the larger product.
