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
import { useSettingsStore } from '@/store/settings'
import type { EditorProps } from './types'
import { latexSuiteAutosnippets } from './latexSuiteShortcuts'

const editableCompartment = new Compartment()
const placeholderCompartment = new Compartment()
const latexSuiteCompartment = new Compartment()
const cursorThemeCompartment = new Compartment()
type VimCodeMirror = Parameters<typeof Vim.handleKey>[0]

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
  const latexSuiteEnabled = useSettingsStore((state) => state.latexSuiteEnabled)
  const cursorColor = useSettingsStore((state) => state.cursorColor)

  useEffect(() => {
    onChangeRef.current = onChange
  }, [onChange])

  useEffect(() => {
    onSubmitRef.current = onSubmit
  }, [onSubmit])

  useEffect(() => {
    if (!hostRef.current || viewRef.current) return

    function sendVimEscape(editorView: EditorView) {
      const cm = getCM(editorView)
      if (!cm?.state.vim) return false

      Vim.handleKey(cm as VimCodeMirror, '<Esc>', 'user')
      editorView.focus()
      return true
    }

    function isVimEscapeEvent(event: KeyboardEvent) {
      return (
        event.key === 'Escape' ||
        event.key === 'Esc' ||
        event.keyCode === 27 ||
        (event.ctrlKey &&
          (event.key === '[' || event.code === 'BracketLeft' || event.keyCode === 219))
      )
    }

    function debugVimEscape(source: string, event: KeyboardEvent) {
      if (window.localStorage.getItem('cf.debugVimEscape') !== '1') return
      const activeElement = document.activeElement
      console.debug('[cf:vim-escape]', {
        source,
        key: event.key,
        code: event.code,
        keyCode: event.keyCode,
        ctrlKey: event.ctrlKey,
        altKey: event.altKey,
        metaKey: event.metaKey,
        shiftKey: event.shiftKey,
        defaultPrevented: event.defaultPrevented,
        eventPhase: event.eventPhase,
        target: describeElement(event.target),
        activeElement: describeElement(activeElement),
      })
    }

    function handleVimEscapeEvent(source: string, event: KeyboardEvent) {
      debugVimEscape(source, event)
      if (!isVimEscapeEvent(event)) return false
      const cm = getCM(view)
      if (!cm?.state.vim) return false

      event.preventDefault()
      event.stopPropagation()
      event.stopImmediatePropagation()
      Vim.handleKey(cm as VimCodeMirror, '<Esc>', 'user')
      view.focus()
      return true
    }

    const editorKeymap = Prec.highest(keymap.of([
      {
        key: 'Escape',
        preventDefault: true,
        stopPropagation: true,
        run: sendVimEscape,
      },
      {
        key: 'Ctrl-[',
        preventDefault: true,
        stopPropagation: true,
        run: sendVimEscape,
      },
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
          Prec.highest(vim()),
          lineNumbers(),
          drawSelection(),
          history(),
          markdown(),
          bracketMatching(),
          closeBrackets(),
          syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
          latexSuiteCompartment.of(
            latexSuiteEnabled ? latexSuiteAutosnippets() : [],
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
              debugVimEscape('codemirror-dom-handler', event)
              if (event.key !== 'Escape' && !(event.ctrlKey && event.key === '[')) return false
              const cm = getCM(editorView)
              if (!cm?.state.vim) return false

              event.preventDefault()
              event.stopPropagation()
              Vim.handleKey(cm as VimCodeMirror, '<Esc>', 'user')
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
    let lastPointerDownAt = 0

    const captureVimEscape = (event: KeyboardEvent) => {
      handleVimEscapeEvent('content-dom-capture', event)
    }

    const captureWindowVimEscape = (event: KeyboardEvent) => {
      const activeElement = document.activeElement
      const editorHasFocus =
        activeElement instanceof Node &&
        (view.dom.contains(activeElement) || hostRef.current?.contains(activeElement))

      debugVimEscape('window-capture', event)
      if (!editorHasFocus) return
      handleVimEscapeEvent('window-capture-active-editor', event)
    }

    const capturePointerDown = () => {
      lastPointerDownAt = window.performance.now()
    }

    const logFocusOut = (event: FocusEvent) => {
      if (window.localStorage.getItem('cf.debugVimEscape') !== '1') return
      window.setTimeout(() => {
        console.debug('[cf:vim-escape]', {
          source: 'editor-focusout',
          target: describeElement(event.target),
          relatedTarget: describeElement(event.relatedTarget),
          activeElement: describeElement(document.activeElement),
        })
      }, 0)
    }

    const recoverKeyboardBlur = (event: FocusEvent) => {
      window.setTimeout(() => {
        const now = window.performance.now()
        const blurredByPointer = now - lastPointerDownAt < 250
        const focusFellToPage =
          document.activeElement === document.body ||
          document.activeElement === document.documentElement
        const focusStayedInWindow = document.hasFocus()
        const leavingEditor =
          event.target instanceof Node && view.dom.contains(event.target)

        if (
          !leavingEditor ||
          blurredByPointer ||
          !focusFellToPage ||
          !focusStayedInWindow
        ) {
          return
        }

        const cm = getCM(view)
        if (!cm?.state.vim) return

        Vim.handleKey(cm as VimCodeMirror, '<Esc>', 'user')
        view.focus()
        if (window.localStorage.getItem('cf.debugVimEscape') === '1') {
          console.debug('[cf:vim-escape]', {
            source: 'recover-keyboard-blur',
            target: describeElement(event.target),
            activeElement: describeElement(document.activeElement),
          })
        }
      }, 0)
    }

    view.contentDOM.addEventListener('keydown', captureVimEscape, {
      capture: true,
    })
    window.addEventListener('keydown', captureWindowVimEscape, {
      capture: true,
    })
    window.addEventListener('pointerdown', capturePointerDown, {
      capture: true,
    })
    view.dom.addEventListener('focusout', logFocusOut)
    view.dom.addEventListener('focusout', recoverKeyboardBlur)
    requestAnimationFrame(() => view.focus())
    return () => {
      view.contentDOM.removeEventListener('keydown', captureVimEscape, {
        capture: true,
      })
      window.removeEventListener('keydown', captureWindowVimEscape, {
        capture: true,
      })
      window.removeEventListener('pointerdown', capturePointerDown, {
        capture: true,
      })
      view.dom.removeEventListener('focusout', logFocusOut)
      view.dom.removeEventListener('focusout', recoverKeyboardBlur)
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
      effects: latexSuiteCompartment.reconfigure(
        latexSuiteEnabled ? latexSuiteAutosnippets() : [],
      ),
    })
  }, [latexSuiteEnabled])

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

function describeElement(element: EventTarget | null) {
  if (!(element instanceof Element)) return String(element)
  const classes = Array.from(element.classList).slice(0, 4).join('.')
  return `${element.tagName.toLowerCase()}${element.id ? `#${element.id}` : ''}${
    classes ? `.${classes}` : ''
  }`
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
