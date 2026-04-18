/**
 * Global providers wrapper.
 *
 * Mounts in order:
 *   1. QueryClientProvider — TanStack Query server state
 *   2. RouterProvider     — TanStack Router navigation
 *
 * Also initializes the real-time transport stub (Phase 5).
 * startRealtime() is a no-op now; in Phase 5 it opens an SSE/WebSocket
 * connection and calls queryClient.invalidateQueries() on push events.
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import { RouterProvider } from '@tanstack/react-router'
import { useEffect } from 'react'
import { router } from './router'
import { startRealtime } from '@/api/realtime'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Stale time of 30s — conversations don't change externally in Phase 1.
      // Reduce this in Phase 5 when agents can push messages.
      staleTime: 30_000,
      retry: 1,
    },
  },
})

function RealtimeInit() {
  useEffect(() => {
    const cleanup = startRealtime(queryClient)
    return cleanup
  }, [])
  return null
}

export function Providers() {
  return (
    <QueryClientProvider client={queryClient}>
      <RealtimeInit />
      <RouterProvider router={router} />
      {import.meta.env.DEV && <ReactQueryDevtools initialIsOpen={false} />}
    </QueryClientProvider>
  )
}
