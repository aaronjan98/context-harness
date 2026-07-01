import { useSettingsStore } from '@/store/settings'
import { RichEditor } from './RichEditor'
import { SimpleEditor } from './SimpleEditor'
import type { EditorProps } from './types'

export function Editor(props: EditorProps) {
  const editorMode = useSettingsStore((state) => state.editorMode)
  if (editorMode === 'plain') return <SimpleEditor {...props} />
  return <RichEditor {...props} />
}
