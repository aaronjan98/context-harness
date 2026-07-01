/**
 * ConversationSidebar — persistent left panel.
 *
 * Shows the list of all conversations and a button to create a new one.
 * Active conversation is highlighted based on the current route param.
 *
 * Data: fetched via TanStack Query, cache key ['conversations'].
 * Navigation: uses TanStack Router Link (typed, validated at compile time).
 */

import { useEffect, useState } from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  createConversation,
  deleteConversation,
  fetchConversations,
  renameConversation,
} from '@/api/conversations'
import type { ConversationSummary } from '@/api/conversations'

type Theme = 'light' | 'dark'

const THEME_STORAGE_KEY = 'context-forge-theme'

function getInitialTheme(): Theme {
  const savedTheme = window.localStorage.getItem(THEME_STORAGE_KEY)
  if (savedTheme === 'light' || savedTheme === 'dark') return savedTheme

  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export function ConversationSidebar() {
  const [theme, setTheme] = useState<Theme>(getInitialTheme)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingTitle, setEditingTitle] = useState('')
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const { data: conversations, isLoading, isError } = useQuery({
    queryKey: ['conversations'],
    queryFn: fetchConversations,
  })

  const {
    mutate: startConversation,
    isPending: isCreating,
    isError: createFailed,
  } = useMutation({
    mutationFn: () => {
      const conversationId = `thread-${Date.now().toString(36)}`
      return createConversation({
        conversation_id: conversationId,
        title: 'New conversation',
      })
    },
    onSuccess: async (conversation) => {
      await queryClient.invalidateQueries({ queryKey: ['conversations'] })
      await navigate({
        to: '/conversations/$id',
        params: { id: conversation.id },
      })
    },
  })

  const {
    mutate: saveTitle,
    isError: renameFailed,
  } = useMutation({
    mutationFn: ({ id, title }: { id: string; title: string }) =>
      renameConversation(id, title),
    onSuccess: async () => {
      setEditingId(null)
      setEditingTitle('')
      await queryClient.invalidateQueries({ queryKey: ['conversations'] })
    },
  })

  const {
    mutate: removeConversation,
    isError: deleteFailed,
  } = useMutation({
    mutationFn: deleteConversation,
    onSuccess: async (_, deletedId) => {
      await queryClient.invalidateQueries({ queryKey: ['conversations'] })
      queryClient.removeQueries({ queryKey: ['conversations', deletedId] })
      await navigate({ to: '/conversations' })
    },
  })

  function startRename(conversation: ConversationSummary) {
    setEditingId(conversation.id)
    setEditingTitle(conversation.title ?? '')
  }

  function submitRename() {
    if (!editingId) return
    const title = editingTitle.trim()
    if (!title) return
    saveTitle({ id: editingId, title })
  }

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
    document.documentElement.style.colorScheme = theme
    window.localStorage.setItem(THEME_STORAGE_KEY, theme)
  }, [theme])

  return (
    <div className="cf-sidebar">
      {/* Header */}
      <div className="cf-sidebar-header">
        <span className="cf-sidebar-title">Conversations</span>
        <div className="cf-sidebar-actions">
          <button
            type="button"
            onClick={() => setTheme((current) => current === 'dark' ? 'light' : 'dark')}
            aria-pressed={theme === 'dark'}
            className="cf-theme-toggle"
          >
            {theme === 'dark' ? 'Light' : 'Dark'}
          </button>
          <Link
            to="/settings"
            title="Settings"
            className="cf-icon-button cf-settings-link"
          >
            ⚙
          </Link>
          <button
            type="button"
            onClick={() => startConversation()}
            disabled={isCreating}
            title="New conversation"
            className="cf-icon-button"
          >
            +
          </button>
        </div>
      </div>

      {/* List */}
      <div className="cf-sidebar-list">
        {isLoading && (
          <div className="cf-sidebar-status">Loading...</div>
        )}
        {isError && (
          <div className="cf-sidebar-status cf-sidebar-error">
            Failed to load conversations.
          </div>
        )}
        {createFailed && (
          <div className="cf-sidebar-status cf-sidebar-error">
            Failed to create conversation.
          </div>
        )}
        {renameFailed && (
          <div className="cf-sidebar-status cf-sidebar-error">
            Failed to rename conversation.
          </div>
        )}
        {deleteFailed && (
          <div className="cf-sidebar-status cf-sidebar-error">
            Failed to delete conversation.
          </div>
        )}
        {conversations &&
          conversations.map((convo: ConversationSummary) => {
            const isEditing = editingId === convo.id

            return (
              <div
                key={convo.id}
                className={`cf-conversation-row ${isEditing ? 'cf-conversation-row-editing' : ''}`}
              >
                {isEditing ? (
                  <input
                    value={editingTitle}
                    onChange={(event) => setEditingTitle(event.target.value)}
                    onBlur={submitRename}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') submitRename()
                      if (event.key === 'Escape') {
                        setEditingId(null)
                        setEditingTitle('')
                      }
                    }}
                    className="cf-conversation-title-input"
                    autoFocus
                  />
                ) : (
                  <>
                    <Link
                      to="/conversations/$id"
                      params={{ id: convo.id }}
                      className="cf-conversation-link"
                      activeProps={{
                        className: 'cf-conversation-link cf-conversation-link-active',
                      }}
                      onDoubleClick={(event) => {
                        event.preventDefault()
                        startRename(convo)
                      }}
                    >
                      {convo.title ?? 'Untitled'}
                    </Link>
                    <button
                      type="button"
                      className="cf-conversation-delete"
                      title="Delete conversation"
                      onClick={() => removeConversation(convo.id)}
                    >
                      ×
                    </button>
                  </>
                )}
              </div>
            )
          })}
      </div>
    </div>
  )
}
