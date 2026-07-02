import { resolveApiUrl, toApiError } from './conversations'

export interface LatexSuiteShortcutResponse {
  trigger: string
  replacement: string
  options: string
  priority: number
  regex: boolean
  description?: string
}

export interface LatexSuiteSnippetsResponse {
  path: string
  snippets: LatexSuiteShortcutResponse[]
  unsupported_count: number
  unsupported_reasons: string[]
}

const snippetCache = new Map<string, Promise<LatexSuiteSnippetsResponse>>()

export function fetchLatexSuiteSnippets(
  path: string,
): Promise<LatexSuiteSnippetsResponse> {
  const cached = snippetCache.get(path)
  if (cached) return cached

  const request = fetch(
    resolveApiUrl(`/api/latex-suite/snippets?path=${encodeURIComponent(path)}`),
  ).then(async (response) => {
    const payload = await response.json().catch(() => null)
    if (!response.ok) throw toApiError(payload, response)
    return payload as LatexSuiteSnippetsResponse
  })

  snippetCache.set(path, request)
  request.catch(() => snippetCache.delete(path))
  return request
}
