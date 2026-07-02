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
import { Compartment, EditorSelection, EditorState, Prec } from '@codemirror/state'
import { EditorView, drawSelection, keymap, lineNumbers, placeholder } from '@codemirror/view'
import { getCM, Vim, vim } from '@replit/codemirror-vim'
import { useSettingsStore } from '@/store/settings'
import type { EditorProps, EditorVimMode } from './types'
import { latexSuiteAutosnippets } from './latexSuiteShortcuts'

const editableCompartment = new Compartment()
const placeholderCompartment = new Compartment()
const latexSuiteCompartment = new Compartment()
const cursorThemeCompartment = new Compartment()
type VimCodeMirror = Parameters<typeof Vim.handleKey>[0]

interface VimCloseActions {
  saveAndClose?: () => void
  discardAndClose?: () => void
}

interface VimRuntimeState {
  exMode?: boolean
  insertMode?: boolean
  visualMode?: boolean
}

interface VimModeChangeEvent {
  mode?: string
}

interface VimCodeMirrorEvents {
  on?: (event: string, handler: (event: VimModeChangeEvent) => void) => void
  off?: (event: string, handler: (event: VimModeChangeEvent) => void) => void
}

const vimCloseActionsByEditor = new WeakMap<VimCodeMirror, VimCloseActions>()
let areContextForgeVimCommandsRegistered = false

function registerContextForgeVimCommands() {
  if (areContextForgeVimCommandsRegistered) return
  areContextForgeVimCommandsRegistered = true

  Vim.defineEx('quit', 'q', (cm) => {
    vimCloseActionsByEditor
      .get(cm as VimCodeMirror)
      ?.discardAndClose?.()
  })
  Vim.defineEx('wq', 'wq', (cm) => {
    vimCloseActionsByEditor
      .get(cm as VimCodeMirror)
      ?.saveAndClose?.()
  })
  Vim.defineEx('xit', 'x', (cm) => {
    vimCloseActionsByEditor
      .get(cm as VimCodeMirror)
      ?.saveAndClose?.()
  })
}

