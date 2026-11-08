/**
 * Host-side HTTP API of the store panel.
 *
 * Design:
 * - One `prefix` route `/agent-plugin/api`; this module dispatches inside;
 * - Loopback only (the Host header must be 127.0.0.1 / localhost / [::1]) so a
 *   remote Web UI can never reach install/uninstall; remote use needs an
 *   authorization design first;
 * - Mutating requests require a same-origin Origin + `application/json`,
 *   blocking cross-site form CSRF; a browser-sent `sec-fetch-site: cross-site`
 *   is rejected outright;
 * - Success `{ok:true,data}`; failure `{ok:false,error,code}` with the HTTP
 *   status matching the code;
 * - GET is read-only (`/store` offline, `/describe` offline, `/icon` raster
 *   only); only `POST /describe {fetch:true}` may refresh a market / clone a
 *   source for the detail view.
 *
 * @module dsh-agent-plugin-hub/ui-routes
 */

import { readFileSync } from 'node:fs'

import { asHubError, hubError } from './hub.ts'
import {
  MAX_ICON_BYTES,
  buildDescribe,
  buildMarketSummary,
  buildStoreSnapshot,
  resolveStoreIconFile,
} from './ui-data.ts'
import type { AgentPluginHub } from './hub.ts'
import type { WebRequest } from './host.ts'
import type { ServerResponse, IncomingMessage } from 'node:http'

const API_PREFIX = '/agent-plugin/api'
const MAX_BODY_BYTES = 256 * 1024
const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]'])

/** GET routes (read-only, offline). */
const GET_ROUTES = new Set(['/store', '/describe', '/icon'])
/** POST routes (may write; only /describe with fetch:true goes online). */
const POST_ROUTES = new Set([
  '/describe',
  '/market/add',
  '/market/preview',
  '/market/refresh',
  '/market/remove',
  '/install',
  '/uninstall',
  '/enable',
  '/update',
  '/update-all',
  '/rollback',
  '/capability',
])

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
function headerValue(request: WebRequest, name: string): string {
  const value = request.headers?.[name]
  if (Array.isArray(value)) return String(value[0] ?? '').toLowerCase()
  return String(value ?? '').toLowerCase()
}

/** Whether this request may reach the plugin API. */
export function isAdmitted(request: WebRequest): boolean {
  const hostHeader = String(request.headers?.host ?? '')
  if (!LOOPBACK_HOSTS.has(hostnameOf(hostHeader))) return false
  const method = String(request.method ?? 'GET').toUpperCase()
  if (method === 'GET' || method === 'HEAD') return true
  // A browser-attested cross-site request never passes, whatever the Origin says.
  if (headerValue(request, 'sec-fetch-site') === 'cross-site') return false
  const origin = request.headers?.origin
  if (origin !== undefined && String(origin) !== `http://${hostHeader}` && String(origin) !== `https://${hostHeader}`) return false
  const contentType = headerValue(request, 'content-type')
  return contentType.includes('application/json')
}

/** Read a JSON request body (within the size cap). */
export function readJsonBody(request: IncomingMessage, limit: number = MAX_BODY_BYTES): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let size = 0
    request.on('data', (chunk: Buffer) => {
      size += chunk.length
      if (size > limit) {
        reject(hubError('请求体过大', 'bad_request'))
        request.destroy()
        return
      }
      chunks.push(chunk)
    })
    request.on('end', () => {
      if (chunks.length === 0) {
        resolve({})
        return
      }
      try {
        const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown
        if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
          reject(hubError('请求体必须是 JSON 对象', 'bad_request'))
          return
        }
        resolve(parsed as Record<string, unknown>)
      } catch (error) {
        reject(hubError(`请求体不是合法 JSON：${error instanceof Error ? error.message : String(error)}`, 'bad_request'))
      }
    })
    request.on('error', error => reject(error))
  })
}

/** Write a JSON response. */
export function sendJson(response: ServerResponse, status: number, payload: unknown): void {
  const body = JSON.stringify(payload)
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'content-length': Buffer.byteLength(body),
  })
  response.end(body)
}

