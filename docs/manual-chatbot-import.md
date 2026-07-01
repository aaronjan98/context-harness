# Manual Chatbot Import Workflow

Context Forge does not automatically inspect open browser tabs. For v1, the
user chooses the source tab and the destination conversation explicitly.

## Import a web chatbot conversation

1. Open the exact ChatGPT conversation tab to import.
2. Click the `Context Forge: Export ChatGPT` bookmarklet.
3. Wait while the bookmarklet scrolls through the thread.
4. Copy the Markdown from the result panel.
5. Open the destination conversation in Context Forge.
6. Click `Import Markdown`.
7. Paste the transcript and import it.

The active browser tab is the selected source. Context Forge does not guess
between multiple ChatGPT, Gemini, Grok, or other chatbot tabs.

When the bookmarklet runs, it shows a small `Context Forge export...` status box
in the lower-right corner of the ChatGPT page. When it finishes, it opens a
Markdown result panel with a `Copy Markdown` button. If no status box appears,
the browser did not execute the bookmark URL.

## Install the ChatGPT bookmarklet

The bookmarklet is browser-native JavaScript. It should work in Firefox,
Chrome, Brave, and similar browsers because it only reads the current active
page where you click it.

1. Create a new browser bookmark.
2. Name it `Context Forge: Export ChatGPT`.
3. Copy the full one-line contents of
   `tools/chatgpt-dom-export.bookmarklet.js`.
4. Paste that line into the bookmark's URL/location field.
5. Save the bookmark.

The exporter does not rely on automatic clipboard access after scrolling,
because browsers often block clipboard writes once the original bookmark click
has finished. Instead, it displays the Markdown in a textarea and provides a
copy button you click manually.

When `tools/chatgpt-dom-export.bookmarklet.js` changes, replace the existing
bookmark URL with the new one-line contents. Existing Firefox bookmarks do not
update automatically from the repository file.

The bookmarklet is a direct `javascript:` URL. It intentionally avoids
`eval(...)` because some chatbot pages block `unsafe-eval` through browser
content-security policy.

The current ChatGPT exporter preserves common Markdown structure, including
headings, bold/italic text, links, nested lists, blockquotes, code blocks, and
HTML tables converted to GitHub-Flavored Markdown pipe tables.

For longer ChatGPT conversations, the exporter scrolls through the active
thread and collects turns as ChatGPT mounts them in the DOM. This is necessary
because ChatGPT may virtualize older messages and keep only part of the thread
in the DOM at one time. Wait for the completion alert before switching tabs or
copying anything else.

The exporter also tries to preserve rendered LaTeX by replacing KaTeX nodes with
their embedded TeX annotations. This works when ChatGPT exposes
`annotation[encoding="application/x-tex"]` in the page. If ChatGPT changes its
math renderer or strips the original TeX source, the exporter falls back to
MathML/ARIA/text content. That fallback should prevent blank math blocks, but it
may be less TeX-like than the original source.

Standalone math blocks are promoted from inline `$...$` syntax to display
`$$...$$` syntax so Context Forge can render them closer to ChatGPT's display
math.

ChatGPT can store one assistant turn as multiple visible message blocks, for
example an initial response before a thinking/tool section and a final response
after it. The exporter joins those blocks into one assistant message so Context
Forge keeps the whole turn.

Visible file tiles are exported as lightweight attachment notes, for example:

```markdown
> [!attachment]
> - Download.mp4
```

The bookmarklet does not copy file contents out of ChatGPT. Future Context
Forge attachment support should store real files through the app/backend, not
by scraping browser-only upload state.

## Debugging fallback

If the bookmarklet stops working after ChatGPT changes its DOM, open devtools on
the ChatGPT tab and run `tools/chatgpt-dom-export.js` from the console. The
readable script uses the same extraction logic as the bookmarklet and is easier
to debug.

## Maintain an ongoing conversation

Use the smallest context movement that matches the situation:

- Copy only the latest chatbot reply when you only want one answer back in
  Context Forge.
- Import a full web-chat transcript when you need the whole external exchange
  to become canonical.
- Export the full active Context Forge thread when starting a new chatbot
  session from the current source of truth.
- Later, export selected Context Forge messages when a chatbot only needs a
  focused slice of the canonical thread.

The long-term rule is: Context Forge owns canonical state; web chatbots and
agents are workers that receive selected context and return messages.

## LLM fallback rule

Deterministic DOM adapters are the primary import path. A local or cloud LLM may
be used later as a fallback for unknown or changed UIs, but it should produce a
reviewable Markdown transcript before the normal importer writes canonical
conversation files.
