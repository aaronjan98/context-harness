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

import {
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type RefObject,
  type SetStateAction,
} from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels'
import { Link, useNavigate } from '@tanstack/react-router'
import { conversationRoute } from '@/app/router'
import { Editor } from '@/features/editor'
import type { EditorSelectionSnapshot, EditorVimMode } from '@/features/editor'
import { GraphPanel } from '@/features/graph'
import { MessageContent } from '@/shared/components/MessageContent'
import { useUIStore } from '@/store/ui'
import {
  ApiError,
  fetchMessages,
  appendMessage,
  fetchCurrentExportMarkdown,
  importMarkdown,
  insertMessage,
  resolveApiUrl,
  deleteMessage,
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

const TOOL_PROTOCOL_PREAMBLE = String.raw`## Context Forge Tool Protocol

You are continuing a conversation managed by Context Forge.

You cannot run terminal commands directly. If local terminal execution is needed, request it using exactly one fenced block with the \`contextforge-tool\` language:

\`\`\`contextforge-tool
{
  "tool": "terminal.exec",
  "cwd": "/absolute/path",
  "command": "command to run",
  "reason": "why this command is needed"
}
\`\`\`

Rules:
- Do not claim you ran commands yourself.
- Do not output terminal results unless Context Forge has returned them.
- Use an absolute \`cwd\`.
- Keep commands minimal and focused.
- Do not put secrets in commands.
- Do not request destructive commands unless explicitly necessary.
- Wait for Context Forge to execute approved commands and return the result.`

function withToolProtocol(markdown: string, enabled: boolean): string {
  if (!enabled) return markdown
  return `${TOOL_PROTOCOL_PREAMBLE}\n\n---\n\n${markdown}`.trim()
}

function downloadMarkdown(filename: string, markdown: string) {
  const blob = new Blob([markdown], {
    type: 'text/markdown;charset=utf-8',
  })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

type BootstrapPreset = 'workspace-router' | 'current-directory' | 'full-orientation'

function bootstrapPresetDescription(preset: BootstrapPreset): string {
  if (preset === 'current-directory') {
    return 'Start by requesting project context files in the working directory.'
  }
  if (preset === 'full-orientation') {
    return 'Start with global agent orientation, tool commands, then route from ~/Repositories.'
  }
  return 'Start from ~/Repositories/ROUTER.md and drill into the relevant area/repo.'
}

function buildBootstrapPrompt({
  cwd,
  task,
  preset,
}: {
  cwd: string
  task: string
  preset: BootstrapPreset
}): string {
  const trimmedCwd = cwd.trim() || '/home/aj/Repositories'
  const trimmedTask = task.trim()
  const orientation =
    preset === 'current-directory'
      ? `Start by requesting the smallest useful reads from the working directory:
- \`CONTEXT.md\`
- \`MEMORY.md\`
- \`DEPENDENCIES.md\` if it exists

If the target is unclear, request \`~/Repositories/ROUTER.md\` and drill down from there.`
      : preset === 'full-orientation'
        ? `Start by requesting the global orientation files, then route from the workspace:
- \`~/.config/ai/shared/agent-orientation.md\`
- \`~/.config/ai/shared/tool-commands.md\`
- \`~/Repositories/ROUTER.md\`

After that, request the relevant area \`CONTEXT.md\`, then the target repo's \`CONTEXT.md\`, \`MEMORY.md\`, and \`DEPENDENCIES.md\` if present.`
        : `Start by requesting \`~/Repositories/ROUTER.md\`, then drill into the relevant area \`CONTEXT.md\`, then the target repo's \`CONTEXT.md\`, \`MEMORY.md\`, and \`DEPENDENCIES.md\` if present.`

  const taskBlock = trimmedTask
    ? `\n\nTask:\n\n${trimmedTask}`
    : ''

  return `You are starting a new conversation that will be coordinated through Context Forge, a local harness on my machine.

You are not directly inside my filesystem. You do not have direct terminal, filesystem, SSH, browser, GUI, or editor access.

Context Forge can run approved local commands and return results. If you need to inspect files, list directories, SSH into machines, run scripts, verify state, or execute any command, request it using the Context Forge tool protocol.

Working directory:
\`${trimmedCwd}\`

Interpret my request relative to that working directory unless I say otherwise.

${orientation}

Use exactly one fenced block when requesting local execution:

\`\`\`contextforge-tool
{
  "tool": "terminal.exec",
  "cwd": "${trimmedCwd}",
  "command": "command to run",
  "reason": "why this command is needed"
}
\`\`\`

Rules:
- Do not claim you read files or ran commands yourself.
- Do not output terminal results unless Context Forge has returned them.
- Ask for the smallest command that gives the next needed piece of context.
- Use absolute paths or shell-expanded home paths clearly.
- Do not put secrets in commands.
- Do not request destructive commands unless explicitly necessary and clearly justified.
- Wait for Context Forge to return command results before continuing.${taskBlock}`.trim()
}

interface EditorTrayProps {
  conversationId: string
  pendingAttachments: Attachment[]
  setPendingAttachments: Dispatch<SetStateAction<Attachment[]>>
  attachmentError: string | null
  fileInputRef: RefObject<HTMLInputElement>
  isUploadingAttachment: boolean
  isSending: boolean
  onUploadFiles: (files: File[]) => void
  onSend: (payload: { content: string; attachmentIds: string[] }) => void
}

function EditorTray({
  conversationId,
  pendingAttachments,
  setPendingAttachments,
  attachmentError,
  fileInputRef,
  isUploadingAttachment,
  isSending,
  onUploadFiles,
  onSend,
}: EditorTrayProps) {
  const [isComposerExpanded, setIsComposerExpanded] = useState(false)
  const [expandedDraft, setExpandedDraft] = useState('')
  const [composerSelection, setComposerSelection] =
    useState<EditorSelectionSnapshot>({ anchor: 0, head: 0 })
  const [expandedSelection, setExpandedSelection] =
    useState<EditorSelectionSnapshot>({ anchor: 0, head: 0 })
  const [composerVimMode, setComposerVimMode] =
    useState<EditorVimMode>('normal')
  const [expandedVimMode, setExpandedVimMode] =
    useState<EditorVimMode>('normal')
  const [composerFocusRequest, setComposerFocusRequest] = useState(0)
  const draft = useUIStore(
    (state) => state.draftsByConversationId[conversationId] ?? '',
  )
  const setDraft = useUIStore((state) => state.setDraft)
  const clearDraft = useUIStore((state) => state.clearDraft)

  function handleSubmit(contentValue = draft) {
    const content = contentValue.trim()
    const attachmentIds = pendingAttachments.map((attachment) => attachment.id)
    if ((!content && attachmentIds.length === 0) || isSending || isUploadingAttachment) {
      return
    }
    onSend({
      content: content || 'Attached file(s).',
      attachmentIds,
    })
    setIsComposerExpanded(false)
    setComposerFocusRequest((value) => value + 1)
  }

  function openExpandedComposer() {
    setExpandedDraft(draft)
    setExpandedSelection(composerSelection)
    setExpandedVimMode(composerVimMode)
    setIsComposerExpanded(true)
  }

  function saveExpandedComposer() {
    setDraft(conversationId, expandedDraft)
    setComposerSelection(expandedSelection)
    setComposerVimMode(expandedVimMode)
    setIsComposerExpanded(false)
    setComposerFocusRequest((value) => value + 1)
  }

  function discardExpandedComposer() {
    setExpandedDraft(draft)
    setComposerVimMode(expandedVimMode)
    setIsComposerExpanded(false)
    setComposerFocusRequest((value) => value + 1)
  }

  function closeExpandedComposer() {
    saveExpandedComposer()
  }

  function submitExpandedComposer() {
    setComposerVimMode(expandedVimMode)
    handleSubmit(expandedDraft)
  }

  function clearComposerDraft() {
    clearDraft(conversationId)
    setComposerSelection({ anchor: 0, head: 0 })
    setComposerFocusRequest((value) => value + 1)
  }

  return (
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
            if (files.length > 0) onUploadFiles(files)
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
        onChange={(value) => setDraft(conversationId, value)}
        onSubmit={handleSubmit}
        onExpand={openExpandedComposer}
        selection={composerSelection}
        onSelectionChange={setComposerSelection}
        focusRequest={composerFocusRequest}
        vimMode={composerVimMode}
        onVimModeChange={setComposerVimMode}
        onSaveAndClose={() => handleSubmit()}
        onDiscardAndClose={clearComposerDraft}
        disabled={isSending || isUploadingAttachment}
      />
      {isComposerExpanded && (
        <div className="cf-attachment-overlay" role="dialog" aria-modal="true">
          <div className="cf-message-edit-modal">
            <div className="cf-attachment-modal-header">
              <div>
                <div className="cf-attachment-modal-title">
                  Compose message
                </div>
                <div className="cf-attachment-modal-meta">
                  Draft for this conversation
                </div>
              </div>
              <div className="cf-attachment-modal-actions">
                <button
                  type="button"
                  className="cf-secondary-button"
                  onClick={closeExpandedComposer}
                  disabled={isSending}
                >
                  Close
                </button>
                <button
                  type="button"
                  className="cf-primary-button"
                  onClick={submitExpandedComposer}
                  disabled={
                    (!expandedDraft.trim() && pendingAttachments.length === 0) ||
                    isSending ||
                    isUploadingAttachment
                  }
                >
                  {isSending ? 'Sending...' : 'Send'}
                </button>
              </div>
            </div>
            <Editor
              value={expandedDraft}
              onChange={setExpandedDraft}
              selection={expandedSelection}
              onSelectionChange={setExpandedSelection}
              vimMode={expandedVimMode}
              onVimModeChange={setExpandedVimMode}
              onSubmit={submitExpandedComposer}
              onSaveAndClose={saveExpandedComposer}
              onDiscardAndClose={discardExpandedComposer}
              disabled={isSending || isUploadingAttachment}
              placeholder="Compose message Markdown... (Vim mode, Ctrl+Enter to send)"
              variant="modal"
            />
          </div>
        </div>
      )}
    </div>
  )
}

interface MessageEditModalProps {
  conversationId: string
  message: Message
  onClose: () => void
}

function MessageEditModal({
  conversationId,
  message,
  onClose,
}: MessageEditModalProps) {
  const queryClient = useQueryClient()
  const [content, setContent] = useState(message.content)
  const [error, setError] = useState<string | null>(null)
  const [selection, setSelection] =
    useState<EditorSelectionSnapshot>({ anchor: 0, head: 0 })
  const [vimMode, setVimMode] = useState<EditorVimMode>('normal')

  const { mutate: saveMessageEdit, isPending: isSaving } = useMutation({
    mutationFn: (nextContent: string) =>
      updateMessage(conversationId, message.id, { content: nextContent }),
    onSuccess: () => {
      onClose()
      queryClient.invalidateQueries({ queryKey: ['conversations'] })
      queryClient.invalidateQueries({
        queryKey: ['conversations', conversationId, 'messages'],
      })
    },
    onError: (mutationError) => {
      setError(
        mutationError instanceof Error
          ? mutationError.message
          : 'Failed to save message edit.',
      )
    },
  })

  function submitEdit() {
    if (!content.trim() || isSaving) return
    saveMessageEdit(content)
  }

  return (
    <div className="cf-attachment-overlay" role="dialog" aria-modal="true">
      <div className="cf-message-edit-modal">
        <div className="cf-attachment-modal-header">
          <div>
            <div className="cf-attachment-modal-title">
              Edit message
            </div>
            <div className="cf-attachment-modal-meta">
              {message.role} · {message.agent ?? 'unknown'} · {message.timestamp}
            </div>
          </div>
          <div className="cf-attachment-modal-actions">
            <button
              type="button"
              className="cf-secondary-button"
              onClick={onClose}
              disabled={isSaving}
            >
              Cancel
            </button>
            <button
              type="button"
              className="cf-primary-button"
              onClick={submitEdit}
              disabled={!content.trim() || isSaving}
            >
              {isSaving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>
        <Editor
          value={content}
          onChange={(nextValue) => {
            setContent(nextValue)
            setError(null)
          }}
          onSubmit={submitEdit}
          selection={selection}
          onSelectionChange={setSelection}
          vimMode={vimMode}
          onVimModeChange={setVimMode}
          onSaveAndClose={submitEdit}
          onDiscardAndClose={onClose}
          disabled={isSaving}
          placeholder="Edit message Markdown... (Vim mode, Ctrl+Enter to save)"
          variant="modal"
        />
        {error && (
          <div className="cf-import-error">{error}</div>
        )}
      </div>
    </div>
  )
}

type InsertPosition = 'before' | 'after'

interface MessageInsertModalProps {
  conversationId: string
  targetMessage: Message
  position: InsertPosition
  onClose: () => void
}

function MessageInsertModal({
  conversationId,
  targetMessage,
  position,
  onClose,
}: MessageInsertModalProps) {
  const queryClient = useQueryClient()
  const [content, setContent] = useState('')
  const [role, setRole] = useState<'user' | 'assistant'>(
    targetMessage.role === 'user' ? 'assistant' : 'user',
  )
  const [agent, setAgent] = useState(role === 'user' ? 'human' : 'imported')
  const [error, setError] = useState<string | null>(null)
  const [selection, setSelection] =
    useState<EditorSelectionSnapshot>({ anchor: 0, head: 0 })
  const [vimMode, setVimMode] = useState<EditorVimMode>('normal')

  const { mutate: saveInsert, isPending: isSaving } = useMutation({
    mutationFn: (nextContent: string) =>
      insertMessage(conversationId, targetMessage.id, {
        position,
        role,
        agent,
        content: nextContent,
      }),
    onSuccess: () => {
      onClose()
      queryClient.invalidateQueries({ queryKey: ['conversations'] })
      queryClient.invalidateQueries({
        queryKey: ['conversations', conversationId, 'messages'],
      })
    },
    onError: (mutationError) => {
      setError(
        mutationError instanceof Error
          ? mutationError.message
          : 'Failed to insert message.',
      )
    },
  })

  function submitInsert() {
    if (!content.trim() || isSaving) return
    saveInsert(content)
  }

  function updateRole(nextRole: 'user' | 'assistant') {
    setRole(nextRole)
    setAgent(nextRole === 'user' ? 'human' : 'imported')
  }

  return (
    <div className="cf-attachment-overlay" role="dialog" aria-modal="true">
      <div className="cf-message-edit-modal">
        <div className="cf-attachment-modal-header">
          <div>
            <div className="cf-attachment-modal-title">
              Insert {position} message
            </div>
            <div className="cf-attachment-modal-meta">
              Relative to {targetMessage.id} · {targetMessage.role} ·{' '}
              {targetMessage.agent ?? 'unknown'}
            </div>
          </div>
          <div className="cf-attachment-modal-actions">
            <button
              type="button"
              className="cf-secondary-button"
              onClick={onClose}
              disabled={isSaving}
            >
              Cancel
            </button>
            <button
              type="button"
              className="cf-primary-button"
              onClick={submitInsert}
              disabled={!content.trim() || isSaving}
            >
              {isSaving ? 'Inserting...' : 'Insert'}
            </button>
          </div>
        </div>
        <div className="cf-message-insert-fields">
          <label className="cf-message-insert-field">
            <span>Role</span>
            <select
              value={role}
              onChange={(event) =>
                updateRole(event.target.value as 'user' | 'assistant')
              }
              disabled={isSaving}
            >
              <option value="user">user</option>
              <option value="assistant">assistant</option>
            </select>
          </label>
          <label className="cf-message-insert-field">
            <span>Agent</span>
            <input
              value={agent}
              onChange={(event) => setAgent(event.target.value)}
              disabled={isSaving}
            />
          </label>
        </div>
        <Editor
          value={content}
          onChange={(nextValue) => {
            setContent(nextValue)
            setError(null)
          }}
          onSubmit={submitInsert}
          selection={selection}
          onSelectionChange={setSelection}
          vimMode={vimMode}
          onVimModeChange={setVimMode}
          onSaveAndClose={submitInsert}
          onDiscardAndClose={onClose}
          disabled={isSaving}
          placeholder="Insert message Markdown... (Vim mode, Ctrl+Enter to insert)"
          variant="modal"
        />
        {error && (
          <div className="cf-import-error">{error}</div>
        )}
      </div>
    </div>
  )
}

interface BootstrapPromptModalProps {
  onClose: () => void
}

function BootstrapPromptModal({ onClose }: BootstrapPromptModalProps) {
  const [cwd, setCwd] = useState('/home/aj/Repositories')
  const [preset, setPreset] = useState<BootstrapPreset>('workspace-router')
  const [task, setTask] = useState('')
  const [status, setStatus] = useState<string | null>(null)
  const prompt = buildBootstrapPrompt({ cwd, preset, task })

  async function copyPrompt() {
    try {
      await navigator.clipboard.writeText(prompt)
      setStatus('Copied bootstrap prompt.')
      window.setTimeout(() => setStatus(null), 2400)
    } catch (error) {
      setStatus(
        error instanceof Error
          ? error.message
          : 'Failed to copy bootstrap prompt.',
      )
    }
  }

  return (
    <div className="cf-attachment-overlay" role="dialog" aria-modal="true">
      <div className="cf-bootstrap-modal">
        <div className="cf-attachment-modal-header">
          <div>
            <div className="cf-attachment-modal-title">
              Bootstrap new chatbot session
            </div>
            <div className="cf-attachment-modal-meta">
              Copy this as the first message in ChatGPT, Claude, Gemini, or Open WebUI.
            </div>
          </div>
          <div className="cf-attachment-modal-actions">
            <button
              type="button"
              className="cf-secondary-button"
              onClick={onClose}
            >
              Close
            </button>
            <button
              type="button"
              className="cf-primary-button"
              onClick={copyPrompt}
            >
              Copy prompt
            </button>
          </div>
        </div>
        <div className="cf-bootstrap-body">
          <label className="cf-bootstrap-field">
            <span>Working directory</span>
            <input
              value={cwd}
              onChange={(event) => setCwd(event.target.value)}
              placeholder="/home/aj/Repositories"
            />
          </label>
          <label className="cf-bootstrap-field">
            <span>Orientation preset</span>
            <select
              value={preset}
              onChange={(event) => setPreset(event.target.value as BootstrapPreset)}
            >
              <option value="workspace-router">Workspace router</option>
              <option value="current-directory">Current directory</option>
              <option value="full-orientation">Full agent orientation</option>
            </select>
          </label>
          <div className="cf-bootstrap-hint">
            {bootstrapPresetDescription(preset)}
          </div>
          <label className="cf-bootstrap-field cf-bootstrap-task">
            <span>Initial task, optional</span>
            <textarea
              value={task}
              onChange={(event) => setTask(event.target.value)}
              placeholder="Ask the chatbot what you want it to accomplish. Leave blank if you only want the generic bootstrap instructions."
            />
          </label>
          <label className="cf-bootstrap-field cf-bootstrap-preview">
            <span>Preview</span>
            <textarea value={prompt} readOnly />
          </label>
          {status && (
            <div className="cf-export-status cf-bootstrap-status">{status}</div>
          )}
        </div>
      </div>
    </div>
  )
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
  const [isBootstrapOpen, setIsBootstrapOpen] = useState(false)
  const [includeToolProtocol, setIncludeToolProtocol] = useState(false)
  const [selectedMessageIds, setSelectedMessageIds] = useState<Set<string>>(
    () => new Set(),
  )
  const [pendingAttachments, setPendingAttachments] = useState<Attachment[]>([])
  const [attachmentError, setAttachmentError] = useState<string | null>(null)
  const [previewAttachment, setPreviewAttachment] = useState<Attachment | null>(null)
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null)
  const [insertTarget, setInsertTarget] = useState<{
    messageId: string
    position: InsertPosition
  } | null>(null)
  const [openActionsMessageId, setOpenActionsMessageId] = useState<string | null>(null)

  const focusedMessageId = useUIStore((s) => s.focusedMessageId)
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

  const { mutate: removeMessage, isPending: isDeletingMessage } = useMutation({
    mutationFn: (messageId: string) => deleteMessage(id, messageId),
    onSuccess: () => {
      setOpenActionsMessageId(null)
      queryClient.invalidateQueries({ queryKey: ['conversations'] })
      queryClient.invalidateQueries({ queryKey: ['conversations', id, 'messages'] })
    },
    onError: (mutationError) => {
      setExportStatus(
        mutationError instanceof Error
          ? mutationError.message
          : 'Failed to delete message.',
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

  function handleImportSubmit() {
    const content = importContent.trim()
    if (!content || isImporting) return
    submitImport(content)
  }

  function startEditingMessage(message: Message) {
    setIsExportOpen(false)
    setOpenActionsMessageId(null)
    setEditingMessageId(message.id)
  }

  function cancelMessageEdit() {
    setEditingMessageId(null)
  }

  function startInsertingMessage(message: Message, position: InsertPosition) {
    setIsExportOpen(false)
    setOpenActionsMessageId(null)
    setInsertTarget({ messageId: message.id, position })
  }

  function cancelMessageInsert() {
    setInsertTarget(null)
  }

  function handleDeleteMessage(message: Message) {
    setIsExportOpen(false)
    setOpenActionsMessageId(null)
    removeMessage(message.id)
  }

  async function handleCopyExport() {
    setExportStatus(null)
    try {
      const markdown = await fetchCurrentExportMarkdown(id)
      await navigator.clipboard.writeText(
        withToolProtocol(markdown, includeToolProtocol),
      )
      setExportStatus(
        includeToolProtocol
          ? 'Copied Markdown export with tool protocol.'
          : 'Copied Markdown export.',
      )
      window.setTimeout(() => setExportStatus(null), 2400)
    } catch (exportError) {
      setExportStatus(
        exportError instanceof Error
          ? exportError.message
          : 'Failed to copy Markdown export.',
      )
    }
  }

  async function handleDownloadExport() {
    setExportStatus(null)
    try {
      const markdown = await fetchCurrentExportMarkdown(id)
      downloadMarkdown(
        includeToolProtocol ? `${id}-with-tools.md` : `${id}.md`,
        withToolProtocol(markdown, includeToolProtocol),
      )
      setExportStatus(
        includeToolProtocol
          ? 'Downloaded Markdown export with tool protocol.'
          : 'Downloaded Markdown export.',
      )
      window.setTimeout(() => setExportStatus(null), 2400)
    } catch (exportError) {
      setExportStatus(
        exportError instanceof Error
          ? exportError.message
          : 'Failed to download Markdown export.',
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
      await navigator.clipboard.writeText(
        withToolProtocol(messagesToMarkdown(selected), includeToolProtocol),
      )
      setExportStatus(
        includeToolProtocol
          ? `Copied ${selected.length} selected message(s) with tool protocol.`
          : `Copied ${selected.length} selected message(s).`,
      )
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

    downloadMarkdown(
      includeToolProtocol
        ? `${id}-selected-with-tools.md`
        : `${id}-selected.md`,
      withToolProtocol(messagesToMarkdown(selected), includeToolProtocol),
    )
    setExportStatus(
      includeToolProtocol
        ? `Downloaded ${selected.length} selected message(s) with tool protocol.`
        : `Downloaded ${selected.length} selected message(s).`,
    )
    window.setTimeout(() => setExportStatus(null), 2400)
  }

  const selectedCount = selectedMessageIds.size
  const editingMessage = messages?.find((message) => message.id === editingMessageId)
  const insertingMessage = insertTarget
    ? messages?.find((message) => message.id === insertTarget.messageId)
    : undefined

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
              setIsImportOpen(false)
              setIsExportOpen(false)
              setIsBootstrapOpen(true)
            }}
          >
            Bootstrap Chat
          </button>
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
              <label className="cf-export-menu-toggle">
                <input
                  type="checkbox"
                  checked={includeToolProtocol}
                  onChange={(event) => setIncludeToolProtocol(event.target.checked)}
                />
                <span>Include tool protocol prompt</span>
              </label>
              <div className="cf-export-menu-note">
                Adds instructions that tell ChatGPT, Claude, or Gemini how to
                request terminal commands through Context Forge.
              </div>
              <div className="cf-export-menu-divider" />
              <button
                type="button"
                className="cf-export-menu-item"
                onClick={handleCopyExport}
              >
                Copy full thread
              </button>
              <button
                type="button"
                className="cf-export-menu-item"
                onClick={handleDownloadExport}
              >
                Download full thread
              </button>
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
                    <div className="cf-message-actions">
                      <button
                        type="button"
                        className="cf-message-edit-button"
                        onClick={(event) => {
                          event.stopPropagation()
                          setOpenActionsMessageId((current) =>
                            current === msg.id ? null : msg.id,
                          )
                        }}
                        aria-label={`Open actions for message ${msg.id}`}
                        title="Message actions"
                        aria-expanded={openActionsMessageId === msg.id}
                      >
                        ✎
                      </button>
                      {openActionsMessageId === msg.id && (
                        <div className="cf-message-actions-menu">
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation()
                              startEditingMessage(msg)
                            }}
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation()
                              startInsertingMessage(msg, 'before')
                            }}
                          >
                            Insert before
                          </button>
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation()
                              startInsertingMessage(msg, 'after')
                            }}
                          >
                            Insert after
                          </button>
                          <button
                            type="button"
                            className="cf-message-actions-danger"
                            onClick={(event) => {
                              event.stopPropagation()
                              handleDeleteMessage(msg)
                            }}
                            disabled={isDeletingMessage}
                          >
                            Delete
                          </button>
                        </div>
                      )}
                    </div>
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

        <EditorTray
          conversationId={id}
          pendingAttachments={pendingAttachments}
          setPendingAttachments={setPendingAttachments}
          attachmentError={attachmentError}
          fileInputRef={fileInputRef}
          isUploadingAttachment={isUploadingAttachment}
          isSending={isSending}
          onUploadFiles={uploadFiles}
          onSend={sendMessage}
        />
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

      {isBootstrapOpen && (
        <BootstrapPromptModal onClose={() => setIsBootstrapOpen(false)} />
      )}

      {editingMessage && (
        <MessageEditModal
          key={editingMessage.id}
          conversationId={id}
          message={editingMessage}
          onClose={cancelMessageEdit}
        />
      )}
      {insertTarget && insertingMessage && (
        <MessageInsertModal
          key={`${insertTarget.messageId}-${insertTarget.position}`}
          conversationId={id}
          targetMessage={insertingMessage}
          position={insertTarget.position}
          onClose={cancelMessageInsert}
        />
      )}
    </>
  )
}
