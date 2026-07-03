# Roadmap: Hierarchical / Threaded Message View

## Goal

A compact threaded view of the conversation — like Reddit's nested comment tree — sitting alongside the flat thread view and the graph view (branches). The purpose is to show the conversation in a more zoomed-out way, making it easier to navigate long sessions and to selectively export only the messages relevant to the next chatbot prompt.

## Core concepts

### Parent-child relationships

- **Default**: a message is a child of the message immediately before it. Tool result messages (`role=tool, agent=contextforge`) are naturally children of the assistant message that emitted the tool request.
- **Manual assignment**: the user can explicitly set a `parent_id` on any message, overriding the default. The UI should make this easy — drag-and-drop, or a right-click "Set parent" action.
- **Depth**: no hard limit. In practice conversations will likely be 2–3 levels deep.

### Indentation style

Reddit-style: each level indented with a vertical line connecting the message to its parent. The line can be followed up to the root of that branch.

## Data model change needed

Add `parent_id` (nullable FK to `messages.id`) to the messages table. The flat thread view ignores it; the hierarchical view uses it to build a tree.

## Selective export by depth

Once hierarchy exists, the export UI gains a "depth" filter:
- Depth 0 = root messages only
- Depth ≤ 1 = roots + direct replies
- All = current behaviour

This is the primary workflow benefit: before sending context to the chatbot, select the root messages that matter and skip deep sub-threads (e.g. verbose tool outputs).

## Autonomy goal

The current workflow is too manual. Before building this view, the tool protocol should be extended so the chatbot can suggest which messages should be grouped / parented, and ContextForge can accept or reject those suggestions. The hierarchical view is most useful once structure can be applied semi-automatically.

## Open questions

- Does the threaded view replace the flat view or live as a toggle (like "View graph")?
- How are orphaned messages (whose parent was deleted) handled — promote to root or hide?
- Should the export-by-depth filter work on the flat thread view too, or only the hierarchical view?
