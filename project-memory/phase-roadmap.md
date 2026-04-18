# Phase Roadmap

## Phase 1 — Conversation MVP
Prove the app can act as a real conversation surface.

Success means:
- create a conversation
- render a thread
- accept input from the browser
- append replies from one agent path
- persist canonical files and update Markdown export

Current status:
- backend foundation mostly complete
- UI work is separate
- Markdown import is the main remaining backend feature for this phase

## Phase 2 — Math-native input
Prove the app is materially better for math-heavy work.

Success means:
- replace the plain text box with a Vim-style editor
- wire in Obsidian-style LaTeX shortcut behavior
- keep the editor integrated with the same conversation model

## Phase 3 — Forking and thread manipulation
Prove the conversation model can support alternate versions cleanly.

Success means:
- fork from a prior message
- insert/edit/delete messages through the GUI
- reshape a conversation without corrupting canonical data
- restore earlier snapshots when needed

## Phase 4 — Graph view
Prove the conversation graph is inspectable and navigable visually.

Success means:
- render nodes and edges for the conversation
- navigate between alternate paths
- prepare for later visual graph edits

## Phase 5 — Multi-agent workflow
Prove the conversation store can coordinate multiple agents and external tools.

Success means:
- multiple agents can continue the same conversation
- exports are reliable enough for agent handoff
- adapters can submit replies without breaking the canonical store
