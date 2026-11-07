/**
 * 插件页 UI 的 Host 端测试：结构化数据、逐项启停、HTTP API 分发与访问控制。
 */

import assert from 'node:assert/strict'
import path from 'node:path'
import { Readable } from 'node:stream'
import { test } from 'node:test'

import { AgentPluginHub } from '../lib/hub.js'
import { buildUiPluginDetail, buildUiState } from '../lib/ui-data.js'
import { isAdmitted, mountUiRoutes } from '../lib/ui-routes.js'
import {
  cleanup,
  copyFixture,
  createFakeCtx,
  createFakeExecutor,
  listenerOf,
  tempHome,
} from './helpers.mjs'

/** 假 Host webServer：记录路由并返回注销函数。 */
function createFakeWebServer() {
  const routes = []
  return {
    routes,
    getOrigin() {
      return 'http://127.0.0.1:9271'
    },
    register(route) {
      routes.push(route)
      return () => {
        const index = routes.indexOf(route)
        if (index >= 0) routes.splice(index, 1)
      }
    },
  }
}

/** 调一次 API 路由，返回 {status, body}。 */
async function callRoute(route, { method = 'GET', url = '/agent-plugin/api/state', headers = {}, body = '' } = {}) {
  const request = new Readable({ read() {} })
  Object.assign(request, { method, url, headers })
  if (body !== '') request.push(body)
  request.push(null)
  const response = {
    status: 0,
    headers: {},
    body: '',
    writeHead(status, responseHeaders) {
      this.status = status
      this.headers = responseHeaders
    },
    end(chunk) {
      this.body = chunk ?? ''
    },
  }
  await route.handler(request, response)
  let parsed = null
  try {
    parsed = JSON.parse(response.body)
  } catch {
    parsed = null
  }
  return { status: response.status, body: parsed }
}

const LOOPBACK_HEADERS = { host: '127.0.0.1:9271' }
const POST_HEADERS = { host: '127.0.0.1:9271', origin: 'http://127.0.0.1:9271', 'content-type': 'application/json' }

async function setup(t) {
  const work = tempHome('hub-ui-')
  cleanup(t, work)
  const marketDir = copyFixture('claude-market', work)
  const executor = createFakeExecutor()
  const ctx = createFakeCtx()
  const webServer = createFakeWebServer()
  ctx.state.services.webServer = webServer
  const hub = new AgentPluginHub({ home: path.join(work, 'hub-home'), ctx, hookExecutor: executor })
  hub.start()
  const market = await hub.marketAdd({ type: 'local', location: marketDir })
  const installed = await hub.install({ name: 'demo-claude', market: market.id })
  const ui = mountUiRoutes(ctx, hub)
  assert.equal(ui.active, true)
  return { hub, ctx, executor, webServer, route: webServer.routes[0], record: installed.record, market }
}

test('ui-routes：挂载前缀路由并返回结构化状态', async (t) => {
  const { route, record } = await setup(t)
  assert.equal(route.kind, 'prefix')
  assert.equal(route.path, '/agent-plugin/api')
  const result = await callRoute(route, { headers: LOOPBACK_HEADERS })
  assert.equal(result.status, 200)
  assert.equal(result.body.ok, true)
  const data = result.body.data
  assert.equal(data.ui.active, true)
  assert.equal(data.plugins.length, 1)
  assert.equal(data.plugins[0].key, record.key)
  assert.equal(data.markets.length, 1)
  assert.equal(data.formats.length, 3)
  assert.equal(data.runtime.skills.registered, true)
})

test('ui-routes：插件详情包含技能/命令/hooks/MCP 与生效状态', async (t) => {
  const { route, record } = await setup(t)
  const key = encodeURIComponent(record.key)
  const result = await callRoute(route, { url: `/agent-plugin/api/plugin?key=${key}`, headers: LOOPBACK_HEADERS })
  assert.equal(result.status, 200)
  const detail = result.body.data
  assert.equal(detail.plugin.key, record.key)
  assert.deepEqual(detail.capabilities.skills.map((item) => item.name), ['greet'])
  assert.deepEqual(detail.capabilities.commands.map((item) => item.hostName), ['demo-claude-hello'])
  const pre = detail.capabilities.hooks.find((item) => item.event === 'PreToolUse')
  assert.equal(pre.effective, true)
  assert.equal(pre.host, 'tools/pre-execute')
  assert.equal(detail.capabilities.mcpServers.length, 2)
  assert.equal(detail.capabilities.mcpServers[0].effective, false)
})

