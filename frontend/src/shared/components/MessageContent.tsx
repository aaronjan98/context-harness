/**
 * MessageContent — renders a message body as Markdown with LaTeX support.
 *
 * Used in features/thread/ for message bubbles, and eventually in
 * features/graph/ for node content previews.
 *
 * Math rendering:
 *   Inline:  $x^2$         → rendered inline via KaTeX
 *   Block:   $$x^2$$       → rendered as display math via KaTeX
 *
 * The katex CSS is imported globally in src/main.tsx.
 *
 * This is a Phase 1 component — LaTeX display is live from day one even
 * though the vim/LaTeX input editor is Phase 2.
 *
 * See project-memory/frontend-architecture.md § Editor abstraction
 * (Two distinct LaTeX concerns) for the rationale behind this split.
 */

import { useState, useEffect, useRef, type ComponentPropsWithoutRef } from 'react'
import ReactMarkdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import hljs from 'highlight.js/lib/core'
import bash from 'highlight.js/lib/languages/bash'
import css from 'highlight.js/lib/languages/css'
import diff from 'highlight.js/lib/languages/diff'
import dos from 'highlight.js/lib/languages/dos'
import javascript from 'highlight.js/lib/languages/javascript'
import json from 'highlight.js/lib/languages/json'
import markdown from 'highlight.js/lib/languages/markdown'
import powershell from 'highlight.js/lib/languages/powershell'
import python from 'highlight.js/lib/languages/python'
import sql from 'highlight.js/lib/languages/sql'
import typescript from 'highlight.js/lib/languages/typescript'
import xml from 'highlight.js/lib/languages/xml'
import yaml from 'highlight.js/lib/languages/yaml'
import type { ToolExecutionRequest } from '@/api/conversations'

hljs.registerLanguage('bash', bash)
hljs.registerLanguage('css', css)
hljs.registerLanguage('diff', diff)
hljs.registerLanguage('dos', dos)
hljs.registerLanguage('javascript', javascript)
hljs.registerLanguage('json', json)
hljs.registerLanguage('markdown', markdown)
hljs.registerLanguage('powershell', powershell)
hljs.registerLanguage('python', python)
hljs.registerLanguage('sql', sql)
hljs.registerLanguage('typescript', typescript)
hljs.registerLanguage('xml', xml)
hljs.registerLanguage('yaml', yaml)

interface MessageContentProps {
  content: string
  onRunToolCall?: (toolCall: ToolExecutionRequest, toolCallKey: string) => void
  runningToolCallKey?: string | null
  toolStreamLog?: string
}

interface ImportedAttachment {
  label: string
  href?: string
}

interface ParsedToolCall {
  key: string
  raw: string
  toolCall?: ToolExecutionRequest
  error?: string
}

type MarkdownCodeProps = ComponentPropsWithoutRef<'code'> & {
  node?: unknown
}

const languageAliases: Record<string, string> = {
  cmd: 'dos',
  html: 'xml',
  js: 'javascript',
  md: 'markdown',
  ps1: 'powershell',
  py: 'python',
  shell: 'bash',
  sh: 'bash',
  ts: 'typescript',
  yml: 'yaml',
  zsh: 'bash',
}

function normalizeLanguage(language: string) {
  const normalized = language.toLowerCase()
  return languageAliases[normalized] ?? normalized
}

function displayLanguage(language: string) {
  if (language === 'dos') return 'CMD'
  if (language === 'xml') return 'HTML/XML'
  return language.toUpperCase()
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

function highlightCode(code: string, language: string) {
  if (!language || !hljs.getLanguage(language)) {
    return escapeHtml(code)
  }

  try {
    return hljs.highlight(code, { language, ignoreIllegals: true }).value
  } catch {
    return escapeHtml(code)
  }
}

function MarkdownCode({
  className,
  children,
  node: _node,
  ...props
}: MarkdownCodeProps) {
  const [copied, setCopied] = useState(false)
  const rawCode = String(children ?? '').replace(/\n$/, '')
  const match = /language-([^\s]+)/.exec(className ?? '')

  if (!match) {
    return (
      <code className={className} {...props}>
        {children}
      </code>
    )
  }

  const language = normalizeLanguage(match[1])
  const highlighted = highlightCode(rawCode, language)

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(rawCode)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1400)
    } catch {
      setCopied(false)
    }
  }

  return (
    <div className="cf-code-block">
      <div className="cf-code-header">
        <span className="cf-code-language">{displayLanguage(language)}</span>
        <button
          type="button"
          className="cf-code-copy"
          onClick={copyCode}
          aria-label={`Copy ${displayLanguage(language)} code`}
        >
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre className="cf-code-pre">
        <code
          className={`hljs language-${language}`}
          dangerouslySetInnerHTML={{ __html: highlighted }}
        />
      </pre>
    </div>
  )
}

