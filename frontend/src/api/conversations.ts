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

export interface InsertMessageRequest {
  position: 'before' | 'after'
  role: string
  agent?: string
  content: string
  message_format?: string
}

export interface ToolExecutionRequest {
  tool: 'terminal.exec'
  cwd: string
  command: string
  reason: string
  timeout_seconds: number
  sudo_password?: string
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

export function toApiError(error: unknown, response: unknown): ApiError {
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

export async function insertMessage(
  conversationId: string,
  messageId: string,
  body: InsertMessageRequest,
) {
  const response = await fetch(
    resolveApiUrl(
      `/api/conversations/${encodeURIComponent(conversationId)}/messages/${encodeURIComponent(messageId)}/insert`,
    ),
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    },
  )

  const payload = await response.json().catch(() => null)
  if (!response.ok) throw toApiError(payload, response)
  return payload
}

export async function deleteMessage(
  conversationId: string,
  messageId: string,
) {
  const response = await fetch(
    resolveApiUrl(
      `/api/conversations/${encodeURIComponent(conversationId)}/messages/${encodeURIComponent(messageId)}`,
    ),
    { method: 'DELETE' },
  )

  const payload = await response.json().catch(() => null)
  if (!response.ok) throw toApiError(payload, response)
  return payload
}

export type ToolStreamEvent =
  | { type: 'stdout'; chunk: string }
  | { type: 'stderr'; chunk: string }
  | { type: 'exit'; code: number; stdout: string; stderr: string }
  | { type: 'error'; message: string }
  | { type: 'done' }

export async function* streamToolExecution(
  conversationId: string,
  messageId: string,
  body: ToolExecutionRequest,
): AsyncGenerator<ToolStreamEvent> {
  const response = await fetch(
    resolveApiUrl(
      `/api/conversations/${encodeURIComponent(conversationId)}/messages/${encodeURIComponent(messageId)}/tool-executions/stream`,
    ),
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    },
  )

  if (!response.ok) {
    const payload = await response.json().catch(() => null)
    throw toApiError(payload, response)
  }

  if (!response.body) throw new Error('No response body from stream endpoint')

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            yield JSON.parse(line.slice(6)) as ToolStreamEvent
          } catch {}
        }
      }
    }
  } finally {
    reader.cancel()
  }
}

export async function runToolExecution(
  conversationId: string,
  messageId: string,
  body: ToolExecutionRequest,
) {
  const response = await fetch(
    resolveApiUrl(
      `/api/conversations/${encodeURIComponent(conversationId)}/messages/${encodeURIComponent(messageId)}/tool-executions`,
    ),
    {
      method: 'POST',
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

// ── Settings ──────────────────────────────────────────────────────────────────

export interface CFSettings {
  auto_run: boolean
  pushbullet_configured: boolean
}

export async function fetchSettings(): Promise<CFSettings> {
  const response = await fetch(resolveApiUrl('/api/settings'))
  const payload = await response.json().catch(() => null)
  if (!response.ok) throw toApiError(payload, response)
  return payload as CFSettings
}

export async function patchSettings(
  patch: { auto_run?: boolean; pushbullet_token?: string },
): Promise<CFSettings> {
  const response = await fetch(resolveApiUrl('/api/settings'), {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  })
  const payload = await response.json().catch(() => null)
  if (!response.ok) throw toApiError(payload, response)
  return payload as CFSettings
}

export async function patchConversationAutoRun(
  conversationId: string,
  autoRun: boolean,
): Promise<ConversationSummary> {
  const response = await fetch(
    resolveApiUrl(`/api/conversations/${encodeURIComponent(conversationId)}/auto-run`),
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ auto_run: autoRun }),
    },
  )
  const payload = await response.json().catch(() => null)
  if (!response.ok) throw toApiError(payload, response)
  return payload as ConversationSummary
}

// ── Tool call classification ───────────────────────────────────────────────────

export type CommandTier = 'safe' | 'confirm' | 'blocked'

export interface ClassifyResult {
  tier: CommandTier
  tier_reason: string
  notification_sent: boolean
}

export async function classifyToolCall(
  toolCall: ToolExecutionRequest,
): Promise<ClassifyResult> {
  const response = await fetch(resolveApiUrl('/api/tool-executions/classify'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(toolCall),
  })
  const payload = await response.json().catch(() => null)
  if (!response.ok) throw toApiError(payload, response)
  return payload as ClassifyResult
}

export async function sendNotification(title: string, body: string): Promise<void> {
  await fetch(resolveApiUrl('/api/notify'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title, body }),
  }).catch(() => {})
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
