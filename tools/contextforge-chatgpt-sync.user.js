// ==UserScript==
// @name         Context Forge Sync — ChatGPT
// @namespace    https://contextforge.local
// @version      0.1.0
// @description  Automatically syncs ChatGPT assistant replies into Context Forge
// @match        https://chatgpt.com/*
// @grant        GM_xmlhttpRequest
// @connect      localhost
// ==/UserScript==

(function () {
  'use strict';

  // ── Config ────────────────────────────────────────────────────────────────
  // Set CONVERSATION_ID to the Context Forge conversation you want to sync into.
  // Find it in the URL when the conversation is open: /conversations/<id>
  const CONVERSATION_ID = 'REPLACE_ME';
  const CF_BASE = 'http://localhost:8000';

  // ChatGPT DOM selectors.
  // If ChatGPT changes its markup, update these constants — nothing else needs to change.
  const SEL_MESSAGE     = '[data-message-id]';
  const ATTR_ROLE       = 'data-message-author-role';
  const SEL_CONTENT     = '.markdown, [class*="prose"]';
  const SEL_STREAMING   = '.result-streaming, [data-is-streaming="true"]';

  // Wait this long after the last DOM mutation on a message before treating it as complete.
  // Gives streaming output time to finish without POSTing a partial reply.
  const SETTLE_MS = 2000;

  // ── State ─────────────────────────────────────────────────────────────────
  const synced  = new Set();  // chatgpt message IDs already sent
  const timers  = new Map();  // messageId → pending setTimeout handle

  // ── Helpers ───────────────────────────────────────────────────────────────
  function ingestUrl() {
    return `${CF_BASE}/api/conversations/${CONVERSATION_ID}/messages/ingest`;
  }

  function extractContent(el) {
    const prose = el.querySelector(SEL_CONTENT);
    return (prose ?? el).innerText.trim();
  }

  function isStreaming(el) {
    return !!el.querySelector(SEL_STREAMING);
  }

  // ── Sync ──────────────────────────────────────────────────────────────────
  function sendToContextForge(el) {
    const id      = el.getAttribute('data-message-id');
    const content = extractContent(el);
    if (!content) return;

    synced.add(id);

    GM_xmlhttpRequest({
      method:  'POST',
      url:     ingestUrl(),
      headers: { 'Content-Type': 'application/json' },
      data:    JSON.stringify({ role: 'assistant', agent: 'chatgpt', content, source_id: id }),
      onload(res) {
        if (res.status >= 200 && res.status < 300) {
          console.log(`[CF] synced ${id}`);
        } else {
          console.warn(`[CF] ingest returned ${res.status} for ${id}:`, res.responseText);
          synced.delete(id); // allow retry on next observation
        }
      },
      onerror() {
        console.error('[CF] network error — is ContextForge running on port 8000?');
        synced.delete(id);
      },
    });
  }

  // Schedule a sync for one assistant message element.
  // Resets the debounce timer on every call so streaming messages are only
  // sent once they stop changing.
  function scheduleSync(el) {
    if (CONVERSATION_ID === 'REPLACE_ME') return; // guard against unconfigured installs

    const id = el.getAttribute('data-message-id');
    if (!id || synced.has(id)) return;

    if (timers.has(id)) clearTimeout(timers.get(id));

    timers.set(id, setTimeout(() => {
      timers.delete(id);
      if (isStreaming(el)) return; // still going — MutationObserver will reschedule
      sendToContextForge(el);
    }, SETTLE_MS));
  }

  // Find and schedule all currently visible assistant messages.
  function scanAll() {
    document.querySelectorAll(`${SEL_MESSAGE}[${ATTR_ROLE}="assistant"]`)
      .forEach(scheduleSync);
  }

  // ── Observer ──────────────────────────────────────────────────────────────
  // Watch the entire document for DOM changes.  For each change, walk up from
  // the mutated node to find the nearest assistant message element.
  const observer = new MutationObserver((mutations) => {
    const seen = new Set();
    for (const mutation of mutations) {
      const nodes = [mutation.target, ...mutation.addedNodes];
      for (const node of nodes) {
        if (!(node instanceof Element)) continue;

        // Node is inside (or is) an assistant message
        const msg = node.closest(`${SEL_MESSAGE}[${ATTR_ROLE}="assistant"]`);
        if (msg && !seen.has(msg)) {
          seen.add(msg);
          scheduleSync(msg);
          continue;
        }

        // Node contains assistant messages (e.g. a page navigation loaded a conversation)
        node.querySelectorAll?.(`${SEL_MESSAGE}[${ATTR_ROLE}="assistant"]`)
          .forEach(el => { if (!seen.has(el)) { seen.add(el); scheduleSync(el); } });
      }
    }
  });

  // ── Init ──────────────────────────────────────────────────────────────────
  function init() {
    if (CONVERSATION_ID === 'REPLACE_ME') {
      console.warn('[CF] Context Forge Sync: set CONVERSATION_ID in the userscript before use.');
      return;
    }

    scanAll();
    observer.observe(document.body, {
      childList:     true,
      subtree:       true,
      characterData: true, // catches streaming text-node updates
    });
    console.log(`[CF] Context Forge Sync active → conversation: ${CONVERSATION_ID}`);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
