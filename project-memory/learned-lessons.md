# Learned Lessons

This file captures project experience in first person so it can be reused when
explaining Context Forge to interviewers or collaborators.

## ChatGPT streaming requires periodic tab activation (rAF flush)

When building the CF Bridge to send messages to ChatGPT and sync replies back,
I hit a wall: ChatGPT's responses never appeared in the browser unless I
manually clicked the tab. The bridge logs showed the message was injected
successfully, but the DOM never updated.

The root cause is that ChatGPT renders its streaming token output using
`requestAnimationFrame`. rAF callbacks are suspended by browsers in background
tabs as a power-saving measure — the tab's rendering pipeline is effectively
paused. Because the DOM never updates, the MutationObserver in the content
script never fires, so CF never sees the response.

The fix is to briefly activate the ChatGPT tab every three seconds to flush the
suspended rAF queue. The bridge background script:

1. Injects the message into ChatGPT's input and submits it
2. Polls CF every 3 seconds for a new assistant message
3. If the response hasn't arrived, briefly switches to the ChatGPT tab (~300ms)
   to unblock rAF rendering, then switches back
4. Repeats until the response lands in CF or a 3-minute timeout is hit

This works even when the ChatGPT tab is on a different Hyprland workspace, because
tab visibility is a browser-level concept — it tracks whether the tab is the
active tab in its window, not whether that window is visible on the current
desktop workspace.

Typical responses arrive after 1–3 flush cycles (3–9 seconds). The brief
tab-switch flash is invisible in practice since the tab was already loaded.

What I learned:

- `requestAnimationFrame` is not just an animation API — many web apps use it as
  a main loop tick. Anything that renders via rAF will silently stall in
  background tabs.
- `document.visibilityState` and the Page Visibility API are the browser's
  mechanism for this; rAF resumes when the tab becomes visible.
- This class of problem is invisible in devtools unless you specifically profile
  rAF scheduling — there is no error, just silence.
- Browser extensions can switch tab focus without user interaction using
  `browser.tabs.update({ active: true })`, which is enough to unblock rAF.
- A polling-with-activation loop is a reasonable workaround when you cannot
  modify the target page's rendering code.

## Shell command classification: transports vs. payloads

When building the auto-run classifier, the first instinct was to flag any
command containing `ssh` or `docker exec` as requiring approval. That broke
entirely legitimate read-only workflows: `ssh homelab "grep -r pattern /logs"`
was getting blocked even though the operation was safe.

The key insight is that SSH and `docker exec` are transport layers, not
operations themselves. The safety of `ssh host "cmd"` is determined entirely by
`cmd`, not by the fact that SSH is involved. Running `ssh host "rm -rf /"` is
dangerous; running `ssh host "cat /etc/hostname"` is not.

The classifier now:

