// Context Forge Bridge — ChatGPT content script
// Two jobs:
//   1. Sync ChatGPT assistant replies → CF  (runs automatically, same logic as the userscript)
//   2. Inject outbound user messages into the ChatGPT input when background.js asks

'use strict';

const CF_BASE = 'http://localhost:8000';
const SETTLE_MS = 1200;
const SEL_STREAMING = '.result-streaming, [data-is-streaming="true"]';
// ChatGPT rebuilt its UI (2026). Assistant content is now a div.MarkdownRoot-*
// carrying data-markdown-text-style="assistant-message"; the stable per-message
// id lives on an ancestor as data-chatgpt-selection-message-id. The pre-2026 UI
// used [data-message-id][data-message-author-role="assistant"]. Match both so a
// future rollback or A/B bucket still syncs.
const SEL_ASSISTANT = '[data-markdown-text-style="assistant-message"], [data-message-id][data-message-author-role="assistant"]';
// The new composer is a bare div.ProseMirror[contenteditable] with no id; the
// old UI used #prompt-textarea. Match both.
const SEL_INPUT = '#prompt-textarea, .ProseMirror[contenteditable="true"], [contenteditable="true"][id*="prompt"]';
// ChatGPT has changed this selector over time — try all known variants. In the
// 2026 UI the send button is <button aria-label="Send" type="submit"> and only
// exists once ProseMirror has content (it replaces the voice button).
const SEND_SELECTORS = [
  'button[aria-label="Send"]',
  'form button[type="submit"]',
  '[data-testid="send-button"]',
  'button[aria-label="Send prompt"]',
  'button[aria-label*="Send"]',
  '#composer-background button[type="submit"]',
];

// ── Config from extension storage ─────────────────────────────────────────
// The popup writes { links: { [cfConvId]: { chatgptUrl, enabled, ... } } }.
// The content script looks up which CF conversation maps to this ChatGPT URL.

let cfConvId = null; // resolved once on init

async function resolveConvId() {
  const result = await browser.storage.local.get('links');
  const links = result.links || {};
  const currentPath = location.pathname;
  for (const [id, link] of Object.entries(links)) {
    if (!link.chatgptUrl) continue;
    try {
      if (new URL(link.chatgptUrl).pathname === currentPath && link.enabled) {
        return id;
      }
    } catch {}
  }
  return null;
}

// Re-resolve when storage changes (e.g. user links the page via popup).
browser.storage.onChanged.addListener(async () => {
  const newId = await resolveConvId();
  if (newId && newId !== cfConvId) {
    cfConvId = newId;
    synced = await loadSynced(cfConvId);
    scanAll();
  }
});

// ── Markdown extraction (kept in sync with chatgpt-dom-export.js) ─────────

