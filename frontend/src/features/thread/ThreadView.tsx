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
  currentExportDownloadUrl,
  fetchCurrentExportMarkdown,
  importMarkdown,
  resolveApiUrl,
  updateMessage,
  uploadAttachment,
} from '@/api/conversations'
import type { Attachment, Message } from '@/api/conversations'

function formatBytes(size: number): string {
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / 1024 / 1024).toFixed(1)} MB`
}

function attachmentKind(attachment: Attachment): 'image' | 'text' | 'pdf' | 'other' {
  if (attachment.content_type.startsWith('image/')) return 'image'
  if (
    attachment.content_type.startsWith('text/') ||
    attachment.content_type.includes('markdown') ||
    attachment.content_type.includes('json')
  ) {
    return 'text'
  }
  if (attachment.content_type === 'application/pdf') return 'pdf'
  return 'other'
}

function messageSpeaker(message: Message): string {
  return message.role === 'user' ? 'User' : message.agent || message.role
}

function messageToMarkdown(message: Message): string {
  const attachmentLines = message.attachments.map(
    (attachment) => `- [${attachment.filename}](${attachment.relative_path})`,
  )
  const attachments =
    attachmentLines.length > 0
      ? `\n\n> [!attachment]\n${attachmentLines
          .map((line) => `> ${line}`)
          .join('\n')}`
      : ''

  return `## ${messageSpeaker(message)}\n${message.content}${attachments}`.trim()
}

function messagesToMarkdown(messages: Message[]): string {
  return messages.map(messageToMarkdown).join('\n\n')
}

