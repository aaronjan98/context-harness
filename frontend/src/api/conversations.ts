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

import { api, apiBaseUrl } from './client'
import type { components } from './schema'

export type ConversationSummary =
  components['schemas']['ConversationSummaryResponse']
export type Message = components['schemas']['MessageResponse']
export type Attachment = components['schemas']['AttachmentResponse']
export type CreateConversationRequest =
  components['schemas']['CreateConversationRequest']
export type AppendMessageRequest =
  components['schemas']['AppendMessageRequest']
export type ImportMarkdownRequest =
  components['schemas']['ImportMarkdownRequest']

export interface UpdateMessageRequest {
  content: string
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

function apiErrorMessage(error: unknown): string {
  if (typeof error === 'string') return error
  if (error && typeof error === 'object' && 'detail' in error) {
    return String(error.detail)
  }
  return 'API request failed'
}

function toApiError(error: unknown, response: unknown): ApiError {
  const status =
    response && typeof response === 'object' && 'status' in response
      ? Number(response.status)
      : 0
  return new ApiError(apiErrorMessage(error), status)
}

// ── Conversations list ────────────────────────────────────────────────────────

export async function fetchConversations(): Promise<ConversationSummary[]> {
  const { data, error, response } = await api.GET('/api/conversations')
  if (error) throw toApiError(error, response)
  return data ?? []
}

// ── Single conversation ───────────────────────────────────────────────────────

export async function fetchConversation(
  id: string,
): Promise<ConversationSummary | undefined> {
  const { data, error, response } = await api.GET(
    '/api/conversations/{conversation_id}',
    {
      params: { path: { conversation_id: id } },
    },
  )
  if (error) throw toApiError(error, response)
  return data
}

// ── Messages ──────────────────────────────────────────────────────────────────

export async function fetchMessages(conversationId: string): Promise<Message[]> {
  const { data, error, response } = await api.GET(
    '/api/conversations/{conversation_id}/thread',
    { params: { path: { conversation_id: conversationId } } },
  )
  if (error) throw toApiError(error, response)
  return data?.messages ?? []
}

export async function appendMessage(
  conversationId: string,
  body: AppendMessageRequest,
) {
  const { data, error, response } = await api.POST(
    '/api/conversations/{conversation_id}/messages',
    {
      params: { path: { conversation_id: conversationId } },
      body,
    },
  )
  if (error) throw toApiError(error, response)
  return data
}

export async function updateMessage(
  conversationId: string,
  messageId: string,
  body: UpdateMessageRequest,
) {
  const response = await fetch(
    resolveApiUrl(
      `/api/conversations/${encodeURIComponent(conversationId)}/messages/${encodeURIComponent(messageId)}`,
    ),
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    },
  )

  const payload = await response.json().catch(() => null)
  if (!response.ok) throw toApiError(payload, response)
  return payload
}

export async function uploadAttachment(
  conversationId: string,
  file: File,
): Promise<Attachment> {
  const form = new FormData()
  form.append('file', file)

  const response = await fetch(
    resolveApiUrl(`/api/conversations/${conversationId}/attachments`),
    {
      method: 'POST',
      body: form,
    },
  )

  const payload = await response.json().catch(() => null)
  if (!response.ok) throw toApiError(payload, response)
  return payload as Attachment
}

export function resolveApiUrl(path: string): string {
  if (/^https?:\/\//.test(path)) return path
  return `${apiBaseUrl}${path}`
}

export async function importMarkdown(
  conversationId: string,
  body: ImportMarkdownRequest,
) {
  const { data, error, response } = await api.POST(
    '/api/conversations/{conversation_id}/imports/markdown',
    {
      params: { path: { conversation_id: conversationId } },
      body,
    },
  )
  if (error) throw toApiError(error, response)
  return data
}

export function currentExportUrl(conversationId: string): string {
  return resolveApiUrl(`/api/conversations/${conversationId}/exports/current.md`)
}

export function currentExportDownloadUrl(conversationId: string): string {
  return resolveApiUrl(
    `/api/conversations/${conversationId}/exports/current.md/download`,
  )
}

export async function fetchCurrentExportMarkdown(
  conversationId: string,
): Promise<string> {
  const response = await fetch(currentExportUrl(conversationId))
  const text = await response.text()
  if (!response.ok) throw toApiError(text, response)
  return text
}

// ── Create conversation ───────────────────────────────────────────────────────

export async function createConversation(body: CreateConversationRequest) {
  const { data, error, response } = await api.POST('/api/conversations', {
    body,
  })
  if (error) throw toApiError(error, response)
  return data
}

// ── Rename conversation ───────────────────────────────────────────────────────
// Used by both auto-rename (AI-suggested) and manual rename (user-edited title).
// See project-memory/frontend-architecture.md § Future features for details.

export async function renameConversation(id: string, title: string) {
  const { data, error, response } = await api.PATCH(
    '/api/conversations/{conversation_id}',
    {
      params: { path: { conversation_id: id } },
      body: { title },
    },
  )
  if (error) throw toApiError(error, response)
  return data
}

// ── Delete conversation ───────────────────────────────────────────────────────

export async function deleteConversation(id: string) {
  const { error, response } = await api.DELETE(
    '/api/conversations/{conversation_id}',
    {
      params: { path: { conversation_id: id } },
    },
  )
  if (error) throw toApiError(error, response)
}
