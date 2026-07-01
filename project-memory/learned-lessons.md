# Learned Lessons

This file captures project experience in first person so it can be reused when
explaining Context Forge to interviewers or collaborators.

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
