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

import { useState, type ComponentPropsWithoutRef } from 'react'
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
}

interface ImportedAttachment {
  label: string
  href?: string
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

export function MessageContent({ content }: MessageContentProps) {
  const parts = splitAttachmentCallouts(content)

  return (
    <div className="cf-message-content">
      {parts.map((part, index) => {
        if (part.type === 'attachments') {
          return (
            <div key={index} className="cf-imported-attachment-list">
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
            key={index}
            remarkPlugins={[remarkGfm, remarkMath]}
            rehypePlugins={[rehypeKatex]}
            components={markdownComponents}
          >
            {part.content}
          </ReactMarkdown>
        )
      })}
    </div>
  )
}
