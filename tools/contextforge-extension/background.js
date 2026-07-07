// Context Forge Bridge — background page (MV2 persistent)
// Uses browser.* (Promise-based) throughout for Firefox compatibility.

const CF_BASE = 'http://localhost:8000';
const POLL_MS = 5000;

// ── Storage helpers ────────────────────────────────────────────────────────

async function getLinks() {
  const result = await browser.storage.local.get('links');
  return result.links || {};
}

async function patchLink(cfConvId, patch) {
  const links = await getLinks();
  links[cfConvId] = { ...links[cfConvId], ...patch };
  await browser.storage.local.set({ links });
}

// ── Polling ────────────────────────────────────────────────────────────────

const inFlight = new Set(); // conversations currently being dispatched

async function pollAllLinks() {
  const links = await getLinks();
  for (const [cfConvId, link] of Object.entries(links)) {
    if (!link.enabled || !link.chatgptUrl) continue;
    if (inFlight.has(cfConvId)) continue; // already dispatching, skip this cycle
    try {
      await checkAndDispatch(cfConvId, link);
    } catch (e) {
      console.warn('[CF Bridge] poll error for', cfConvId, '—', e.message);
    }
  }
}

async function checkAndDispatch(cfConvId, link) {
  inFlight.add(cfConvId);
  const res = await fetch(`${CF_BASE}/api/conversations/${cfConvId}/thread`);
  if (!res.ok) {
    console.warn('[CF Bridge] CF returned', res.status, 'for', cfConvId);
    return;
  }
  const data = await res.json();
  // Always dispatch pending user messages regardless of agent mode.
  // Agent mode (auto_run) only controls tool execution and auto-continue on the CF side.
  const { messages } = data;

  let lastIdx = -1;
  if (link.lastDispatchedMsgId) {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].id === link.lastDispatchedMsgId) { lastIdx = i; break; }
    }
  }

  const pending = messages.slice(lastIdx + 1).filter(m => m.role === 'user');
  if (pending.length === 0) { inFlight.delete(cfConvId); return; }

  console.log(`[CF Bridge] ${pending.length} pending message(s) for ${cfConvId}`);
  try {
    for (const msg of pending) {
      await dispatchMessage(cfConvId, link, msg);
      await patchLink(cfConvId, { lastDispatchedMsgId: msg.id });
      link.lastDispatchedMsgId = msg.id;
      await sleep(500);
    }
  } finally {
    inFlight.delete(cfConvId);
  }
}

async function sendInject(tabId, content, cfConvId, msgId) {
  try {
    return await browser.tabs.sendMessage(tabId, { type: 'inject-message', content, cfConvId, msgId });
  } catch {
    return null; // tab sleeping or content script not ready
  }
}

async function dispatchMessage(cfConvId, link, msg) {
  console.log(`[CF Bridge] dispatching msg ${msg.id} to ChatGPT`);
  const tab = await ensureChatGPTTab(link.chatgptUrl);

  const capturing = isBaseUrl(link.chatgptUrl);

  // Try without switching tabs first — works when the ChatGPT tab already has focus.
  const directReply = await sendInject(tab.id, msg.content, cfConvId, msg.id);
  if (directReply?.ok) {
    console.log(`[CF Bridge] injected msg ${msg.id} (no tab switch needed)`);
    waitForChatGPTResponse(cfConvId, tab, msg.id);
    if (capturing) captureConversationUrl(cfConvId, tab);
    return;
  }

  // execCommand('insertText') needs document focus. Briefly make the tab
  // active — since ensureChatGPTTab already handled any reload, the tab is
  // fully loaded so there's no gray screen, just a ~200ms flash.
  const [prev] = await browser.tabs.query({ active: true, currentWindow: true });
  await browser.tabs.update(tab.id, { active: true });
  await sleep(200);

  const reply = await sendInject(tab.id, msg.content, cfConvId, msg.id);
  if (reply?.ok) {
    console.log(`[CF Bridge] injected msg ${msg.id} (focused tab)`);
  } else {
    console.warn(`[CF Bridge] injection failed:`, reply?.error ?? 'no response');
  }

  if (prev && prev.id !== tab.id) browser.tabs.update(prev.id, { active: true });
  if (!reply?.ok) throw new Error(reply?.error ?? 'Injection failed');

  waitForChatGPTResponse(cfConvId, tab, msg.id);
  if (capturing) captureConversationUrl(cfConvId, tab);
}

