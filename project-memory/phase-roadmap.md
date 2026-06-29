# Phase Roadmap

## Phase 1 — Conversation MVP
Prove the app can act as a real conversation surface.

Success means:
- create a conversation
- render a thread
- accept input from the browser
- append replies from one agent path
- persist canonical files and update Markdown export
- align the frontend/backend API contract around the local backend as the only
  canonical writer

Current status:
- backend foundation mostly complete
- frontend scaffold exists but does not yet match the backend API contract
- Markdown import is the main remaining backend feature for this phase
- local files/tools/skills are future backend capabilities, not Phase 1
  behavior

## Phase 2 — Math-native input
Prove the app is materially better for math-heavy work.

Success means:
- replace the plain text box with a Vim-style editor
- wire in Obsidian-style LaTeX shortcut behavior
- keep the editor integrated with the same conversation model
- support structured writing patterns, including bullet-heavy input, without
  turning this phase into automated context selection

## Phase 3 — Forking and thread manipulation
Prove the conversation model can support alternate versions cleanly.

Success means:
- fork from a prior message
- insert/edit/delete messages through the GUI
- reshape a conversation without corrupting canonical data
- restore earlier snapshots when needed

## Phase 4 — Context lenses and graph view
Prove long conversations can be navigated visually and exported selectively.

Success means:
- render nodes and edges for the conversation
- navigate between alternate paths
- generate context lenses such as full thread, branch-only, summary, or
  topic-focused context
- drill into detailed sub-context only when needed
- prepare for later visual graph edits

## Phase 5 — Agent and web-chatbot bridge
Prove the conversation store can coordinate multiple AI surfaces and mediated
local capabilities.

Success means:
- multiple agents can continue the same conversation
- exports are reliable enough for agent handoff
- a CLI bridge exists so Claude Code, Codex, scripts, and web-chatbot workflows
  can export context and append responses without native integration
- adapters can submit replies without breaking the canonical store
- model-requested tool actions can be reviewed, executed by the local backend,
  and exported back into the thread