const markdownComponents: Components = {
  code: MarkdownCode as Components['code'],
}

function parseImportedAttachments(block: string): ImportedAttachment[] {
  return block
    .split('\n')
    .map((line) => line.replace(/^>\s?/, '').trim())
    .filter((line) => line.startsWith('- '))
    .map((line) => line.slice(2).trim())
    .map((item) => {
      const link = item.match(/^\[(.+?)]\((.+?)\)$/)
      if (link) return { label: link[1], href: link[2] }
      return { label: item }
    })
    .filter((attachment) => attachment.label)
}

function splitAttachmentCallouts(content: string) {
  const pattern = /(^|\n)(>\s?\[!attachment]\s*\n(?:>\s?.*(?:\n|$))*)/g
  const parts: Array<
    | { type: 'markdown'; content: string }
    | { type: 'attachments'; attachments: ImportedAttachment[] }
  > = []
  let cursor = 0
  let match: RegExpExecArray | null

  while ((match = pattern.exec(content)) !== null) {
    const start = match.index + match[1].length
    if (start > cursor) {
      parts.push({ type: 'markdown', content: content.slice(cursor, start) })
    }

    const attachments = parseImportedAttachments(match[2])
    if (attachments.length > 0) {
      parts.push({ type: 'attachments', attachments })
    }
    cursor = start + match[2].length
  }

  if (cursor < content.length) {
    parts.push({ type: 'markdown', content: content.slice(cursor) })
  }

  return parts.length > 0 ? parts : [{ type: 'markdown' as const, content }]
}

function sanitizeJsonNewlines(raw: string): string {
  // DOM innerText extraction (e.g. via the ChatGPT userscript) can produce
  // literal newlines/tabs inside JSON string values, which JSON.parse rejects.
  // Walk character-by-character to replace them with proper escape sequences.
  let inString = false
  let escaped = false
  let result = ''
  for (const ch of raw) {
    if (escaped) {
      result += ch
      escaped = false
    } else if (ch === '\\' && inString) {
      result += ch
      escaped = true
    } else if (ch === '"') {
      result += ch
      inString = !inString
    } else if (inString && ch === '\n') {
      result += '\\n'
    } else if (inString && ch === '\r') {
      result += '\\r'
    } else if (inString && ch === '\t') {
      result += '\\t'
    } else {
      result += ch
    }
  }
  return result
}

function parseToolCall(raw: string, key: string): ParsedToolCall {
  try {
    const value: unknown = JSON.parse(sanitizeJsonNewlines(raw))
    if (!value || typeof value !== 'object') {
      return { key, raw, error: 'Tool call must be a JSON object.' }
    }

    const candidate = value as Record<string, unknown>
    const tool = candidate.tool
    const cwd = candidate.cwd
    const command = candidate.command
    const reason = candidate.reason
    const timeout_seconds =
      typeof candidate.timeout_seconds === 'number' ? candidate.timeout_seconds : 300
    if (tool !== 'terminal.exec') {
      return { key, raw, error: 'Only terminal.exec is supported right now.' }
    }
    if (
      typeof cwd !== 'string' ||
      typeof command !== 'string' ||
      typeof reason !== 'string'
    ) {
      return {
        key,
        raw,
        error: 'Tool call requires string cwd, command, and reason fields.',
      }
    }

    return {
      key,
      raw,
      toolCall: {
        tool,
        cwd,
        command,
        reason,
        timeout_seconds,
      },
    }
  } catch (error) {
    return {
      key,
      raw,
      error: error instanceof Error ? error.message : 'Invalid JSON tool call.',
    }
  }
}

function splitToolCallBlocks(content: string) {
  // ChatGPT's DOM extractor sometimes puts the language on the first content line
  // instead of the opening fence (```\ncontextforge-tool\n…). Normalize to the
  // standard form (```contextforge-tool\n…) before parsing.
  const normalized = content.replace(
    /(^|\n)```\ncontextforge-tool\n/g,
    '$1```contextforge-tool\n',
  )
  const pattern = /(^|\n)```contextforge-tool[^\n]*\n([\s\S]*?)\n```/g
  const parts: Array<
    | { type: 'markdown'; content: string }
    | { type: 'tool-call'; toolCall: ParsedToolCall }
  > = []
  let cursor = 0
  let index = 0
  let match: RegExpExecArray | null

  while ((match = pattern.exec(normalized)) !== null) {
    const start = match.index + match[1].length
    if (start > cursor) {
      parts.push({ type: 'markdown', content: normalized.slice(cursor, start) })
    }

    parts.push({
      type: 'tool-call',
      toolCall: parseToolCall(match[2].trim(), `tool-${index}`),
    })
    cursor = start + match[0].length - match[1].length
    index += 1
  }

  if (cursor < normalized.length) {
    parts.push({ type: 'markdown', content: normalized.slice(cursor) })
  }

  return parts.length > 0 ? parts : [{ type: 'markdown' as const, content: normalized }]
}

