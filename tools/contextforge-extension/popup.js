'use strict';

const CF_BASE = 'http://localhost:8000';

// ── Auto-fill + caching ───────────────────────────────────────────────────

async function autoFill() {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  if (!tab?.url) return;

  const cfInput      = document.getElementById('cf-id');
  const chatgptInput = document.getElementById('chatgpt-url');

  if (tab.url.startsWith('https://chatgpt.com/c/')) {
    if (!chatgptInput.value) chatgptInput.value = tab.url;
    await browser.storage.local.set({ lastChatGPTUrl: tab.url });
  } else {
    if (!chatgptInput.value) {
      const { lastChatGPTUrl } = await browser.storage.local.get('lastChatGPTUrl');
      if (lastChatGPTUrl) chatgptInput.value = lastChatGPTUrl;
    }
  }

  const cfMatch = tab.url.match(/\/conversations\/([\w-]+)/);
  if (cfMatch) {
    if (!cfInput.value) cfInput.value = cfMatch[1];
    await browser.storage.local.set({ lastCFConvId: cfMatch[1] });
  } else if (!cfInput.value) {
    const { lastCFConvId } = await browser.storage.local.get('lastCFConvId');
    if (lastCFConvId) cfInput.value = lastCFConvId;
  }
}

// ── Draft persistence ─────────────────────────────────────────────────────

async function saveDraft() {
  await browser.storage.local.set({
    'popup-draft': {
      cfId:       document.getElementById('cf-id').value,
      chatgptUrl: document.getElementById('chatgpt-url').value,
    },
  });
}

async function restoreDraft() {
  const result = await browser.storage.local.get('popup-draft');
  const draft = result['popup-draft'];
  if (draft?.cfId)       document.getElementById('cf-id').value       = draft.cfId;
  if (draft?.chatgptUrl) document.getElementById('chatgpt-url').value = draft.chatgptUrl;
}

['cf-id', 'chatgpt-url'].forEach(id => {
  document.getElementById(id).addEventListener('input', saveDraft);
});

// ── Helpers ───────────────────────────────────────────────────────────────

async function fetchLastUserMsgId(cfConvId) {
  try {
    const res = await fetch(`${CF_BASE}/api/conversations/${cfConvId}/thread`);
    if (!res.ok) return null;
    const { messages } = await res.json();
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'user') return messages[i].id;
    }
  } catch {}
  return null;
}

// ── Render linked conversations ───────────────────────────────────────────

