/**
 * Typed query and mutation functions for the conversations resource.
 *
 * These functions are consumed by TanStack Query hooks in feature components.
 * Components never call api directly — they go through these functions so the
 * query key structure and error handling are consistent.
 *
 * TanStack Query cache keys:
 *   ['conversations']        → list of all conversations
 *   ['conversations', id]    → single conversation + its active thread messages
 *
 * See project-memory/frontend-architecture.md § API client layer for details.
 */

import { api } from './client'

// ── Conversations list ────────────────────────────────────────────────────────

export async function fetchConversations() {
  const { data, error } = await api.GET('/conversations' as never)
  if (error) throw new Error(String(error))
  return data
}

// ── Single conversation ───────────────────────────────────────────────────────

export async function fetchConversation(id: string) {
  const { data, error } = await api.GET('/conversations/{id}' as never, {
    params: { path: { id } },
  } as never)
  if (error) throw new Error(String(error))
  return data
}

// ── Messages ──────────────────────────────────────────────────────────────────

export async function fetchMessages(conversationId: string) {
  const { data, error } = await api.GET(
    '/conversations/{id}/messages' as never,
    { params: { path: { id: conversationId } } } as never
  )
  if (error) throw new Error(String(error))
  return data
}

export async function appendMessage(
  conversationId: string,
  body: { role: string; content: string; agent?: string }
) {
  const { data, error } = await api.POST(
    '/conversations/{id}/messages' as never,
    {
      params: { path: { id: conversationId } },
      body,
    } as never
  )
  if (error) throw new Error(String(error))
  return data
}

// ── Create conversation ───────────────────────────────────────────────────────

export async function createConversation(body: { title?: string }) {
  const { data, error } = await api.POST('/conversations' as never, {
    body,
  } as never)
  if (error) throw new Error(String(error))
  return data
}

// ── Rename conversation ───────────────────────────────────────────────────────
// Used by both auto-rename (AI-suggested) and manual rename (user-edited title).
// See project-memory/frontend-architecture.md § Future features for details.

export async function renameConversation(id: string, title: string) {
  const { data, error } = await api.PATCH('/conversations/{id}' as never, {
    params: { path: { id } },
    body: { title },
  } as never)
  if (error) throw new Error(String(error))
  return data
}
