/**
 * EditorProps — the stable contract for the input editor component.
 *
 * ThreadView depends only on this interface, never on a specific
 * implementation. This makes the Phase 1 → Phase 2 editor swap a one-line
 * change in features/editor/index.ts without touching ThreadView.
 *
 * Implementations:
 *   SimpleEditor  (Phase 1) — styled textarea, Ctrl+Enter submits
 *   RichEditor    (Phase 2) — CodeMirror 6 + vim bindings + LaTeX preview
 *
 * See project-memory/frontend-architecture.md § Editor abstraction.
 */

export interface EditorProps {
  /** Current editor content. Controlled by the parent (ThreadView). */
  value: string

  /** Called on every content change. */
  onChange: (value: string) => void

  /**
   * Called when the user commits the current value (Ctrl+Enter in both
   * SimpleEditor and RichEditor; also Enter in vim normal mode for RichEditor).
   */
  onSubmit: () => void

  /** Disables input while a message is being sent. */
  disabled?: boolean
}