export function RichEditor({
  value,
  onChange,
  onSubmit,
  onExpand,
  selection,
  onSelectionChange,
  focusRequest,
  vimMode,
  onVimModeChange,
  onSaveAndClose,
  onDiscardAndClose,
  disabled = false,
  placeholder: placeholderText,
  variant = 'composer',
}: EditorProps) {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const viewRef = useRef<EditorView | null>(null)
  const onChangeRef = useRef(onChange)
  const onSubmitRef = useRef(onSubmit)
  const onExpandRef = useRef(onExpand)
  const onSelectionChangeRef = useRef(onSelectionChange)
  const onVimModeChangeRef = useRef(onVimModeChange)
  const onSaveAndCloseRef = useRef(onSaveAndClose)
  const onDiscardAndCloseRef = useRef(onDiscardAndClose)
  const selectionRef = useRef(selection)
  const vimModeRef = useRef(vimMode)
  const lastHandledFocusRequestRef = useRef<unknown>(undefined)
  const pendingVimCloseChordRef = useRef(false)
  const latexSuiteEnabled = useSettingsStore((state) => state.latexSuiteEnabled)
  const cursorColor = useSettingsStore((state) => state.cursorColor)

  useEffect(() => {
    onChangeRef.current = onChange
  }, [onChange])

  useEffect(() => {
    onSubmitRef.current = onSubmit
  }, [onSubmit])

  useEffect(() => {
    onExpandRef.current = onExpand
  }, [onExpand])

  useEffect(() => {
    onSelectionChangeRef.current = onSelectionChange
  }, [onSelectionChange])

  useEffect(() => {
    selectionRef.current = selection
  }, [selection])

  useEffect(() => {
    vimModeRef.current = vimMode
  }, [vimMode])

  useEffect(() => {
    onVimModeChangeRef.current = onVimModeChange
  }, [onVimModeChange])

  useEffect(() => {
    onSaveAndCloseRef.current = onSaveAndClose
  }, [onSaveAndClose])

  useEffect(() => {
    onDiscardAndCloseRef.current = onDiscardAndClose
  }, [onDiscardAndClose])

  useEffect(() => {
    if (!hostRef.current || viewRef.current) return
    registerContextForgeVimCommands()

    function sendVimEscape(editorView: EditorView) {
      const cm = getCM(editorView)
      if (!cm?.state.vim) return false

      Vim.handleKey(cm as VimCodeMirror, '<Esc>', 'user')
      onVimModeChangeRef.current?.('normal')
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

    function isExpandEditorEvent(event: KeyboardEvent) {
      return event.ctrlKey && event.key.toLowerCase() === 'g'
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
      onVimModeChangeRef.current?.('normal')
      view.focus()
      return true
    }

    function handleVimCloseChordEvent(event: KeyboardEvent) {
      if (!onSaveAndCloseRef.current && !onDiscardAndCloseRef.current) {
        pendingVimCloseChordRef.current = false
        return false
      }

      if (
        event.ctrlKey ||
        event.altKey ||
        event.metaKey ||
        event.key !== 'Z'
      ) {
        pendingVimCloseChordRef.current = false
        return false
      }

      const cm = getCM(view)
      const vimState = cm?.state.vim as VimRuntimeState | undefined
      if (
        !vimState ||
        vimState.insertMode ||
        vimState.visualMode ||
        vimState.exMode
      ) {
        pendingVimCloseChordRef.current = false
        return false
      }

      if (!pendingVimCloseChordRef.current) {
        pendingVimCloseChordRef.current = true
        event.preventDefault()
        event.stopPropagation()
        event.stopImmediatePropagation()
        return true
      }

      pendingVimCloseChordRef.current = false
      event.preventDefault()
      event.stopPropagation()
      event.stopImmediatePropagation()
      onSaveAndCloseRef.current?.()
      return true
    }

    function handleVimDiscardChordEvent(event: KeyboardEvent) {
      if (!onDiscardAndCloseRef.current) {
        pendingVimCloseChordRef.current = false
        return false
      }

      if (
        !pendingVimCloseChordRef.current ||
        event.ctrlKey ||
        event.altKey ||
        event.metaKey ||
        event.key !== 'Q'
      ) {
        return false
      }

      const cm = getCM(view)
      const vimState = cm?.state.vim as VimRuntimeState | undefined
      if (
        !vimState ||
        vimState.insertMode ||
        vimState.visualMode ||
        vimState.exMode
      ) {
        pendingVimCloseChordRef.current = false
        return false
      }

      pendingVimCloseChordRef.current = false
      event.preventDefault()
      event.stopPropagation()
      event.stopImmediatePropagation()
      onDiscardAndCloseRef.current?.()
      return true
    }

    function handleExpandEditorEvent(event: KeyboardEvent) {
      if (
        variant !== 'composer' ||
        !onExpandRef.current ||
        !isExpandEditorEvent(event)
      ) {
        return false
      }

      event.preventDefault()
      event.stopPropagation()
      event.stopImmediatePropagation()
      onExpandRef.current()
      return true
    }

    const editorKeymap = Prec.highest(keymap.of([
      {
        key: 'Ctrl-G',
        preventDefault: variant === 'composer',
        stopPropagation: variant === 'composer',
        run: () => {
          if (variant !== 'composer' || !onExpandRef.current) return false
          onExpandRef.current()
          return true
        },
      },
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
        selection: selection
          ? EditorSelection.single(
              clampSelectionPosition(selection.anchor, value.length),
              clampSelectionPosition(selection.head, value.length),
            )
          : undefined,
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
              onVimModeChangeRef.current?.('normal')
              editorView.focus()
              return true
            },
          }),
          EditorView.lineWrapping,
          EditorView.updateListener.of((update) => {
            if (update.docChanged) onChangeRef.current(update.state.doc.toString())
            if (update.selectionSet) {
              onSelectionChangeRef.current?.({
                anchor: update.state.selection.main.anchor,
                head: update.state.selection.main.head,
              })
            }
          }),
        ],
      }),
      parent: hostRef.current,
    })

    viewRef.current = view
    const cm = getCM(view)
    const handleVimModeChange = (event: VimModeChangeEvent) => {
      const nextMode = vimModeFromEvent(event)
      if (nextMode) onVimModeChangeRef.current?.(nextMode)
    }
    if (cm) {
      vimCloseActionsByEditor.set(cm as VimCodeMirror, {
        saveAndClose: () => onSaveAndCloseRef.current?.(),
        discardAndClose: () => onDiscardAndCloseRef.current?.(),
      })
      ;(cm as VimCodeMirrorEvents).on?.('vim-mode-change', handleVimModeChange)
    }
    let lastPointerDownAt = 0

    const captureVimEscape = (event: KeyboardEvent) => {
      if (handleVimDiscardChordEvent(event)) return
      if (handleVimCloseChordEvent(event)) return
      if (handleExpandEditorEvent(event)) return
      handleVimEscapeEvent('content-dom-capture', event)
    }

    const captureWindowVimEscape = (event: KeyboardEvent) => {
      const activeElement = document.activeElement
      const editorHasFocus =
        activeElement instanceof Node &&
        (view.dom.contains(activeElement) || hostRef.current?.contains(activeElement))

      debugVimEscape('window-capture', event)
      if (!editorHasFocus) return
      if (handleVimDiscardChordEvent(event)) return
      if (handleVimCloseChordEvent(event)) return
      if (handleExpandEditorEvent(event)) return
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
        onVimModeChangeRef.current?.('normal')
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
    requestAnimationFrame(() => {
      view.focus()
      restoreVimMode(view, vimModeRef.current)
    })
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
      const cm = getCM(view)
      if (cm) {
        vimCloseActionsByEditor.delete(cm as VimCodeMirror)
        ;(cm as VimCodeMirrorEvents).off?.('vim-mode-change', handleVimModeChange)
      }
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
    if (!view || focusRequest === undefined) return
    if (lastHandledFocusRequestRef.current === focusRequest) return
    lastHandledFocusRequestRef.current = focusRequest

    const docLength = view.state.doc.length
    const nextSelection = selectionRef.current
    const nextVimMode = vimModeRef.current
    view.focus()
    if (nextSelection) {
      view.dispatch({
        selection: EditorSelection.single(
          clampSelectionPosition(nextSelection.anchor, docLength),
          clampSelectionPosition(nextSelection.head, docLength),
        ),
        scrollIntoView: true,
      })
    }
    restoreVimMode(view, nextVimMode)
  }, [focusRequest])

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

function clampSelectionPosition(position: number, docLength: number) {
  return Math.max(0, Math.min(position, docLength))
}

function vimModeFromEvent(event: VimModeChangeEvent): EditorVimMode | null {
  if (event.mode === 'insert' || event.mode === 'replace') return 'insert'
  if (event.mode === 'normal') return 'normal'
  return null
}

function restoreVimMode(view: EditorView, mode: EditorVimMode | undefined) {
  if (!mode) return

  const cm = getCM(view)
  const vimState = cm?.state.vim as VimRuntimeState | undefined
  if (!cm || !vimState) return

  if (mode === 'insert') {
    if (!vimState.insertMode) Vim.handleKey(cm as VimCodeMirror, 'i', 'user')
    return
  }

  if (vimState.insertMode) {
    Vim.exitInsertMode(cm as never, true)
  }
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
