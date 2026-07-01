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

import { useEffect, useRef, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels'
import { Link, useNavigate } from '@tanstack/react-router'
import { conversationRoute } from '@/app/router'
import { Editor } from '@/features/editor'
import { GraphPanel } from '@/features/graph'
import { MessageContent } from '@/shared/components/MessageContent'
import { useUIStore } from '@/store/ui'
import {
  ApiError,
  fetchMessages,
  appendMessage,
  importMarkdown,
} from '@/api/conversations'
import type { Message } from '@/api/conversations'

export function ThreadView() {
  const { id } = conversationRoute.useParams()
  const { panel } = conversationRoute.useSearch()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [isImportOpen, setIsImportOpen] = useState(false)
  const [importContent, setImportContent] = useState('')
  const [importError, setImportError] = useState<string | null>(null)

  const focusedMessageId = useUIStore((s) => s.focusedMessageId)
  const draft = useUIStore((s) => s.draftsByConversationId[id] ?? '')
  const setDraft = useUIStore((s) => s.setDraft)
  const clearDraft = useUIStore((s) => s.clearDraft)
  const messageRefs = useRef<Record<string, HTMLDivElement | null>>({})

  // Fetch messages for this conversation
  const { data: messages, error, isLoading, isError } = useQuery({
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
      queryClient.invalidateQueries({ queryKey: ['conversations'] })
      queryClient.invalidateQueries({ queryKey: ['conversations', id, 'messages'] })
    },
  })

  const { mutate: submitImport, isPending: isImporting } = useMutation({
    mutationFn: (content: string) => importMarkdown(id, { content }),
    onSuccess: () => {
      setImportContent('')
      setImportError(null)
      setIsImportOpen(false)
      queryClient.invalidateQueries({ queryKey: ['conversations'] })
      queryClient.invalidateQueries({ queryKey: ['conversations', id, 'messages'] })
    },
    onError: (mutationError) => {
      setImportError(
        mutationError instanceof Error
          ? mutationError.message
          : 'Failed to import Markdown.',
      )
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

  useEffect(() => {
    if (error instanceof ApiError && error.status === 404) {
      queryClient.invalidateQueries({ queryKey: ['conversations'] })
      navigate({ to: '/conversations', replace: true })
    }
  }, [error, navigate, queryClient])

  function handleSubmit() {
    const content = draft.trim()
    if (!content || isSending) return
    sendMessage(content)
  }

  function handleImportSubmit() {
    const content = importContent.trim()
    if (!content || isImporting) return
    submitImport(content)
  }

  const isMissingConversation = error instanceof ApiError && error.status === 404

  if (isMissingConversation) {
    return (
      <div className="cf-empty-state">
        Select a conversation or create a new one.
      </div>
    )
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
          <button
            type="button"
            className="cf-link-pill cf-toolbar-button"
            onClick={() => {
              setImportError(null)
              setIsImportOpen((value) => !value)
            }}
          >
            {isImportOpen ? 'Close import' : 'Import Markdown'}
          </button>
          <Link
            to="/conversations/$id"
            params={{ id }}
            search={panel === 'graph' ? {} : { panel: 'graph' }}
            className="cf-link-pill"
          >
            {panel === 'graph' ? 'Close graph' : 'View graph'}
          </Link>
        </div>

        {isImportOpen && (
          <div className="cf-import-panel">
            <div className="cf-import-header">
              <div>
                <div className="cf-import-title">Import Markdown transcript</div>
                <div className="cf-import-help">
                  Paste exported chatbot turns here. Context Forge will append
                  them to this conversation as canonical messages.
                </div>
              </div>
              <div className="cf-import-actions">
                <button
                  type="button"
                  className="cf-secondary-button"
                  onClick={() => {
                    setImportContent('')
                    setImportError(null)
                  }}
                  disabled={!importContent || isImporting}
                >
                  Clear
                </button>
                <button
                  type="button"
                  className="cf-primary-button"
                  onClick={handleImportSubmit}
                  disabled={!importContent.trim() || isImporting}
                >
                  {isImporting ? 'Importing...' : 'Import'}
                </button>
              </div>
            </div>
            <textarea
              className="cf-import-textarea"
              value={importContent}
              onChange={(event) => {
                setImportContent(event.target.value)
                setImportError(null)
              }}
              placeholder={'## User\n\nPaste a copied or exported conversation here.\n\n## ChatGPT\n\nThe imported reply goes here.'}
              disabled={isImporting}
            />
            {importError && (
              <div className="cf-import-error">{importError}</div>
            )}
          </div>
        )}

        {/* Message list */}
        <div className="cf-thread-scroll">
          {isLoading && <div className="cf-sidebar-status">Loading...</div>}
          {isError && !(error instanceof ApiError && error.status === 404) && (
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
