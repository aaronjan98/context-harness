/**
 * Zustand UI store — ephemeral client-only state.
 *
 * This store is intentionally thin. Most state lives in the URL (TanStack
 * Router) or the server cache (TanStack Query). Only state that is:
 *   - ephemeral (not worth persisting or deep-linking)
 *   - cross-feature (can't live in a single component)
 * belongs here.
 *
 * Current contents:
 *   focusedMessageId  — set by the graph panel when a node is clicked;
 *                       read by ThreadView to scroll to that message.
 *                       This is the cross-feature communication seam between
 *                       features/graph and features/thread.
 *
 *   draftsByConversationId — unsent editor text, keyed per conversation so
 *                            switching threads does not leak drafts.
 *
 * See project-memory/frontend-architecture.md § State layers for the full map.
 */

import { create } from 'zustand'

interface UIState {
  // Graph → Thread communication: clicking a graph node scrolls the thread
  focusedMessageId: string | null
  setFocusedMessageId: (id: string | null) => void

  draftsByConversationId: Record<string, string>
  setDraft: (conversationId: string, value: string) => void
  clearDraft: (conversationId: string) => void
}

export const useUIStore = create<UIState>((set) => ({
  focusedMessageId: null,
  setFocusedMessageId: (id) => set({ focusedMessageId: id }),

  draftsByConversationId: {},
  setDraft: (conversationId, value) =>
    set((state) => ({
      draftsByConversationId: {
        ...state.draftsByConversationId,
        [conversationId]: value,
      },
    })),
  clearDraft: (conversationId) =>
    set((state) => {
      const nextDrafts = { ...state.draftsByConversationId }
      delete nextDrafts[conversationId]
      return { draftsByConversationId: nextDrafts }
    }),
}))
