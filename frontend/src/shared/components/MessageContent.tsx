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

import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'

interface MessageContentProps {
  content: string
}

interface ImportedAttachment {
  label: string
  href?: string
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
          >
            {part.content}
          </ReactMarkdown>
        )
      })}
    </div>
  )
}