function normalizeText(text) {
  return text
    .replace(/ /g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function escapeMarkdownText(text) {
  return text.replace(/ /g, ' ');
}

function texAnnotation(element) {
  const annotations = Array.from(element.querySelectorAll('annotation'));
  const found = annotations.find(a => /tex/i.test(a.getAttribute('encoding') ?? ''));
  return found?.textContent?.trim();
}

function firstNonEmpty(values) {
  for (const v of values) {
    const n = normalizeText(v ?? '');
    if (n) return n;
  }
  return '';
}

function mathFallbackText(element) {
  const math = element.tagName.toLowerCase() === 'math' ? element : element.querySelector('math');
  return firstNonEmpty([
    element.getAttribute('data-math-source'), // ChatGPT's canonical LaTeX source
    element.getAttribute('data-latex'),
    element.getAttribute('data-tex'),
    element.getAttribute('aria-label'),
    element.getAttribute('alttext'),
    math?.getAttribute('alttext'),
    math?.getAttribute('aria-label'),
    math?.textContent,
    element.textContent,
    element.innerText,
  ]);
}

function mathToMarkdown(element, display) {
  const tex = texAnnotation(element) || mathFallbackText(element);
  if (!tex) return '';
  // A real LaTeX equation never contains a raw '$'. When the source has one,
  // ChatGPT has wrapped a markdown fragment (e.g. a multi-line proof with
  // inline $…$ and indented bullets) in a display span that KaTeX couldn't
  // parse. Emit it verbatim as its own block — nesting it in $$…$$ would break.
  if (tex.includes('$')) return `\n\n${tex}\n\n`;
  return display ? `\n\n$$\n${tex}\n$$\n\n` : `$${tex}$`;
}

function isDisplayMathElement(element) {
  const tag = element.tagName.toLowerCase();
  // ChatGPT wraps display math in <span role="math" style="display: block">
  // whose only math class (katex-display) sits on a child, so check both.
  const isBlockStyled = /display:\s*block/.test(element.getAttribute('style') || '');
  return (
    element.classList?.contains('katex-display') ||
    element.querySelector(':scope > .katex-display') !== null ||
    (element.getAttribute('role') === 'math' && isBlockStyled) ||
    element.getAttribute('display') === 'block' ||
    element.querySelector(':scope > math[display="block"]') !== null ||
    (tag === 'math' && element.getAttribute('display') === 'block') ||
    (tag === 'mjx-container' && element.getAttribute('display') === 'true')
  );
}

function isInlineMathElement(element) {
  const tag = element.tagName.toLowerCase();
  return (
    element.classList?.contains('katex') ||
    tag === 'math' ||
    tag === 'mjx-container' ||
    element.getAttribute('role') === 'math' ||
    element.hasAttribute('data-latex') ||
    element.hasAttribute('data-tex')
  );
}

function isIgnoredElement(element) {
  const tag = element.tagName.toLowerCase();
  const ignoredTags = new Set([
    'at-mentions-menu', 'gem-icon', 'gem-icon-button', 'mat-icon',
    'message-actions', 'source-footnote', 'source-inline-chip',
    'sources-carousel-inline', 'thinking-overlay', 'tts-control-v2',
  ]);
  if (ignoredTags.has(tag)) return true;
  if (element.matches?.('[aria-hidden="true"], .cdk-visually-hidden')) return true;
  if (element.closest?.('source-inline-chip, sources-carousel-inline')) return true;
  if (tag === 'button' && !element.closest('a')) return true;
  return false;
}

function inlineToMarkdown(node) {
  if (node.nodeType === Node.TEXT_NODE) return escapeMarkdownText(node.textContent ?? '');
  if (node.nodeType !== Node.ELEMENT_NODE) return '';
  const element = node;
  const tag = element.tagName.toLowerCase();
  if (isIgnoredElement(element)) return '';
  if (isDisplayMathElement(element)) return mathToMarkdown(element, true);
  if (isInlineMathElement(element)) return mathToMarkdown(element, false);
  if (tag === 'br') return '\n';
  if (tag === 'code') return `\`${element.innerText.trim()}\``;
  const children = Array.from(element.childNodes).map(inlineToMarkdown).join('');
  if (tag === 'strong' || tag === 'b') return `**${children.trim()}**`;
  if (tag === 'em' || tag === 'i') return `*${children.trim()}*`;
  if (tag === 'a') {
    const href = element.getAttribute('href');
    const label = children.trim() || href || '';
    return href ? `[${label}](${href})` : label;
  }
  return children;
}

function promoteStandaloneMath(markdown) {
  const text = normalizeText(markdown);
  if (text.startsWith('$$') && text.endsWith('$$')) return text;
  const match = text.match(/^\$([\s\S]+)\$$/)
  if (!match) return text;
  const tex = match[1].trim();
  if (!tex) return text;
  return `$$\n${tex}\n$$`;
}

function escapeTableCell(text) {
  return normalizeText(text).replace(/\n+/g, '<br>').replace(/\|/g, '\\|');
}

function tableToMarkdown(table) {
  const rows = Array.from(table.querySelectorAll('tr'))
    .map(row => Array.from(row.querySelectorAll('th,td')).map(cell => escapeTableCell(blockChildrenToMarkdown(cell))))
    .filter(cells => cells.length > 0);
  if (rows.length === 0) return '';
  const width = Math.max(...rows.map(cells => cells.length));
  const normalized = rows.map(cells => [...cells, ...Array.from({ length: width - cells.length }, () => '')]);
  const [firstRow, ...bodyRows] = normalized;
  const header = `| ${firstRow.join(' | ')} |`;
  const separator = `| ${Array.from({ length: width }, () => '---').join(' | ')} |`;
  const body = bodyRows.map(row => `| ${row.join(' | ')} |`);
  return [header, separator, ...body].join('\n');
}

function listItemText(item) {
  const clone = item.cloneNode(true);
  clone.querySelectorAll(':scope > ul, :scope > ol').forEach(l => l.remove());
  return blockChildrenToMarkdown(clone);
}

function indentLines(text, spaces) {
  const prefix = ' '.repeat(spaces);
  return text.split('\n').map(line => (line ? `${prefix}${line}` : line)).join('\n');
}

function listToMarkdown(list, depth = 0) {
  const ordered = list.tagName.toLowerCase() === 'ol';
  return Array.from(list.children)
    .filter(child => child.tagName.toLowerCase() === 'li')
    .map((item, index) => {
      const marker = ordered ? `${index + 1}.` : '-';
      const markerPrefix = `${'  '.repeat(depth)}${marker} `;
      const body = listItemText(item);
      const nested = Array.from(item.children)
        .filter(child => ['ul', 'ol'].includes(child.tagName.toLowerCase()))
        .map(child => listToMarkdown(child, depth + 1))
        .filter(Boolean)
        .join('\n');
      const bodyLines = body.split('\n');
      const firstLine = `${markerPrefix}${bodyLines.shift() ?? ''}`.trimEnd();
      const continuation = bodyLines.length ? `\n${indentLines(bodyLines.join('\n'), markerPrefix.length)}` : '';
      return [firstLine + continuation, nested].filter(Boolean).join('\n');
    })
    .join('\n');
}

function elementToMarkdown(element) {
  const tag = element.tagName.toLowerCase();
  if (isIgnoredElement(element)) return '';
  if (isDisplayMathElement(element)) return mathToMarkdown(element, true);
  if (isInlineMathElement(element)) return mathToMarkdown(element, false);
  if (tag === 'code-block') {
    const code = element.querySelector('pre code');
    const language = normalizeText(element.querySelector('.code-block-decoration span')?.innerText ?? '').toLowerCase();
    return `\`\`\`${language}\n${code?.innerText?.trim() ?? element.innerText.trim()}\n\`\`\``;
  }
  if (tag === 'table') return tableToMarkdown(element);
  if (tag === 'hr') return '---';
  if (['div', 'section', 'response-element', 'link-block', 'message-content'].includes(tag)) return blockChildrenToMarkdown(element);
  if (tag === 'pre') return `\`\`\`\n${element.innerText.trim()}\n\`\`\``;
  if (/^h[1-6]$/.test(tag)) return `${'#'.repeat(Number(tag.slice(1)))} ${normalizeText(inlineToMarkdown(element))}`;
  if (tag === 'blockquote') return blockChildrenToMarkdown(element).split('\n').map(line => `> ${line}`).join('\n');
  if (tag === 'ul' || tag === 'ol') return listToMarkdown(element);
  return promoteStandaloneMath(inlineToMarkdown(element));
}

function blockChildrenToMarkdown(root) {
  const blockTags = new Set([
    'blockquote', 'div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'li', 'link-block', 'message-content', 'ol', 'p', 'pre',
    'response-element', 'table', 'ul',
  ]);
  const blocks = Array.from(root.children)
    .filter(child => {
      const tag = child.tagName.toLowerCase();
      return !isIgnoredElement(child) && (blockTags.has(tag) || isDisplayMathElement(child) || tag === 'code-block');
    })
    .map(elementToMarkdown)
    .filter(Boolean);
  if (blocks.length > 0) return blocks.join('\n\n');
  return promoteStandaloneMath(inlineToMarkdown(root));
}

function contentToMarkdown(root) {
  if (!root) return '';
  return blockChildrenToMarkdown(root);
}

function findContentRoot(messageRoot) {
  if (!messageRoot) return null;
  // New UI: the element we matched (via data-markdown-text-style) IS the
  // markdown container, so process it directly.
  if (messageRoot.matches?.('[data-markdown-text-style], [class*="MarkdownRoot"]')) return messageRoot;
  return (
    messageRoot.querySelector('[data-markdown-text-style="assistant-message"]') ??
    messageRoot.querySelector('[class*="MarkdownRoot"]') ??
    messageRoot.querySelector('.markdown') ??
    messageRoot.querySelector('[data-message-id]') ??
    messageRoot
  );
}

// The on-screen assistant element carries no id itself in the 2026 UI; the stable
// per-message id sits on an ancestor. Fall back to the old attribute for the
// pre-2026 UI, where the id is on the element we matched.
function messageIdOf(el) {
  const holder = el.closest?.('[data-chatgpt-selection-message-id]');
  return (
    holder?.getAttribute('data-chatgpt-selection-message-id') ||
    el.getAttribute('data-message-id') ||
    null
  );
}

function isStreaming(el) {
  return !!(
    el?.querySelector?.(SEL_STREAMING) ||
    document.querySelector(SEL_STREAMING) ||
    document.querySelector('button[aria-label*="Stop" i], button[data-testid="stop-button"]')
  );
}

function extractMarkdown(el) {
  return contentToMarkdown(findContentRoot(el));
}

// ── Sync: ChatGPT → CF ───────────────────────────────────────────────────

let synced = new Map(); // messageId → content length at last successful sync
const timers = new Map(); // messageId → setTimeout handle

function syncedKey(convId) { return `cf_synced_${convId}`; }

async function loadSynced(convId) {
  try {
    const result = await browser.storage.local.get(syncedKey(convId));
    const data = result[syncedKey(convId)];
    return data ? new Map(Object.entries(data).map(([k, v]) => [k, Number(v)])) : new Map();
  } catch { return new Map(); }
}

function persistSynced(convId) {
  browser.storage.local.set({ [syncedKey(convId)]: Object.fromEntries(synced) }).catch(() => {});
}

function scheduleSync(el) {
  const id = messageIdOf(el);
  if (!id || id.startsWith('request-placeholder-')) return;

  if (timers.has(id)) clearTimeout(timers.get(id));
  timers.set(id, setTimeout(async () => {
    timers.delete(id);
    if (isStreaming(el)) return;
    // Re-resolve in case cfConvId wasn't set when the message first arrived.
    if (!cfConvId) cfConvId = await resolveConvId();
    if (!cfConvId) {
      console.warn('[CF Bridge] no linked conversation — reply not synced');
      return;
    }
    sendToContextForge(el);
  }, SETTLE_MS));
}

function sendToContextForge(el) {
  const id = messageIdOf(el);
  if (!id || id.startsWith('request-placeholder-')) return;
  const content = extractMarkdown(el);
  if (!content) return;
  if (synced.get(id) === content.length) return;

  fetch(`${CF_BASE}/api/conversations/${cfConvId}/messages/ingest`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ role: 'assistant', agent: 'chatgpt', content, source_id: id }),
  })
    .then(r => {
      if (r.ok) {
        synced.set(id, content.length);
        persistSynced(cfConvId);
        console.log(`[CF Bridge] synced ${id} (${content.length} chars)`);
      } else {
        console.warn(`[CF Bridge] ingest failed: ${r.status}`);
      }
    })
    .catch(e => console.error('[CF Bridge] network error:', e.message));
}

