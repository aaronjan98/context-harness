# Product Spec - Context Forge

## Overview
Context Forge is a local, single-user conversation/context harness for AI agents
and chat tools. It treats the conversation itself as the durable artifact and
allows different agents and web chatbots to participate in the same thread over
time.

The product is designed around a file-first canonical conversation store, a web
UI for reading and editing conversations, a local backend that mediates access
to configured files/tools/skills, and exports that let external agents or chat
tools continue a thread without owning its state.

## Product goal
Create a local interface where a user can:

- conduct mixed coding, math, and general conversations
- preserve those conversations independently of any one AI product
- let different agents continue the same thread
- reshape conversations later through editing, forking, and visual navigation
- mediate local context access through explicit backend capabilities, not raw
  browser access

## Non-goals for v1
- cloud sync or multi-user collaboration
- branch merging
- graph editing
- advanced search and project metadata indexing
- binary attachment workflows beyond future hooks in the model
- arbitrary shell/tool execution from the browser
- general-purpose agent orchestration

## Core principles

### The conversation is the product
The canonical conversation store matters more than any one UI surface or agent
adapter.

### File-first, app-written
Canonical data lives in normal visible files. The app is the canonical writer so
metadata stays consistent.

### Agent-agnostic
The core app should not depend on Claude-specific features. Adapters may exist,
but they are not the architecture.

### Local capability backend
The browser UI is only a control surface. Local file, tool, skill, and directory
access must be mediated by the backend through explicit configured
capabilities.

### Mixed-purpose by default
A single conversation may contain coding, math, and general discussion together.

### Predictable context
When an agent continues a conversation, the default context is the entire active
thread.

### Context is everything
The product should make context visible, editable, exportable, and eventually
selectively expandable. Long conversations should support deliberate context
lenses instead of forcing every model to consume every prior message.

## Users
Primary user: AJ on a local machine.

Primary usage patterns:
- continue one conversation across multiple AI agents
- keep a readable durable record of important technical and mathematical chats
- improve math-heavy input and output compared with stock chat tools
- use local knowledge sources, such as notes or project files, through an
  explicit local capability layer

## Canonical data model

### Conversation
The top-level durable object stored in one folder.

Conversation-level metadata lives in `conversation.yaml`.

### Message
One conversational turn stored as its own Markdown file with YAML frontmatter.

Required fields:
- `id`
- `parent_id`
- `role`
- `agent`
- `timestamp`
- `format`
- `attachments`

### Thread
The active linear path through the conversation graph currently shown in the UI.

## Storage layout

```text
conversation-folder/
├── conversation.yaml
├── messages/
│   ├── m0001.md
│   ├── m0002.md
│   └── ...
├── attachments/
├── exports/
└── .history/
```

See `project-memory/storage-model.md` for the durable rationale and examples.

## Reading and writing model

### Canonical writer
Only the app writes canonical conversation files.

### Local capability access
The backend is the only layer allowed to touch local configured capabilities:
files, directories, skills, imports, exports, and future shell/tool actions.
The browser UI requests operations through APIs and never receives direct raw
filesystem or shell authority.

### External readers
External tools and agents may read conversation exports freely.

### Agent handoff
Agents share a conversation by reading exported context and returning new
messages through the app, not by directly mutating canonical files.

The first durable integration path should be a small CLI bridge rather than MCP
or a full custom agent runtime. Any agent that can read files and run commands
should be able to export context from Context Forge and append a response back
through commands such as `context-forge export` and `context-forge append`.

## Import and export

### Markdown export
The app should keep a readable Markdown export of the active thread up to date.

Initial target:
- `exports/current.md`

### Markdown import
The importer should:
- do light speaker-pattern matching
- create a simple linear conversation
- avoid aggressive guesswork

### Wiki-links
Canonical message bodies may contain `[[...]]` links. v1 preserves them in the
canonical conversation model. More advanced export handling is deferred.

## Phase roadmap

### Phase 1 — Conversation MVP
- chat UI
- input field
- canonical write path
- one-agent or mock reply path
- Markdown export sync
- basic Markdown import
- aligned frontend/backend API contract

### Phase 2 — Math-native input
- Vim-style editor
- Obsidian-compatible LaTeX shortcut workflow
- structured writing support for math-heavy and bullet-heavy context

### Phase 3 — Forking and thread manipulation
- fork from a prior message
- insert/edit/delete from the GUI
- rollback support as a real workflow

### Phase 4 — Context lenses and graph view
- visual conversation graph
- branch navigation via nodes/edges
- selective exports such as full thread, branch-only, summary, or topic-focused
  context

### Phase 5 — Agent and web-chatbot bridge
- multiple agent adapters
- smoother handoff and continuation between tools
- CLI bridge commands for export/append/import before deeper runtime adapters
- controlled tool-action workflow where model output can request local actions
  that the backend mediates and the user approves

## Success criteria

### v1 success
- a user can hold a real conversation through the browser UI
- the conversation survives reloads as readable structured files
- the app can generate a clean Markdown export for reuse elsewhere

### product success
- conversations outlive any one model or tool
- math-heavy use feels materially better than ordinary chat tools
- future branching and graph features fit naturally onto the same storage model
- users can control what context a model receives instead of treating a long
  conversation as an all-or-nothing transcript
