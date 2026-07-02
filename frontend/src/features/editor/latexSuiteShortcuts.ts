import {
  hasNextSnippetField,
  nextSnippetField,
  snippet as applySnippet,
} from '@codemirror/autocomplete'
import { EditorSelection, Prec } from '@codemirror/state'
import type { ChangeDesc, Extension } from '@codemirror/state'
import { EditorView, keymap } from '@codemirror/view'

export interface LatexSuiteShortcut {
  trigger: string
  replacement: string
  options: string
  priority: number
  regex: boolean
  description?: string
}

interface IndexedShortcuts {
  autosnippetsByLastChar: Map<string, LatexSuiteShortcut[]>
  autoRegexSnippets: CompiledRegexShortcut[]
  tabStringSnippets: LatexSuiteShortcut[]
  tabRegexSnippets: CompiledRegexShortcut[]
}

interface CompiledRegexShortcut {
  shortcut: LatexSuiteShortcut
  pattern: RegExp
}

const REGEX_PREFIX_LIMIT = 500
const MATH_CONTEXT_PREFIX_LIMIT = 5000

interface LatexSuiteSession {
  from: number
  to: number
  tabstops: number[]
}

interface LatexSuiteLineEndTabstop {
  from: number
  to: number
}

const sessionsByEditor = new WeakMap<EditorView, LatexSuiteSession>()
const lineEndTabstopsByEditor = new WeakMap<EditorView, LatexSuiteLineEndTabstop>()

export function latexSuiteShortcuts(shortcuts: LatexSuiteShortcut[]): Extension {
  const indexed = indexShortcuts(shortcuts)

  return [
    latexSuiteAutosnippets(indexed),
    latexSuiteTabExpansion(indexed),
    latexSuiteSessionMapper(),
  ]
}

function latexSuiteAutosnippets(indexed: IndexedShortcuts): Extension {
  return Prec.highest(EditorView.inputHandler.of((view, from, to, inserted) => {
    if (from !== to || inserted.length !== 1 || view.state.readOnly) return false

    const stringCandidates = indexed.autosnippetsByLastChar.get(inserted) ?? []
    const match =
      findStringInputMatch(view, stringCandidates, from, inserted) ??
      findRegexInputMatch(view, indexed.autoRegexSnippets, from, inserted)

    if (!match) return false
    applyLatexSuiteSnippet(view, match.shortcut, match.from, from, match.captures)
    return true
  }))
}

function latexSuiteTabExpansion(indexed: IndexedShortcuts): Extension {
  return Prec.highest(keymap.of([
    {
      key: 'Tab',
      run: (view) => {
        if (hasNextSnippetField(view.state)) {
          return nextSnippetField(view)
        }

        if (moveToRememberedTabstop(view)) return true
        if (expandTabSnippet(view, indexed)) return true
        if (tabOutOfMath(view)) return true
        if (moveToRememberedLineEnd(view)) return true

        return false
      },
    },
  ]))
}

function expandTabSnippet(view: EditorView, indexed: IndexedShortcuts) {
  const range = view.state.selection.main
  if (!range.empty) return false

  const cursor = range.head
  const match =
    findStringMatch(view, indexed.tabStringSnippets, cursor) ??
    findRegexMatch(view, indexed.tabRegexSnippets, cursor)

  if (!match) return false
  applyLatexSuiteSnippet(view, match.shortcut, match.from, cursor, match.captures)
  return true
}

function latexSuiteSessionMapper(): Extension {
  return EditorView.updateListener.of((update) => {
    if (!update.docChanged) return

    const session = sessionsByEditor.get(update.view)
    if (session) {
      const mapped = mapSession(session, update.changes)
      if (!mapped || mapped.from >= mapped.to) {
        sessionsByEditor.delete(update.view)
      } else {
        sessionsByEditor.set(update.view, mapped)
      }
    }

    const lineEndTabstop = lineEndTabstopsByEditor.get(update.view)
    if (lineEndTabstop) {
      const mapped = mapLineEndTabstop(lineEndTabstop, update.changes)
      if (!mapped || mapped.from >= mapped.to) {
        lineEndTabstopsByEditor.delete(update.view)
      } else {
        lineEndTabstopsByEditor.set(update.view, mapped)
      }
    }
  })
}