function scanAll() {
  document.querySelectorAll(SEL_ASSISTANT).forEach(scheduleSync);
}

const observer = new MutationObserver((mutations) => {
  if (!cfConvId) return;
  const seen = new Set();
  for (const mutation of mutations) {
    for (const node of [mutation.target, ...mutation.addedNodes]) {
      if (!(node instanceof Element)) continue;
      const msg = node.closest?.(SEL_ASSISTANT);
      if (msg && !seen.has(msg)) { seen.add(msg); scheduleSync(msg); continue; }
      node.querySelectorAll?.(SEL_ASSISTANT).forEach(el => {
        if (!seen.has(el)) { seen.add(el); scheduleSync(el); }
      });
    }
  }
});

// ── Inject: CF → ChatGPT ─────────────────────────────────────────────────

function findSendButton() {
  for (const sel of SEND_SELECTORS) {
    const el = document.querySelector(sel);
    if (el) return el;
  }
  return null;
}

function isSendReady(btn) {
  // ChatGPT never sets the native `disabled` property — until ProseMirror has
  // content the button is marked aria-disabled + data-visually-disabled. So
  // `!btn.disabled` is always true and must NOT be used to gate the click.
  return (
    !!btn &&
    !btn.disabled &&
    btn.getAttribute('aria-disabled') !== 'true' &&
    !btn.hasAttribute('data-visually-disabled')
  );
}

