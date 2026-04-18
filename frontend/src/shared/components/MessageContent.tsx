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
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'

interface MessageContentProps {
  content: string
}

export function MessageContent({ content }: MessageContentProps) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkMath]}
      rehypePlugins={[rehypeKatex]}
    >
      {content}
    </ReactMarkdown>
  )
}
