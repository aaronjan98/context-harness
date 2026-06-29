# Cross-Editor Snippet Strategy

## Decision (2026-04-28)

The user's LaTeX/math snippet system spans four targets. A single plugin cannot
cover all of them — each runs a different runtime (Lua, JavaScript, TypeScript,
browser). The correct architecture is **one shared data file, per-target adapters**.

## Canonical data source

```
~/Repositories/self-hosted/zettelkasten/Documents/shortcuts.json
```

This file is the Obsidian latex-suite snippet format. It is the source of truth.
No editor should maintain its own independent snippet list — derive from this file.

## Per-target adapters

| Target | Mechanism | Status |
|---|---|---|
| Neovim | LuaSnip Lua adapter (`~/.config/nvim/lua/snippets/markdown.lua`) | Broken; needs full redo |
| Obsidian | latex-suite reads shortcuts.json natively | Working |
| VSCodium | Convert shortcuts.json → VS Code snippet JSON | Not yet done |
| Context Forge | CodeMirror 6 `@codemirror/autocomplete` snippet system in `RichEditor.tsx` | Phase 2 |

## Options flag mapping (from shortcuts.json)

Each snippet entry has an `options` string that must be translated per target:

| Flag | Meaning |
|---|---|
| `t` | Text mode only (no math condition) |
| `m` | Math mode only |
| `A` | Auto-expand (no Tab needed) |
| `r` | Regex trigger |
| `w` | Word boundary |
| `tA` | Global autosnippet |
| `mA` | Math-mode autosnippet |
| `rmA` | Regex math autosnippet |

## Context Forge specifics (Phase 2)

When implementing `RichEditor.tsx` with CodeMirror 6:

1. Load `shortcuts.json` at build time or runtime (file is local, can be bundled or fetched).
2. Filter to text-mode snippets (`t`, `tA`) for the input box — math-mode ones
   are less useful in a chat input context, but math-mode can be included if
   in-math detection is implemented via CodeMirror's syntax tree.
3. Use `@codemirror/autocomplete`'s `snippetCompletion` or a custom
   `CompletionSource` to drive expansion.
4. Auto-expanding snippets (`A` flag) require a custom transaction filter that
   watches for matching trigger strings and expands without Tab.

The math-context detection in CodeMirror mirrors Neovim's treesitter approach:
walk the syntax node at cursor position, check for `InlineFormula` or
`FencedCode` math node types from the `@lezer/markdown` grammar.

## What NOT to do

- Do not create a separate snippet list for each editor — they will diverge.
- Do not try to write a unified Lua plugin that runs in Obsidian or VSCodium;
  those runtimes do not have Lua.
- Do not use UltiSnips format — it is Vim/Neovim only and creates the same
  divergence problem.

## Related files

- `~/.config/nvim/MEMORY.md` — nvim-side strategy and adapter redo notes
- `~/.config/nvim/memory/2026-04-28.md` — full session log with known bugs
- `~/Repositories/self-hosted/zettelkasten/Documents/shortcuts.json` — canonical data
- `frontend-architecture.md` — Phase 2 RichEditor context
