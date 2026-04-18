# Durable Decisions

## Product shape
- The product is a local conversation workspace, not a Claude-specific display
  panel
- `agent-display` is the current working name
- The conversation is the source of truth; the UI is a control surface over it

## User model
- v1 is single-user
- A conversation may mix coding, math, and general discussion freely
- Conversations are not required to be linked to a repo or project

## Storage
- Canonical conversation data is file-first
- The app is the canonical writer of conversation files
- Canonical messages are individual Markdown files with YAML frontmatter
- The app reconstructs thread structure from message metadata
- Exports are public read surfaces, not the source of truth

## Agent participation
- External agents/tools may read exported conversation context
- External agents/tools should not directly write canonical message files
- The default context sent to an agent is the entire active thread
- Multi-agent replies remain in one visible linear thread by default

## Import and export
- Markdown import should do light pattern matching for speaker turns
- Imported Markdown becomes a simple linear conversation
- Canonical message bodies may contain wiki-links like `[[note]]`
- v1 export keeps wiki-links simple; bundling linked files is deferred

## Editing
- Primary manipulation happens in the GUI, not by hand-editing canonical files
- GUI edits replace messages in place from the user's point of view
- The app should keep rollback history/snapshots for recovery

## Roadmap
- Graph view comes after forking work and after Vim/math-editor work
- Forking/branching is a future phase, not a v1 requirement
