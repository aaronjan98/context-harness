# 2026-07-05 — Auto-run fixes and per-conversation auto-run

## What was worked on

A full session of CF stability fixes driven by real use in the TAA playlist workflow,
culminating in per-conversation auto-run.

---

## Bug fixes made

### 1. `pendingAutoRunRef` retry pattern
- **Bug**: `autoRunFiredRef.current.add(msg.id)` ran before the HTTP call, so a failed
  `appendMessage` permanently marked the message as handled with no retry.
- **Fix**: Added `pendingAutoRunRef` — acts as an in-flight lock, clears on both success
  and failure. `autoRunFiredRef` is only marked on confirmed success.

### 2. `sudo` inside heredocs not classified
- **Bug**: `CONFIRM_PATTERNS` sudo regex `(^|[;&|`]\s*)sudo` only matched `sudo` at the
  start of the full string or after `;|&`. Inside SSH heredocs it appears after `\n` and
  was classified as `safe`, auto-executing without the approval UI.
- **Fix**: Added `re.MULTILINE` to all `(^|...)` patterns in `CONFIRM_PATTERNS` and
  `DANGEROUS_COMMAND_PATTERNS` so `^` matches start-of-line inside heredocs.

### 3. Large tool output flooding ChatGPT context
- **Backend** (`format_terminal_result_markdown`): stdout > 10 KB is truncated to
  head+tail and saved to `tool-logs/{source_msg_id}-stdout.log` in the conversation dir.
- **Frontend** (`formatChatbotCopy`): same 10 KB limit applied to the chatbot bridge
  message so the ChatGPT context window isn't blown.

### 4. `terminal.done` detection gaps
- `extractDoneSignal` now also catches bare `terminal.done` (plain text without fenced
  block) and short completion messages (≤60 chars containing "done/complete/finished").
- The done check now runs **before** the no-tool-call streak path so bare completions
  stop the loop instead of triggering another continue.

### 5. Continue message includes `terminal.done` format example
- The auto-continue "Please continue..." message now includes the exact `terminal.done`
  JSON block so ChatGPT gets the format reminder at the moment it needs it.

### 6. Streaming spinner hang after timeout
- **Bug**: After `process.kill()`, `process.wait()` blocked indefinitely when SSH
  subprocesses kept the local client alive.
- **Fix**: `asyncio.wait_for(process.wait(), timeout=5.0)` caps the wait; double-kills
  and returns exit code -1 if it times out.

### 7. "Waiting for ChatGPT response" spinner when auto-run off
- Spinner and polling now gated on `autoRunEnabled` — when off, no indicator and no
  2-second poll for new user messages.

### 8. "Continue ▶" button removed
- Redundant with the Auto-run toggle. When auto-run is off, users submit manually via
  the composer. Removed the button and the `showContinue` derived value.

### 9. Conversation stuck on tool result (no chatbot copy)
- **Bug**: If auto-run was off when a tool completed, the chatbot copy (user message for
  the bridge) was never appended. The conversation got stuck with a `tool` message last.
- **Fix**: Auto-run effect now detects `tool` as the last message with no subsequent
  `user`, parses the tool result, and appends the chatbot copy automatically.

### 10. Extension bridge respects auto-run
- `background.js` (`checkAndDispatch`) now reads `auto_run` from the conversation's
  thread endpoint and skips injection when off. ChatGPT→CF sync (MutationObserver in
  `content-chatgpt.js`) is unaffected — always runs.
- Pending user messages are preserved across pause/resume because `lastDispatchedMsgId`
  only advances on successful injection.

---

## Per-conversation auto-run

Auto-run is now per-conversation (stored in `conversation.yaml`), defaulting to OFF.

**Changes:**
- `ConversationMetadata.auto_run: bool = False` (backend)
- `write_conversation_metadata` only writes the field if True (keeps YAMLs clean)
- `ConversationSummaryResponse` Pydantic model includes `auto_run`
- New endpoint: `PATCH /api/conversations/{id}/auto-run`
- Frontend reads `auto_run` via `fetchConversation(id)` query (not global settings)
- Toggle invalidates `['conversations', id]` and forces message refetch on enable
- Green dot indicator (`.cf-autorun-badge`) in sidebar for active conversations
- Extension reads `conversation.auto_run` from the thread response per-link

---

## Key lessons

- FastAPI `response_model=` silently drops extra fields — always add new fields to both
  the store dict AND the Pydantic response model.
- `re.MULTILINE` needed for any `^` regex that should match inside multi-line shell
  heredocs embedded in a JSON command string.
- The chatbot copy (bridge user message) is gated behind `autoRunEnabledRef` — if
  auto-run is off when a tool completes, the copy is never appended and the conversation
  stalls. Detect and recover in the auto-run effect.

---

## Open questions / next steps

- Consider whether the auto-run toggle should also be surfaced in the conversation list
  context menu (right-click) in addition to the toolbar.
- The rAF flush in `waitForChatGPTResponse` switches tabs every 3s — this may be
  noticeable with multiple simultaneous conversations. Worth monitoring.
- `patchSettings` still writes global `auto_run` to settings.json — this is now unused
  by the CF UI but the extension's legacy userscript may reference it. Could clean up.