function indexShortcuts(shortcuts: LatexSuiteShortcut[]): IndexedShortcuts {
  const autosnippetsByLastChar = new Map<string, LatexSuiteShortcut[]>()
  const autoRegexSnippets: CompiledRegexShortcut[] = []
  const tabStringSnippets: LatexSuiteShortcut[] = []
  const tabRegexSnippets: CompiledRegexShortcut[] = []

  const sorted = [...shortcuts].sort(compareShortcutPriority)
  for (const shortcut of sorted) {
    if (hasUnsupportedReplacement(shortcut.replacement)) continue

    const isAutomatic = shortcut.options.includes('A')
    if (shortcut.regex) {
      const compiled = compileRegexShortcut(shortcut)
      if (!compiled) continue
      if (isAutomatic) autoRegexSnippets.push(compiled)
      else tabRegexSnippets.push(compiled)
      continue
    }

    if (isAutomatic) {
      const lastChar = shortcut.trigger[shortcut.trigger.length - 1]
      if (!lastChar) continue
      const matches = autosnippetsByLastChar.get(lastChar) ?? []
      matches.push(shortcut)
      autosnippetsByLastChar.set(lastChar, matches)
    } else {
      tabStringSnippets.push(shortcut)
    }
  }

  return {
    autosnippetsByLastChar,
    autoRegexSnippets,
    tabStringSnippets,
    tabRegexSnippets,
  }
}

function compareShortcutPriority(left: LatexSuiteShortcut, right: LatexSuiteShortcut) {
  if (right.priority !== left.priority) return right.priority - left.priority
  return right.trigger.length - left.trigger.length
}

function compileRegexShortcut(shortcut: LatexSuiteShortcut): CompiledRegexShortcut | null {
  try {
    return {
      shortcut,
      pattern: new RegExp(`${shortcut.trigger}$`),
    }
  } catch (error) {
    console.warn('[context-forge] skipped invalid latex-suite regex', {
      trigger: shortcut.trigger,
      error,
    })
    return null
  }
}

function findStringMatch(
  view: EditorView,
  candidates: LatexSuiteShortcut[],
  cursor: number,
): SnippetMatch | null {
  if (candidates.length === 0) return null

  const line = view.state.doc.lineAt(cursor)
  const prefix = view.state.doc.sliceString(line.from, cursor)
  for (const shortcut of candidates) {
    if (!prefix.endsWith(shortcut.trigger)) continue

    const from = cursor - shortcut.trigger.length
    if (!isAllowedInContext(view, shortcut, from, cursor)) continue
    return { shortcut, from, captures: [] }
  }

  return null
}

function findStringInputMatch(
  view: EditorView,
  candidates: LatexSuiteShortcut[],
  from: number,
  inserted: string,
): SnippetMatch | null {
  if (candidates.length === 0) return null

  const line = view.state.doc.lineAt(from)
  const prefix = view.state.doc.sliceString(line.from, from) + inserted
  const virtualCursor = from + inserted.length
  for (const shortcut of candidates) {
    if (!prefix.endsWith(shortcut.trigger)) continue

    const matchFrom = virtualCursor - shortcut.trigger.length
    if (!isAllowedInContext(view, shortcut, matchFrom, virtualCursor, inserted)) {
      continue
    }
    return { shortcut, from: matchFrom, captures: [] }
  }

  return null
}

function findRegexMatch(
  view: EditorView,
  candidates: CompiledRegexShortcut[],
  cursor: number,
): SnippetMatch | null {
  if (candidates.length === 0) return null

  const from = Math.max(0, cursor - REGEX_PREFIX_LIMIT)
  const prefix = view.state.doc.sliceString(from, cursor)
  for (const candidate of candidates) {
    const match = candidate.pattern.exec(prefix)
    if (!match) continue

    const matchFrom = cursor - match[0].length
    if (!isAllowedInContext(view, candidate.shortcut, matchFrom, cursor)) continue
    return {
      shortcut: candidate.shortcut,
      from: matchFrom,
      captures: match.slice(1),
    }
  }

  return null
}

