/**
 * Graph transforms — pure functions for converting conversation data to
 * React Flow node/edge format.
 *
 * Written in Phase 1 so Phase 4 inherits a tested, working transform rather
 * than reverse-engineering the message structure later.
 *
 * The backend storage model uses parent_id on every message, which is an
 * adjacency list — exactly what React Flow needs. The graph is fully
 * derivable from the messages already fetched in Phase 1.
 *
 * See project-memory/frontend-architecture.md § Graph view readiness.
 */

import type { Node, Edge } from '@xyflow/react'

// Minimal message shape needed for graph transforms.
// In Phase 4, import the full type from @/api/schema when schema.ts is generated.
export interface GraphMessage {
  id: string
  parent_id: string | null
  role: string
  content: string
}

export interface GraphData {
  nodes: Node[]
  edges: Edge[]
}

/**
 * Converts a flat list of messages (with parent_id links) into React Flow
 * nodes and edges.
 *
 * Node positions are initialized to { x: 0, y: 0 }. A layout algorithm
 * (e.g. dagre, elkjs) should be applied in Phase 4 to produce a readable
 * graph layout before passing nodes to the React Flow canvas.
 *
 * Node type 'message' must be registered with React Flow in Phase 4.
 */
export function messagesToGraph(messages: GraphMessage[]): GraphData {
  const nodes: Node[] = messages.map((m) => ({
    id: m.id,
    type: 'message',
    // Layout algorithm fills real positions in Phase 4
    position: { x: 0, y: 0 },
    data: {
      role: m.role,
      content: m.content,
    },
  }))

  const edges: Edge[] = messages
    .filter((m): m is GraphMessage & { parent_id: string } => m.parent_id !== null)
    .map((m) => ({
      id: `${m.parent_id}-${m.id}`,
      source: m.parent_id,
      target: m.id,
    }))

  return { nodes, edges }
}
