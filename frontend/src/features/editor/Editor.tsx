import { useUIStore } from '@/store/ui'
import { RichEditor } from './RichEditor'
import { SimpleEditor } from './SimpleEditor'
import type { EditorProps } from './types'

export function Editor(props: EditorProps) {
  const editorMode = useUIStore((state) => state.editorMode)
  if (editorMode === 'plain') return <SimpleEditor {...props} />
  return <RichEditor {...props} />
}
