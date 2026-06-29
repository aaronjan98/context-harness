# Frontend Architecture — Context Forge

## Overview

The frontend is a local single-user SPA that talks to the FastAPI backend over
HTTP. It has no server-side rendering and no hybrid rendering. The FastAPI
backend is the canonical writer of all conversation data. The frontend is a
control surface over that data.

This document is the canonical catch-up reference for any agent working on the
frontend. Read it before touching any frontend file.

---

## Technology stack

| Library | Role | Why |
|---|---|---|
| React 18 | UI framework | Richest ecosystem for the heavy components needed (graph, vim editor) |
| Vite | Build tool | Fast, modern, no overhead |
| TypeScript | Language | End-to-end type safety across router, API, and store |
| TanStack Router v1 | Routing | Fully typed route params and search params via Zod |
| TanStack Query v5 | Server state | Async state, caching, loading/error, optimistic updates |
| Zustand | UI state | Lightweight client-only state (modals, focused message) |
| react-resizable-panels | Layout | Drag handles, push behavior, collapse, size persistence |
| openapi-fetch | HTTP client | Typed fetch wrapper driven by generated schema |
| openapi-typescript | Type generation | Generates src/api/schema.ts from FastAPI's /openapi.json |
| Zod | Validation | Search param schemas, runtime validation |
| react-markdown | Message display | Markdown rendering in message bubbles |
| remark-math + rehype-katex | Math display | LaTeX rendering in message bubbles (Phase 1) |
| katex | LaTeX engine | Peer dependency of rehype-katex |
| @xyflow/react | Graph view | React Flow — interactive node/edge graph (Phase 4) |
| CodeMirror 6 | Rich editor | Vim bindings, LaTeX preview (Phase 2) |

---

## Directory structure

```
frontend/
├── index.html                  ← Vite entry point
├── package.json
├── vite.config.ts              ← path alias @/ → src/, dev proxy
├── tsconfig.json
├── tsconfig.node.json          ← TypeScript config for vite.config.ts
└── src/
    ├── main.tsx                ← mounts React, imports global CSS (katex, theme)
    ├── app/
    │   ├── router.tsx          ← route tree, exports router + route objects
    │   ├── shell.tsx           ← root layout: sidebar + <Outlet />
    │   └── providers.tsx       ← QueryClientProvider, RouterProvider, realtime init
    ├── features/
    │   ├── conversations/      ← conversation list, create, sidebar
    │   │   ├── index.ts
    │   │   ├── ConversationSidebar.tsx
    │   │   └── ConversationsPage.tsx
    │   ├── thread/             ← message display, reply flow, inner panel layout
    │   │   ├── index.ts
    │   │   └── ThreadView.tsx
    │   ├── editor/             ← input abstraction (Phase 1: simple, Phase 2: vim)
    │   │   ├── index.ts        ← re-exports active implementation (the swap seam)
    │   │   ├── types.ts        ← EditorProps interface (the stable contract)
    │   │   ├── SimpleEditor.tsx ← Phase 1: textarea + Ctrl+Enter submit
    │   │   └── RichEditor.tsx  ← Phase 2: CodeMirror + vim + KaTeX (stub)
    │   └── graph/              ← graph panel, node/edge transforms
    │       ├── index.ts
    │       ├── GraphPanel.tsx  ← Phase 1: placeholder; Phase 4: React Flow canvas
    │       └── transforms.ts   ← pure fn: Message[] → { nodes, edges }
    ├── api/
    │   ├── client.ts           ← openapi-fetch instance (base URL)
    │   ├── schema.ts           ← GENERATED — never hand-edit (see workflow below)
    │   ├── conversations.ts    ← typed query/mutation functions per resource
    │   └── realtime.ts         ← Phase 5 stub: SSE/WebSocket → cache invalidation
    ├── store/
    │   └── ui.ts               ← Zustand: focusedMessageId, modal flags
    └── shared/
        └── components/
            └── MessageContent.tsx  ← markdown + KaTeX renderer for message bodies
```

---

## Feature slice discipline

Each directory under `features/` is a self-contained enclosure. The rule is:

**Features may not import from each other.**

Cross-feature communication happens through:
- The Zustand `ui` store (e.g. `focusedMessageId`)
- The URL / TanStack Router search params (e.g. `?panel=graph`)
- `app/`-level wiring (e.g. the shell passing props down)

The `shared/` layer is only for components and utilities that genuinely appear
in multiple features. Do not put feature-specific code in `shared/`.

This discipline ensures:
- The graph feature cannot reach into thread internals
- The editor is swappable without modifying ThreadView
- Phase boundaries are clean

---

## Routing

### Approach
Code-based routing with TanStack Router v1. Route objects are exported from
`app/router.tsx` so component files can use their typed hooks directly.

