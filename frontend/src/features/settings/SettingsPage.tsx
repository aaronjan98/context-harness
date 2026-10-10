import { Link } from '@tanstack/react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useSettingsStore } from '@/store/settings'
import type { EditorMode } from '@/store/settings'
import { fetchSettings, patchSettings } from '@/api/conversations'

export function SettingsPage() {
  const editorMode = useSettingsStore((state) => state.editorMode)
  const setEditorMode = useSettingsStore((state) => state.setEditorMode)
  const latexSuiteEnabled = useSettingsStore((state) => state.latexSuiteEnabled)
  const setLatexSuiteEnabled = useSettingsStore((state) => state.setLatexSuiteEnabled)
  const cursorColor = useSettingsStore((state) => state.cursorColor)
  const setCursorColor = useSettingsStore((state) => state.setCursorColor)
  const latexSuitePath = useSettingsStore((state) => state.latexSuitePath)
  const setLatexSuitePath = useSettingsStore((state) => state.setLatexSuitePath)
  const theme = useSettingsStore((state) => state.theme)
  const setTheme = useSettingsStore((state) => state.setTheme)

  const queryClient = useQueryClient()

  const { data: serverSettings } = useQuery({
    queryKey: ['settings'],
    queryFn: fetchSettings,
  })

  const { mutate: saveServerSettings, isPending: isSaving } = useMutation({
    mutationFn: patchSettings,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] })
    },
  })

  return (
    <div className="cf-settings-page">
      <div className="cf-settings-header">
        <div>
          <h1>Settings</h1>
          <p>Local editor preferences and automation configuration.</p>
        </div>
        <Link to="/conversations" className="cf-link-pill">
          Back to conversations
        </Link>
      </div>

      {/* ── Appearance ─────────────────────────────────────────────────────── */}
      <section className="cf-settings-section">
        <h2>Appearance</h2>
        <label className="cf-settings-field">
          <span>Theme</span>
          <div className="cf-settings-toggle-row">
            <button
              type="button"
              className={`cf-settings-theme-btn ${theme === 'light' ? 'cf-settings-theme-btn--active' : ''}`}
              onClick={() => setTheme('light')}
            >
              Light
            </button>
            <button
              type="button"
              className={`cf-settings-theme-btn ${theme === 'dark' ? 'cf-settings-theme-btn--active' : ''}`}
              onClick={() => setTheme('dark')}
            >
              Dark
            </button>
          </div>
        </label>
      </section>

      {/* ── Automation ─────────────────────────────────────────────────────── */}
      <section className="cf-settings-section">
        <h2>Automation</h2>

        <label className="cf-settings-field">
          <span>Auto-run commands</span>
          <label className="cf-settings-checkbox">
            <input
              type="checkbox"
              checked={serverSettings?.auto_run ?? false}
              onChange={(event) =>
                saveServerSettings({ auto_run: event.target.checked })
              }
              disabled={isSaving}
            />
            <span>
              Automatically execute safe (read-only) commands without clicking Run.
              Modifying commands still require approval and send a desktop
              notification.
            </span>
          </label>
        </label>

        <p className="cf-settings-note">
          Approval prompts and timeouts pop a desktop notification via
          notify-send, shown by the laptop's notification daemon (quickshell).
        </p>
      </section>

      {/* ── Editor ─────────────────────────────────────────────────────────── */}
      <section className="cf-settings-section">
        <h2>Editor</h2>
        <label className="cf-settings-field">
          <span>Editor mode</span>
          <select
            value={editorMode}
            onChange={(event) => setEditorMode(event.target.value as EditorMode)}
          >
            <option value="vim">Vim</option>
            <option value="plain">Plain</option>
          </select>
        </label>
        <label className="cf-settings-field">
          <span>Cursor color</span>
          <div className="cf-settings-color-row">
            <input
              type="color"
              value={cursorColor}
              onChange={(event) => setCursorColor(event.target.value)}
            />
            <input
              type="text"
              value={cursorColor}
              onChange={(event) => setCursorColor(event.target.value)}
            />
          </div>
        </label>
        <label className="cf-settings-field">
          <span>LaTeX Suite</span>
          <label className="cf-settings-checkbox">
            <input
              type="checkbox"
              checked={latexSuiteEnabled}
              onChange={(event) => setLatexSuiteEnabled(event.target.checked)}
              disabled={editorMode !== 'vim'}
            />
            <span>Enable autosnippets in Vim mode</span>
          </label>
        </label>
      </section>

      {/* ── LaTeX Suite ────────────────────────────────────────────────────── */}
      <section className="cf-settings-section">
        <h2>LaTeX Suite</h2>
        <label className="cf-settings-field">
          <span>Shortcut source path</span>
          <input
            type="text"
            value={latexSuitePath}
            onChange={(event) => setLatexSuitePath(event.target.value)}
          />
        </label>
        <p className="cf-settings-note">
          Context Forge asks the local backend to load this Obsidian
          latex-suite shortcut file when Vim mode snippets are enabled.
        </p>
      </section>
    </div>
  )
}
