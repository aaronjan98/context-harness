/**
 * RichEditor — Phase 2 editor implementation (STUB).
 *
 * Will be implemented in Phase 2 using:
 *   - CodeMirror 6 (@codemirror/view, @codemirror/state, @codemirror/lang-markdown)
 *   - Vim bindings (@replit/codemirror-vim)
 *   - Inline LaTeX preview via KaTeX
 *
 * Keybinding: Ctrl+Enter submits in both insert and normal mode.
 *
 * To activate: change features/editor/index.ts to export RichEditor as Editor.
 * Nothing else in the app needs to change.
 *
 * See project-memory/frontend-architecture.md § Editor abstraction.
 */

import type { EditorProps } from './types'
import { SimpleEditor } from './SimpleEditor'

// Phase 2: replace this body with the CodeMirror implementation.
// The component signature (EditorProps) must remain unchanged.
export function RichEditor(props: EditorProps) {
  // Fallback to SimpleEditor until Phase 2 is implemented.
  return <SimpleEditor {...props} />
}
