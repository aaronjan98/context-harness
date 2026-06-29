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
import { createConversation, fetchConversations } from '@/api/conversations'
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
        {conversations &&
          conversations.map((convo: ConversationSummary) => (
            <Link
              key={convo.id}
              to="/conversations/$id"
              params={{ id: convo.id }}
              className="cf-conversation-link"
              activeProps={{ className: 'cf-conversation-link cf-conversation-link-active' }}
            >
              {convo.title ?? 'Untitled'}
            </Link>
          ))}
      </div>
    </div>
  )
}