test('逐项启停：技能禁用后 provider 不再列出，启用后恢复', async (t) => {
  const { route, ctx, record } = await setup(t)
  const provider = ctx.state.providers[0]
  const disable = await callRoute(route, {
    method: 'POST',
    url: '/agent-plugin/api/capability',
    headers: POST_HEADERS,
    body: JSON.stringify({ name: record.key, kind: 'skills', capability: 'greet', enabled: false }),
  })
  assert.equal(disable.status, 200, JSON.stringify(disable.body))
  assert.deepEqual(await provider.list({}), [])
  const enable = await callRoute(route, {
    method: 'POST',
    url: '/agent-plugin/api/capability',
    headers: POST_HEADERS,
    body: JSON.stringify({ name: record.key, kind: 'skills', capability: 'greet', enabled: true }),
  })
  assert.equal(enable.status, 200)
  assert.equal((await provider.list({})).length, 1)
})

test('逐项启停：命令禁用后宿主命令注销', async (t) => {
  const { route, ctx, record } = await setup(t)
  assert.equal(ctx.state.commands.has('demo-claude-hello'), true)
  const result = await callRoute(route, {
    method: 'POST',
    url: '/agent-plugin/api/capability',
    headers: POST_HEADERS,
    body: JSON.stringify({ name: record.key, kind: 'commands', capability: 'hello', enabled: false }),
  })
  assert.equal(result.status, 200)
  assert.equal(ctx.state.commands.has('demo-claude-hello'), false)
  await callRoute(route, {
    method: 'POST',
    url: '/agent-plugin/api/capability',
    headers: POST_HEADERS,
    body: JSON.stringify({ name: record.key, kind: 'commands', capability: 'hello', enabled: true }),
  })
  assert.equal(ctx.state.commands.has('demo-claude-hello'), true)
})

test('逐项启停：hooks 事件禁用后不再执行外部命令', async (t) => {
  const { route, ctx, executor, record } = await setup(t)
  const [preListener] = listenerOf(ctx, 'tools/pre-execute')
  const before = executor.calls.length
  await preListener({ name: 'Bash', arguments: {} }, async () => ({ kind: 'allow' }))
  assert.equal(executor.calls.length, before + 1)
  const disabled = await callRoute(route, {
    method: 'POST',
    url: '/agent-plugin/api/capability',
    headers: POST_HEADERS,
    body: JSON.stringify({ name: record.key, kind: 'hooks', capability: 'PreToolUse', enabled: false }),
  })
  assert.equal(disabled.status, 200)
  await preListener({ name: 'Bash', arguments: {} }, async () => ({ kind: 'allow' }))
  assert.equal(executor.calls.length, before + 1, '禁用的 hooks 事件不应执行')
  const detail = await callRoute(route, {
    url: `/agent-plugin/api/plugin?key=${encodeURIComponent(record.key)}`,
    headers: LOOPBACK_HEADERS,
  })
  const pre = detail.body.data.capabilities.hooks.find((item) => item.event === 'PreToolUse')
  assert.equal(pre.enabled, false)
})

test('逐项启停：MCP 清单启停只持久化（标注未生效）', async (t) => {
  const { route, hub, record } = await setup(t)
  const result = await callRoute(route, {
    method: 'POST',
    url: '/agent-plugin/api/capability',
    headers: POST_HEADERS,
    body: JSON.stringify({ name: record.key, kind: 'mcpServers', capability: 'fixture-fs', enabled: false }),
  })
  assert.equal(result.status, 200)
  const saved = hub.findRecord(record.key)
  assert.deepEqual(saved.disabledCapabilities.mcpServers, ['fixture-fs'])
  const detail = await callRoute(route, {
    url: `/agent-plugin/api/plugin?key=${encodeURIComponent(record.key)}`,
    headers: LOOPBACK_HEADERS,
  })
  const server = detail.body.data.capabilities.mcpServers.find((item) => item.name === 'fixture-fs')
  assert.equal(server.enabled, false)
  assert.equal(server.effective, false)
})

test('市场与安装 API：移除市场、卸载插件', async (t) => {
  const { route, hub, market } = await setup(t)
  const uninstall = await callRoute(route, {
    method: 'POST',
    url: '/agent-plugin/api/uninstall',
    headers: POST_HEADERS,
    body: JSON.stringify({ name: 'demo-claude' }),
  })
  assert.equal(uninstall.status, 200, JSON.stringify(uninstall.body))
  assert.equal(hub.state.plugins.length, 0)
  const remove = await callRoute(route, {
    method: 'POST',
    url: '/agent-plugin/api/market/remove',
    headers: POST_HEADERS,
    body: JSON.stringify({ id: market.id }),
  })
  assert.equal(remove.status, 200)
  assert.equal(hub.markets.list().length, 0)
})

