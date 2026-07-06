# 2026-07-04 — ChatGPT Bridge: rAF flush + session notes

## What was worked on

Completed the Context Forge ↔ ChatGPT browser extension bridge (`tools/contextforge-extension/`). Primary focus: fixing the "response never syncs until user manually visits ChatGPT tab" problem.

## Root cause identified

ChatGPT uses `requestAnimationFrame` (rAF) for streaming DOM updates. Browsers suspend rAF in background (non-active) tabs as a performance optimization. So:

1. Message injected into ChatGPT ✓
2. ChatGPT generates a response and streams it
3. DOM updates via rAF — but tab is in background → rAF suspended → no DOM mutations
4. MutationObserver in content script never fires → no sync to CF
5. User switches to tab → rAF resumes → bulk DOM update → sync happens

## Fix implemented

`waitForChatGPTResponse()` in `background.js`:
- Called fire-and-forget after successful injection
- Every 3s: checks CF thread for new assistant message
- While no response: briefly activates ChatGPT tab (~300ms) to flush rAF rendering, then switches back to previous tab
- Logs `[CF Bridge] flushed rAF for <msgId> (Xs elapsed)` each cycle
- Returns when assistant message found; times out at 3 minutes

## Key insight

Making a tab active via `browser.tabs.update({ active: true })` sets `document.visibilityState = 'visible'` and `document.hidden = false` — that's what gates rAF. OS window focus is separate; this works even when Firefox is on a different Hyprland workspace.

## Observed behavior

~7 flushes for a 24-second ChatGPT response. This is expected: each flush gives 300ms of rAF time. While streaming, mutations reset the content script's 1200ms settle timer. Once ChatGPT finishes, the next flush lets settle timer complete → sync.

## Other changes in this commit

- `source_id` dedup + upsert in `server/store.py` and `server/main.py`
- Tool card code fence normalization + `sanitizeJsonNewlines()` for literal `\n` in DOM
- Edit button always enabled (draftRaw state) for error recovery
- Waiting spinner in `ThreadView.tsx` + 2s refetch poll while last msg is user
- CORS middleware on CF server
- Tampermonkey userscript updated with `synced` Map + `SETTLE_MS = 2000`

## Open questions / next steps

- rAF flush is the current workaround; a cleaner alternative would be fetch/XHR interception to read ChatGPT's SSE stream directly — more reliable but fragile to API changes
- Shorter flush interval (1.5s) could reduce latency at cost of more tab flashing
- Depth field (`depth: int`) for MessageRecord + UI depth controls — noted from earlier session, not yet prioritized
