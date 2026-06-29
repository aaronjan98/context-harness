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
import type { components } from './schema'

export type ConversationSummary =
  components['schemas']['ConversationSummaryResponse']
export type Message = components['schemas']['MessageResponse']
export type CreateConversationRequest =
  components['schemas']['CreateConversationRequest']
export type AppendMessageRequest =
  components['schemas']['AppendMessageRequest']

// ── Conversations list ────────────────────────────────────────────────────────

export async function fetchConversations(): Promise<ConversationSummary[]> {
  const { data, error } = await api.GET('/api/conversations')
  if (error) throw new Error(String(error))
  return data ?? []
}

// ── Single conversation ───────────────────────────────────────────────────────

export async function fetchConversation(
  id: string,
): Promise<ConversationSummary | undefined> {
  const { data, error } = await api.GET('/api/conversations/{conversation_id}', {
    params: { path: { conversation_id: id } },
  })
  if (error) throw new Error(String(error))
  return data
}

// ── Messages ──────────────────────────────────────────────────────────────────

export async function fetchMessages(conversationId: string): Promise<Message[]> {
  const { data, error } = await api.GET(
    '/api/conversations/{conversation_id}/thread',
    { params: { path: { conversation_id: conversationId } } },
  )
  if (error) throw new Error(String(error))
  return data?.messages ?? []
}

export async function appendMessage(
  conversationId: string,
  body: AppendMessageRequest,
) {
  const { data, error } = await api.POST(
    '/api/conversations/{conversation_id}/messages',
    {
      params: { path: { conversation_id: conversationId } },
      body,
    },
  )
  if (error) throw new Error(String(error))
  return data
}

// ── Create conversation ───────────────────────────────────────────────────────

export async function createConversation(body: CreateConversationRequest) {
  const { data, error } = await api.POST('/api/conversations', {
    body,
  })
  if (error) throw new Error(String(error))
  return data
}

// ── Rename conversation ───────────────────────────────────────────────────────
// Used by both auto-rename (AI-suggested) and manual rename (user-edited title).
// See project-memory/frontend-architecture.md § Future features for details.

export async function renameConversation(id: string, title: string) {
  const { data, error } = await api.PATCH(
    '/api/conversations/{conversation_id}',
    {
      params: { path: { conversation_id: id } },
      body: { title },
    },
  )
  if (error) throw new Error(String(error))
  return data
}