function findRegexInputMatch(
  view: EditorView,
  candidates: CompiledRegexShortcut[],
  from: number,
  inserted: string,
): SnippetMatch | null {
  if (candidates.length === 0) return null

  const prefixFrom = Math.max(0, from - REGEX_PREFIX_LIMIT)
  const prefix = view.state.doc.sliceString(prefixFrom, from) + inserted
  const virtualCursor = from + inserted.length
  for (const candidate of candidates) {
    const match = candidate.pattern.exec(prefix)
    if (!match) continue

    const matchFrom = virtualCursor - match[0].length
    if (!isAllowedInContext(view, candidate.shortcut, matchFrom, virtualCursor, inserted)) {
      continue
    }
    return {
      shortcut: candidate.shortcut,
      from: matchFrom,
      captures: match.slice(1),
    }
  }

  return null
}

interface SnippetMatch {
  shortcut: LatexSuiteShortcut
  from: number
  captures: string[]
}

function isAllowedInContext(
  view: EditorView,
  shortcut: LatexSuiteShortcut,
  from: number,
  cursor: number,
  virtualInsert = '',
) {
  if (shortcut.options.includes('w') && !isWordBoundary(view, from, cursor)) {
    return false
  }

  const mathMode = isLikelyMathMode(view, cursor, virtualInsert)
  const allowsMath = /[mMn]/.test(shortcut.options)
  const allowsText = shortcut.options.includes('t')
  if (allowsMath && !mathMode) return false
  if (allowsText && !allowsMath && mathMode) return false
  if (!allowsText && !allowsMath) return true
  return true
}

function isWordBoundary(view: EditorView, from: number, cursor: number) {
  const before = from > 0 ? view.state.doc.sliceString(from - 1, from) : ''
  const after =
    cursor < view.state.doc.length
      ? view.state.doc.sliceString(cursor, cursor + 1)
      : ''
  return !/\w/.test(before) && !/\w/.test(after)
}

function applyLatexSuiteSnippet(
  view: EditorView,
  shortcut: LatexSuiteShortcut,
  from: number,
  to: number,
  captures: string[],
) {
  const replacement = applyRegexCaptures(shortcut.replacement, captures)
  const directExpansion = parseDirectExpansion(replacement)
  if (directExpansion) {
    view.dispatch({
      changes: { from, to, insert: directExpansion.insert },
      selection: EditorSelection.cursor(from + directExpansion.cursorOffset),
      userEvent: 'input.autosnippet',
    })
    rememberSession(view, from, directExpansion.insert, directExpansion.tabstops)
    return
  }

  const template = toCodeMirrorSnippetTemplate(replacement)
  applySnippet(template)(view, null, from, to)
  rememberSession(
    view,
    from,
    stripLatexSuiteTabstops(replacement),
    collectTabstops(replacement),
  )
}

function applyRegexCaptures(template: string, captures: string[]) {
  return template.replace(/\[\[(\d+)]]/g, (_, index: string) => {
    return captures[Number(index)] ?? ''
  })
}

function toCodeMirrorSnippetTemplate(template: string) {
  let output = ''
  for (let index = 0; index < template.length; index += 1) {
    const char = template[index]
    const nextChar = template[index + 1]
    if (char === '$' && nextChar === '{') {
      const placeholder = parseLatexSuiteBracedTabstop(template, index)
      if (placeholder) {
        output += placeholder.value
        index = placeholder.end
        continue
      }
    }
    if (char === '$' && /\d/.test(nextChar ?? '')) {
      let number = nextChar
      index += 1
      while (/\d/.test(template[index + 1] ?? '')) {
        number += template[index + 1]
        index += 1
      }
      output += `\${${Number(number) + 1}}`
      continue
    }
    output += char
  }
  return output
}

