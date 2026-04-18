/**
 * Real-time transport layer — Phase 5 stub.
 *
 * In Phase 1–4, this is a no-op. External agents cannot push messages yet.
 *
 * In Phase 5, this function opens an SSE or WebSocket connection to the
 * backend and calls queryClient.invalidateQueries() when push events arrive.
 * The HTTP path (api/conversations.ts) stays unchanged — push events only
 * trigger re-fetches, they do not replace the HTTP layer.
 *
 * This function is called once in app/providers.tsx and returns a cleanup fn.
 *
 * See project-memory/frontend-architecture.md § Future transport layer.
 */

import type { QueryClient } from '@tanstack/react-query'

export function startRealtime(_queryClient: QueryClient): () => void {
  // Phase 5 implementation:
  //
  // const es = new EventSource('http://localhost:8000/events')
  //
  // es.addEventListener('message', (event) => {
  //   const { conversationId } = JSON.parse(event.data)
  //   _queryClient.invalidateQueries({ queryKey: ['conversations', conversationId] })
  // })
  //
  // return () => es.close()

  return () => {}
}
