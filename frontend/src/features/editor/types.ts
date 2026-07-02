/**
 * EditorProps — the stable contract for the input editor component.
 *
 * ThreadView depends only on this interface, never on a specific
 * implementation. This makes the Phase 1 → Phase 2 editor swap a one-line
 * change in features/editor/index.ts without touching ThreadView.
 *
 * Implementations:
 *   SimpleEditor  (Phase 1) — styled textarea, Enter submits
 *   RichEditor    (Phase 2) — CodeMirror 6 + vim bindings + LaTeX preview
 *
 * See project-memory/frontend-architecture.md § Editor abstraction.
 */

export interface EditorSelectionSnapshot {
  anchor: number
  head: number
}

export type EditorVimMode = 'normal' | 'insert'

export interface EditorProps {
  /** Current editor content. Controlled by the parent (ThreadView). */
  value: string

  /** Called on every content change. */
  onChange: (value: string) => void

  /**
   * Called when the user commits the current value.
   */
  onSubmit: () => void

  /** Disables input while a message is being sent. */
  disabled?: boolean

  /** Optional placeholder text for editor implementations that support it. */
  placeholder?: string

  /** Optional request to open this editor value in a larger modal surface. */
  onExpand?: () => void

  /** Initial or restored cursor/selection position. */
  selection?: EditorSelectionSnapshot

  /** Called when the cursor/selection changes. */
  onSelectionChange?: (selection: EditorSelectionSnapshot) => void

  /** Increment/change this value to request focus from the parent. */
  focusRequest?: number

  /** Current or restored Vim mode. RichEditor ignores visual mode for handoff. */
  vimMode?: EditorVimMode

  /** Called when RichEditor enters normal or insert mode. */
  onVimModeChange?: (mode: EditorVimMode) => void

  /** Optional Vim-style save-and-close action for modal editor surfaces. */
  onSaveAndClose?: () => void

  /** Optional Vim-style discard-and-close action for modal editor surfaces. */
  onDiscardAndClose?: () => void

  /** Layout variant for shared editor surfaces. */
  variant?: 'composer' | 'modal'
}
