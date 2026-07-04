import { useState } from 'react'
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

  // Pushbullet token local state — cleared after save
  const [tokenDraft, setTokenDraft] = useState('')
  const [showToken, setShowToken] = useState(false)
  const [tokenStatus, setTokenStatus] = useState<string | null>(null)

  function saveToken() {
    const token = tokenDraft.trim()
    if (!token) return
    saveServerSettings(
      { pushbullet_token: token },
      {
        onSuccess: () => {
          setTokenDraft('')
          setShowToken(false)
          setTokenStatus('Token saved.')
          window.setTimeout(() => setTokenStatus(null), 3000)
        },
      },
    )
  }

  function clearToken() {
    saveServerSettings(
      { pushbullet_token: '' },
      {
        onSuccess: () => {
          setTokenStatus('Token removed.')
          window.setTimeout(() => setTokenStatus(null), 3000)
        },
      },
    )
  }

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
              Modifying commands still require approval and send a Pushbullet
              notification.
            </span>
          </label>
        </label>

        <div className="cf-settings-field">
          <span>Pushbullet token</span>
          <div className="cf-settings-token-area">
            {serverSettings?.pushbullet_configured && !tokenDraft && (
              <div className="cf-settings-token-status">
                <span className="cf-settings-token-configured">✓ Token configured</span>
                <button
                  type="button"
                  className="cf-settings-token-action"
                  onClick={() => setShowToken(true)}
                >
                  Replace
                </button>
                <button
                  type="button"
                  className="cf-settings-token-action cf-settings-token-danger"
                  onClick={clearToken}
                  disabled={isSaving}
                >
                  Remove
                </button>
              </div>
            )}
            {(!serverSettings?.pushbullet_configured || tokenDraft || showToken) && (
              <div className="cf-settings-token-input-row">
                <input
                  type={showToken ? 'text' : 'password'}
                  value={tokenDraft}
                  onChange={(event) => setTokenDraft(event.target.value)}
                  onKeyDown={(event) => { if (event.key === 'Enter') saveToken() }}
                  placeholder="o.xxxxxxxxxxxxxxxxxxxxxxxx"
                  className="cf-settings-token-input"
                  autoComplete="off"
                />
                <button
                  type="button"
                  className="cf-settings-token-action"
                  onClick={() => setShowToken((v) => !v)}
                >
                  {showToken ? 'Hide' : 'Show'}
                </button>
                <button
                  type="button"
                  className="cf-primary-button"
                  onClick={saveToken}
                  disabled={!tokenDraft.trim() || isSaving}
                >
                  {isSaving ? 'Saving…' : 'Save'}
                </button>
                {serverSettings?.pushbullet_configured && (
                  <button
                    type="button"
                    className="cf-secondary-button"
                    onClick={() => { setTokenDraft(''); setShowToken(false) }}
                  >
                    Cancel
                  </button>
                )}
              </div>
            )}
            {tokenStatus && (
              <div className="cf-settings-token-feedback">{tokenStatus}</div>
            )}
          </div>
          <p className="cf-settings-note">
            Sent to your phone when a command requires approval. Get your token
            at pushbullet.com → Settings → Account → Create Access Token.
          </p>
        </div>
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
