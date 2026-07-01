import { EditorSelection } from '@codemirror/state'
import { EditorView } from '@codemirror/view'

type LatexSuiteShortcut = {
  trigger: string
  replacement: string
  options: string
  description?: string
}

type Expansion = {
  insert: string
  cursorOffset: number
}

// Canonical source:
// ~/Repositories/self-hosted/zettelkasten/Documents/shortcuts.json
//
// The canonical file uses Obsidian latex-suite's JS-like format. This adapter
// mirrors the important `A` autosnippet behavior for portable string triggers.
const shortcuts: LatexSuiteShortcut[] = [
  { trigger: ' mm', replacement: ' movement', options: 'tA' },
  { trigger: 'mnt', replacement: 'mountain', options: 'tA' },
  { trigger: 'govt', replacement: 'government', options: 'tA' },
  { trigger: ' bc', replacement: ' because', options: 'tA' },
  { trigger: 'Bc', replacement: 'Because', options: 'tA' },
  { trigger: ' ppl', replacement: ' people', options: 'tA' },
  { trigger: 'w/', replacement: 'with ', options: 'tA' },
  { trigger: 'btwn', replacement: 'between', options: 'tA' },
  { trigger: 'opn', replacement: 'operation', options: 'tA' },
  { trigger: 'fn', replacement: 'function', options: 'tA' },
  { trigger: 'Fn', replacement: 'Function', options: 'tA' },
  { trigger: 'qs', replacement: 'question', options: 'tA' },
  { trigger: 'sln', replacement: 'solution', options: 'tA' },
  { trigger: 'Sln', replacement: 'Solution', options: 'tA' },
  { trigger: ' og', replacement: ' original', options: 'tA' },
  { trigger: 'ddt', replacement: 'derivative ', options: 'tA' },
  { trigger: 'Ddt', replacement: 'Derivative ', options: 'tA' },
  { trigger: 'eql', replacement: 'equal', options: 'tA' },
  { trigger: 'eqn', replacement: 'equation', options: 'tA' },
  { trigger: 'Eqn', replacement: 'Equation', options: 'tA' },
  { trigger: 'avg', replacement: 'average', options: 'tA' },
  { trigger: 'ex.', replacement: '**Example$0.** $1', options: 'tA' },
  { trigger: 'obj.', replacement: '**Objective$0.** $1', options: 'tA' },
  { trigger: 'prob.', replacement: '**Problem$0.** $1', options: 'tA' },
  { trigger: 'sol.', replacement: '**Solution$0.** $1', options: 'tA' },
  { trigger: 'lhs', replacement: 'left-hand side', options: 'tA' },
  { trigger: 'rhs', replacement: 'right-hand side', options: 'tA' },
  { trigger: '(', replacement: '($0)$1', options: 'tA' },
  { trigger: '=>', replacement: '$\\Rightarrow$ ', options: 'tA' },
  { trigger: '->', replacement: '$\\rightarrow$ ', options: 'tA' },
  { trigger: 'tf', replacement: 'therefore', options: 'tA' },
  { trigger: 'Tf', replacement: 'Therefore', options: 'tA' },
  { trigger: '^(', replacement: '^{($0)}$1', options: 'mA' },
  { trigger: 'sr', replacement: '^2', options: 'mA' },
  { trigger: 'cb', replacement: '^3', options: 'mA' },
  { trigger: '_', replacement: '_{$0}$1', options: 'mA' },
  { trigger: 'sts', replacement: '_\\text{$0}', options: 'mA' },
  { trigger: 'sq', replacement: '\\sqrt{ $0 }$1', options: 'mA' },
  { trigger: 'cr', replacement: '\\sqrt[3]{ $0 }$1', options: 'mA' },
  { trigger: 'cq', replacement: '\\sqrt[$0]{ $1 }$2', options: 'mA' },
  { trigger: '//', replacement: '\\frac{$0}{$1}$2', options: 'mA' },
]

const autosnippets = shortcuts
  .filter((shortcut) => shortcut.options.includes('A'))
  .sort((left, right) => right.trigger.length - left.trigger.length)

const autosnippetsByLastChar = new Map<string, LatexSuiteShortcut[]>()
for (const shortcut of autosnippets) {
  const lastChar = shortcut.trigger[shortcut.trigger.length - 1]
  if (!lastChar) continue
  const matches = autosnippetsByLastChar.get(lastChar) ?? []
  matches.push(shortcut)
  autosnippetsByLastChar.set(lastChar, matches)
}

export function latexSuiteAutosnippets() {
  return EditorView.updateListener.of((update) => {
    if (!update.docChanged) return
    if (!update.transactions.some((transaction) => transaction.isUserEvent('input.type'))) {
      return
    }

    const range = update.state.selection.main
    if (!range.empty) return

    const cursor = range.head
    const previousChar = cursor > 0 ? update.state.doc.sliceString(cursor - 1, cursor) : ''
    const candidates = autosnippetsByLastChar.get(previousChar)
    if (!candidates) return

    const line = update.state.doc.lineAt(cursor)
    const prefix = update.state.doc.sliceString(line.from, cursor)
    const triggerMatches = candidates.filter((shortcut) =>
      prefix.endsWith(shortcut.trigger),
    )
    if (triggerMatches.length === 0) return

    const mathMode = isLikelyMathMode(prefix)
    const match = triggerMatches.find((shortcut) => {
      if (shortcut.options.includes('m')) return mathMode
      if (shortcut.options.includes('t')) return !mathMode
      return true
    })
    if (!match) return

    const expansion = parseExpansion(match.replacement)
    const from = cursor - match.trigger.length
    update.view.dispatch({
      changes: { from, to: cursor, insert: expansion.insert },
      selection: EditorSelection.cursor(from + expansion.cursorOffset),
      userEvent: 'input.autosnippet',
    })
  })
}

function parseExpansion(template: string): Expansion {
  const cursorIndex = template.indexOf('$0')
  const insert = template.replace(/\$\d+/g, '')
  if (cursorIndex === -1) {
    return { insert, cursorOffset: insert.length }
  }
  const beforeCursor = template.slice(0, cursorIndex).replace(/\$\d+/g, '')
  return { insert, cursorOffset: beforeCursor.length }
}

function isLikelyMathMode(textBeforeCursor: string): boolean {
  let delimiterCount = 0
  for (let index = 0; index < textBeforeCursor.length; index += 1) {
    if (textBeforeCursor[index] !== '$') continue
    if (index > 0 && textBeforeCursor[index - 1] === '\\') continue
    delimiterCount += 1
  }
  return delimiterCount % 2 === 1
}
