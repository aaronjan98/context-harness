/**
 * SimpleEditor — Phase 1 editor implementation.
 *
 * A plain textarea that satisfies the EditorProps contract.
 * Ctrl+Enter submits. Tab inserts two spaces (prevents focus loss).
 *
 * This component is replaced in Phase 2 by RichEditor (CodeMirror + vim).
 * The swap is one line in features/editor/index.ts — this file is not touched.
 *
 * See project-memory/frontend-architecture.md § Editor abstraction.
 */

import type { EditorProps } from './types'

export function SimpleEditor({ value, onChange, onSubmit, disabled }: EditorProps) {
  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    // Ctrl+Enter — submit
    if (e.key === 'Enter' && e.ctrlKey) {
      e.preventDefault()
      if (!disabled) onSubmit()
      return
    }

    // Tab — insert two spaces instead of moving focus
    if (e.key === 'Tab') {
      e.preventDefault()
      const target = e.currentTarget
      const start = target.selectionStart
      const end = target.selectionEnd
      const next = value.substring(0, start) + '  ' + value.substring(end)
      onChange(next)
      // Restore cursor position after React re-renders
      requestAnimationFrame(() => {
        target.selectionStart = start + 2
        target.selectionEnd = start + 2
      })
    }
  }

  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={handleKeyDown}
      disabled={disabled}
      placeholder="Message... (Ctrl+Enter to send)"
      rows={4}
      className="cf-editor"
    />
  )
}
