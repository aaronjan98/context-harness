/**
 * GraphPanel — Phase 1 placeholder.
 *
 * Rendered inside ThreadView when ?panel=graph is active.
 * In Phase 4, this is replaced with GraphCanvas (React Flow canvas).
 *
 * Phase 4 implementation plan:
 *   - Import @xyflow/react
 *   - Register custom 'message' node type
 *   - Apply dagre/elkjs layout to messagesToGraph() output
 *   - On node click: call setFocusedMessageId() from store/ui.ts so ThreadView
 *     scrolls to that message
 *   - Support drag-to-reposition nodes (visual only, not persisted in Phase 4)
 *
 * See project-memory/frontend-architecture.md § Graph view readiness.
 */

export function GraphPanel() {
  return (
    <div
      style={{
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#9ca3af',
        fontSize: '14px',
        fontFamily: 'monospace',
      }}
    >
      Graph view — Phase 4
    </div>
  )
}