export function ThreadView() {
  const { id } = conversationRoute.useParams()
  const { panel } = conversationRoute.useSearch()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [isImportOpen, setIsImportOpen] = useState(false)
  const [isExportOpen, setIsExportOpen] = useState(false)
  const [importContent, setImportContent] = useState('')
  const [importError, setImportError] = useState<string | null>(null)
  const [exportStatus, setExportStatus] = useState<string | null>(null)
  const [selectedMessageIds, setSelectedMessageIds] = useState<Set<string>>(
    () => new Set(),
  )
  const [pendingAttachments, setPendingAttachments] = useState<Attachment[]>([])
  const [attachmentError, setAttachmentError] = useState<string | null>(null)
  const [previewAttachment, setPreviewAttachment] = useState<Attachment | null>(null)
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null)
  const [editingContent, setEditingContent] = useState('')
  const [editError, setEditError] = useState<string | null>(null)

  const focusedMessageId = useUIStore((s) => s.focusedMessageId)
  const draft = useUIStore((s) => s.draftsByConversationId[id] ?? '')
  const setDraft = useUIStore((s) => s.setDraft)
  const clearDraft = useUIStore((s) => s.clearDraft)
  const messageRefs = useRef<Record<string, HTMLDivElement | null>>({})
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  // Fetch messages for this conversation
  const { data: messages, error, isLoading, isError } = useQuery({
    queryKey: ['conversations', id, 'messages'],
    queryFn: () => fetchMessages(id),
    enabled: !!id,
  })

  // Append a new message
  const { mutate: sendMessage, isPending: isSending } = useMutation({
    mutationFn: (payload: { content: string; attachmentIds: string[] }) =>
      appendMessage(id, {
        role: 'user',
        content: payload.content,
        attachment_ids: payload.attachmentIds,
      }),
    onSuccess: () => {
      clearDraft(id)
      setPendingAttachments([])
      setAttachmentError(null)
      queryClient.invalidateQueries({ queryKey: ['conversations'] })
      queryClient.invalidateQueries({ queryKey: ['conversations', id, 'messages'] })
    },
  })

  const { mutate: uploadFiles, isPending: isUploadingAttachment } = useMutation({
    mutationFn: async (files: File[]) => {
      const uploaded: Attachment[] = []
      for (const file of files) {
        uploaded.push(await uploadAttachment(id, file))
      }
      return uploaded
    },
    onSuccess: (uploaded) => {
      setPendingAttachments((current) => [...current, ...uploaded])
      setAttachmentError(null)
      if (fileInputRef.current) fileInputRef.current.value = ''
    },
    onError: (mutationError) => {
      setAttachmentError(
        mutationError instanceof Error
          ? mutationError.message
          : 'Failed to upload attachment.',
      )
      if (fileInputRef.current) fileInputRef.current.value = ''
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

  const { mutate: saveMessageEdit, isPending: isEditingMessage } = useMutation({
    mutationFn: (payload: { messageId: string; content: string }) =>
      updateMessage(id, payload.messageId, { content: payload.content }),
    onSuccess: () => {
      setEditingMessageId(null)
      setEditingContent('')
      setEditError(null)
      queryClient.invalidateQueries({ queryKey: ['conversations'] })
      queryClient.invalidateQueries({ queryKey: ['conversations', id, 'messages'] })
    },
    onError: (mutationError) => {
      setEditError(
        mutationError instanceof Error
          ? mutationError.message
          : 'Failed to save message edit.',
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

  useEffect(() => {
    if (!messages) return

    const messageIds = new Set(messages.map((message) => message.id))
    setSelectedMessageIds((current) => {
      const next = new Set(
        Array.from(current).filter((messageId) => messageIds.has(messageId)),
      )
      return next.size === current.size ? current : next
    })
  }, [messages])

  function handleSubmit() {
    const content = draft.trim()
    const attachmentIds = pendingAttachments.map((attachment) => attachment.id)
    if ((!content && attachmentIds.length === 0) || isSending || isUploadingAttachment) {
      return
    }
    sendMessage({
      content: content || 'Attached file(s).',
      attachmentIds,
    })
  }

  function handleImportSubmit() {
    const content = importContent.trim()
    if (!content || isImporting) return
    submitImport(content)
  }

  function startEditingMessage(message: Message) {
    setIsExportOpen(false)
    setEditingMessageId(message.id)
    setEditingContent(message.content)
    setEditError(null)
  }

  function cancelMessageEdit() {
    setEditingMessageId(null)
    setEditingContent('')
    setEditError(null)
  }

  function submitMessageEdit(messageId: string) {
    if (!editingContent.trim() || isEditingMessage) return
    saveMessageEdit({ messageId, content: editingContent })
  }

  async function handleCopyExport() {
    setExportStatus(null)
    try {
      const markdown = await fetchCurrentExportMarkdown(id)
      await navigator.clipboard.writeText(markdown)
      setExportStatus('Copied Markdown export.')
      window.setTimeout(() => setExportStatus(null), 2400)
    } catch (exportError) {
      setExportStatus(
        exportError instanceof Error
          ? exportError.message
          : 'Failed to copy Markdown export.',
      )
    }
  }

  function selectedMessages(): Message[] {
    return (messages ?? []).filter((message) => selectedMessageIds.has(message.id))
  }

  function toggleMessageSelection(messageId: string) {
    setSelectedMessageIds((current) => {
      const next = new Set(current)
      if (next.has(messageId)) {
        next.delete(messageId)
      } else {
        next.add(messageId)
      }
      return next
    })
  }

  async function handleCopySelectedExport() {
    const selected = selectedMessages()
    if (selected.length === 0) return

    try {
      await navigator.clipboard.writeText(messagesToMarkdown(selected))
      setExportStatus(`Copied ${selected.length} selected message(s).`)
      window.setTimeout(() => setExportStatus(null), 2400)
    } catch (exportError) {
      setExportStatus(
        exportError instanceof Error
          ? exportError.message
          : 'Failed to copy selected messages.',
      )
    }
  }

  function handleDownloadSelectedExport() {
    const selected = selectedMessages()
    if (selected.length === 0) return

    const blob = new Blob([messagesToMarkdown(selected)], {
      type: 'text/markdown;charset=utf-8',
    })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${id}-selected.md`
    link.click()
    URL.revokeObjectURL(url)
    setExportStatus(`Downloaded ${selected.length} selected message(s).`)
    window.setTimeout(() => setExportStatus(null), 2400)
  }

  const selectedCount = selectedMessageIds.size
  const editingMessage = messages?.find((message) => message.id === editingMessageId)

  const isMissingConversation = error instanceof ApiError && error.status === 404

  if (isMissingConversation) {
    return (
      <div className="cf-empty-state">
        Select a conversation or create a new one.
      </div>
    )
  }

  return (
    <>
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
              setIsExportOpen(false)
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
          <button
            type="button"
            className="cf-link-pill cf-toolbar-button"
            onClick={() => {
              setIsImportOpen(false)
              setIsExportOpen((value) => !value)
            }}
            aria-expanded={isExportOpen}
          >
            Export
          </button>
          {isExportOpen && (
            <div className="cf-export-menu">
              <button
                type="button"
                className="cf-export-menu-item"
                onClick={handleCopyExport}
              >
                Copy full thread
              </button>
              <a
                className="cf-export-menu-item"
                href={currentExportDownloadUrl(id)}
              >
                Download full thread
              </a>
              <div className="cf-export-menu-divider" />
              <div className="cf-export-menu-note">
                {selectedCount > 0
                  ? `${selectedCount} selected message(s)`
                  : 'Select messages with the dots on the left.'}
              </div>
              <button
                type="button"
                className="cf-export-menu-item"
                onClick={handleCopySelectedExport}
                disabled={selectedCount === 0}
              >
                Copy selected
              </button>
              <button
                type="button"
                className="cf-export-menu-item"
                onClick={handleDownloadSelectedExport}
                disabled={selectedCount === 0}
              >
                Download selected
              </button>
              <button
                type="button"
                className="cf-export-menu-item"
                onClick={() => setSelectedMessageIds(new Set())}
                disabled={selectedCount === 0}
              >
                Clear selection
              </button>
            </div>
          )}
        </div>
        {exportStatus && (
          <div className="cf-export-status">{exportStatus}</div>
        )}

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
                className={`cf-message-row ${
                  isExportOpen ? 'cf-message-row-selecting' : ''
                }`}
              >
                {isExportOpen && (
                  <button
                    type="button"
                    className={`cf-message-select-dot ${
                      selectedMessageIds.has(msg.id)
                        ? 'cf-message-select-dot-active'
                        : ''
                    }`}
                    onClick={() => toggleMessageSelection(msg.id)}
                    aria-label={
                      selectedMessageIds.has(msg.id)
                        ? `Deselect message ${msg.id}`
                        : `Select message ${msg.id}`
                    }
                    aria-pressed={selectedMessageIds.has(msg.id)}
                  />
                )}
                <div
                  ref={(el) => { messageRefs.current[msg.id] = el }}
                  role={isExportOpen ? 'button' : undefined}
                  tabIndex={isExportOpen ? 0 : undefined}
                  aria-pressed={
                    isExportOpen ? selectedMessageIds.has(msg.id) : undefined
                  }
                  onClick={() => {
                    if (isExportOpen) toggleMessageSelection(msg.id)
                  }}
                  onKeyDown={(event) => {
                    if (!isExportOpen) return
                    if (event.key !== 'Enter' && event.key !== ' ') return
                    event.preventDefault()
                    toggleMessageSelection(msg.id)
                  }}
                  className={`cf-message ${
                    msg.role === 'user' ? 'cf-message-user' : 'cf-message-assistant'
                  } ${
                    isExportOpen ? 'cf-message-selectable' : ''
                  } ${
                    isExportOpen && selectedMessageIds.has(msg.id)
                      ? 'cf-message-selected'
                      : ''
                  }`}
                >
                  <div className="cf-message-topline">
                    <div className="cf-message-meta">
                      {msg.role} · {msg.agent ?? 'unknown'} · {msg.timestamp}
                    </div>
                    <button
                      type="button"
                      className="cf-message-edit-button"
                      onClick={(event) => {
                        event.stopPropagation()
                        startEditingMessage(msg)
                      }}
                      aria-label={`Edit message ${msg.id}`}
                      title="Edit message"
                    >
                      ✎
                    </button>
                  </div>
                  <MessageContent content={msg.content} />
                  {msg.attachments.length > 0 && (
                    <div className="cf-attachment-list">
                      {msg.attachments.map((attachment) => (
                        <button
                          key={attachment.id}
                          type="button"
                          className="cf-attachment-card"
                          onClick={(event) => {
                            event.stopPropagation()
                            setPreviewAttachment(attachment)
                          }}
                        >
                          <span className="cf-attachment-icon">
                            {attachmentKind(attachment) === 'image' ? 'IMG' : 'FILE'}
                          </span>
                          <span className="cf-attachment-details">
                            <span className="cf-attachment-name">
                              {attachment.filename}
                            </span>
                            <span className="cf-attachment-meta">
                              {attachment.content_type} · {formatBytes(attachment.size)}
                            </span>
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
        </div>

        {/* Editor */}
        <div className="cf-editor-tray">
          {pendingAttachments.length > 0 && (
            <div className="cf-pending-attachments">
              {pendingAttachments.map((attachment) => (
                <div key={attachment.id} className="cf-pending-attachment">
                  <span>{attachment.filename}</span>
                  <button
                    type="button"
                    onClick={() =>
                      setPendingAttachments((current) =>
                        current.filter((item) => item.id !== attachment.id),
                      )
                    }
                    aria-label={`Remove ${attachment.filename}`}
                  >
                    x
                  </button>
                </div>
              ))}
            </div>
          )}
          {attachmentError && (
            <div className="cf-import-error">{attachmentError}</div>
          )}
          <div className="cf-editor-actions">
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="cf-hidden-file-input"
              onChange={(event) => {
                const files = Array.from(event.target.files ?? [])
                if (files.length > 0) uploadFiles(files)
              }}
            />
            <button
              type="button"
              className="cf-secondary-button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploadingAttachment || isSending}
            >
              {isUploadingAttachment ? 'Attaching...' : 'Attach file'}
            </button>
          </div>
          <Editor
            value={draft}
            onChange={(value) => setDraft(id, value)}
            onSubmit={handleSubmit}
            disabled={isSending || isUploadingAttachment}
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

      {previewAttachment && (
        <div className="cf-attachment-overlay" role="dialog" aria-modal="true">
          <div className="cf-attachment-modal">
            <div className="cf-attachment-modal-header">
              <div>
                <div className="cf-attachment-modal-title">
                  {previewAttachment.filename}
                </div>
                <div className="cf-attachment-modal-meta">
                  {previewAttachment.content_type} · {formatBytes(previewAttachment.size)}
                </div>
              </div>
              <div className="cf-attachment-modal-actions">
                <a
                  className="cf-secondary-button"
                  href={resolveApiUrl(previewAttachment.download_url)}
                >
                  Download
                </a>
                <a
                  className="cf-secondary-button"
                  href={resolveApiUrl(previewAttachment.preview_url)}
                  target="_blank"
                  rel="noreferrer"
                >
                  Open
                </a>
                <button
                  type="button"
                  className="cf-primary-button"
                  onClick={() => setPreviewAttachment(null)}
                >
                  Close
                </button>
              </div>
            </div>
            <div className="cf-attachment-preview-body">
              {attachmentKind(previewAttachment) === 'image' && (
                <img
                  src={resolveApiUrl(previewAttachment.preview_url)}
                  alt={previewAttachment.filename}
                  className="cf-attachment-image-preview"
                />
              )}
              {attachmentKind(previewAttachment) === 'pdf' && (
                <iframe
                  title={previewAttachment.filename}
                  src={resolveApiUrl(previewAttachment.preview_url)}
                  className="cf-attachment-frame-preview"
                />
              )}
              {attachmentKind(previewAttachment) === 'text' && (
                <iframe
                  title={previewAttachment.filename}
                  src={resolveApiUrl(previewAttachment.preview_url)}
                  className="cf-attachment-frame-preview"
                />
              )}
              {attachmentKind(previewAttachment) === 'other' && (
                <div className="cf-attachment-unsupported">
                  Preview is not available for this file type yet. Use Open or
                  Download to inspect the attachment.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {editingMessage && (
        <div className="cf-attachment-overlay" role="dialog" aria-modal="true">
          <div className="cf-message-edit-modal">
            <div className="cf-attachment-modal-header">
              <div>
                <div className="cf-attachment-modal-title">
                  Edit message
                </div>
                <div className="cf-attachment-modal-meta">
                  {editingMessage.role} · {editingMessage.agent ?? 'unknown'} ·{' '}
                  {editingMessage.timestamp}
                </div>
              </div>
              <div className="cf-attachment-modal-actions">
                <button
                  type="button"
                  className="cf-secondary-button"
                  onClick={cancelMessageEdit}
                  disabled={isEditingMessage}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="cf-primary-button"
                  onClick={() => submitMessageEdit(editingMessage.id)}
                  disabled={!editingContent.trim() || isEditingMessage}
                >
                  {isEditingMessage ? 'Saving...' : 'Save'}
                </button>
              </div>
            </div>
            <Editor
              value={editingContent}
              onChange={(nextValue) => {
                setEditingContent(nextValue)
                setEditError(null)
              }}
              onSubmit={() => submitMessageEdit(editingMessage.id)}
              disabled={isEditingMessage}
              placeholder="Edit message Markdown... (Vim mode, Ctrl+Enter to save)"
              variant="modal"
            />
            {editError && (
              <div className="cf-import-error">{editError}</div>
            )}
          </div>
        </div>
      )}
    </>
  )
}