function parseLatexSuiteBracedTabstop(template: string, start: number) {
  const match = /^\$\{(\d+)(?::([^}]*))?}/.exec(template.slice(start))
  if (!match) return null

  const latexSuiteIndex = Number(match[1])
  const tabstop = latexSuiteIndex + 1
  const defaultText = match[2] ?? ''
  return {
    value:
      match[2] === undefined
        ? `\${${tabstop}}`
        : `\${${tabstop}:${defaultText}}`,
    latexSuiteIndex,
    defaultText,
    end: start + match[0].length - 1,
  }
}

function parseDirectExpansion(template: string) {
  if (/\$\{\d+:[^}]*}/.test(template)) return null
  if (/\$\d/.test(template.replace(/\$0/g, ''))) return null

  const cursorIndex = template.indexOf('$0')
  const insert = template.replace(/\$0/g, '')
  if (cursorIndex === -1) {
    return { insert, cursorOffset: insert.length, tabstops: [] }
  }

  const cursorOffset = template.slice(0, cursorIndex).replace(/\$0/g, '').length
  return { insert, cursorOffset, tabstops: [cursorOffset] }
}

function collectTabstops(template: string) {
  const stops: Array<{ order: number; offset: number }> = []
  let outputOffset = 0

  for (let index = 0; index < template.length; index += 1) {
    const char = template[index]
    const braced =
      char === '$' && template[index + 1] === '{'
        ? parseLatexSuiteBracedTabstop(template, index)
        : null
    if (braced) {
      stops.push({ order: braced.latexSuiteIndex, offset: outputOffset })
      outputOffset += braced.defaultText.length
      index = braced.end
      continue
    }

    if (char === '$' && /\d/.test(template[index + 1] ?? '')) {
      let number = template[index + 1]
      index += 1
      while (/\d/.test(template[index + 1] ?? '')) {
        number += template[index + 1]
        index += 1
      }
      stops.push({ order: Number(number), offset: outputOffset })
      continue
    }

    outputOffset += char.length
  }

  return stops
    .sort((left, right) => left.order - right.order)
    .map((stop) => stop.offset)
}

function stripLatexSuiteTabstops(template: string) {
  let output = ''

  for (let index = 0; index < template.length; index += 1) {
    const char = template[index]
    const braced =
      char === '$' && template[index + 1] === '{'
        ? parseLatexSuiteBracedTabstop(template, index)
        : null
    if (braced) {
      output += braced.defaultText
      index = braced.end
      continue
    }

    if (char === '$' && /\d/.test(template[index + 1] ?? '')) {
      index += 1
      while (/\d/.test(template[index + 1] ?? '')) index += 1
      continue
    }

    output += char
  }

  return output
}

function rememberSession(
  view: EditorView,
  from: number,
  insert: string,
  relativeTabstops: number[],
) {
  lineEndTabstopsByEditor.delete(view)

  const tabstops = Array.from(
    new Set(relativeTabstops.map((offset) => from + offset)),
  )
  if (tabstops.length === 0) {
    sessionsByEditor.delete(view)
    return
  }

  sessionsByEditor.set(view, {
    from,
    to: from + insert.length,
    tabstops,
  })
}

function mapSession(
  session: LatexSuiteSession,
  changes: ChangeDesc,
): LatexSuiteSession | null {
  const from = changes.mapPos(session.from, -1)
  const to = changes.mapPos(session.to, 1)
  const tabstops = session.tabstops.map((position) => changes.mapPos(position, 1))

  if (tabstops.some((position) => position < from || position > to)) return null
  return { from, to, tabstops }
}

function mapLineEndTabstop(
  tabstop: LatexSuiteLineEndTabstop,
  changes: ChangeDesc,
): LatexSuiteLineEndTabstop | null {
  const from = changes.mapPos(tabstop.from, -1)
  const to = changes.mapPos(tabstop.to, 1)
  if (from < 0 || to < 0 || from >= to) return null
  return { from, to }
}

function moveToRememberedTabstop(view: EditorView) {
  const session = sessionsByEditor.get(view)
  const range = view.state.selection.main
  if (!session || !range.empty) return false

  const cursor = range.head
  if (cursor < session.from || cursor > session.to) return false

  const next = session.tabstops.find((position) => position > cursor)
  if (next === undefined) return false

  view.dispatch({
    selection: EditorSelection.cursor(next),
    scrollIntoView: true,
  })
  return true
}

