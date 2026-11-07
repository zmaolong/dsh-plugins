/**
 * 插件页 Web UI 的 Host 端 HTTP API。
 *
 * 设计：
 * - 只注册一条 `prefix` 命名路由 `/agent-plugin/api`，由本模块内部分发；
 * - 只接受本机回环访问（Host 头必须是 127.0.0.1 / localhost / [::1]），
 *   避免远端 Web UI 暴露安装/卸载能力；需要远端使用时再扩展授权。
 * - 变更类请求要求同源 Origin + `application/json`，阻断跨站表单 CSRF；
 * - 所有结果都是 `{ok:true,data}` / `{ok:false,error}`，错误信息中文可操作。
 *
 * @module dsh-agent-plugin-hub/ui-routes
 */

import { buildUiPluginDetail, buildUiState } from './ui-data.js'

const API_PREFIX = '/agent-plugin/api'
const MAX_BODY_BYTES = 256 * 1024
const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]'])

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
  if (origin !== undefined && origin !== `http://${hostHeader}`) return false
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

/** 从查询串取参数。 */
function queryParam(request, name) {
  const url = new URL(String(request.url ?? '/'), 'http://localhost')
  return url.searchParams.get(name) ?? ''
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
    const status = { active: false, reason: '宿主未提供 webServer 服务，插件页 UI 不可用', path: API_PREFIX, dispose: () => {} }
    hub.uiRoutes = { active: status.active, reason: status.reason, path: API_PREFIX }
    return status
  }
  const handle = async (request, response) => {
    if (!isAdmitted(request)) {
      sendJson(response, 403, { ok: false, error: '拒绝访问：插件 API 只允许本机回环页面的同源请求' })
      return
    }
    const url = new URL(String(request.url ?? '/'), 'http://localhost')
    const route = url.pathname.slice(API_PREFIX.length) || '/'
    const method = String(request.method ?? 'GET').toUpperCase()
    try {
      if (method === 'GET' && route === '/state') {
        sendJson(response, 200, { ok: true, data: buildUiState(hub) })
        return
      }
      if (method === 'GET' && route === '/plugin') {
        sendJson(response, 200, { ok: true, data: buildUiPluginDetail(hub, queryParam(request, 'key')) })
        return
      }
      if (method !== 'POST') {
        sendJson(response, 405, { ok: false, error: `不支持的请求方法：${method}` })
        return
      }
      const body = await readJsonBody(request)
      const data = await dispatch(hub, route, body)
      sendJson(response, 200, { ok: true, data })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      hub.store.log('warn', `插件页 API ${route} 失败：${message}`)
      sendJson(response, 400, { ok: false, error: message })
    }
  }
  const dispose = webServer.register({ kind: 'prefix', path: API_PREFIX, handler: handle })
  const status = { active: true, reason: '', path: API_PREFIX, dispose }
  hub.uiRoutes = { active: true, reason: '', path: API_PREFIX }
  hub.store.log('info', `插件页 API 已挂载：${API_PREFIX}`)
  return status
}

/** POST 路由分发。 */
async function dispatch(hub, route, body) {
  switch (route) {
    case '/market/add': {
      const market = await hub.marketAdd({
        type: body.type,
        location: body.location,
        name: body.name,
        format: body.format,
      })
      return { message: `市场已添加：${market.name}`, market: market.id }
    }
    case '/market/refresh': {
      const result = await hub.marketRefresh(body.id || undefined)
      const refreshed = result.refreshed.map((market) => ({
        id: market.id,
        plugins: market.plugins?.length ?? 0,
        refreshError: market.refreshError ?? '',
      }))
      return { refreshed, failures: result.failures }
    }
    case '/market/remove': {
      const removed = hub.marketRemove(body.id)
      return { message: `已移除市场：${removed.id}` }
    }
    case '/install': {
      const result = await hub.install({ name: body.name, market: body.market, force: body.force === true })
      return {
        message: `安装完成：${result.record.name}@${result.record.version}`,
        plugin: result.record.key,
        warnings: result.warnings,
      }
    }
    case '/uninstall': {
      const record = hub.uninstall(body.name)
      return { message: `已卸载：${record.name}@${record.version}` }
    }
    case '/enable': {
      const record = hub.setEnabled(body.name, body.enabled === true)
      return { message: `${record.name} 已${record.enabled ? '启用' : '禁用'}`, enabled: record.enabled }
    }
    case '/update': {
      const result = await hub.update(body.name, body.force === true)
      return { message: result.message, changed: result.changed }
    }
    case '/rollback': {
      const result = hub.rollback(body.name)
      return {
        message: `已回滚 ${result.record.name} 到 ${result.record.version}`,
        version: result.record.version,
      }
    }
    case '/capability': {
      const record = hub.setCapabilityEnabled(body.name, body.kind, body.capability, body.enabled === true)
      return {
        message: `${body.enabled === true ? '启用' : '禁用'} ${body.capability}`,
        plugin: record.key,
      }
    }
    default:
      throw new Error(`未知接口：${route}`)
  }
}