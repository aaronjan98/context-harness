# Phase 1 Mini-Goal

## Goal
Build the first usable slice of Context Forge: a local browser UI that can
hold a conversation, accept input, persist it canonically, and keep a readable
Markdown export in sync.

## Current implementation status
Backend progress:
- create/open conversation flow is implemented
- canonical message append/read/export flow is implemented
- backend tests cover the current storage and API foundation

Frontend progress:
- React/Vite browser shell is implemented enough for create/read/append,
  rename/delete, Markdown rendering, and manual transcript import
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

## Out of scope
- branching/forking
- graph view
- advanced attachment handling
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

## Immediate implementation questions
- what is the smallest useful agent adapter or mocked reply path
- whether selected Context Forge message export belongs before or after the
  first assistant adapter boundary
