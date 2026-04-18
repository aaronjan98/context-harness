/**
 * ConversationSidebar — persistent left panel.
 *
 * Shows the list of all conversations and a button to create a new one.
 * Active conversation is highlighted based on the current route param.
 *
 * Data: fetched via TanStack Query, cache key ['conversations'].
 * Navigation: uses TanStack Router Link (typed, validated at compile time).
 *
 * Phase 1 implementation — fills in real API calls once schema.ts is generated.
 */

import { Link } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { useUIStore } from '@/store/ui'
import { fetchConversations } from '@/api/conversations'

export function ConversationSidebar() {
  const setModalOpen = useUIStore((s) => s.setNewConversationModalOpen)

  const { data: conversations, isLoading, isError } = useQuery({
    queryKey: ['conversations'],
    queryFn: fetchConversations,
  })

  return (
    <div
      style={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        borderRight: '1px solid #e5e7eb',
        fontFamily: 'sans-serif',
        fontSize: '14px',
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: '12px 16px',
          borderBottom: '1px solid #e5e7eb',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <span style={{ fontWeight: 600 }}>Conversations</span>
        <button
          onClick={() => setModalOpen(true)}
          title="New conversation"
          style={{
            background: 'none',
            border: '1px solid #d1d5db',
            borderRadius: '4px',
            cursor: 'pointer',
            padding: '2px 8px',
            fontSize: '18px',
            lineHeight: 1,
          }}
        >
          +
        </button>
      </div>

      {/* List */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
        {isLoading && (
          <div style={{ padding: '8px 16px', color: '#9ca3af' }}>Loading…</div>
        )}
        {isError && (
          <div style={{ padding: '8px 16px', color: '#ef4444' }}>
            Failed to load conversations.
          </div>
        )}
        {conversations &&
          // TODO: replace `any` with the generated Conversation type from schema.ts
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (conversations as any[]).map((convo: any) => (
            <Link
              key={convo.id}
              to="/conversations/$id"
              params={{ id: convo.id }}
              style={{ display: 'block', padding: '8px 16px', textDecoration: 'none', color: 'inherit' }}
              activeProps={{ style: { display: 'block', padding: '8px 16px', textDecoration: 'none', color: 'inherit', background: '#f3f4f6', fontWeight: 600 } }}
            >
              {convo.title ?? 'Untitled'}
            </Link>
          ))}
      </div>
    </div>
  )
}
