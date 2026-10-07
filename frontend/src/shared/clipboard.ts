/**
 * Clipboard helper with an insecure-context fallback.
 *
 * navigator.clipboard only exists in a secure context — HTTPS or a `localhost`
 * origin. When the app is served over plain HTTP from any other host (e.g. the
 * `http://contextforge.local` Caddy alias), `navigator.clipboard` is undefined
 * and every `.writeText` call throws. Fall back to a hidden <textarea> +
 * document.execCommand('copy'), which still works on insecure origins.
 */
export async function copyText(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text)
      return
    } catch {
      // Permission denied or transient failure — fall through to execCommand.
    }
  }

  const textarea = document.createElement('textarea')
  textarea.value = text
  // Keep it out of view and out of the layout/scroll.
  textarea.style.position = 'fixed'
  textarea.style.top = '0'
  textarea.style.left = '0'
  textarea.style.width = '1px'
  textarea.style.height = '1px'
  textarea.style.opacity = '0'
  textarea.setAttribute('readonly', '')
  document.body.appendChild(textarea)
  textarea.select()
  textarea.setSelectionRange(0, text.length)

  try {
    const ok = document.execCommand('copy')
    if (!ok) throw new Error('execCommand("copy") returned false')
  } finally {
    document.body.removeChild(textarea)
  }
}