1. Detects SSH or docker exec at the start of a command
2. Parses out the remote command using `shlex.split` (with a regex fallback
   for complex shell quoting that shlex can't handle)
3. Calls `classify_command` recursively on the remote command
4. Returns the tier of the inner command, not the transport

The same principle applies to `docker exec container sh -c "cmd"` — the
dangerous part is `cmd`, not `docker exec`.

What I learned:

- Security classifiers should model *what a command does*, not pattern-match
  on command names. Command names are often nouns (ssh, docker, xargs) while
  the verb is in the arguments.
- `shlex.split` is the right tool for tokenizing shell commands in Python, but
  it fails on complex mixed quoting (double quotes containing single quotes,
  etc.). A fallback that strips the prefix by walking token boundaries is
  robust enough for the real-world cases.
- False positives in a safety classifier are a usability problem, not just an
  annoyance — each false positive trains the user to ignore approvals, which
  defeats the purpose.

## Deeply nested shell escaping breaks JSON parsing

Building tool calls for multi-step Python scripts sent over SSH exposed a
fundamental fragility: JSON → shell → `python3 -c` → Python string literals
requires four levels of escaping. By level four, escape sequences like `\\\\\\"`
are nearly impossible for an LLM to generate consistently, and a single
mismatch causes `JSON.parse` to throw.

The practical fix is a system prompt rule: for any script longer than a few
lines, write it to `/tmp/script.py` using a heredoc, then execute it. This
collapses four escaping levels to one (just the JSON string containing the
shell command `cat > /tmp/... << 'PYEOF'\n...\nPYEOF\npython3 /tmp/...`).

On the CF side, the JSON sanitizer was also extended to re-escape any
`\X` sequence where `X` is not a valid JSON escape character (e.g. `\$` from
shell variable references becomes `\\$`), preventing `bad escaped character`
parse errors from shell idioms leaking into tool call JSON.

What I learned:

- Each layer of shell/string nesting multiplies escaping complexity
  exponentially. Three layers is the practical maximum for reliable LLM output.
- A system prompt rule ("use heredocs for scripts") solves the problem at the
  source rather than requiring increasingly clever parser heuristics.
- When `JSON.parse` throws `bad escaped character`, the issue is almost always
  a shell escape sequence (`\$`, `\!`, `\(`) that was not doubled for JSON.
  The sanitizer fix is a reasonable last resort but not a substitute for clean
  generation.

## Firefox extension permanent installation on NixOS

Developing a browser extension as a temporarily-loaded add-on (via
`about:debugging`) means losing it on every reboot. Making it permanent on
Firefox release (non-Developer Edition) requires Mozilla signing.

The process:

1. Add a `browser_specific_settings.gecko.id` to `manifest.json` — Firefox
   enterprise policies require a stable extension ID to target.
2. Sign via `web-ext sign --channel=unlisted` using AMO API credentials. The
   "unlisted" channel skips public review; Mozilla's automated pipeline signs
   it within minutes and returns a signed `.xpi`.
3. On NixOS, use `programs.firefox.policies.ExtensionSettings` with
   `installation_mode: force_installed` and `install_url` pointing at the
   signed `.xpi`. This survives reboots without user interaction.

Key trap: `force_installed` with an unsigned `.xpi` fails silently in
`about:addons` with `ERROR_SIGNEDSTATE_REQUIRED` in the browser console. The
policy is applied (visible in `about:policies`) but the extension is never
installed. The signing step is non-optional even for enterprise-managed
installs on Firefox release.

Developer Edition and Firefox ESR allow `xpinstall.signatures.required: false`
via policy, which bypasses this. Regular Firefox release does not.

## Zustand subscriptions can make a plain textarea feel slow

I hit a performance regression while adding the richer Context Forge editor. At
first it looked like the lag had to be coming from CodeMirror, Vim mode, or the
LaTeX shortcut system, because the slowdown showed up around the same time those
features were added. That was a reasonable first suspicion, but it was
incomplete.

The debugging process taught me to separate three different costs:

- **Editor runtime cost.** CodeMirror, Vim bindings, and snippets can add real
  work, especially if autocomplete or syntax extensions run on every keystroke.
- **Store write cost.** A Zustand store write is cheap by itself, but middleware
  such as `persist` can add work on every write if hot state like drafts shares
  the same persisted store as settings.
- **Subscriber render cost.** The most important bug was not the editor. The
  parent `ThreadView` component subscribed directly to the draft text. Every
  keystroke changed the Zustand draft state, which caused `ThreadView` to
  re-render. That meant the whole message thread re-rendered too, including
  Markdown, KaTeX, syntax-highlighted code blocks, attachment cards, export
  controls, and edit affordances.

The mistake was treating "the editor is plain" as equivalent to "typing is
cheap." The plain editor was just a textarea, but its `onChange` still updated
global draft state. Because the wrong component subscribed to that state, a
single keypress invalidated much more UI than the text input itself.

The fix was to narrow the subscription boundary. I moved the draft subscription
and draft updates into a small `EditorTray` component. `ThreadView` still owns
the thread layout and message list, but it no longer reads the draft value. Now
typing only re-renders the editor tray instead of the whole thread.

What I learned:

- Zustand selectors are part of the render architecture, not just a convenient
  way to access state.
- Hot state, especially keystroke-level state, should be subscribed to by the
  smallest component that actually needs it.
- Persisted settings and ephemeral input drafts should not live in the same
  hot store if persistence middleware can run on every write.
- When UI gets slower after adding a rich editor, verify whether the editor is
  actually slow or whether the rest of the app is being re-rendered because of a
  broad state subscription.
- A profiler would have shortened the loop. The final bug was visible from code
  review once I looked at subscription scope, but I lost time by assuming the
  expensive-looking editor stack was the main culprit.

This is a good interview story because the fix was not a heroic optimization.
It was a state ownership correction: localize hot state, isolate expensive
render trees, and make subscription boundaries match the UI that truly depends
on the state.

## Vim Escape handling can fail before application keymaps run

I hit a tricky editor bug while integrating CodeMirror Vim mode into Context
Forge. Pressing `Escape` or `Ctrl-[` was supposed to leave insert mode and enter
Vim normal mode. Instead, Firefox appeared to blur the editor: the input lost
focus, the cursor disappeared, and Vim normal mode did not activate.

My first instinct was to treat this as a normal keybinding problem. I added
CodeMirror keymaps for `Escape` and `Ctrl-[`, set them to the highest precedence,
called the Vim adapter directly, and stopped propagation. That was the right
first layer to check, but it did not fix the bug.

The important debugging step was adding event instrumentation instead of
guessing. I logged capture-phase keyboard events at `window`, capture-phase
events on CodeMirror's `contentDOM`, CodeMirror's own DOM handler, and focusout
events from the editor. The trace showed the key fact: when I pressed plain
`Escape`, the page did not receive a keyboard event at all. There was no
`window` keydown and no CodeMirror keydown. The only event Context Forge saw was
a `focusout` from `.cm-content` to `body`.

That changed the diagnosis. This was not just "my Escape keymap is wrong."
Something before the app's key handling was converting Escape into "blur this
contenteditable." The console also showed an `inject.js` error while testing
modifier keys, which pointed toward browser extension/content-script behavior
rather than ordinary React or CodeMirror behavior.

The final fix was to handle the observable failure mode instead of relying only
on keydown events. Context Forge now watches for the editor losing focus to
`body` without a recent pointer/click event while the document still has focus.
That pattern means "keyboard-induced editor blur," not an intentional click
away. When it happens, the app sends `<Esc>` to the CodeMirror Vim adapter and
immediately refocuses the editor. Normal pointer-driven blur still works, so
clicking elsewhere is not trapped.

What I learned:

- Browser editors have more than one event layer: native browser behavior,
  extension/content scripts, CodeMirror DOM handling, CodeMirror keymaps, and
  the Vim adapter can all participate.
- If a keybinding does not work, first prove whether the page actually receives
  the key event. A missing `keydown` is a different class of bug than a keymap
  ordering problem.
- Capture-phase instrumentation is often the fastest way to locate ownership:
  log at `window`, the editor DOM, the framework/editor handler, and focus
  transitions.
- `Escape` is special in browsers and extensions because it is commonly used to
  cancel UI, close popups, or blur fields. Rich editor integrations should not
  assume it always reaches the application as a normal keydown.
- A robust editor can recover from focus transitions when they have a precise
  signature. In this case, focus moving from CodeMirror to `body` without a
  pointer event was specific enough to treat as Vim Escape without breaking
  normal mouse focus behavior.
- Keeping debug instrumentation behind an opt-in flag is useful. The
  `cf.debugVimEscape` localStorage flag lets me inspect future browser-key
  issues without making the normal app noisy.

This is a good project lesson because the fix came from changing the debugging
question. Instead of asking "why does my Escape handler not work?", I had to ask
"does the application receive Escape at all, and if not, what observable state
change replaces it?" That led to a focus-based recovery path that matches the
actual failure mode.
