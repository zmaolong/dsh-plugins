/**
 * HTTP data channel of the plugin panel: same-origin fetch against the host's
 * `/agent-plugin/api` prefix with the `{ok,data}` / `{ok:false,error,code}`
 * envelope unwrapped into typed results.
 *
 * @module dsh-agent-extension/client/api
 */

/** Response envelope shape of the plugin API. */
interface ApiEnvelope {
  ok?: unknown
  data?: unknown
  error?: unknown
  code?: unknown
}

/** Envelope error carrying the host's stable code. */
export class ApiError extends Error {
  readonly code: string

  constructor(message: string, code: string) {
    super(message)
    this.name = 'ApiError'
    this.code = code
  }
}

/** Options of one API call. */
export interface ApiOptions {
  method?: 'GET' | 'POST'
  body?: unknown
  timeoutMs?: number
}

const API_BASE = '/agent-plugin/api'

/** Call one plugin API endpoint and return its `data`. */
export async function api<T = unknown>(path: string, options: ApiOptions = {}): Promise<T> {
  const method = options.method ?? 'GET'
  const timeoutMs = options.timeoutMs ?? 120000
  const init: RequestInit = { method, cache: 'no-store', headers: { 'content-type': 'application/json' } }
  if (options.body !== undefined) init.body = JSON.stringify(options.body)
  if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
    init.signal = AbortSignal.timeout(timeoutMs)
  }
  const response = await fetch(`${API_BASE}${path}`, init)
  let payload: ApiEnvelope | null = null
  try {
    payload = await response.json() as ApiEnvelope
  } catch {
    payload = null
  }
  if (!response.ok || payload === null || payload.ok !== true) {
    const message = payload !== null && typeof payload.error === 'string' ? payload.error : `HTTP ${response.status}`
    const code = payload !== null && typeof payload.code === 'string' ? payload.code : ''
    throw new ApiError(message, code)
  }
  return payload.data as T
}
