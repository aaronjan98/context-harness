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
