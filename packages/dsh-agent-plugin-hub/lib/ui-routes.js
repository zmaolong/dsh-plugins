/**
 * 商店面板的 Host 端 HTTP API。
 *
 * 设计：
 * - 只注册一条 `prefix` 命名路由 `/agent-plugin/api`，由本模块内部分发；
 * - 只接受本机回环访问（Host 头必须是 127.0.0.1 / localhost / [::1]），
 *   避免远端 Web UI 暴露安装/卸载能力；需要远端使用时再扩展授权；
 * - 变更类请求要求同源 Origin + `application/json`，阻断跨站表单 CSRF；
 * - 成功 `{ok:true,data}`；失败 `{ok:false,error,code}`，HTTP 状态与 code 一一对应；
 * - GET 只读（`/store` 不联网、`/describe` 不联网、`/icon` 只出 raster）；
 *   只有 `POST /describe {fetch:true}` 才允许为解析详情刷新市场/克隆来源。
 *
 * @module dsh-agent-plugin-hub/ui-routes
 */

import { readFileSync } from 'node:fs'

import { asHubError, hubError } from './hub.js'
import {
  MAX_ICON_BYTES,
  buildDescribe,
  buildMarketSummary,
  buildStoreSnapshot,
  resolveStoreIconFile,
} from './ui-data.js'

const API_PREFIX = '/agent-plugin/api'
const MAX_BODY_BYTES = 256 * 1024
const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]'])

/** GET 路由（只读、不联网）。 */
const GET_ROUTES = new Set(['/store', '/describe', '/icon'])
/** POST 路由（可能写盘；`fetch:true` 的 /describe 才联网）。 */
const POST_ROUTES = new Set([
  '/describe',
  '/market/add',
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

/** 取 Host 头里的主机名（去掉端口，保留 IPv6 方括号形式）。 */
function hostnameOf(hostHeader) {
  const value = String(hostHeader ?? '').trim().toLowerCase()
  if (value.startsWith('[')) {
    const end = value.indexOf(']')
    return end === -1 ? value : value.slice(0, end + 1)
  }
  const colon = value.lastIndexOf(':')
  return colon === -1 ? value : value.slice(0, colon)
}

/** 是否允许本次请求访问插件 API。 */
export function isAdmitted(request) {
  const hostHeader = String(request.headers?.host ?? '')
  if (!LOOPBACK_HOSTS.has(hostnameOf(hostHeader))) return false
  const method = String(request.method ?? 'GET').toUpperCase()
  if (method === 'GET' || method === 'HEAD') return true
  const origin = request.headers?.origin
  if (origin !== undefined && origin !== `http://${hostHeader}` && origin !== `https://${hostHeader}`) return false
  const contentType = String(request.headers?.['content-type'] ?? '').toLowerCase()
  return contentType.includes('application/json')
}

/** 读 JSON 请求体（大小上限内）。 */
export function readJsonBody(request, limit = MAX_BODY_BYTES) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    request.on('data', (chunk) => {
      size += chunk.length
      if (size > limit) {
        reject(new Error('请求体过大'))
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
        const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'))
        if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
          reject(new Error('请求体必须是 JSON 对象'))
          return
        }
        resolve(parsed)
      } catch (error) {
        reject(new Error(`请求体不是合法 JSON：${error instanceof Error ? error.message : String(error)}`))
      }
    })
    request.on('error', (error) => reject(error))
  })
}

/** 写 JSON 响应。 */
export function sendJson(response, status, payload) {
  const body = JSON.stringify(payload)
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'content-length': Buffer.byteLength(body),
  })
  response.end(body)
}

/** 统一错误信封（code + 建议状态码 + 进行中操作详情）。 */
export function sendError(response, error) {
  const normalized = asHubError(error)
  const payload = { ok: false, error: normalized.message, code: normalized.code }
  if (normalized.operation) payload.details = { operation: normalized.operation }
  sendJson(response, normalized.status ?? 400, payload)
}

/** 从查询串取参数。 */
function queryParam(request, name) {
  const url = new URL(String(request.url ?? '/'), 'http://localhost')
  return url.searchParams.get(name) ?? ''
}

function nonEmptyString(value) {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : ''
}

/** 写接口入参统一取 key / name / market。 */
function targetOf(body = {}) {
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

/** 取 key 或 name（已安装插件动作的入参）。 */
function keyOrNameOf(body = {}) {
  return nonEmptyString(body.key) || nonEmptyString(body.name)
}

/** 安装/更新响应里的记录摘要。 */
function recordSummary(record) {
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
    previousVersions: (record.previousVersions ?? []).map((item) => item.version),
  }
}

/** 二进制输出图标；找不到/越界/非 raster 一律 404 JSON。 */
function serveIcon(hub, request, response) {
  const key = queryParam(request, 'key')
  const found = resolveStoreIconFile(hub, key)
  if (!found) {
    sendJson(response, 404, { ok: false, error: '未找到图标', code: 'not_found' })
    return
  }
  let data
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

/**
 * 挂载插件 API。
 *
 * @param {object} ctx - Host cordis 上下文
 * @param {import('./hub.js').AgentPluginHub} hub
 * @returns {{active: boolean, reason: string, path: string, dispose: () => void}}
 */
export function mountUiRoutes(ctx, hub) {
  const webServer = ctx?.get?.('webServer')
  if (!webServer || typeof webServer.register !== 'function') {
    const status = {
      active: false,
      reason: '宿主未提供 webServer 服务，插件页 UI 不可用',
      path: API_PREFIX,
      dispose: () => {},
    }
    hub.uiRoutes = { active: status.active, reason: status.reason, path: API_PREFIX }
    return status
  }
  const handle = async (request, response) => {
    if (!isAdmitted(request)) {
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
          key: queryParam(request, 'key'),
          market: queryParam(request, 'market'),
          name: queryParam(request, 'name'),
          fetch: false,
        })
        sendJson(response, 200, { ok: true, data })
        return
      }
      if (method === 'GET' && route === '/icon') {
        serveIcon(hub, request, response)
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
      hub.store.log('warn', `插件页 API ${route} 失败：${message}`)
      sendError(response, error)
    }
  }
  const dispose = webServer.register({ kind: 'prefix', path: API_PREFIX, handler: handle })
  const status = { active: true, reason: '', path: API_PREFIX, dispose }
  hub.uiRoutes = { active: true, reason: '', path: API_PREFIX }
  hub.store.log('info', `插件页 API 已挂载：${API_PREFIX}`)
  return status
}

/** POST 路由分发。 */
async function dispatch(hub, route, body = {}) {
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
        location: body.location,
        name: body.name,
        format: body.format,
        type: body.type,
        clientOpId: body.clientOpId,
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
    case '/market/refresh': {
      const result = await hub.marketRefresh(nonEmptyString(body.id))
      const message = result.refreshed.length === 0 && result.failures.length === 0
        ? '没有市场可刷新'
        : `已刷新 ${result.refreshed.length} 个市场${result.failures.length > 0 ? `，${result.failures.length} 个失败` : ''}`
      return {
        message,
        refreshed: result.refreshed.map((market) => buildMarketSummary(hub, market)),
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
        clientOpId: body.clientOpId,
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
        clientOpId: body.clientOpId,
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
        keys: Array.isArray(body.keys) ? body.keys : [],
        clientOpId: body.clientOpId,
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
        body.kind,
        body.capability,
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