// ChatGPT uses requestAnimationFrame for streaming DOM updates. rAF is
// suspended in background tabs, so MutationObserver never fires and the
// response never syncs to CF until the tab is manually visited.
// Fix: briefly activate the ChatGPT tab every 3s to flush rAF rendering.
async function waitForChatGPTResponse(cfConvId, tab, dispatchedMsgId) {
  const maxMs = 3 * 60 * 1000;
  const start = Date.now();
  console.log(`[CF Bridge] waiting for ChatGPT response to ${dispatchedMsgId}`);

  while (Date.now() - start < maxMs) {
    await sleep(3000);

    // Check if an assistant message arrived in CF after the dispatched message.
    try {
      const res = await fetch(`${CF_BASE}/api/conversations/${cfConvId}/thread`);
      if (res.ok) {
        const { messages } = await res.json();
        let idx = -1;
        for (let i = messages.length - 1; i >= 0; i--) {
          if (messages[i].id === dispatchedMsgId) { idx = i; break; }
        }
        if (idx >= 0 && messages.slice(idx + 1).some(m => m.role === 'assistant')) {
          console.log(`[CF Bridge] response received for ${dispatchedMsgId}`);
          return;
        }
      }
    } catch {}

    // Response not yet in CF — briefly activate the ChatGPT tab to flush
    // suspended requestAnimationFrame rendering, then switch back.
    try {
      const [curr] = await browser.tabs.query({ active: true, currentWindow: true });
      await browser.tabs.update(tab.id, { active: true });
      await sleep(300);
      if (curr && curr.id !== tab.id) {
        await browser.tabs.update(curr.id, { active: true });
      }
      console.log(`[CF Bridge] flushed rAF for ${dispatchedMsgId} (${Math.round((Date.now() - start) / 1000)}s elapsed)`);
    } catch (e) {
      console.warn('[CF Bridge] rAF flush failed:', e.message);
    }
  }

  console.warn(`[CF Bridge] gave up waiting for response to ${dispatchedMsgId} after 3 min`);
}

function isBaseUrl(url) {
  try { const p = new URL(url).pathname; return p === '/' || p === ''; } catch { return false; }
}

async function captureConversationUrl(cfConvId, tab) {
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    await sleep(500);
    try {
      const updated = await browser.tabs.get(tab.id);
      const { pathname } = new URL(updated.url);
      if (pathname.startsWith('/c/')) {
        await patchLink(cfConvId, { chatgptUrl: updated.url });
        console.log(`[CF Bridge] captured conversation URL for ${cfConvId}: ${updated.url}`);
        return;
      }
    } catch (e) {
      console.warn('[CF Bridge] captureConversationUrl error:', e.message);
    }
  }
  console.warn('[CF Bridge] gave up capturing conversation URL for', cfConvId);
}

async function ensureChatGPTTab(chatgptUrl) {
  const parsedUrl = new URL(chatgptUrl);
  const convPath = parsedUrl.pathname;
  const baseOnly = isBaseUrl(chatgptUrl);
  const allTabs = await browser.tabs.query({ url: 'https://chatgpt.com/*' });
  const match = allTabs.find(t => {
    try {
      const p = new URL(t.url).pathname;
      return baseOnly ? (p === '/' || p === '') : p === convPath;
    } catch { return false; }
  });

  if (!match) {
    console.log('[CF Bridge] opening background tab for', chatgptUrl);
    const tab = await browser.tabs.create({ url: chatgptUrl, active: false });
    await waitForTabLoad(tab.id);
    await waitForContentScript(tab.id);
    return tab;
  }

  // Tab exists — check if Firefox discarded it (removes DOM from memory to save RAM).
  // This causes the gray screen + full reload when you click it.
  // We can reload it in the background without making it active.
  if (match.discarded) {
    console.log('[CF Bridge] tab was discarded — reloading in background');
    await browser.tabs.reload(match.id);
    await waitForTabLoad(match.id);
    await waitForContentScript(match.id);
  }

  console.log('[CF Bridge] reusing tab', match.id, match.discarded ? '(reloaded)' : '');
  return match;
}

function waitForTabLoad(tabId) {
  return new Promise((resolve) => {
    function listener(id, info) {
      if (id === tabId && info.status === 'complete') {
        browser.tabs.onUpdated.removeListener(listener);
        setTimeout(resolve, 2000); // wait for React to hydrate
      }
    }
    browser.tabs.onUpdated.addListener(listener);
  });
}

async function waitForContentScript(tabId, maxMs = 8000) {
  const deadline = Date.now() + maxMs;
  while (Date.now() < deadline) {
    try {
      const reply = await browser.tabs.sendMessage(tabId, { type: 'ping' });
      if (reply?.ok) return;
    } catch {}
    await sleep(300);
  }
  console.warn('[CF Bridge] content script not ready after', maxMs, 'ms');
}

// ── Message passing from popup ─────────────────────────────────────────────
// Returning a Promise from onMessage is the Firefox-native async response pattern.

browser.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'get-links') {
    return getLinks();
  }
  if (msg.type === 'set-link') {
    return patchLink(msg.cfConvId, msg.patch).then(() => ({ ok: true }));
  }
  if (msg.type === 'delete-link') {
    return getLinks().then(links => {
      delete links[msg.cfConvId];
      return browser.storage.local.set({ links });
    }).then(() => ({ ok: true }));
  }
});

// ── Init ──────────────────────────────────────────────────────────────────

setInterval(pollAllLinks, POLL_MS);
pollAllLinks();

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
