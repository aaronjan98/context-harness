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

import { useEffect, useRef } from 'react'
import type { EditorProps } from './types'

export function SimpleEditor({
  value,
  onChange,
  onSubmit,
  onExpand,
  selection,
  onSelectionChange,
  focusRequest,
  disabled,
  placeholder,
  variant = 'composer',
}: EditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const selectionRef = useRef(selection)
  const lastHandledFocusRequestRef = useRef<unknown>(undefined)

  useEffect(() => {
    selectionRef.current = selection
  }, [selection])

  useEffect(() => {
    const textarea = textareaRef.current
    if (!textarea || focusRequest === undefined) return
    if (lastHandledFocusRequestRef.current === focusRequest) return
    lastHandledFocusRequestRef.current = focusRequest

    const nextSelection = selectionRef.current
    textarea.focus()
    if (nextSelection) {
      textarea.selectionStart = clampSelectionPosition(
        nextSelection.anchor,
        textarea.value.length,
      )
      textarea.selectionEnd = clampSelectionPosition(
        nextSelection.head,
        textarea.value.length,
      )
    }
  }, [focusRequest])

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (variant === 'composer' && e.key.toLowerCase() === 'g' && e.ctrlKey && onExpand) {
      e.preventDefault()
      onExpand()
      return
    }

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
      ref={textareaRef}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={handleKeyDown}
      onSelect={(event) => {
        onSelectionChange?.({
          anchor: event.currentTarget.selectionStart,
          head: event.currentTarget.selectionEnd,
        })
      }}
      disabled={disabled}
      placeholder={placeholder ?? 'Message... (Enter to send, Shift+Enter for newline)'}
      rows={variant === 'modal' ? 18 : 4}
      className={`cf-editor ${variant === 'modal' ? 'cf-editor-modal' : ''}`}
    />
  )
}

function clampSelectionPosition(position: number, docLength: number) {
  return Math.max(0, Math.min(position, docLength))
}
