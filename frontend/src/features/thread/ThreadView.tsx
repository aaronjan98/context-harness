/**
 * ThreadView — rendered at /conversations/$id.
 *
 * The main conversation surface. Renders:
 *   - The active thread (scrollable list of messages)
 *   - The Editor at the bottom (input + submit)
 *   - The GraphPanel when ?panel=graph is active (push layout, slides in right)
 *
 * Layout: inner PanelGroup (thread | graph) nested inside the shell's main panel.
 * Both panels are drag-resizable. The graph panel only mounts when ?panel=graph.
 *
 * Cross-feature note: ThreadView reads focusedMessageId from the Zustand UI
 * store. When it changes (set by GraphPanel on node click in Phase 4), ThreadView
 * scrolls to the corresponding message element.
 *
 * See project-memory/frontend-architecture.md § Layout and § State layers.
 */

import { useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels'
import { Link } from '@tanstack/react-router'
import { conversationRoute } from '@/app/router'
import { Editor } from '@/features/editor'
import { GraphPanel } from '@/features/graph'
import { MessageContent } from '@/shared/components/MessageContent'
import { useUIStore } from '@/store/ui'
import { fetchMessages, appendMessage } from '@/api/conversations'
import type { Message } from '@/api/conversations'

export function ThreadView() {
  const { id } = conversationRoute.useParams()
  const { panel } = conversationRoute.useSearch()
  const queryClient = useQueryClient()

  const focusedMessageId = useUIStore((s) => s.focusedMessageId)
  const draft = useUIStore((s) => s.draftsByConversationId[id] ?? '')
  const setDraft = useUIStore((s) => s.setDraft)
  const clearDraft = useUIStore((s) => s.clearDraft)
  const messageRefs = useRef<Record<string, HTMLDivElement | null>>({})

  // Fetch messages for this conversation
  const { data: messages, isLoading, isError } = useQuery({
    queryKey: ['conversations', id, 'messages'],
    queryFn: () => fetchMessages(id),
    enabled: !!id,
  })

  // Append a new message
  const { mutate: sendMessage, isPending: isSending } = useMutation({
    mutationFn: (content: string) =>
      appendMessage(id, { role: 'user', content }),
    onSuccess: () => {
      clearDraft(id)
      queryClient.invalidateQueries({ queryKey: ['conversations', id, 'messages'] })
    },
  })

  // Scroll to focused message when graph panel clicks a node (Phase 4)
  useEffect(() => {
    if (focusedMessageId && messageRefs.current[focusedMessageId]) {
      messageRefs.current[focusedMessageId]?.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      })
    }
  }, [focusedMessageId])

  function handleSubmit() {
    const content = draft.trim()
    if (!content || isSending) return
    sendMessage(content)
  }

  return (
    <PanelGroup
      direction="horizontal"
      autoSaveId={`thread-layout-${id}`}
      style={{ height: '100%' }}
    >
      {/* Thread panel */}
      <Panel id="thread" minSize={30} className="cf-thread-panel">
        {/* Graph panel toggle */}
        <div className="cf-thread-toolbar">
          <Link
            to="/conversations/$id"
            params={{ id }}
            search={panel === 'graph' ? {} : { panel: 'graph' }}
            className="cf-link-pill"
          >
            {panel === 'graph' ? 'Close graph' : 'View graph'}
          </Link>
        </div>

        {/* Message list */}
        <div className="cf-thread-scroll">
          {isLoading && <div className="cf-sidebar-status">Loading...</div>}
          {isError && (
            <div className="cf-sidebar-status cf-sidebar-error">
              Failed to load messages.
            </div>
          )}
          {messages &&
            messages.map((msg: Message) => (
              <div
                key={msg.id}
                ref={(el) => { messageRefs.current[msg.id] = el }}
                className={`cf-message ${
                  msg.role === 'user' ? 'cf-message-user' : 'cf-message-assistant'
                }`}
              >
                <div className="cf-message-meta">
                  {msg.role} · {msg.agent ?? 'unknown'} · {msg.timestamp}
                </div>
                <MessageContent content={msg.content} />
              </div>
            ))}
        </div>

        {/* Editor */}
        <div className="cf-editor-tray">
          <Editor
            value={draft}
            onChange={(value) => setDraft(id, value)}
            onSubmit={handleSubmit}
            disabled={isSending}
          />
        </div>
      </Panel>

      {/* Graph panel — only mounts when ?panel=graph */}
      {panel === 'graph' && (
        <>
          <PanelResizeHandle
            className="cf-resize-handle"
          />
          <Panel
            id="graph"
            collapsible
            minSize={20}
            defaultSize={35}
            style={{ overflow: 'hidden' }}
          >
            <GraphPanel />
          </Panel>
        </>
      )}
    </PanelGroup>
  )
}
