/**
 * Editor feature public interface.
 *
 * This file is the swap seam between Phase 1 and Phase 2 editors.
 * Change the one active export line to switch implementations app-wide.
 *
 * Phase 1 (active):
 *   export { SimpleEditor as Editor } from './SimpleEditor'
 *
 * Phase 2 — change to:
 *   export { RichEditor as Editor } from './RichEditor'
 *
 * Nothing outside this file needs to change.
 */

export { SimpleEditor as Editor } from './SimpleEditor'
export type { EditorProps } from './types'
