/**
 * Export the currently open ChatGPT conversation tab to Markdown.
 *
 * Usage:
 * 1. Open the ChatGPT tab you want to import.
 * 2. Run this script from devtools, or use the bookmarklet version.
 * 3. Wait while it scrolls through the thread and collects mounted turns.
 * 4. Paste the copied Markdown into Context Forge's "Import Markdown" panel.
 *
 * This is intentionally active-tab-only. Context Forge should not guess which
 * browser tab is canonical; the user chooses the tab by running the exporter.
 */

(async () => {
  const roleLabels = {
    user: 'User',
    assistant: 'ChatGPT',
  }
  const waitMs = 450
  let statusEl = null

  function setStatus(message) {
    if (!statusEl) {
      statusEl = document.createElement('div')
      statusEl.setAttribute('data-context-forge-export-status', 'true')
      Object.assign(statusEl.style, {
        position: 'fixed',
        right: '16px',
        bottom: '16px',
        zIndex: '2147483647',
        maxWidth: '360px',
        border: '1px solid rgba(255,255,255,0.22)',
        borderRadius: '10px',
        background: 'rgba(15,23,42,0.96)',
        boxShadow: '0 12px 30px rgba(0,0,0,0.35)',
        color: '#f8fafc',
        font: '13px/1.4 sans-serif',
        padding: '10px 12px',
        pointerEvents: 'none',
      })
      document.body.appendChild(statusEl)
    }
    statusEl.textContent = message
  }

  function clearStatusSoon() {
    if (!statusEl) return
    setTimeout(() => {
      statusEl?.remove()
      statusEl = null
    }, 2600)
  }

  function showResultPanel(markdown) {
    statusEl?.remove()
    statusEl = null

    const panel = document.createElement('div')
    panel.setAttribute('data-context-forge-export-panel', 'true')
    Object.assign(panel.style, {
      position: 'fixed',
      right: '16px',
      bottom: '16px',
      zIndex: '2147483647',
      width: 'min(720px, calc(100vw - 32px))',
      maxHeight: 'min(620px, calc(100vh - 32px))',
      display: 'flex',
      flexDirection: 'column',
      gap: '10px',
      border: '1px solid rgba(255,255,255,0.22)',
      borderRadius: '12px',
      background: 'rgba(15,23,42,0.98)',
      boxShadow: '0 18px 48px rgba(0,0,0,0.45)',
      color: '#f8fafc',
      font: '13px/1.4 sans-serif',
      padding: '12px',
    })

    const header = document.createElement('div')
    header.textContent = 'Context Forge export complete'
    Object.assign(header.style, {
      fontWeight: '700',
      fontSize: '14px',
    })

    const help = document.createElement('div')
    help.textContent =
      'Copy the Markdown below, then paste it into Context Forge → Import Markdown.'
    Object.assign(help.style, {
      color: '#cbd5e1',
    })

    const textarea = document.createElement('textarea')
    textarea.value = markdown
    Object.assign(textarea.style, {
      width: '100%',
      height: '360px',
      resize: 'vertical',
      border: '1px solid rgba(148,163,184,0.55)',
      borderRadius: '8px',
      background: '#020617',
      color: '#f8fafc',
      font: '12px/1.45 monospace',
      padding: '10px',
      whiteSpace: 'pre',
    })

    const actions = document.createElement('div')
    Object.assign(actions.style, {
      display: 'flex',
      justifyContent: 'flex-end',
      gap: '8px',
    })

    const copyButton = document.createElement('button')
    copyButton.textContent = 'Copy Markdown'
    const closeButton = document.createElement('button')
    closeButton.textContent = 'Close'

    for (const button of [copyButton, closeButton]) {
      Object.assign(button.style, {
        border: '1px solid rgba(148,163,184,0.65)',
        borderRadius: '8px',
        background: '#1e293b',
        color: '#f8fafc',
        cursor: 'pointer',
        font: '13px/1.2 sans-serif',
        padding: '7px 10px',
      })
    }

    copyButton.addEventListener('click', async () => {
      textarea.focus()
      textarea.select()
      try {
        await navigator.clipboard.writeText(markdown)
        copyButton.textContent = 'Copied'
      } catch {
        document.execCommand('copy')
        copyButton.textContent = 'Selected/copied'
      }
    })

    closeButton.addEventListener('click', () => {
      panel.remove()
    })

    actions.append(copyButton, closeButton)
    panel.append(header, help, textarea, actions)
    document.body.appendChild(panel)
    textarea.focus()
    textarea.select()
  }

  function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }

  function normalizeText(text) {
    return text
      .replace(/\u00a0/g, ' ')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
  }

  function findScrollRoot() {
    return (
      document.querySelector('[data-scroll-root]') ??
      document.scrollingElement ??
      document.documentElement
    )
  }

  function scrollTopOf(root) {
    return root === document.scrollingElement
      ? window.scrollY
      : root.scrollTop
  }

  function setScrollTop(root, top) {
    if (root === document.scrollingElement) {
      window.scrollTo({ top, behavior: 'instant' })
      return
    }
    root.scrollTop = top
  }

  function scrollHeightOf(root) {
    return root === document.scrollingElement
      ? document.documentElement.scrollHeight
      : root.scrollHeight
  }

  function viewportHeightOf(root) {
    return root === document.scrollingElement ? window.innerHeight : root.clientHeight
  }

  function escapeTableCell(text) {
    return normalizeText(text)
      .replace(/\n+/g, '<br>')
      .replace(/\|/g, '\\|')
  }

  function texAnnotation(element) {
    const annotations = Array.from(element.querySelectorAll('annotation'))
    const texAnnotation = annotations.find((annotation) =>
      /tex/i.test(annotation.getAttribute('encoding') ?? ''),
    )
    return texAnnotation?.textContent?.trim()
  }

  function firstNonEmpty(values) {
    for (const value of values) {
      const normalized = normalizeText(value ?? '')
      if (normalized) return normalized
    }
    return ''
  }

  function mathFallbackText(element) {
    const math = element.tagName.toLowerCase() === 'math'
      ? element
      : element.querySelector('math')

    return firstNonEmpty([
      element.getAttribute('data-latex'),
      element.getAttribute('data-tex'),
      element.getAttribute('aria-label'),
      element.getAttribute('alttext'),
      math?.getAttribute('alttext'),
      math?.getAttribute('aria-label'),
      math?.textContent,
      element.textContent,
      element.innerText,
    ])
  }

  function mathToMarkdown(element, display) {
    const tex = texAnnotation(element) || mathFallbackText(element)
    if (!tex) return ''
    return display ? `\n\n$$\n${tex}\n$$\n\n` : `$${tex}$`
  }

  function isDisplayMathElement(element) {
    const tagName = element.tagName.toLowerCase()
    return (
      element.classList?.contains('katex-display') ||
      element.getAttribute('display') === 'block' ||
      element.querySelector(':scope > math[display="block"]') !== null ||
      (tagName === 'math' && element.getAttribute('display') === 'block') ||
      (tagName === 'mjx-container' && element.getAttribute('display') === 'true')
    )
  }

  function isInlineMathElement(element) {
    const tagName = element.tagName.toLowerCase()
    return (
      element.classList?.contains('katex') ||
      tagName === 'math' ||
      tagName === 'mjx-container' ||
      element.getAttribute('role') === 'math' ||
      element.hasAttribute('data-latex') ||
      element.hasAttribute('data-tex')
    )
  }

  function escapeMarkdownText(text) {
    return text.replace(/\u00a0/g, ' ')
  }

  function inlineToMarkdown(node) {
    if (node.nodeType === Node.TEXT_NODE) {
      return escapeMarkdownText(node.textContent ?? '')
    }

    if (node.nodeType !== Node.ELEMENT_NODE) return ''

    const element = node
    const tagName = element.tagName.toLowerCase()

    if (isDisplayMathElement(element)) {
      return mathToMarkdown(element, true)
    }

    if (isInlineMathElement(element)) {
      return mathToMarkdown(element, false)
    }

    if (tagName === 'br') return '\n'
    if (tagName === 'code') return `\`${element.innerText.trim()}\``

    const children = Array.from(element.childNodes).map(inlineToMarkdown).join('')

    if (tagName === 'strong' || tagName === 'b') return `**${children.trim()}**`
    if (tagName === 'em' || tagName === 'i') return `*${children.trim()}*`
    if (tagName === 'a') {
      const href = element.getAttribute('href')
      const label = children.trim() || href || ''
      return href ? `[${label}](${href})` : label
    }

    return children
  }

  function promoteStandaloneMath(markdown) {
    const text = normalizeText(markdown)
    if (text.startsWith('$$') && text.endsWith('$$')) return text

    const match = text.match(/^\$([\s\S]+)\$$/)
    if (!match) return text

    const tex = match[1].trim()
    if (!tex) return text
    return `$$\n${tex}\n$$`
  }

  function tableToMarkdown(table) {
    const rows = Array.from(table.querySelectorAll('tr'))
      .map((row) =>
        Array.from(row.querySelectorAll('th,td')).map((cell) =>
          escapeTableCell(blockChildrenToMarkdown(cell)),
        ),
      )
      .filter((cells) => cells.length > 0)

    if (rows.length === 0) return ''

    const width = Math.max(...rows.map((cells) => cells.length))
    const normalizedRows = rows.map((cells) => [
      ...cells,
      ...Array.from({ length: width - cells.length }, () => ''),
    ])
    const [firstRow, ...bodyRows] = normalizedRows
    const header = `| ${firstRow.join(' | ')} |`
    const separator = `| ${Array.from({ length: width }, () => '---').join(' | ')} |`
    const body = bodyRows.map((row) => `| ${row.join(' | ')} |`)

    return [header, separator, ...body].join('\n')
  }

  function listItemText(item) {
    const clone = item.cloneNode(true)
    clone.querySelectorAll(':scope > ul, :scope > ol').forEach((list) => {
      list.remove()
    })
    return blockChildrenToMarkdown(clone)
  }

  function indentLines(text, spaces) {
    const prefix = ' '.repeat(spaces)
    return text
      .split('\n')
      .map((line) => (line ? `${prefix}${line}` : line))
      .join('\n')
  }

  function listToMarkdown(list, depth = 0) {
    const ordered = list.tagName.toLowerCase() === 'ol'
    return Array.from(list.children)
      .filter((child) => child.tagName.toLowerCase() === 'li')
      .map((item, index) => {
        const marker = ordered ? `${index + 1}.` : '-'
        const markerPrefix = `${'  '.repeat(depth)}${marker} `
        const body = listItemText(item)
        const nested = Array.from(item.children)
          .filter((child) => {
            const tagName = child.tagName.toLowerCase()
            return tagName === 'ul' || tagName === 'ol'
          })
          .map((child) => listToMarkdown(child, depth + 1))
          .filter(Boolean)
          .join('\n')

        const bodyLines = body.split('\n')
        const firstLine = `${markerPrefix}${bodyLines.shift() ?? ''}`.trimEnd()
        const continuation = bodyLines.length
          ? `\n${indentLines(bodyLines.join('\n'), markerPrefix.length)}`
          : ''
        return [firstLine + continuation, nested].filter(Boolean).join('\n')
      })
      .join('\n')
  }

  function elementToMarkdown(element) {
    const tagName = element.tagName.toLowerCase()

    if (isDisplayMathElement(element)) return mathToMarkdown(element, true)
    if (isInlineMathElement(element)) return mathToMarkdown(element, false)
    if (tagName === 'table') return tableToMarkdown(element)
    if (tagName === 'div' || tagName === 'section') {
      return blockChildrenToMarkdown(element)
    }
    if (tagName === 'pre') return `\`\`\`\n${element.innerText.trim()}\n\`\`\``
    if (/^h[1-6]$/.test(tagName)) {
      const depth = Number(tagName.slice(1))
      return `${'#'.repeat(depth)} ${normalizeText(inlineToMarkdown(element))}`
    }
    if (tagName === 'blockquote') {
      return blockChildrenToMarkdown(element)
        .split('\n')
        .map((line) => `> ${line}`)
        .join('\n')
    }
    if (tagName === 'ul' || tagName === 'ol') {
      return listToMarkdown(element)
    }

    return promoteStandaloneMath(inlineToMarkdown(element))
  }

  function blockChildrenToMarkdown(root) {
    const blockTags = new Set([
      'blockquote',
      'div',
      'h1',
      'h2',
      'h3',
      'h4',
      'h5',
      'h6',
      'li',
      'ol',
      'p',
      'pre',
      'table',
      'ul',
    ])
    const blocks = Array.from(root.children)
      .filter((child) => {
        return blockTags.has(child.tagName.toLowerCase()) || isDisplayMathElement(child)
      })
      .map((child) => elementToMarkdown(child))
      .filter(Boolean)

    if (blocks.length > 0) return blocks.join('\n\n')
    return promoteStandaloneMath(inlineToMarkdown(root))
  }

  function contentToMarkdown(root) {
    if (!root) return ''
    return blockChildrenToMarkdown(root)
  }

  function findMessageRoots(turn, role) {
    const exactRoots = Array.from(
      turn.querySelectorAll(`[data-message-author-role="${role}"]`),
    )
    if (exactRoots.length > 0) return exactRoots

    return Array.from(turn.querySelectorAll('[data-message-author-role]'))
  }

  function findContentRoot(messageRoot, role) {
    if (!messageRoot) return null

    if (role === 'assistant') {
      return (
        messageRoot.querySelector('.markdown') ??
        messageRoot.querySelector('[data-message-id]') ??
        messageRoot
      )
    }

    return (
      messageRoot.querySelector('.whitespace-pre-wrap') ??
      messageRoot.querySelector('[data-message-id]') ??
      messageRoot
    )
  }

  function attachmentSummaries(turn) {
    const labels = new Set()
    const attachmentSelectors = [
      '[role="group"][aria-label]',
      '[data-testid*="file"][aria-label]',
      '[aria-label][class*="file"]',
    ]

    for (const element of turn.querySelectorAll(attachmentSelectors.join(','))) {
      const label = normalizeText(element.getAttribute('aria-label') ?? '')
      if (!label) continue
      if (/copy|edit|response|message actions|good response|bad response/i.test(label)) {
        continue
      }
      labels.add(label)
    }

    if (labels.size === 0) return ''

    return [
      '> [!attachment]',
      ...Array.from(labels).map((label) => `> - ${label}`),
    ].join('\n')
  }

  function turnContentToMarkdown(turn, role) {
    const roots = findMessageRoots(turn, role)
    const parts = roots
      .map((root) => contentToMarkdown(findContentRoot(root, role)))
      .filter(Boolean)

    const attachments = attachmentSummaries(turn)
    if (attachments) parts.unshift(attachments)

    return parts.join('\n\n')
  }

  function turnSortKey(turn) {
    const testId = turn.getAttribute('data-testid') ?? ''
    const match = testId.match(/conversation-turn-(\d+)/)
    return match ? Number(match[1]) : Number.MAX_SAFE_INTEGER
  }

  function collectVisibleTurns(collected) {
    const turns = Array.from(
      document.querySelectorAll('section[data-testid^="conversation-turn-"]'),
    )

    for (const turn of turns) {
      const role =
        turn.getAttribute('data-turn') ??
        turn
          .querySelector('[data-message-author-role]')
          ?.getAttribute('data-message-author-role') ??
        'assistant'
      const label = roleLabels[role] ?? role
      const content = turnContentToMarkdown(turn, role)
      if (!content) continue

      const id =
        turn.getAttribute('data-turn-id') ??
        turn.getAttribute('data-testid') ??
        `${role}:${content.slice(0, 80)}`

      collected.set(id, {
        sortKey: turnSortKey(turn),
        markdown: `## ${label}\n\n${content}`,
      })
    }

    setStatus(`Context Forge export: collected ${collected.size} turns...`)
  }

  async function collectThread() {
    const root = findScrollRoot()
    const originalTop = scrollTopOf(root)
    const collected = new Map()

    collectVisibleTurns(collected)

    for (let i = 0; i < 40 && scrollTopOf(root) > 0; i += 1) {
      setScrollTop(root, Math.max(0, scrollTopOf(root) - viewportHeightOf(root) * 0.9))
      await wait(waitMs)
      collectVisibleTurns(collected)
    }

    setScrollTop(root, 0)
    await wait(waitMs)
    collectVisibleTurns(collected)

    let previousTop = -1
    for (let i = 0; i < 140; i += 1) {
      const currentTop = scrollTopOf(root)
      const maxTop = scrollHeightOf(root) - viewportHeightOf(root)
      if (Math.abs(currentTop - previousTop) < 4 && currentTop >= maxTop - 8) {
        break
      }
      previousTop = currentTop
      setScrollTop(root, Math.min(maxTop, currentTop + viewportHeightOf(root) * 0.85))
      await wait(waitMs)
      collectVisibleTurns(collected)
    }

    setScrollTop(root, originalTop)

    return Array.from(collected.values())
      .sort((a, b) => a.sortKey - b.sortKey)
      .map((turn) => turn.markdown)
      .join('\n\n')
  }

  setStatus('Context Forge export starting...')
  const markdown = await collectThread()

  if (!markdown) {
    setStatus('Context Forge export found no ChatGPT turns.')
    clearStatusSoon()
    console.warn('Context Forge export found no ChatGPT turns on this page.')
    return
  }

  showResultPanel(markdown)
})()