async function waitForSendButton(timeoutMs = 4000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const btn = findSendButton();
    if (isSendReady(btn)) return btn;
    await new Promise(r => setTimeout(r, 150));
  }
  const btns = [...document.querySelectorAll('button[aria-label]')].map(b => b.getAttribute('aria-label'));
  console.warn('[CF Bridge] send button never enabled. aria-label buttons:', btns);
  throw new Error('ChatGPT send button not found or never enabled');
}

async function injectMessage(text) {
  const input = document.querySelector(SEL_INPUT);
  if (!input) throw new Error('ChatGPT input not found');

  // execCommand('insertText') is the only insertion ProseMirror actually
  // registers, and it requires the document to hold real OS focus. background.js
  // focuses the window + tab before calling this; if focus wasn't granted the
  // insert no-ops and we throw so background can retry after forcing focus.
  // (A synthetic paste does NOT work unfocused — verified against ChatGPT.)
  input.focus();
  await new Promise(r => setTimeout(r, 100));

  // Scope the selection to the composer's contents with an explicit Range.
  // A bare document.execCommand('selectAll') acts on whatever node the document
  // selection is anchored in — and when the ProseMirror editor doesn't truly
  // hold focus (e.g. the Firefox window is backgrounded, common under a tiling
  // WM), that anchor is the page body, so selectAll highlights the ENTIRE tab
  // instead of the input and the following insertText no-ops. Selecting the
  // input's node contents first keeps selection/replacement inside the editor.
  const range = document.createRange();
  range.selectNodeContents(input);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);

  document.execCommand('insertText', false, text);
  await new Promise(r => setTimeout(r, 100));

  const injected = input.innerText?.trim();
  if (!injected) throw new Error('Text injection failed — document not focused (execCommand no-op)');

  // Click only once ChatGPT enables the button, i.e. ProseMirror registered the
  // text. Enter-to-send is unreliable (untrusted event), so require the button.
  const sendBtn = await waitForSendButton(4000);
  sendBtn.click();
}

// ── Message handler from background.js ───────────────────────────────────

// Keep the tab alive so Firefox doesn't discard it while waiting for messages.
setInterval(() => {}, 20000);

browser.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'ping') return Promise.resolve({ ok: true });
  if (msg.type === 'inject-message') {
    return injectMessage(msg.content)
      .then(() => ({ ok: true }))
      .catch(e => ({ ok: false, error: e.message }));
  }
});

// ── Init ─────────────────────────────────────────────────────────────────

(async () => {
  // Cache the current ChatGPT URL so the popup can pre-fill it even when
  // the user is on a different tab (CF, etc.) when they open the popup.
  if (location.href.startsWith('https://chatgpt.com/c/')) {
    browser.storage.local.set({ lastChatGPTUrl: location.href });
  }

  cfConvId = await resolveConvId();
  if (cfConvId) {
    synced = await loadSynced(cfConvId);
    scanAll();
    console.log(`[CF Bridge] active on conversation: ${cfConvId} (${synced.size} already synced)`);
  } else {
    console.log('[CF Bridge] no linked CF conversation for this ChatGPT URL');
  }
  observer.observe(document.body, { childList: true, subtree: true, characterData: true });
})();