### Route tree

```
/                           → redirect to /conversations
/conversations              → ConversationsPage (empty state, no conversation selected)
/conversations/$id          → ThreadView (active conversation)
  ?panel=graph              → search param: opens graph panel in ThreadView
```

The graph panel is **not** a separate route — it is a search param on the
conversation route. This means:
- Deep-linking works (`/conversations/abc?panel=graph` opens graph directly)
- Browser back button closes the graph panel naturally
- The route type system covers it from day one

### Search param schema

```ts
// defined in app/router.tsx alongside the route
const conversationSearchSchema = z.object({
  panel: z.enum(['graph']).optional(),
})
```

To add future panels (e.g. `?panel=history` for Phase 3 rollback view), extend
the enum. TypeScript will surface every call site that needs to handle the new
value.

### Typed param access in components

```ts
// components import the route object to get typed hooks
import { conversationRoute } from '@/app/router'

const { id } = conversationRoute.useParams()
const { panel } = conversationRoute.useSearch()
// panel is typed as 'graph' | undefined — not string
```

### Typed navigation with Link

```tsx
import { Link } from '@tanstack/react-router'

// TypeScript validates route exists and params are correct
<Link to="/conversations/$id" params={{ id: convo.id }}>
  {convo.title}
</Link>

// TypeScript validates panel is in the enum
<Link to="/conversations/$id" params={{ id }} search={{ panel: 'graph' }}>
  View graph
</Link>
```

---

## Layout

### Shell (two columns, always present)

The root shell renders a persistent two-column layout using
`react-resizable-panels`. The sidebar never unmounts — switching conversations
only changes the `<Outlet />`.

```
┌──────────────────────────────────────────┐
│  Sidebar (20%)  │  <Outlet /> (80%)      │
│                 │                         │
│  conversations  │  active route content  │
│  list + new btn │                         │
└──────────────────────────────────────────┘
```

```tsx
// app/shell.tsx
<PanelGroup direction="horizontal" autoSaveId="shell-layout">
  <Panel id="sidebar" collapsible minSize={15} defaultSize={20} />
  <PanelResizeHandle />
  <Panel id="main">
    <Outlet />
  </Panel>
</PanelGroup>
```

`autoSaveId` persists panel sizes to localStorage automatically.

### ThreadView (three columns when graph is open)

The conversation route renders its own inner PanelGroup. When `?panel=graph`
is active, a third panel slides in from the right (push behavior — not overlay).

```
┌──────────────────────────────────────────────────────────────┐
│  Sidebar  │  Thread (flex)           │  Graph panel →        │
│           │                          │  (when ?panel=graph)  │
└──────────────────────────────────────────────────────────────┘
```

```tsx
// features/thread/ThreadView.tsx
<PanelGroup direction="horizontal" autoSaveId="thread-layout">
  <Panel id="thread" minSize={30} />
  {panel === 'graph' && (
    <>
      <PanelResizeHandle />
      <Panel id="graph" collapsible minSize={25} defaultSize={35} />
    </>
  )}
</PanelGroup>
```

When the graph panel is closed, there is no phantom resize handle. The
`autoSaveId` remembers the last size so reopening it restores position.

Both the sidebar and graph panel are collapsible. All resize handles support
drag-to-resize.

---

## State layers

There are five distinct state owners. Never duplicate state across layers.

| Layer | Owns | Tool |
|---|---|---|
| Backend / disk | Canonical conversation data | FastAPI + file system |
| TanStack Query cache | Server state mirror, invalidated on writes or push | TanStack Query |
| TanStack Router / URL | Navigation state (active conversation, panel visibility) | TanStack Router |
| Zustand `ui` store | Ephemeral UI state (focused message ID, modal flags) | Zustand |
| React component state | Truly transient state (editor text before submit) | useState |

### Optimistic updates

TanStack Query optimistic updates are temporary assumptions, not violations of
the model. When a message is appended, the UI shows it immediately before the
server confirms. The cache corrects itself when the server responds. Always
reconcile with the server — never assume success.

---

## API client layer

### How it works

FastAPI auto-generates an OpenAPI spec at `http://localhost:8000/openapi.json`.

`openapi-typescript` reads that spec and emits `src/api/schema.ts` — a pure
TypeScript types file. No logic, no runtime cost, erased at compile time.

`openapi-fetch` takes `schema.ts` as a type parameter and produces a typed
fetch client. Every API call is end-to-end typed: wrong request shapes and
unexpected response handling are caught at compile time.

### schema.ts — the generated contract

```
schema.ts = TypeScript types only, derived from FastAPI's OpenAPI spec
          ≠ conversation data
          ≠ runtime code
```

It contains types like:

