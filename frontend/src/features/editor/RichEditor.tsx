/**
 * RichEditor — CodeMirror editor with Vim bindings and latex-suite autosnippets.
 *
 * This is the shared editor substrate for the composer and message edit modal.
 * Segment-level inline editing should reuse this component later instead of
 * building a separate editor path.
 */

import { useEffect, useRef } from 'react'
import { closeBrackets } from '@codemirror/autocomplete'
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import { markdown } from '@codemirror/lang-markdown'
import { bracketMatching, defaultHighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { Compartment, EditorState, Prec } from '@codemirror/state'
import { EditorView, drawSelection, keymap, lineNumbers, placeholder } from '@codemirror/view'
import { getCM, Vim, vim } from '@replit/codemirror-vim'
import { useUIStore } from '@/store/ui'
import type { EditorProps } from './types'
import { latexSuiteAutosnippets } from './latexSuiteShortcuts'

const editableCompartment = new Compartment()
const placeholderCompartment = new Compartment()
const vimCompartment = new Compartment()
const latexSuiteCompartment = new Compartment()
const cursorThemeCompartment = new Compartment()
type VimCodeMirror = Parameters<typeof Vim.exitInsertMode>[0]

export function RichEditor({
  value,
  onChange,
  onSubmit,
  disabled = false,
  placeholder: placeholderText,
  variant = 'composer',
}: EditorProps) {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const viewRef = useRef<EditorView | null>(null)
  const onChangeRef = useRef(onChange)
  const onSubmitRef = useRef(onSubmit)
  const editorMode = useUIStore((state) => state.editorMode)
  const latexSuiteEnabled = useUIStore((state) => state.latexSuiteEnabled)
  const cursorColor = useUIStore((state) => state.cursorColor)
  const editorModeRef = useRef(editorMode)

  useEffect(() => {
    onChangeRef.current = onChange
  }, [onChange])

  useEffect(() => {
    onSubmitRef.current = onSubmit
  }, [onSubmit])

  useEffect(() => {
    editorModeRef.current = editorMode
  }, [editorMode])

  useEffect(() => {
    if (!hostRef.current || viewRef.current) return

    const editorKeymap = Prec.highest(keymap.of([
      {
        key: 'Ctrl-Enter',
        mac: 'Mod-Enter',
        run: () => {
          onSubmitRef.current()
          return true
        },
      },
    ]))

    const view = new EditorView({
      state: EditorState.create({
        doc: value,
        extensions: [
          vimCompartment.of(editorMode === 'vim' ? Prec.highest(vim()) : []),
          lineNumbers(),
          drawSelection(),
          history(),
          markdown(),
          bracketMatching(),
          closeBrackets(),
          syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
          latexSuiteCompartment.of(
            editorMode === 'vim' && latexSuiteEnabled
              ? latexSuiteAutosnippets()
              : [],
          ),
          editorKeymap,
          keymap.of([
            ...historyKeymap,
            indentWithTab,
            ...defaultKeymap,
          ]),
          editableCompartment.of([
            EditorState.readOnly.of(disabled),
            EditorView.editable.of(!disabled),
          ]),
          placeholderCompartment.of(
            placeholder(
              placeholderText ??
                'Message... (Vim mode, Ctrl+Enter to send, latex-suite autosnippets enabled)',
            ),
          ),
          cursorThemeCompartment.of(cursorTheme(cursorColor)),
          EditorView.domEventHandlers({
            keydown: (event, editorView) => {
              if (event.key !== 'Escape') return false
              if (editorModeRef.current !== 'vim') return false
              const cm = getCM(editorView)
              if (!cm?.state.vim) return false

              event.preventDefault()
              event.stopPropagation()
              Vim.exitInsertMode(cm as VimCodeMirror)
              editorView.focus()
              return true
            },
          }),
          EditorView.lineWrapping,
          EditorView.updateListener.of((update) => {
            if (!update.docChanged) return
            onChangeRef.current(update.state.doc.toString())
          }),
        ],
      }),
      parent: hostRef.current,
    })

    viewRef.current = view
    requestAnimationFrame(() => view.focus())
    return () => {
      view.destroy()
      viewRef.current = null
    }
    // The editor instance owns its internal state; prop sync happens below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    view.dispatch({
      effects: vimCompartment.reconfigure(
        editorMode === 'vim' ? Prec.highest(vim()) : [],
      ),
    })
  }, [editorMode])

  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    view.dispatch({
      effects: latexSuiteCompartment.reconfigure(
        editorMode === 'vim' && latexSuiteEnabled
          ? latexSuiteAutosnippets()
          : [],
      ),
    })
  }, [editorMode, latexSuiteEnabled])

  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    view.dispatch({
      effects: cursorThemeCompartment.reconfigure(cursorTheme(cursorColor)),
    })
  }, [cursorColor])

  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    const currentValue = view.state.doc.toString()
    if (currentValue === value) return
    view.dispatch({
      changes: { from: 0, to: currentValue.length, insert: value },
    })
  }, [value])

  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    view.dispatch({
      effects: editableCompartment.reconfigure([
        EditorState.readOnly.of(disabled),
        EditorView.editable.of(!disabled),
      ]),
    })
  }, [disabled])

  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    view.dispatch({
      effects: placeholderCompartment.reconfigure(
        placeholder(
          placeholderText ??
            'Message... (Vim mode, Ctrl+Enter to send, latex-suite autosnippets enabled)',
        ),
      ),
    })
  }, [placeholderText])

  return (
    <div
      ref={hostRef}
      className={`cf-rich-editor ${
        variant === 'modal' ? 'cf-rich-editor-modal' : ''
      }`}
    />
  )
}

function cursorTheme(color: string) {
  return EditorView.theme({
    '.cm-cursor': {
      borderLeftColor: color,
      borderLeftWidth: '2px',
    },
    '.cm-fat-cursor': {
      background: color,
      color: 'var(--cf-bg)',
    },
    '.cm-focused .cm-fat-cursor': {
      background: color,
      outline: 'none',
    },
    '&:not(.cm-focused) .cm-fat-cursor': {
      outlineColor: color,
    },
  })
}
