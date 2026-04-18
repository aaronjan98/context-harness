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
import { useState } from 'react'
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels'
import { Link } from '@tanstack/react-router'
import { conversationRoute } from '@/app/router'
import { Editor } from '@/features/editor'
import { GraphPanel } from '@/features/graph'
import { MessageContent } from '@/shared/components/MessageContent'
import { useUIStore } from '@/store/ui'
import { fetchMessages, appendMessage } from '@/api/conversations'

export function ThreadView() {
  const { id } = conversationRoute.useParams()
  const { panel } = conversationRoute.useSearch()
  const queryClient = useQueryClient()

  const [draft, setDraft] = useState('')
  const focusedMessageId = useUIStore((s) => s.focusedMessageId)
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
      setDraft('')
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
      <Panel id="thread" minSize={30} style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* Graph panel toggle */}
        <div style={{ padding: '8px 16px', borderBottom: '1px solid #e5e7eb', display: 'flex', justifyContent: 'flex-end' }}>
          <Link
            to="/conversations/$id"
            params={{ id }}
            search={panel === 'graph' ? {} : { panel: 'graph' }}
            style={{ fontSize: '12px', color: '#6b7280', textDecoration: 'none' }}
          >
            {panel === 'graph' ? 'Close graph' : 'View graph'}
          </Link>
        </div>

        {/* Message list */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
          {isLoading && <div style={{ color: '#9ca3af' }}>Loading…</div>}
          {isError && <div style={{ color: '#ef4444' }}>Failed to load messages.</div>}
          {messages &&
            // TODO: replace `any` with generated Message type from schema.ts
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (messages as any[]).map((msg: any) => (
              <div
                key={msg.id}
                ref={(el) => { messageRefs.current[msg.id] = el }}
                style={{
                  marginBottom: '16px',
                  padding: '12px',
                  borderRadius: '8px',
                  background: msg.role === 'user' ? '#f3f4f6' : '#ffffff',
                  border: '1px solid #e5e7eb',
                }}
              >
                <div style={{ fontSize: '11px', color: '#9ca3af', marginBottom: '4px', fontFamily: 'monospace' }}>
                  {msg.role} · {msg.agent ?? 'unknown'} · {msg.timestamp}
                </div>
                <MessageContent content={msg.content} />
              </div>
            ))}
        </div>

        {/* Editor */}
        <div style={{ padding: '12px 16px', borderTop: '1px solid #e5e7eb' }}>
          <Editor
            value={draft}
            onChange={setDraft}
            onSubmit={handleSubmit}
            disabled={isSending}
          />
        </div>
      </Panel>

      {/* Graph panel — only mounts when ?panel=graph */}
      {panel === 'graph' && (
        <>
          <PanelResizeHandle
            style={{ width: 4, background: '#e5e7eb', cursor: 'col-resize' }}
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
