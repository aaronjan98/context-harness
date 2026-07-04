import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type EditorMode = 'plain' | 'vim'
export type Theme = 'light' | 'dark'

const THEME_STORAGE_KEY = 'context-forge-theme'

function getInitialTheme(): Theme {
  const saved = window.localStorage.getItem(THEME_STORAGE_KEY)
  if (saved === 'light' || saved === 'dark') return saved
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

interface SettingsState {
  editorMode: EditorMode
  setEditorMode: (mode: EditorMode) => void
  latexSuiteEnabled: boolean
  setLatexSuiteEnabled: (enabled: boolean) => void
  cursorColor: string
  setCursorColor: (color: string) => void
  latexSuitePath: string
  setLatexSuitePath: (path: string) => void
  theme: Theme
  setTheme: (theme: Theme) => void
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
      theme: getInitialTheme(),
      setTheme: (theme) => set({ theme }),
    }),
    { name: 'context-forge-settings' },
  ),
)