/** Unified error envelope (code + suggested status + in-flight operation details). */
export function sendError(response: ServerResponse, error: unknown): void {
  const normalized = asHubError(error)
  const payload: { ok: false, error: string, code: string, details?: Record<string, unknown> } = {
    ok: false,
    error: normalized.message,
    code: normalized.code,
  }
  if (normalized.operation) payload.details = { operation: normalized.operation }
  sendJson(response, normalized.status ?? 400, payload)
}

/** One query parameter. */
function queryParam(request: WebRequest, name: string): string {
  const url = new URL(String(request.url ?? '/'), 'http://localhost')
  return url.searchParams.get(name) ?? ''
}

function nonEmptyString(value: unknown): string {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : ''
}

/** Unified key / name / market extraction for write endpoints. */
function targetOf(body: Record<string, unknown> = {}): { key: string, market: string, name: string } {
  const key = nonEmptyString(body.key)
  if (key !== '') {
    const slash = key.indexOf('/')
    if (slash > 0) {
      return { key, market: key.slice(0, slash), name: key.slice(slash + 1) }
    }
    return { key, market: '', name: key }
  }
  return { key: '', market: nonEmptyString(body.market), name: nonEmptyString(body.name) }
}

/** key-or-name argument of installed-plugin actions. */
function keyOrNameOf(body: Record<string, unknown> = {}): string {
  return nonEmptyString(body.key) || nonEmptyString(body.name)
}

/** Record summary inside install/update responses. */
function recordSummary(record: {
  key: string
  name: string
  version: string
  format: string
  market: string
  enabled?: boolean
  installedAt?: string
  installedPath?: string
  capabilities?: Record<string, unknown>
  previousVersions?: Array<{ version: string }>
}): Record<string, unknown> {
  return {
    key: record.key,
    name: record.name,
    version: record.version,
    format: record.format,
    market: record.market,
    enabled: record.enabled !== false,
    installedAt: record.installedAt ?? '',
    installedPath: record.installedPath ?? '',
    capabilities: record.capabilities ?? { skills: [], commands: [], hooks: [], mcpServers: [] },
    previousVersions: (record.previousVersions ?? []).map(item => item.version),
  }
}

/** Serve the binary icon; missing/out-of-bounds/non-raster all answer 404 JSON. */
function serveIcon(hub: AgentPluginHub, request: WebRequest, response: ServerResponse): void {
  const key = queryParam(request, 'key')
  const found = resolveStoreIconFile(hub, key)
  if (!found) {
    sendJson(response, 404, { ok: false, error: '未找到图标', code: 'not_found' })
    return
  }
  let data: Buffer
  try {
    data = readFileSync(found.file)
  } catch {
    sendJson(response, 404, { ok: false, error: '未找到图标', code: 'not_found' })
    return
  }
  if (data.length > MAX_ICON_BYTES) {
    sendJson(response, 404, { ok: false, error: '图标文件过大', code: 'not_found' })
    return
  }
  response.writeHead(200, {
    'content-type': found.mime,
    'content-length': data.length,
    'cache-control': 'public, max-age=300',
    'x-content-type-options': 'nosniff',
  })
  response.end(data)
}

/** Mount status. */
export interface UiRoutesStatus {
  active: boolean
  reason: string
  path: string
  dispose: () => void
}

/**
 * Mount the plugin API.
 *
 * @param ctx - host cordis context.
 * @param hub - the hub instance.
 */