```ts
// What schema.ts looks like (generated — never write this by hand)
export interface components {
  schemas: {
    Conversation: { id: string; title: string; created_at: string }
    Message: {
      id: string
      role: string
      content: string
      parent_id: string | null
      agent: string
      timestamp: string
    }
  }
}
```

**Never hand-edit `schema.ts`.** When the backend changes, regenerate it.

### Regenerating schema.ts

```bash
# from frontend/
npm run generate:api
# or directly:
npx openapi-typescript http://localhost:8000/openapi.json -o src/api/schema.ts
```

After regeneration, TypeScript will immediately surface every frontend call
site that broke due to the backend change.

### Call pattern

During local browser development, the frontend uses same-origin `/api/...`
requests and Vite proxies them to FastAPI at `http://localhost:8000`. This
keeps the browser flow CORS-free while preserving the backend `/api` namespace.

If an external runtime needs to bypass the Vite dev server, set
`VITE_API_BASE_URL`. Otherwise leave it unset.

```ts
// api/client.ts — configured once
import createClient from 'openapi-fetch'
import type { paths } from './schema'

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? ''

export const api = createClient<paths>({ baseUrl: apiBaseUrl })

// api/conversations.ts — typed functions consumed by TanStack Query hooks
export async function fetchConversations() {
  const { data, error } = await api.GET('/api/conversations')
  if (error) throw error
  return data
}

export async function appendMessage(
  conversationId: string,
  body: { role: string; content: string }
) {
  const { data, error } = await api.POST('/api/conversations/{conversation_id}/messages', {
    params: { path: { conversation_id: conversationId } },
    body,
  })
  if (error) throw error
  return data
}
```

### TanStack Query keys

```ts
['conversations']                → list of all conversations
['conversations', id, 'messages'] → active thread messages
```

---

## Theme boundary

The frontend theme should stay intentionally simple during Phase 1. The app has
a light/dark toggle in the conversation sidebar. Theme changes should mostly be
CSS variable swaps plus restrained highlight/glow states.

Do not treat dark mode as a redesign. Preserve the current plain layout,
generic fonts, spacing, radii, and component structure unless the user asks for
a broader UI pass.

---

## Editor abstraction

### The problem it solves

Phase 1 uses a simple textarea. Phase 2 replaces it with CodeMirror 6 + vim
bindings + LaTeX preview. Without an abstraction, the Phase 2 swap requires
opening `ThreadView` and surgically replacing the input — risking regressions.

### The contract

```ts
// features/editor/types.ts
export interface EditorProps {
  value: string
  onChange: (value: string) => void
  onSubmit: () => void
  disabled?: boolean
}
```

`ThreadView` depends only on `EditorProps`. It never imports a specific
implementation.

### The swap seam

```ts
// features/editor/index.ts
// Phase 1:
export { SimpleEditor as Editor } from './SimpleEditor'

// Phase 2 — change this one line:
// export { RichEditor as Editor } from './RichEditor'
```

Phase 2 is purely additive — fill in `RichEditor.tsx` and change one export.
Nothing in `ThreadView` changes.

### Submit keybinding

`Ctrl+Enter` submits in both `SimpleEditor` and `RichEditor`. In the vim
editor (Phase 2), this binding works in both insert and normal mode so the
behavior is consistent regardless of vim mode.

### LaTeX: two separate concerns

| Concern | What | Where | Phase |
|---|---|---|---|
| Input preview | Typing `$x^2$` shows rendered preview while composing | `features/editor/` | Phase 2 |
| Display rendering | Rendering `$x^2$` in message bubbles | `shared/components/MessageContent.tsx` | Phase 1 |

These are independent. Display-side KaTeX is wired in Phase 1 because it
makes the app immediately useful for math-heavy conversations even before the
vim editor exists.

---

## Graph view readiness

### Why this matters in Phase 1

Phase 4 introduces React Flow for the graph view. If Phase 1 ignores graph
concerns entirely, Phase 4 will need to reverse-engineer the message structure
and retrofit data transforms. Writing `transforms.ts` now avoids that.

### The data is already graph-shaped

Every message has a `parent_id`. This is an adjacency list — exactly what
React Flow needs. The graph is fully derivable from messages already being
fetched in Phase 1.

### transforms.ts — write this in Phase 1

```ts
// features/graph/transforms.ts
import type { Node, Edge } from '@xyflow/react'
import type { components } from '@/api/schema'

type Message = components['schemas']['Message']

export function messagesToGraph(messages: Message[]): {
  nodes: Node[]
  edges: Edge[]
} {
  const nodes = messages.map((m) => ({
    id: m.id,
    type: 'message',            // custom node type registered in Phase 4
    position: { x: 0, y: 0 },  // layout algorithm fills this in Phase 4
    data: { role: m.role, content: m.content },
  }))

  const edges = messages
    .filter((m) => m.parent_id !== null)
    .map((m) => ({
      id: `${m.parent_id}-${m.id}`,
      source: m.parent_id!,
      target: m.id,
    }))

  return { nodes, edges }
}
```

