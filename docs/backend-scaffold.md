# Backend Scaffold

This document explains the first backend files added for Phase 1.

## Purpose
The initial scaffold creates a clear split between:

- app entrypoint and HTTP surface
- canonical conversation storage logic

That keeps the product aligned with the core goal: the app owns the canonical
conversation files, while later APIs and adapters use that storage layer.

## Files

### `server/__init__.py`
Marks `server/` as a Python package.

Why it exists:
- allows clean imports like `from server.store import ConversationStore`

### `server/main.py`
Defines the FastAPI application object.

Current responsibilities:
- create the `FastAPI` app
- create a shared `ConversationStore`
- expose a minimal `/health` route

Why it exists:
- provides one stable backend entrypoint
- gives later API routes a place to live
- separates request handling from storage implementation

### `server/store.py`
Defines the first file-system storage primitives.

Current responsibilities:
- describe the expected conversation folder layout
- resolve the filesystem paths for a conversation
- create missing directories for a conversation
- seed `conversation.yaml` if it does not exist
- seed `exports/current.md` if it does not exist

Why it exists:
- makes the conversation store explicit in code
- ensures folder creation rules live in one place
- gives future API handlers a single write path

## Path model

By default, conversations are stored in:

```text
~/Repositories/conversations/
```

Each conversation gets its own folder:

```text
~/Repositories/conversations/<conversation-id>/
```

Inside that folder, the store currently expects:

```text
<conversation-id>/
├── conversation.yaml
├── messages/
├── attachments/
├── exports/
└── .history/
```

## `StorePaths`

`StorePaths` is a small dataclass that bundles the important paths for one
conversation.

Fields:
- `root` — conversation folder
- `messages` — directory for message files
- `attachments` — directory for attachments
- `exports` — directory for generated exports
- `history` — directory for rollback snapshots
- `conversation_file` — path to `conversation.yaml`

Why this matters:
- route handlers and helpers can pass one structured object around
- the storage layout stays centralized rather than rebuilt ad hoc

## `ConversationStore`

### `__init__`
Sets the base directory for all conversations.

Default:
- `~/Repositories/conversations`

This is intentionally outside the app repo because the conversations are meant
to outlive the implementation details of this project.

### `conversation_dir(conversation_id)`
Returns the folder for one conversation ID.

Example:
- `agent-ui-planning` becomes
  `~/Repositories/conversations/agent-ui-planning`

### `paths_for(conversation_id)`
Builds and returns the `StorePaths` object for that conversation.

### `ensure_layout(conversation_id)`
Creates the expected directory structure if it does not exist yet.

This is the first concrete rule that the app, not external tools, defines the
canonical on-disk shape.

### `default_conversation_metadata(conversation_id)`
Returns starter YAML content for a new `conversation.yaml`.

Current fields:
- `id`
- `title`
- `created_at`
- `root_message_id`
- `active_message_id`

This is seed metadata only. Later steps will add reading and updating logic.

### `initialize_conversation(conversation_id)`
Creates the layout, creates `conversation.yaml` if missing, and creates an empty
`exports/current.md` if missing.

Why this matters:
- one method can bootstrap a conversation for the API
- later endpoints can call this before reading or writing message files

## Current limitations
- no message read/write logic yet
- no parsing of `conversation.yaml`
- no API endpoints beyond `/health`
- no UI integration yet

That is intentional. This scaffold only establishes the storage boundary before
the API layer is added.