function renderMarkdownPart(content: string, keyPrefix: string) {
  return splitAttachmentCallouts(content).map((part, index) => {
    if (part.type === 'attachments') {
      return (
        <div key={`${keyPrefix}-attachments-${index}`} className="cf-imported-attachment-list">
          {part.attachments.map((attachment) => {
            const body = (
              <>
                <span className="cf-attachment-icon">FILE</span>
                <span className="cf-attachment-details">
                  <span className="cf-attachment-name">
                    {attachment.label}
                  </span>
                  <span className="cf-attachment-meta">
                    Imported attachment reference
                  </span>
                </span>
              </>
            )

            return attachment.href ? (
              <a
                key={`${attachment.label}-${attachment.href}`}
                className="cf-attachment-card"
                href={attachment.href}
              >
                {body}
              </a>
            ) : (
              <div
                key={attachment.label}
                className="cf-attachment-card cf-attachment-card-unavailable"
                title="Reference only: this imported transcript included the attachment name, not the media file. Upload the file to Context Forge to preview it."
                aria-disabled="true"
              >
                {body}
              </div>
            )
          })}
        </div>
      )
    }

    return (
      <ReactMarkdown
        key={`${keyPrefix}-markdown-${index}`}
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex]}
        components={markdownComponents}
      >
        {part.content}
      </ReactMarkdown>
    )
  })
}