test('访问控制：非回环 Host、跨源 POST、非 JSON 一律拒绝', async (t) => {
  const { route } = await setup(t)
  const remote = await callRoute(route, { headers: { host: '192.168.1.10:9271' } })
  assert.equal(remote.status, 403)
  const crossOrigin = await callRoute(route, {
    method: 'POST',
    url: '/agent-plugin/api/market/remove',
    headers: { host: '127.0.0.1:9271', origin: 'http://evil.example', 'content-type': 'application/json' },
    body: JSON.stringify({ id: 'x' }),
  })
  assert.equal(crossOrigin.status, 403)
  const plain = await callRoute(route, {
    method: 'POST',
    url: '/agent-plugin/api/market/remove',
    headers: { host: '127.0.0.1:9271', origin: 'http://127.0.0.1:9271', 'content-type': 'text/plain' },
    body: JSON.stringify({ id: 'x' }),
  })
  assert.equal(plain.status, 403)
  assert.equal(isAdmitted({ method: 'GET', headers: { host: 'localhost:9271' } }), true)
  assert.equal(isAdmitted({ method: 'GET', headers: { host: '[::1]:9271' } }), true)
  assert.equal(isAdmitted({ method: 'GET', headers: { host: 'example.com' } }), false)
})

test('非法请求体返回 400 且错误信息可读', async (t) => {
  const { route } = await setup(t)
  const badJson = await callRoute(route, {
    method: 'POST',
    url: '/agent-plugin/api/market/add',
    headers: POST_HEADERS,
    body: '{ 不是 JSON',
  })
  assert.equal(badJson.status, 400)
  assert.match(badJson.body.error, /JSON/)
  const unknown = await callRoute(route, {
    method: 'POST',
    url: '/agent-plugin/api/nope',
    headers: POST_HEADERS,
    body: '{}',
  })
  assert.equal(unknown.status, 400)
  assert.match(unknown.body.error, /未知接口/)
})

test('ui-data：buildUiState / buildUiPluginDetail 直接调用可用', async (t) => {
  const { hub, record } = await setup(t)
  const state = buildUiState(hub)
  assert.equal(state.plugins[0].key, record.key)
  assert.equal(state.markets[0].plugins.length, 3)
  const detail = buildUiPluginDetail(hub, record.key)
  assert.equal(detail.capabilities.hooks.length, 4)
  assert.equal(detail.capabilities.mcpServers.length, 2)
})

test('hooks：subprocess 服务晚到后执行器懒探测生效', async (t) => {
  const work = tempHome('hub-ui-')
  cleanup(t, work)
  const marketDir = copyFixture('claude-market', work)
  const ctx = createFakeCtx()
  // 初始没有 subprocess 服务，模拟宿主按服务可用性激活时本插件先启动
  const spawnCalls = []
  const hub = new AgentPluginHub({ home: path.join(work, 'hub-home'), ctx })
  hub.start()
  const market = await hub.marketAdd({ type: 'local', location: marketDir })
  await hub.install({ name: 'demo-claude', market: market.id })
  const [preListener] = listenerOf(ctx, 'tools/pre-execute')
  assert.ok(preListener, '即使 subprocess 未就绪也应注册工具事件监听')
  const before = await preListener({ name: 'Bash', arguments: {} }, async () => ({ kind: 'allow' }))
  assert.equal(before.kind, 'allow')
  assert.equal(spawnCalls.length, 0)
  assert.equal(hub.hooks.stats().events.find((item) => item.event === 'PreToolUse').effective, false)

  // 服务晚到：加入一个可用的假 subprocess
  ctx.state.services.subprocess = {
    async terminalEnvironment() {
      return { platform: 'posix', defaultShell: 'sh' }
    },
    async resolveExecutable(name) {
      return name
    },
    spawn(spec) {
      spawnCalls.push(spec)
      return {
        terminate() {},
        done: Promise.resolve({ exitCode: 0, signal: null }),
        collected: {
          stdout: { readFrom: () => ({ text: '' }) },
          stderr: { readFrom: () => ({ text: '' }) },
        },
      }
    },
  }
  const after = await preListener({ name: 'Bash', arguments: {} }, async () => ({ kind: 'allow' }))
  assert.equal(after.kind, 'allow')
  assert.equal(spawnCalls.length, 1, '服务到位后应真正执行 hook 命令')
  assert.equal(hub.hooks.stats().events.find((item) => item.event === 'PreToolUse').effective, true)
})