export function mountUiRoutes(ctx: unknown, hub: AgentPluginHub): UiRoutesStatus {
  const webServer = (ctx as { get?: (name: string) => unknown } | null)?.get?.('webServer')
    ?? (ctx as { webServer?: unknown } | null)?.webServer
  if (!webServer || typeof (webServer as { register?: unknown }).register !== 'function') {
    const status: UiRoutesStatus = {
      active: false,
      reason: '宿主未提供 webServer 服务，插件页 UI 不可用',
      path: API_PREFIX,
      dispose: () => {},
    }
    hub.uiRoutes = { active: status.active, reason: status.reason, path: API_PREFIX }
    return status
  }
  const handle = async (request: IncomingMessage, response: ServerResponse): Promise<void> => {
    const webRequest: WebRequest = {
      method: request.method,
      url: request.url,
      headers: request.headers as WebRequest['headers'],
    }
    if (!isAdmitted(webRequest)) {
      sendJson(response, 403, {
        ok: false,
        error: '拒绝访问：插件 API 只允许本机回环页面的同源请求',
        code: 'forbidden',
      })
      return
    }
    const url = new URL(String(request.url ?? '/'), 'http://localhost')
    const route = url.pathname.slice(API_PREFIX.length) || '/'
    const method = String(request.method ?? 'GET').toUpperCase()
    try {
      if (method === 'GET' && route === '/store') {
        sendJson(response, 200, { ok: true, data: await buildStoreSnapshot(hub) })
        return
      }
      if (method === 'GET' && route === '/describe') {
        const data = await buildDescribe(hub, {
          key: queryParam(webRequest, 'key'),
          market: queryParam(webRequest, 'market'),
          name: queryParam(webRequest, 'name'),
          fetch: false,
        })
        sendJson(response, 200, { ok: true, data })
        return
      }
      if (method === 'GET' && route === '/icon') {
        serveIcon(hub, webRequest, response)
        return
      }
      if (POST_ROUTES.has(route) && method === 'POST') {
        const body = await readJsonBody(request)
        const data = await dispatch(hub, route, body)
        sendJson(response, 200, { ok: true, data })
        return
      }
      if (GET_ROUTES.has(route) || POST_ROUTES.has(route)) {
        sendJson(response, 405, { ok: false, error: `不支持的请求方法：${method}`, code: 'method_not_allowed' })
        return
      }
      sendJson(response, 404, { ok: false, error: `未知接口：${route}`, code: 'not_found' })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      hub.log('warn', `插件页 API ${route} 失败：${message}`)
      sendError(response, error)
    }
  }
  const dispose = (webServer as { register(route: { kind: 'prefix', path: string, handler: (request: IncomingMessage, response: ServerResponse) => Promise<void> }): () => void })
    .register({ kind: 'prefix', path: API_PREFIX, handler: handle })
  const status: UiRoutesStatus = { active: true, reason: '', path: API_PREFIX, dispose }
  hub.uiRoutes = { active: true, reason: '', path: API_PREFIX }
  hub.log('info', `插件页 API 已挂载：${API_PREFIX}`)
  return status
}

