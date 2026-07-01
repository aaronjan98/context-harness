/**
 * SimpleEditor — Phase 1 editor implementation.
 *
 * A plain textarea that satisfies the EditorProps contract.
 * Enter submits. Shift+Enter inserts a newline. Tab inserts two spaces.
 *
 * This component is replaced in Phase 2 by RichEditor (CodeMirror + vim).
 * The swap is one line in features/editor/index.ts — this file is not touched.
 *
 * See project-memory/frontend-architecture.md § Editor abstraction.
 */

import type { EditorProps } from './types'

export function SimpleEditor({
  value,
  onChange,
  onSubmit,
  disabled,
  placeholder,
  variant = 'composer',
}: EditorProps) {
  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    // Enter submits; Shift+Enter keeps multiline editing available.
    if (e.key === 'Enter' && !e.shiftKey) {
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
      placeholder={placeholder ?? 'Message... (Enter to send, Shift+Enter for newline)'}
      rows={variant === 'modal' ? 18 : 4}
      className={`cf-editor ${variant === 'modal' ? 'cf-editor-modal' : ''}`}
    />
  )
}
