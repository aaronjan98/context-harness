# Context Forge

Context is everything.

Context Forge is a local, model-agnostic conversation/context harness for
long-running AI discussions. The repository is named `context-harness` because
that describes the category; Context Forge is the product name.

The project treats the conversation itself as the durable artifact. Instead of
tying a thread to Claude, Codex, ChatGPT, or any one agent UI, it stores the
conversation locally, lets different AIs continue from the same context, and
eventually gives the user tools to edit, fork, summarize, graph, and export that
context deliberately.

## Product Identity

This is not primarily an AI coding workflow engine. It is a workbench for
owning and reshaping conversation state.

Use it when you want to:

- continue a discussion across multiple AI models or tools
- preserve conversations independently of any vendor UI
- edit or clone past context to test different outputs
- export a clean thread into a web chatbot or coding agent
- work with math-heavy or research-heavy conversations that need durable context
- eventually drill into only the parts of a long conversation that matter

The shortest description:

> A local conversation/context harness for long-running AI work.

## What It Is Not

Context Forge is not trying to replace workflow engines like Archon.

Archon-style tools focus on deterministic coding workflows: plan, implement,
validate, review, and produce a PR. Context Forge focuses on the conversation
and context layer underneath AI work: what was said, what should be included
next time, what branch of the discussion is active, and what context should be
exported to another model.

In simple terms:

- Archon: run a coding process reliably.
- Context Forge: preserve, reshape, and reuse conversation context.

## Core Model

The app owns a local file-first conversation store.

Each conversation is stored as a folder containing:

- conversation metadata
- one Markdown file per message
- generated exports for humans and external AI tools
- future history/snapshot data for rollback and recovery

The backend is the canonical writer. External agents and web chatbots should
read exported context and send new messages back through the app, rather than
mutating canonical files directly.

## Current Status

The project is in early implementation.

Implemented:

- FastAPI backend foundation
- file-first conversation store
- conversation creation and message append flow
- active-thread reconstruction
- Markdown export regeneration
- backend unit and API integration tests
- React/Vite frontend scaffold with routing, editor abstraction, message view,
  graph placeholder, and API layer
- aligned Phase 1 frontend/backend API contract with generated OpenAPI
  TypeScript types

Current focus:

- Verify the browser UI against the real backend runtime.
- Keep the default conversation store under
  `~/Documents/context-harness/conversations`.
- Add basic Markdown import.

## Phase Roadmap

### Phase 1 - Conversation MVP

Prove the app can hold a real local conversation.

Goals:

- create and open conversations
- render a thread in the browser
- submit messages through an input field
- persist canonical message files
- keep `exports/current.md` in sync
- support basic Markdown import
- align the frontend/backend API contract

### Phase 2 - Math-Native Input

Make the app materially better than ordinary chat UIs for math-heavy work.

Goals:

- replace the plain text editor with a Vim-style editor
- integrate Obsidian-style LaTeX shortcuts
- keep math display working in message bubbles
- begin supporting structured writing patterns, including bullet-heavy input

### Phase 3 - Conversation Surgery

Turn conversations into editable experiments.

Goals:

- edit messages through the GUI
- clone conversations
- fork from prior messages
- insert or delete messages safely
- keep rollback history before destructive edits

### Phase 4 - Context Lenses and Graph Navigation

Make long conversations navigable and selectively exportable.

Goals:

- show branches and threads as a graph
- support context lenses such as full thread, summary, branch-only, or selected
  topic context
- allow drilling into detailed sub-context only when needed
- prepare for future graph-based conversation editing

### Phase 5 - Agent and Web-Chatbot Bridge

Let different AI surfaces participate in the same local conversation.

Goals:

- support multiple agent adapters
- improve handoff between local agents and web chatbots
- allow controlled tool-action workflows where model output can be reviewed,
  executed locally, and exported back into the conversation

## Development

Enter the Nix development environment:

```bash
nix develop
```

Run backend tests:

```bash
pytest
```

The current backend entrypoint is:

```bash
uvicorn server.main:app --reload --port 8000
```

The frontend lives in `frontend/` and is a React/Vite app.
