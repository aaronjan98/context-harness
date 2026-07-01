import { Link } from '@tanstack/react-router'
import { useUIStore } from '@/store/ui'
import type { EditorMode } from '@/store/ui'

export function SettingsPage() {
  const editorMode = useUIStore((state) => state.editorMode)
  const setEditorMode = useUIStore((state) => state.setEditorMode)
  const cursorColor = useUIStore((state) => state.cursorColor)
  const setCursorColor = useUIStore((state) => state.setCursorColor)
  const latexSuitePath = useUIStore((state) => state.latexSuitePath)
  const setLatexSuitePath = useUIStore((state) => state.setLatexSuitePath)

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
          This is stored now for configuration. Loading custom shortcut files
          from the browser will need a backend-backed settings step.
        </p>
      </section>
    </div>
  )
}
