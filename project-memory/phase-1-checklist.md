# Phase 1 Checklist

## Purpose
Concrete sub-tasks for the current implementation phase. This is the tactical
checklist under `project-memory/phase-1-mvp.md`.

## Checklist
- [x] Scaffold backend package and storage boundary
- [x] Set the default conversation store location to
      `~/Documents/context-harness/conversations`
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
- [x] Align frontend/backend API contract
- [x] Regenerate frontend OpenAPI types from the backend
- [x] Add/update backend tests for the Phase 1 API contract
- [x] Wire frontend API calls to the aligned backend contract
- [x] Verify frontend production build with generated API types
- [x] Verify minimal browser UI shell against the real backend
- [x] Verify text input submission flow against the real backend
- [x] Add conversation rename and delete lifecycle controls
- [x] Prevent implicit conversation creation on stale read routes
- [x] Add basic Markdown import with light speaker-pattern matching
- [x] Add manual browser import UX for pasted Markdown transcripts
- [x] Add active-tab ChatGPT DOM export prototype
- [x] Add cross-browser ChatGPT export bookmarklet for v1
- [x] Expand the active-tab exporter to Gemini DOM conversations
- [x] Add app-managed attachment foundation
- [x] Render message attachment cards and fixed preview overlay

## Current checkpoint
The backend can now append canonical message nodes, read the active thread,
regenerate the current Markdown export, list conversations, rename
conversations, delete conversations, import Markdown transcripts, and expose
typed response models through OpenAPI. It can also copy uploaded files into the
conversation-local `attachments/` directory, store attachment metadata in
message frontmatter, serve inline previews/downloads, and include attachment
references in the generated Markdown export. API integration tests cover the
current Phase 1 contract.

The real browser/backend loop has been manually verified: empty state, explicit
conversation creation from the sidebar, message submission, sidebar auto-title
refresh, rename, delete, stale-route recovery, and storage under
`~/Documents/context-harness/conversations`.

Markdown import exists because Context Forge must be able to take a transcript
from a web chatbot, copied agent output, or Markdown file and convert it into
canonical message files that future agents can continue from.

Manual browser import now has a small UI surface: the active conversation can
open an `Import Markdown` panel, paste a transcript, and append it through the
canonical backend importer. The DOM exporter is an active-tab prototype for
supported chatbot UIs: the user runs it in the browser tab they want to import,
then pastes the copied Markdown into Context Forge. It currently supports
ChatGPT and Gemini DOM conversations. The normal v1 workflow should use the
one-line bookmarklet in `tools/chatgpt-dom-export.bookmarklet.js`; the readable
console script remains available for debugging when the chatbot DOM changes.

Phase 1 should keep local capability work out of scope beyond preserving the
backend as the only authority that will eventually mediate configured files,
skills, directories, imports, exports, and approved tool actions.

The next checkpoint should be either manual verification of the attachment UI
against the live backend or the first small assistant-adapter boundary. Do not
extend browser scraping to copy attachment file contents from web chatbots.