function moveToRememberedLineEnd(view: EditorView) {
  const tabstop = lineEndTabstopsByEditor.get(view)
  const range = view.state.selection.main
  if (!tabstop || !range.empty) return false

  const cursor = range.head
  if (cursor < tabstop.from || cursor >= tabstop.to) {
    lineEndTabstopsByEditor.delete(view)
    return false
  }

  view.dispatch({
    selection: EditorSelection.cursor(tabstop.to),
    scrollIntoView: true,
  })
  lineEndTabstopsByEditor.delete(view)
  return true
}

function tabOutOfMath(view: EditorView) {
  const range = view.state.selection.main
  if (!range.empty) return false

  const nextMathClose = findNextMathClose(view, range.head)
  if (nextMathClose === null) return false

  view.dispatch({
    selection: EditorSelection.cursor(nextMathClose),
    scrollIntoView: true,
  })

  const lineEnd = view.state.doc.lineAt(nextMathClose).to
  if (nextMathClose < lineEnd) {
    lineEndTabstopsByEditor.set(view, {
      from: nextMathClose,
      to: lineEnd,
    })
  } else {
    lineEndTabstopsByEditor.delete(view)
  }

  return true
}

function findNextMathClose(view: EditorView, cursor: number) {
  const from = Math.max(0, cursor - MATH_CONTEXT_PREFIX_LIMIT)
  const prefix = view.state.doc.sliceString(from, cursor)
  const displayMath = isInsideDisplayMath(prefix)
  const inlineMath = !displayMath && isInsideInlineMath(prefix)
  if (!displayMath && !inlineMath) return null

  const line = view.state.doc.lineAt(cursor)
  const searchEnd = displayMath
    ? Math.min(view.state.doc.length, cursor + MATH_CONTEXT_PREFIX_LIMIT)
    : line.to
  const textAfterCursor = view.state.doc.sliceString(cursor, searchEnd)
  const closing = displayMath ? '$$' : '$'
  const closingIndex = textAfterCursor.indexOf(closing)
  if (closingIndex < 0) return null

  return cursor + closingIndex + closing.length
}

function isInsideInlineMath(prefix: string) {
  let inlineMath = false
  let displayMath = false
  for (let index = 0; index < prefix.length; index += 1) {
    if (prefix[index] !== '$') continue
    if (index > 0 && prefix[index - 1] === '\\') continue
    if (prefix[index + 1] === '$') {
      displayMath = !displayMath
      index += 1
      continue
    }
    if (!displayMath) inlineMath = !inlineMath
  }
  return inlineMath
}

function isInsideDisplayMath(prefix: string) {
  let displayMath = false
  for (let index = 0; index < prefix.length; index += 1) {
    if (prefix[index] !== '$' || prefix[index + 1] !== '$') continue
    if (index > 0 && prefix[index - 1] === '\\') continue
    displayMath = !displayMath
    index += 1
  }
  return displayMath
}

function hasUnsupportedReplacement(replacement: string) {
  return replacement.includes('${VISUAL}')
}

function isLikelyMathMode(
  view: EditorView,
  cursor: number,
  virtualInsert = '',
): boolean {
  const from = Math.max(0, cursor - MATH_CONTEXT_PREFIX_LIMIT)
  const realEnd = cursor - virtualInsert.length
  const textBeforeCursor = view.state.doc.sliceString(from, realEnd) + virtualInsert
  let inlineMath = false
  let displayMath = false

  for (let index = 0; index < textBeforeCursor.length; index += 1) {
    if (textBeforeCursor[index] !== '$') continue
    if (index > 0 && textBeforeCursor[index - 1] === '\\') continue
    if (textBeforeCursor[index + 1] === '$') {
      displayMath = !displayMath
      index += 1
      continue
    }
    if (!displayMath) inlineMath = !inlineMath
  }

  return inlineMath || displayMath
}
