# Phase 1 Mini-Goal

## Goal
Build the first usable slice of Context Forge: a local browser UI that can
hold a conversation, accept input, persist it canonically, and keep a readable
Markdown export in sync.

## Current implementation status
Backend progress:
- create/open conversation flow is implemented
- canonical message append/read/export flow is implemented
- app-managed attachment storage and preview/download routes are implemented
- backend tests cover the current storage and API foundation

Frontend progress:
- React/Vite browser shell is implemented enough for create/read/append,
  rename/delete, Markdown rendering, manual transcript import, file attachment,
  and attachment preview overlay
- UI work should remain conservative because the user is shaping the visual
  design

Immediate backend gap:
- no major backend gap is known for manual transcript import
- next backend-facing gap is the first assistant adapter boundary

## In scope
- create/open a conversation
- render the active thread in a chat UI
- text input for new user messages
- append assistant replies from one initial agent path or mock adapter
- write canonical conversation files
- regenerate `exports/current.md`
- basic Markdown import with light speaker-pattern matching
- paste/import UX for web-chatbot or agent transcripts
- app-managed attachments: upload local files, attach them to messages, render
  attachment cards, preview supported files, and expose download/open links

## Out of scope
- branching/forking
- graph view
- advanced attachment handling such as web-chatbot file scraping, OCR, indexing,
  deduplication, or rich previews for every file type
- Vim editor mode
- multi-agent orchestration
- export-time wiki-link bundling

## Proof points
- the conversation store on disk stays readable and valid
- reloading the app restores the same thread
- a user can use the UI as the main surface instead of the terminal alone
- exported Markdown is good enough to hand to another agent/chat tool
- a copied/exported web-chatbot transcript can be appended into the canonical
  conversation without direct browser automation
- a user can attach a local file to a message and inspect it later from the
  thread

## Immediate implementation questions
- what is the smallest useful agent adapter or mocked reply path
- whether selected Context Forge message export belongs before or after the
  first assistant adapter boundary
