/**
 * ConversationsPage — rendered at /conversations (no conversation selected).
 *
 * Empty state shown in the main pane when the sidebar has no active selection.
 * In Phase 1 this is a simple prompt. Later it could show recents, stats, etc.
 */

export function ConversationsPage() {
  return (
    <div
      style={{
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#9ca3af',
        fontSize: '14px',
      }}
    >
      Select a conversation or create a new one.
    </div>
  )
}
