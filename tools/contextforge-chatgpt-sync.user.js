// ==UserScript==
// @name         Context Forge Sync — ChatGPT
// @namespace    https://contextforge.local
// @version      0.4.0
// @description  Automatically syncs ChatGPT assistant replies into Context Forge
// @match        https://chatgpt.com/*
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @connect      localhost
// ==/UserScript==

(function () {
  'use strict';

  // ── Config ────────────────────────────────────────────────────────────────
  // Set CONVERSATION_ID to the Context Forge conversation you want to sync into.
  // Find it in the URL when the conversation is open: /conversations/<id>
  const CONVERSATION_ID = 'REPLACE_ME';
  const CF_BASE = 'http://localhost:8000';

  // How long to wait after the last DOM mutation before treating a message as
  // complete.  Gives streaming output time to settle without POSTing a partial reply.
  const SETTLE_MS = 2000;

  // Streaming indicator — when this selector matches inside a message, the reply
  // is still being generated.  Update if ChatGPT changes its markup.
  const SEL_STREAMING = '.result-streaming, [data-is-streaming="true"]';

  // ── Markdown extraction (shared with chatgpt-dom-export.js) ──────────────
  // These functions are deliberately kept in sync with the bookmarklet.
  // If you update one file, update the other.

  function normalizeText(text) {
    return text
      .replace(/ /g, ' ')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
  }

  function escapeMarkdownText(text) {
    return text.replace(/ /g, ' ')
  }

  function texAnnotation(element) {
    const annotations = Array.from(element.querySelectorAll('annotation'))
    const found = annotations.find((a) => /tex/i.test(a.getAttribute('encoding') ?? ''))
    return found?.textContent?.trim()
  }

  function firstNonEmpty(values) {
    for (const value of values) {
      const normalized = normalizeText(value ?? '')
      if (normalized) return normalized
    }
    return ''
  }

  function mathFallbackText(element) {
    const math =
      element.tagName.toLowerCase() === 'math' ? element : element.querySelector('math')
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
    const tag = element.tagName.toLowerCase()
    return (
      element.classList?.contains('katex-display') ||
      element.getAttribute('display') === 'block' ||
      element.querySelector(':scope > math[display="block"]') !== null ||
      (tag === 'math' && element.getAttribute('display') === 'block') ||
      (tag === 'mjx-container' && element.getAttribute('display') === 'true')
    )
  }

  function isInlineMathElement(element) {
    const tag = element.tagName.toLowerCase()
    return (
      element.classList?.contains('katex') ||
      tag === 'math' ||
      tag === 'mjx-container' ||
      element.getAttribute('role') === 'math' ||
      element.hasAttribute('data-latex') ||
      element.hasAttribute('data-tex')
    )
  }

  function isIgnoredElement(element) {
    const tag = element.tagName.toLowerCase()
    const ignoredTags = new Set([
      'at-mentions-menu', 'gem-icon', 'gem-icon-button', 'mat-icon',
      'message-actions', 'source-footnote', 'source-inline-chip',
      'sources-carousel-inline', 'thinking-overlay', 'tts-control-v2',
    ])
    if (ignoredTags.has(tag)) return true
    if (element.matches?.('[aria-hidden="true"], .cdk-visually-hidden')) return true
    if (element.closest?.('source-inline-chip, sources-carousel-inline')) return true
    if (tag === 'button' && !element.closest('a')) return true
    return false
  }

  function inlineToMarkdown(node) {
    if (node.nodeType === Node.TEXT_NODE) return escapeMarkdownText(node.textContent ?? '')
    if (node.nodeType !== Node.ELEMENT_NODE) return ''
    const element = node
    const tag = element.tagName.toLowerCase()
    if (isIgnoredElement(element)) return ''
    if (isDisplayMathElement(element)) return mathToMarkdown(element, true)
    if (isInlineMathElement(element)) return mathToMarkdown(element, false)
    if (tag === 'br') return '\n'
    if (tag === 'code') return `\`${element.innerText.trim()}\``
    const children = Array.from(element.childNodes).map(inlineToMarkdown).join('')
    if (tag === 'strong' || tag === 'b') return `**${children.trim()}**`
    if (tag === 'em' || tag === 'i') return `*${children.trim()}*`
    if (tag === 'a') {
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

  function escapeTableCell(text) {
    return normalizeText(text).replace(/\n+/g, '<br>').replace(/\|/g, '\\|')
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
    const normalized = rows.map((cells) => [
      ...cells,
      ...Array.from({ length: width - cells.length }, () => ''),
    ])
    const [firstRow, ...bodyRows] = normalized
    const header = `| ${firstRow.join(' | ')} |`
    const separator = `| ${Array.from({ length: width }, () => '---').join(' | ')} |`
    const body = bodyRows.map((row) => `| ${row.join(' | ')} |`)
    return [header, separator, ...body].join('\n')
  }

  function listItemText(item) {
    const clone = item.cloneNode(true)
    clone.querySelectorAll(':scope > ul, :scope > ol').forEach((l) => l.remove())
    return blockChildrenToMarkdown(clone)
  }

  function indentLines(text, spaces) {
    const prefix = ' '.repeat(spaces)
    return text.split('\n').map((line) => (line ? `${prefix}${line}` : line)).join('\n')
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
          .filter((child) => ['ul', 'ol'].includes(child.tagName.toLowerCase()))
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
    const tag = element.tagName.toLowerCase()
    if (isIgnoredElement(element)) return ''
    if (isDisplayMathElement(element)) return mathToMarkdown(element, true)
    if (isInlineMathElement(element)) return mathToMarkdown(element, false)
    if (tag === 'code-block') {
      const code = element.querySelector('pre code')
      const language = normalizeText(
        element.querySelector('.code-block-decoration span')?.innerText ?? '',
      ).toLowerCase()
      return `\`\`\`${language}\n${code?.innerText?.trim() ?? element.innerText.trim()}\n\`\`\``
    }
    if (tag === 'table') return tableToMarkdown(element)
    if (tag === 'hr') return '---'
    if (['div', 'section', 'response-element', 'link-block', 'message-content'].includes(tag)) {
      return blockChildrenToMarkdown(element)
    }
    if (tag === 'pre') return `\`\`\`\n${element.innerText.trim()}\n\`\`\``
    if (/^h[1-6]$/.test(tag)) {
      return `${'#'.repeat(Number(tag.slice(1)))} ${normalizeText(inlineToMarkdown(element))}`
    }
    if (tag === 'blockquote') {
      return blockChildrenToMarkdown(element)
        .split('\n')
        .map((line) => `> ${line}`)
        .join('\n')
    }
    if (tag === 'ul' || tag === 'ol') return listToMarkdown(element)
    return promoteStandaloneMath(inlineToMarkdown(element))
  }

  function blockChildrenToMarkdown(root) {
    const blockTags = new Set([
      'blockquote', 'div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
      'li', 'link-block', 'message-content', 'ol', 'p', 'pre',
      'response-element', 'table', 'ul',
    ])
    const blocks = Array.from(root.children)
      .filter((child) => {
        const tag = child.tagName.toLowerCase()
        return (
          !isIgnoredElement(child) &&
          (blockTags.has(tag) || isDisplayMathElement(child) || tag === 'code-block')
        )
      })
      .map(elementToMarkdown)
      .filter(Boolean)
    if (blocks.length > 0) return blocks.join('\n\n')
    return promoteStandaloneMath(inlineToMarkdown(root))
  }

  function contentToMarkdown(root) {
    if (!root) return ''
    return blockChildrenToMarkdown(root)
  }

  function findContentRoot(messageRoot) {
    if (!messageRoot) return null
    return (
      messageRoot.querySelector('.markdown') ??
      messageRoot.querySelector('[data-message-id]') ??
      messageRoot
    )
  }

  function extractMarkdown(el) {
    return contentToMarkdown(findContentRoot(el))
  }

  // ── State ─────────────────────────────────────────────────────────────────
  // synced maps messageId → content length at last successful sync.
  // Using content length as a fingerprint lets us detect when streaming added
  // more text after a partial capture and re-sync the complete reply.
  const STORAGE_KEY = `cf_synced_${CONVERSATION_ID}`;

  function loadSynced() {
    try {
      const raw = GM_getValue(STORAGE_KEY, '{}');
      const parsed = JSON.parse(raw);
      // Migrate old Set format (array of strings) to Map format (object).
      if (Array.isArray(parsed)) {
        return new Map(parsed.map(id => [id, Infinity]));
      }
      return new Map(Object.entries(parsed));
    } catch { return new Map(); }
  }

  function saveSynced() {
    try { GM_setValue(STORAGE_KEY, JSON.stringify(Object.fromEntries(synced))); } catch {}
  }

  const synced = loadSynced();  // Map<messageId, contentLength>
  const timers = new Map();     // messageId → pending setTimeout handle

  // ── Sync ──────────────────────────────────────────────────────────────────
  function ingestUrl() {
    return `${CF_BASE}/api/conversations/${CONVERSATION_ID}/messages/ingest`;
  }

  function sendToContextForge(el) {
    const id      = el.getAttribute('data-message-id');
    // ChatGPT's thinking-in-progress placeholder uses this ID prefix and only
    // contains "Thinking" — skip it entirely.
    if (id?.startsWith('request-placeholder-')) return;
    const content = extractMarkdown(el);
    if (!content) return;
    // Skip only if we already sent this exact content length (fingerprint).
    if (synced.get(id) === content.length) return;

    GM_xmlhttpRequest({
      method:  'POST',
      url:     ingestUrl(),
      headers: { 'Content-Type': 'application/json' },
      data:    JSON.stringify({ role: 'assistant', agent: 'chatgpt', content, source_id: id }),
      onload(res) {
        if (res.status >= 200 && res.status < 300) {
          synced.set(id, content.length);
          saveSynced();
          console.log(`[CF] synced ${id} (${content.length} chars)`);
        } else {
          console.warn(`[CF] ingest ${res.status} for ${id}:`, res.responseText);
        }
      },
      onerror() {
        console.error('[CF] network error — is ContextForge running on port 8000?');
      },
    });
  }

  function scheduleSync(el) {
    if (CONVERSATION_ID === 'REPLACE_ME') return;
    const id = el.getAttribute('data-message-id');
    if (!id || id.startsWith('request-placeholder-')) return;

    if (timers.has(id)) clearTimeout(timers.get(id));
    timers.set(id, setTimeout(() => {
      timers.delete(id);
      if (el.querySelector(SEL_STREAMING)) return; // still streaming — will reschedule
      sendToContextForge(el);
    }, SETTLE_MS));
  }

  function scanAll() {
    document.querySelectorAll('[data-message-id][data-message-author-role="assistant"]')
      .forEach(scheduleSync);
  }

  // ── Observer ──────────────────────────────────────────────────────────────
  const observer = new MutationObserver((mutations) => {
    const seen = new Set();
    for (const mutation of mutations) {
      for (const node of [mutation.target, ...mutation.addedNodes]) {
        if (!(node instanceof Element)) continue;
        const msg = node.closest?.('[data-message-id][data-message-author-role="assistant"]');
        if (msg && !seen.has(msg)) { seen.add(msg); scheduleSync(msg); continue; }
        node.querySelectorAll?.('[data-message-id][data-message-author-role="assistant"]')
          .forEach((el) => { if (!seen.has(el)) { seen.add(el); scheduleSync(el); } });
      }
    }
  });

  // ── Init ──────────────────────────────────────────────────────────────────
  function init() {
    if (CONVERSATION_ID === 'REPLACE_ME') {
      console.warn('[CF] Set CONVERSATION_ID in the userscript before use.');
      return;
    }
    scanAll();
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    console.log(`[CF] Context Forge Sync active → conversation: ${CONVERSATION_ID}`);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
