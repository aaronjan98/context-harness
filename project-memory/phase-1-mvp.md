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
- intentionally not implemented by the backend agent at this stage
- the user is building the UI layer separately

Immediate backend gap:
- Markdown import remains the main unfinished Phase 1 backend feature

## In scope
- create/open a conversation
- render the active thread in a chat UI
- text input for new user messages
- append assistant replies from one initial agent path or mock adapter
- write canonical conversation files
- regenerate `exports/current.md`
- basic Markdown import with light speaker-pattern matching

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

## Immediate implementation questions
- what initial backend API should own conversation writes
- what import syntax patterns should v1 support first
- what is the smallest useful agent adapter or mocked reply path
