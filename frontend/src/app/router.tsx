/**
 * Route tree for Context Forge.
 *
 * All routes are defined here using TanStack Router code-based routing.
 * Route objects are exported so component files can call their typed hooks
 * (e.g. conversationRoute.useParams(), conversationRoute.useSearch()).
 *
 * Routes:
 *   /                        → redirect to /conversations
 *   /conversations            → ConversationsPage (empty state)
 *   /conversations/$id        → ThreadView (active conversation)
 *     ?panel=graph            → search param: opens graph panel
 *
 * See project-memory/frontend-architecture.md § Routing for full rationale.
 */

import {
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  redirect,
} from '@tanstack/react-router'
import { z } from 'zod'
import { Shell } from './shell'
import { ConversationsPage } from '@/features/conversations/ConversationsPage'
import { ThreadView } from '@/features/thread/ThreadView'

// ── Root ─────────────────────────────────────────────────────────────────────

export const rootRoute = createRootRoute({
  component: Shell,
  // Fallback for unmatched routes
  notFoundComponent: () => <Outlet />,
})

// ── Index redirect ────────────────────────────────────────────────────────────

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  beforeLoad: () => {
    throw redirect({ to: '/conversations' })
  },
})

// ── Conversations list ────────────────────────────────────────────────────────

export const conversationsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/conversations',
  component: ConversationsPage,
})

// ── Active conversation ───────────────────────────────────────────────────────

// Search param schema: the only valid panel value is 'graph'.
// To add future panels (e.g. 'history' for Phase 3 rollback), extend this enum.
// TypeScript will surface every call site that needs to handle the new value.
const conversationSearchSchema = z.object({
  panel: z.enum(['graph']).optional(),
})

export const conversationRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/conversations/$id',
  validateSearch: (search) => conversationSearchSchema.parse(search),
  component: ThreadView,
})

// ── Router ────────────────────────────────────────────────────────────────────

const routeTree = rootRoute.addChildren([
  indexRoute,
  conversationsRoute,
  conversationRoute,
])

export const router = createRouter({ routeTree })

// Register the router type globally so useRouter(), Link, etc. are all typed.
declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}
