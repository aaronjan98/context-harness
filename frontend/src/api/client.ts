/**
 * Typed HTTP client for the FastAPI backend.
 *
 * Uses openapi-fetch, which takes src/api/schema.ts as a type parameter.
 * Every request and response is typed end-to-end — wrong shapes are caught
 * at compile time, not at runtime.
 *
 * schema.ts is GENERATED. Regenerate it when the backend changes:
 *   npm run generate:api
 *
 * Never hand-edit schema.ts.
 *
 * See project-memory/frontend-architecture.md § API client layer for details.
 */

import createClient from 'openapi-fetch'
import type { paths } from './schema'

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? ''

export const api = createClient<paths>({
  baseUrl: apiBaseUrl,
})