This is a pure function — no React Flow dependency, fully testable in Phase 1.

### Thread ↔ graph interaction (Phase 4)

Clicking a node in the graph scrolls the thread to that message. This is the
only cross-feature communication point. It goes through Zustand so neither
feature imports the other:

```ts
// store/ui.ts
focusedMessageId: string | null
setFocusedMessageId: (id: string | null) => void
```

Graph sets it. Thread reads it and scrolls. Both are stubbed in Phase 1.

### Phase 1 graph stub

```tsx
// features/graph/GraphPanel.tsx (Phase 1)
export function GraphPanel() {
  return <div className="graph-placeholder">Graph view — Phase 4</div>
}
```

Phase 4 fills in `GraphCanvas.tsx` using `@xyflow/react` and swaps it in.

---

## Future transport layer (Phase 5)

### Current approach (Phase 1)

Optimistic updates on writes + TanStack Query cache invalidation on response.
Sufficient for Phase 1 because the app is the only writer.

### Future approach (Phase 5)

When external agents write messages, the frontend needs push notifications.
The strategy: add an SSE or WebSocket listener that calls
`queryClient.invalidateQueries()` when events arrive. The HTTP path stays for
all writes forever. Push events only trigger re-fetches.

```ts
// api/realtime.ts — Phase 5 stub, wired in providers.tsx now
export function startRealtime(_queryClient: QueryClient): () => void {
  // Phase 5: open SSE/WebSocket connection
  // On message event: queryClient.invalidateQueries(['conversations', id])
  // Return cleanup function
  return () => {}
}
```

Called once in `app/providers.tsx`. Phase 5 fills in the body without touching
anything else in the app.

---

## Future features (feasibility notes)

### Auto-rename conversation

`conversation.yaml` already has a `title` field. Implementation:
- Backend: one endpoint that calls an LLM with the thread content and writes
  the result to `conversation.yaml`
- Frontend: click-to-edit title in the sidebar, fires a mutation, invalidates
  `['conversations']` cache
- No architectural changes needed

### Message compaction

User selects messages → prompts AI to produce a combined version.
- Selection state is transient React state in the thread view
- Frontend sends selected message IDs + prompt to a backend endpoint
- Backend calls LLM, returns candidate combined message
- User accepts or rejects
- If accepted: backend writes new message, moves originals to `.history/`
- Rollback support already planned in the storage model
- No architectural changes needed

Both features are fully compatible with the current architecture and data model.

---

## Mental model

```
Backend / disk       owns canonical conversation data
TanStack Query       mirrors server state, invalidates on writes and push
TanStack Router      owns navigation state (URL is the source of truth)
Zustand              owns ephemeral UI state not captured by URL
React component      owns truly transient state (text before submit)
```

Every meaningful write goes through HTTP to the backend.
React revalidates from the backend — optimistic updates are temporary
shortcuts that the server always corrects.

---

## Phase 1 implementation checklist

### Build now (Phase 1)
- [ ] `SimpleEditor.tsx` — textarea, `Ctrl+Enter` submit
- [ ] `ConversationSidebar.tsx` — list conversations, create new
- [ ] `ConversationsPage.tsx` — empty state
- [ ] `ThreadView.tsx` — display messages, inner panel group, mount Editor
- [ ] `MessageContent.tsx` — markdown + KaTeX rendering
- [ ] `api/client.ts` — openapi-fetch instance
- [ ] `api/conversations.ts` — typed fetch/mutation functions
- [ ] `api/schema.ts` — generate from backend
- [ ] `store/ui.ts` — focusedMessageId + modal flags
- [ ] `features/graph/transforms.ts` — messagesToGraph pure function

### Stub now, fill in later
- [ ] `RichEditor.tsx` — Phase 2 (CodeMirror + vim + KaTeX input)
  - Snippet system should load from `~/Repositories/self-hosted/zettelkasten/Documents/shortcuts.json`
  - See `project-memory/snippet-strategy.md` for the full cross-editor plan before implementing
- [ ] `GraphPanel.tsx` / `GraphCanvas.tsx` — Phase 4 (React Flow)
- [ ] `api/realtime.ts` — Phase 5 (SSE/WebSocket)

---

## Development workflow

```bash
# from repo root
nix develop

# start backend
cd backend && uvicorn app.main:app --reload

# start frontend (separate terminal)
cd frontend && npm install && npm run dev

# regenerate API types after backend changes
cd frontend && npm run generate:api
```

Frontend runs on `http://localhost:5173` by default.
Backend runs on `http://localhost:8000`.