function ToolCallCard({
  parsed,
  onRun,
  isRunning,
  streamLog,
}: {
  parsed: ParsedToolCall
  onRun?: (toolCall: ToolExecutionRequest, toolCallKey: string) => void
  isRunning: boolean
  streamLog?: string
}) {
  const [copied, setCopied] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const logRef = useRef<HTMLPreElement>(null)

  useEffect(() => {
    if (!isRunning) { setElapsed(0); return }
    setElapsed(0)
    const id = window.setInterval(() => setElapsed((s) => s + 1), 1000)
    return () => window.clearInterval(id)
  }, [isRunning])

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight
  }, [streamLog])
  const toolCall = parsed.toolCall
  const [draftToolCall, setDraftToolCall] = useState<ToolExecutionRequest | null>(
    toolCall ?? null,
  )
  const [draftRaw, setDraftRaw] = useState(parsed.raw)
  const activeToolCall = draftToolCall ?? toolCall
  const warning = activeToolCall
    ? commandQuoteWarning(activeToolCall.command)
    : null

  async function copyCommand() {
    if (!activeToolCall) return
    try {
      await navigator.clipboard.writeText(activeToolCall.command)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1400)
    } catch {
      setCopied(false)
    }
  }

  function updateDraft(field: 'cwd' | 'command' | 'reason', value: string): void
  function updateDraft(field: 'timeout_seconds', value: number): void
  function updateDraft(field: string, value: string | number) {
    if (!activeToolCall) return
    setDraftToolCall({
      ...activeToolCall,
      [field]: value,
    })
  }

  function tryApplyRaw() {
    try {
      const obj = JSON.parse(sanitizeJsonNewlines(draftRaw)) as Record<string, unknown>
      const { tool, cwd, command, reason, timeout_seconds } = obj
      if (
        tool === 'terminal.exec' &&
        typeof cwd === 'string' &&
        typeof command === 'string' &&
        typeof reason === 'string'
      ) {
        setDraftToolCall({
          tool,
          cwd,
          command,
          reason,
          timeout_seconds: typeof timeout_seconds === 'number' ? timeout_seconds : 300,
        })
        setIsEditing(false)
      }
    } catch {}
  }

  function resetDraft() {
    setDraftToolCall(toolCall ?? null)
    setDraftRaw(parsed.raw)
    setIsEditing(false)
  }

  return (
    <div
      className="cf-tool-call-card"
      onClick={(event) => event.stopPropagation()}
    >
      <div className="cf-tool-call-header">
        <div>
          <div className="cf-tool-call-title">Context Forge tool request</div>
          <div className="cf-tool-call-subtitle">
            {activeToolCall?.tool ?? 'invalid tool call'}
          </div>
        </div>
        <div className="cf-tool-call-actions">
          <button
            type="button"
            className="cf-secondary-button"
            onClick={(event) => {
              event.stopPropagation()
              if (isEditing && !activeToolCall) {
                tryApplyRaw()
              } else {
                setIsEditing((value) => !value)
              }
            }}
            disabled={isRunning}
          >
            {isEditing ? (activeToolCall ? 'Preview' : 'Apply') : 'Edit'}
          </button>
          <button
            type="button"
            className="cf-secondary-button"
            onClick={(event) => {
              event.stopPropagation()
              copyCommand()
            }}
            disabled={!activeToolCall}
          >
            {copied ? 'Copied' : 'Copy command'}
          </button>
          {isEditing && (
            <button
              type="button"
              className="cf-secondary-button"
              onClick={(event) => {
                event.stopPropagation()
                resetDraft()
              }}
              disabled={isRunning}
            >
              Reset
            </button>
          )}
          <button
            type="button"
            className="cf-primary-button"
            onClick={(event) => {
              event.stopPropagation()
              if (activeToolCall) onRun?.(activeToolCall, parsed.key)
            }}
            disabled={!activeToolCall || !onRun || isRunning}
          >
            {isRunning ? 'Running...' : 'Run'}
          </button>
        </div>
      </div>
      {isEditing && !activeToolCall ? (
        <div className="cf-tool-call-edit-grid">
          <div className="cf-tool-call-error">{parsed.error}</div>
          <label className="cf-tool-call-edit-field">
            <span>Raw JSON — fix the error above, then click Apply</span>
            <textarea
              value={draftRaw}
              onChange={(event) => setDraftRaw(event.target.value)}
              rows={12}
              spellCheck={false}
            />
          </label>
        </div>
      ) : parsed.error ? (
        <div className="cf-tool-call-error">{parsed.error}</div>
      ) : isEditing && activeToolCall ? (
        <div className="cf-tool-call-edit-grid">
          <label className="cf-tool-call-edit-field">
            <span>Reason</span>
            <textarea
              value={activeToolCall.reason}
              onChange={(event) => updateDraft('reason', event.target.value)}
              rows={2}
            />
          </label>
          <label className="cf-tool-call-edit-field">
            <span>Working directory</span>
            <input
              value={activeToolCall.cwd}
              onChange={(event) => updateDraft('cwd', event.target.value)}
            />
          </label>
          <label className="cf-tool-call-edit-field">
            <span>Command</span>
            <textarea
              value={activeToolCall.command}
              onChange={(event) => updateDraft('command', event.target.value)}
              rows={8}
              spellCheck={false}
            />
          </label>
          <label className="cf-tool-call-edit-field cf-tool-call-edit-field--inline">
            <span>Timeout (seconds)</span>
            <input
              type="number"
              min={1}
              max={3600}
              value={activeToolCall.timeout_seconds}
              onChange={(event) =>
                updateDraft('timeout_seconds', Math.max(1, parseInt(event.target.value, 10) || 300))
              }
            />
          </label>
          {warning && (
            <div className="cf-tool-call-warning">{warning}</div>
          )}
        </div>
      ) : (
        <>
          {warning && (
            <div className="cf-tool-call-warning">{warning}</div>
          )}
          <div className="cf-tool-call-field">
            <span>Reason</span>
            <p>{activeToolCall?.reason}</p>
          </div>
          <div className="cf-tool-call-field">
            <span>Working directory</span>
            <code>{activeToolCall?.cwd}</code>
          </div>
          <div className="cf-tool-call-field">
            <span>Command</span>
            <pre>{activeToolCall?.command}</pre>
          </div>
          <div className="cf-tool-call-field cf-tool-call-field--inline">
            <span>Timeout</span>
            <code>{activeToolCall?.timeout_seconds ?? 300}s</code>
          </div>
        </>
      )}
      {isRunning && (
        <div className="cf-tool-stream-log">
          <div className="cf-tool-stream-header">
            <span className="cf-tool-stream-spinner" />
            Running… {elapsed}s
          </div>
          <pre ref={logRef} className="cf-tool-stream-output">
            {streamLog || ' '}
          </pre>
        </div>
      )}
    </div>
  )
}

function commandQuoteWarning(command: string): string | null {
  if (
    /\bssh\s+\S+\s+'[^']*sqlite3/.test(command) &&
    /''[^']+''/.test(command)
  ) {
    return 'This looks like nested SSH/SQLite quoting. Single quotes inside the SSH single-quoted command may be stripped before SQLite sees them. Consider editing the command before running.'
  }
  return null
}

export function MessageContent({
  content,
  onRunToolCall,
  runningToolCallKey,
  toolStreamLog,
}: MessageContentProps) {
  const parts = splitToolCallBlocks(content)

  return (
    <div className="cf-message-content">
      {parts.map((part, index) => {
        if (part.type === 'tool-call') {
          const isRunning = runningToolCallKey === part.toolCall.key
          return (
            <ToolCallCard
              key={`${part.toolCall.key}-${index}`}
              parsed={part.toolCall}
              onRun={onRunToolCall}
              isRunning={isRunning}
              streamLog={isRunning ? toolStreamLog : undefined}
            />
          )
        }

        return renderMarkdownPart(part.content, `part-${index}`)
      })}
    </div>
  )
}
