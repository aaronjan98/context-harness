import { Link } from '@tanstack/react-router'
import { useSettingsStore } from '@/store/settings'
import type { EditorMode } from '@/store/settings'

export function SettingsPage() {
  const editorMode = useSettingsStore((state) => state.editorMode)
  const setEditorMode = useSettingsStore((state) => state.setEditorMode)
  const latexSuiteEnabled = useSettingsStore((state) => state.latexSuiteEnabled)
  const setLatexSuiteEnabled = useSettingsStore((state) => state.setLatexSuiteEnabled)
  const cursorColor = useSettingsStore((state) => state.cursorColor)
  const setCursorColor = useSettingsStore((state) => state.setCursorColor)
  const latexSuitePath = useSettingsStore((state) => state.latexSuitePath)
  const setLatexSuitePath = useSettingsStore((state) => state.setLatexSuitePath)

  return (
    <div className="cf-settings-page">
      <div className="cf-settings-header">
        <div>
          <h1>Settings</h1>
          <p>Local editor preferences for this browser.</p>
        </div>
        <Link to="/conversations" className="cf-link-pill">
          Back to conversations
        </Link>
      </div>

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