async function render() {
  const links = await browser.runtime.sendMessage({ type: 'get-links' });
  const container = document.getElementById('links-container');
  container.innerHTML = '';

  if (!links || Object.keys(links).length === 0) {
    container.innerHTML = '<p style="color:#666;font-size:12px">No linked conversations yet.</p>';
    return;
  }

  for (const [cfConvId, link] of Object.entries(links)) {
    let chatgptId = '—';
    try { if (link.chatgptUrl) chatgptId = new URL(link.chatgptUrl).pathname.replace('/c/', ''); } catch {}

    const div = document.createElement('div');
    div.className = 'link';
    div.dataset.id = cfConvId;

    // ── Normal view ──
    const normalView = document.createElement('div');
    normalView.className = 'normal-view';
    normalView.innerHTML = `
      <div class="link-row">
        <span class="link-label">CF</span>
        <span class="link-value">${cfConvId}</span>
        <span class="badge ${link.enabled ? 'badge-on' : 'badge-off'}">${link.enabled ? 'Active' : 'Paused'}</span>
      </div>
      <div class="link-row">
        <span class="link-label">ChatGPT</span>
        <span class="link-value">${chatgptId}</span>
      </div>
      <div class="actions">
        <button class="toggle-btn">${link.enabled ? 'Pause' : 'Resume'}</button>
        <button class="edit-btn">Edit</button>
        <button class="reset-btn">Reset</button>
        <button class="delete-btn danger">Remove</button>
      </div>
    `;

    // ── Edit view ──
    const editView = document.createElement('div');
    editView.className = 'edit-view';
    editView.style.display = 'none';
    editView.innerHTML = `
      <label class="edit-label">CF Conversation ID</label>
      <input class="edit-cf-id" value="${cfConvId}" />
      <label class="edit-label">ChatGPT URL</label>
      <input class="edit-chatgpt-url" value="${link.chatgptUrl ?? ''}" />
      <div class="actions" style="margin-top:6px">
        <button class="save-btn primary-btn">Save</button>
        <button class="cancel-btn">Cancel</button>
      </div>
    `;

    div.appendChild(normalView);
    div.appendChild(editView);
    container.appendChild(div);

    // Toggle / Pause / Resume
    normalView.querySelector('.toggle-btn').addEventListener('click', async () => {
      await browser.runtime.sendMessage({
        type: 'set-link', cfConvId,
        patch: { enabled: !link.enabled },
      });
      render();
    });

    // Edit — show edit view
    normalView.querySelector('.edit-btn').addEventListener('click', () => {
      normalView.style.display = 'none';
      editView.style.display = '';
    });

    // Reset — set dispatch pointer to now so only future messages are sent
    normalView.querySelector('.reset-btn').addEventListener('click', async (e) => {
      e.target.textContent = 'Resetting…';
      e.target.disabled = true;
      const lastId = await fetchLastUserMsgId(cfConvId);
      await browser.runtime.sendMessage({
        type: 'set-link', cfConvId,
        patch: { lastDispatchedMsgId: lastId },
      });
      e.target.textContent = 'Done ✓';
      setTimeout(render, 800);
    });

    // Remove
    normalView.querySelector('.delete-btn').addEventListener('click', async () => {
      await browser.runtime.sendMessage({ type: 'delete-link', cfConvId });
      render();
    });

    // Save edit
    editView.querySelector('.save-btn').addEventListener('click', async (e) => {
      e.target.textContent = 'Saving…';
      e.target.disabled = true;
      const newCfId      = editView.querySelector('.edit-cf-id').value.trim();
      const newUrl       = editView.querySelector('.edit-chatgpt-url').value.trim();
      if (!newCfId || !newUrl) { render(); return; }

      // If CF ID changed, delete old key and create new one.
      if (newCfId !== cfConvId) {
        await browser.runtime.sendMessage({ type: 'delete-link', cfConvId });
      }
      await browser.runtime.sendMessage({
        type: 'set-link', cfConvId: newCfId,
        patch: { chatgptUrl: newUrl, enabled: link.enabled, lastDispatchedMsgId: link.lastDispatchedMsgId },
      });
      render();
    });

    // Cancel edit
    editView.querySelector('.cancel-btn').addEventListener('click', () => {
      editView.style.display = 'none';
      normalView.style.display = '';
    });
  }
}

// ── Add link ──────────────────────────────────────────────────────────────

document.getElementById('add-btn').addEventListener('click', async () => {
  const cfId = document.getElementById('cf-id').value.trim();
  const url  = document.getElementById('chatgpt-url').value.trim();
  if (!cfId || !url) return;

  const btn = document.getElementById('add-btn');
  btn.textContent = 'Linking…';
  btn.disabled = true;

  const lastDispatchedMsgId = await fetchLastUserMsgId(cfId);

  await browser.runtime.sendMessage({
    type: 'set-link', cfConvId: cfId,
    patch: { chatgptUrl: url, enabled: true, lastDispatchedMsgId },
  });

  btn.textContent = 'Linked ✓';
  await new Promise(r => setTimeout(r, 1200));
  document.getElementById('cf-id').value = '';
  document.getElementById('chatgpt-url').value = '';
  await browser.storage.local.remove('popup-draft');
  btn.textContent = 'Link';
  btn.disabled = false;
  render();
});

// ── Init ──────────────────────────────────────────────────────────────────

(async () => {
  await restoreDraft();
  await autoFill();
  await render();
})();