/** POST route dispatch. */
async function dispatch(hub: AgentPluginHub, route: string, body: Record<string, unknown> = {}): Promise<unknown> {
  switch (route) {
    case '/describe':
      return await buildDescribe(hub, {
        key: nonEmptyString(body.key),
        market: nonEmptyString(body.market),
        name: nonEmptyString(body.name),
        fetch: body.fetch === true,
      })
    case '/market/add': {
      const market = await hub.marketAdd({
        location: String(body.location ?? ''),
        ...(body.name !== undefined && body.name !== null ? { name: String(body.name) } : {}),
        ...(body.format !== undefined && body.format !== null ? { format: String(body.format) } : {}),
        ...(body.type !== undefined && body.type !== null ? { type: String(body.type) } : {}),
        ...(nonEmptyString(body.clientOpId) !== '' ? { clientOpId: nonEmptyString(body.clientOpId) } : {}),
      })
      return {
        message: `市场已添加：${market.name}`,
        market: buildMarketSummary(hub, market),
        detectedType: market.type,
        format: market.format,
        pluginCount: (market.plugins ?? []).length,
        refreshError: nonEmptyString(market.refreshError) || null,
      }
    }
    case '/market/preview': {
      const data = await hub.marketPreview({
        location: String(body.location ?? ''),
        ...(body.format !== undefined && body.format !== null ? { format: String(body.format) } : {}),
        refresh: body.refresh === true,
      })
      return { ...data, pluginCount: data.plugins.length }
    }
    case '/market/refresh': {
      const result = await hub.marketRefresh(nonEmptyString(body.id))
      const message = result.refreshed.length === 0 && result.failures.length === 0
        ? '没有市场可刷新'
        : `已刷新 ${result.refreshed.length} 个市场${result.failures.length > 0 ? `，${result.failures.length} 个失败` : ''}`
      return {
        message,
        refreshed: result.refreshed.map(market => buildMarketSummary(hub, market)),
        failures: result.failures,
        stats: {
          total: result.refreshed.length + result.failures.length,
          ok: result.refreshed.length,
          failed: result.failures.length,
        },
      }
    }
    case '/market/remove': {
      const result = await hub.marketRemove(nonEmptyString(body.id))
      return { message: `已移除市场：${nonEmptyString(body.id)}`, orphaned: result.orphaned }
    }
    case '/install': {
      const target = targetOf(body)
      const result = await hub.install({
        market: target.market,
        name: target.name,
        force: body.force === true,
        refresh: body.refresh !== false,
        ...(nonEmptyString(body.clientOpId) !== '' ? { clientOpId: nonEmptyString(body.clientOpId) } : {}),
      })
      return {
        message: `安装完成：${result.record.name}@${result.record.version}`,
        installed: recordSummary(result.record),
        replaced: result.replaced === true,
        warnings: result.warnings ?? [],
      }
    }
    case '/uninstall': {
      const record = await hub.uninstall(keyOrNameOf(body))
      return { message: `已卸载：${record.name}@${record.version}`, key: record.key }
    }
    case '/enable': {
      const record = await hub.setEnabled(keyOrNameOf(body), body.enabled === true)
      return {
        message: `${record.name} 已${record.enabled ? '启用' : '禁用'}`,
        key: record.key,
        enabled: record.enabled,
      }
    }
    case '/update': {
      const result = await hub.update(keyOrNameOf(body), body.force === true, {
        refresh: body.refresh !== false,
        ...(nonEmptyString(body.clientOpId) !== '' ? { clientOpId: nonEmptyString(body.clientOpId) } : {}),
      })
      return {
        message: result.message,
        changed: result.changed === true,
        key: result.record?.key ?? keyOrNameOf(body),
        previousVersion: result.previousVersion ?? null,
        record: result.record ? recordSummary(result.record) : null,
        warnings: result.warnings ?? [],
      }
    }
    case '/update-all': {
      const result = await hub.updateAll({
        force: body.force === true,
        keys: Array.isArray(body.keys) ? body.keys.map(String) : [],
        ...(nonEmptyString(body.clientOpId) !== '' ? { clientOpId: nonEmptyString(body.clientOpId) } : {}),
      })
      return {
        message: result.message,
        succeeded: result.succeeded,
        failed: result.failed,
        aborted: result.aborted === true,
        marketFailures: result.marketFailures,
        summary: result.summary,
      }
    }
    case '/rollback': {
      const targetVersion = typeof body.version === 'string' && body.version.trim() !== '' ? body.version.trim() : undefined
      const result = await hub.rollback(keyOrNameOf(body), targetVersion)
      return {
        message: `已回滚 ${result.record.name}：${result.previousVersion} → ${result.record.version}`,
        key: result.record.key,
        version: result.record.version,
        previousVersion: result.previousVersion,
      }
    }
    case '/capability': {
      const record = await hub.setCapabilityEnabled(
        keyOrNameOf(body),
        String(body.kind ?? ''),
        String(body.capability ?? ''),
        body.enabled === true,
      )
      return {
        message: `${body.enabled === true ? '启用' : '禁用'} ${String(body.capability ?? '')}`,
        key: record.key,
        plugin: record.key,
        disabledCapabilities: record.disabledCapabilities,
      }
    }
    default:
      throw hubError(`未知接口：${route}`, 'not_found')
  }
}
