/**
 * Desktop panel data plane, mounted on the host webServer (loopback only —
 * the phone never talks to this surface; it uses the plugin's own LAN
 * server). Read-only today: `GET /remote-ctrl/api/status` returns everything
 * the panel renders (listening state, per-address URLs, QR payload, token,
 * connected clients). Mirrors the dsh-agent-extension admission fence.
 *
 * @module dsh-remote-ctrl/ui-routes
 */

import type { IncomingMessage, ServerResponse } from 'node:http'
import type { RemoteCtrl } from './remote-ctrl.ts'

const API_PREFIX = '/remote-ctrl/api'
const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]'])

/** Hostname of the Host header (port stripped; IPv6 keeps its brackets). */
function hostnameOf(hostHeader: unknown): string {
  const value = String(hostHeader ?? '').trim().toLowerCase()
  if (value.startsWith('[')) {
    const end = value.indexOf(']')
    return end === -1 ? value : value.slice(0, end + 1)
  }
  const colon = value.lastIndexOf(':')
  return colon === -1 ? value : value.slice(0, colon)
}

/** Header value as a lowercase string (array headers join on their first value). */
function headerValue(request: IncomingMessage, name: string): string {
  const value = request.headers[name]
  if (Array.isArray(value)) return String(value[0] ?? '').toLowerCase()
  return String(value ?? '').toLowerCase()
}

/** Loopback-only + same-origin-mutation admission (hub `isAdmitted` shape). */
export function isAdmitted(request: IncomingMessage): boolean {
  const hostHeader = String(request.headers.host ?? '')
  if (!LOOPBACK_HOSTS.has(hostnameOf(hostHeader))) return false
  const method = String(request.method ?? 'GET').toUpperCase()
  if (method === 'GET' || method === 'HEAD') return true
  if (headerValue(request, 'sec-fetch-site') === 'cross-site') return false
  const origin = request.headers.origin
  if (origin !== undefined && String(origin) !== `http://${hostHeader}` && String(origin) !== `https://${hostHeader}`) return false
  return headerValue(request, 'content-type').includes('application/json')
}

/** Mount status. */
export interface UiRoutesStatus {
  active: boolean
  reason: string
  path: string
  dispose: () => void
}

/**
 * Mount the panel API on the host webServer. Synchronous first; the caller
 * falls back to `ctx.inject(['webServer'], …)` when the service is pending.
 */
export function mountUiRoutes(ctx: unknown, ctrl: RemoteCtrl): UiRoutesStatus {
  const source = ctx as { get?: (name: string) => unknown, webServer?: unknown } | null
  const webServer = source?.get?.('webServer') ?? source?.webServer
  const inactive = (reason: string): UiRoutesStatus => ({ active: false, reason, path: API_PREFIX, dispose: () => {} })
  if (!webServer || typeof (webServer as { register?: unknown }).register !== 'function') {
    return inactive('宿主未提供 webServer 服务，桌面面板数据面不可用')
  }
  const handle = (request: IncomingMessage, response: ServerResponse): void => {
    if (!isAdmitted(request)) {
      sendJson(response, 403, { ok: false, error: '拒绝访问：面板 API 只允许本机回环页面的同源请求', code: 'forbidden' })
      return
    }
    const pathname = String(request.url ?? '/').split('?')[0] ?? ''
    const route = pathname.startsWith(API_PREFIX) ? pathname.slice(API_PREFIX.length) || '/' : pathname
    const method = String(request.method ?? 'GET').toUpperCase()
    if (route === '/status' && (method === 'GET' || method === 'HEAD')) {
      const body = JSON.stringify({ ok: true, data: ctrl.panelStatus() })
      response.writeHead(200, {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'no-store',
        'content-length': Buffer.byteLength(body),
      })
      response.end(body)
      return
    }
    if (route === '/status') {
      sendJson(response, 405, { ok: false, error: `不支持的请求方法：${method}`, code: 'method_not_allowed' })
      return
    }
    sendJson(response, 404, { ok: false, error: `未知接口：${route}`, code: 'not_found' })
  }
  const dispose = (webServer as {
    register(route: { kind: 'prefix', path: string, handler: (request: IncomingMessage, response: ServerResponse) => void }): () => void
  }).register({ kind: 'prefix', path: API_PREFIX, handler: handle })
  ctrl.log('info', `桌面面板 API 已挂载：${API_PREFIX}`)
  return { active: true, reason: '', path: API_PREFIX, dispose }
}

function sendJson(response: ServerResponse, status: number, payload: unknown): void {
  const body = JSON.stringify(payload)
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'content-length': Buffer.byteLength(body),
  })
  response.end(body)
}
