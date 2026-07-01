import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type EditorMode = 'plain' | 'vim'

interface SettingsState {
  editorMode: EditorMode
  setEditorMode: (mode: EditorMode) => void
  latexSuiteEnabled: boolean
  setLatexSuiteEnabled: (enabled: boolean) => void
  cursorColor: string
  setCursorColor: (color: string) => void
  latexSuitePath: string
  setLatexSuitePath: (path: string) => void
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      editorMode: 'vim',
      setEditorMode: (mode) => set({ editorMode: mode }),
      latexSuiteEnabled: true,
      setLatexSuiteEnabled: (enabled) => set({ latexSuiteEnabled: enabled }),
      cursorColor: '#ff2800',
      setCursorColor: (color) => set({ cursorColor: color }),
      latexSuitePath:
        '~/Repositories/self-hosted/zettelkasten/Documents/shortcuts.json',
      setLatexSuitePath: (path) => set({ latexSuitePath: path }),
    }),
    { name: 'context-forge-settings' },
  ),
)
