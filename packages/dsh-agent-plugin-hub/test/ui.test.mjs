/**
 * 商店面板 Host API 测试：`/store` 聚合、`/describe` 两条路径与降级、`/icon`、
 * 市场/插件动作、`/update-all`、单写互斥 409、错误码与访问控制。
 *
 * 全程零网络：市场夹具是本地目录；`fetch:true` 的 /describe 只触发本地市场刷新。
 */

import assert from 'node:assert/strict'
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { Readable } from 'node:stream'
import { test } from 'node:test'

import { AgentPluginHub } from '../lib/hub.js'
import { buildDescribe, buildStoreSnapshot, resolveStoreIconFile } from '../lib/ui-data.js'
import { mountUiRoutes } from '../lib/ui-routes.js'
import {
  cleanup,
  copyDir,
  copyFixture,
  createFakeCtx,
  createFakeExecutor,
  tempHome,
} from './helpers.mjs'

const API = '/agent-plugin/api'

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

/** 调一次 API 路由，返回 {status, headers, body(JSON|null), raw}。 */
async function callRoute(route, { method = 'GET', url = `${API}/store`, headers = {}, body = '' } = {}) {
  const request = new Readable({ read() {} })
  Object.assign(request, { method, url, headers })
  if (body !== '') request.push(body)
  request.push(null)
  const response = {
    status: 0,
    headers: {},
    raw: null,
    writeHead(status, responseHeaders) {
      this.status = status
      this.headers = responseHeaders
    },
    end(chunk) {
      this.raw = chunk ?? null
    },
  }
  await route.handler(request, response)
  const raw = response.raw
  let text = ''
  if (typeof raw === 'string') text = raw
  else if (Buffer.isBuffer(raw)) text = raw.toString('utf8')
  let parsed = null
  try {
    parsed = JSON.parse(text)
  } catch {
    parsed = null
  }
  return { status: response.status, headers: response.headers, body: parsed, raw }
}

const LOOPBACK_HEADERS = { host: '127.0.0.1:9271' }
const POST_HEADERS = { host: '127.0.0.1:9271', origin: 'http://127.0.0.1:9271', 'content-type': 'application/json' }

/** GET/POST 便捷封装。 */
function get(route, url) {
  return callRoute(route, { headers: LOOPBACK_HEADERS, url })
}

function post(route, name, body) {
  return callRoute(route, {
    method: 'POST',
    url: `${API}/${name}`,
    headers: POST_HEADERS,
    body: JSON.stringify(body ?? {}),
  })
}

/** 修改市场夹具里的 marketplace.json。 */
function patchMarketplace(marketDir, mutate) {
  const file = path.join(marketDir, '.claude-plugin', 'marketplace.json')
  const manifest = JSON.parse(readFileSync(file, 'utf8'))
  mutate(manifest)
  writeFileSync(file, `${JSON.stringify(manifest, null, 2)}\n`)
}

/** 修改插件清单 plugin.json。 */
function patchPluginManifest(marketDir, pluginName, mutate) {
  const file = path.join(marketDir, 'plugins', pluginName, '.claude-plugin', 'plugin.json')
  const manifest = JSON.parse(readFileSync(file, 'utf8'))
  mutate(manifest)
  writeFileSync(file, `${JSON.stringify(manifest, null, 2)}\n`)
}

/** 把一个内存市场记录塞进 marketplaces（用于构造 url 市场，不触发任何网络）。 */
function addMemoryMarket(hub, record) {
  const market = {
    id: record.id,
    name: record.name ?? record.id,
    title: record.title ?? record.name ?? record.id,
    format: record.format ?? 'claude',
    type: record.type,
    location: record.location,
    addedAt: new Date().toISOString(),
    lastRefreshed: new Date().toISOString(),
    display: { title: record.title ?? record.id, description: '', owner: { name: '' } },
    owner: { name: '' },
    featured: [],
    plugins: record.plugins ?? [],
    warnings: [],
  }
  hub.markets.data.markets.push(market)
  hub.markets.save()
  return market
}

/** 基础环境：临时 home + 本地 claude 市场 + 假 ctx/webServer + 已挂载路由。 */
async function setup(t) {
  const work = tempHome('hub-ui-')
  cleanup(t, work)
  const marketDir = copyFixture('claude-market', work)
  const ctx = createFakeCtx()
  const webServer = createFakeWebServer()
  ctx.state.services.webServer = webServer
  const hub = new AgentPluginHub({
    home: path.join(work, 'hub-home'),
    ctx,
    hookExecutor: createFakeExecutor(),
  })
  hub.start()
  const market = await hub.marketAdd({ type: 'local', location: marketDir })
  const ui = mountUiRoutes(ctx, hub)
  assert.equal(ui.active, true)
  return { work, marketDir, ctx, webServer, hub, route: webServer.routes[0], market }
}

test('路由挂载：前缀路由 + GET /store 聚合市场、商品与已安装项', async (t) => {
  const { route, hub, market, ctx } = await setup(t)
  assert.equal(route.kind, 'prefix')
  assert.equal(route.path, API)
  await hub.install({ market: market.id, name: 'demo-claude' })
  const result = await get(route, `${API}/store`)
  assert.equal(result.status, 200, JSON.stringify(result.body))
  const data = result.body.data
  assert.equal(data.ok, undefined, '信封由路由添加')
  assert.match(data.version, /^\d+\.\d+\.\d+/u)
  assert.equal(data.started, true)
  assert.equal(data.ui.active, true)
  assert.equal(data.migrationError, null)
  assert.deepEqual(data.operations, [])
  assert.equal('cache' in data, false, '/store 不应含 cache')

  assert.equal(data.markets.length, 1)
  const summary = data.markets[0]
  assert.equal(summary.id, market.id)
  assert.equal(summary.type, 'local')
  assert.equal(summary.format, 'claude')
  assert.equal(summary.location, market.location)
  assert.equal(summary.refreshError, null)
  assert.equal(summary.pluginCount, 3)
  assert.equal(typeof summary.lastRefreshed, 'string')
  assert.equal(summary.display.title, 'fixture-claude-market')
  assert.equal(summary.display.owner.name, 'dsh-agent-plugin-hub fixtures')
  assert.equal(summary.health.status, 'ok')
  assert.equal(summary.refreshing, false)

  assert.equal(data.items.length, 3)
  const demo = data.items.find((item) => item.name === 'demo-claude')
  assert.equal(demo.key, `${market.id}/demo-claude`)
  assert.equal(demo.version, '0.1.0')
  assert.equal(demo.versionValid, true)
  assert.equal(demo.format, 'claude')
  assert.equal(demo.market.id, market.id)
  assert.equal(demo.installed, true)
  assert.equal(demo.installedVersion, '0.1.0')
  assert.equal(demo.installedEnabled, true)
  assert.equal(demo.update.state, 'current')
  assert.equal(demo.source.kind, 'local')
  assert.equal(demo.source.resolved, true)
  assert.equal(demo.source.cloneRequired, false)
  assert.equal(demo.installable, true)
  assert.equal(demo.blockedReason, null)
  const npm = data.items.find((item) => item.name === 'npm-plugin')
  assert.equal(npm.installable, false)
  assert.match(npm.blockedReason, /npm/u)

  assert.equal(data.installed.length, 1)
  const installed = data.installed[0]
  assert.equal(installed.key, `${market.id}/demo-claude`)
  assert.equal(typeof installed.installedAt, 'string')
  assert.equal(typeof installed.installedPath, 'string')
  assert.deepEqual(installed.previousVersions, [])
  assert.deepEqual(installed.capabilities.skills, ['greet'])
  assert.equal(installed.orphan, false)
  assert.equal(installed.market.id, market.id)
  assert.equal(installed.display.title, 'demo-claude')
  assert.equal(installed.displaySource, 'market')
  assert.equal(installed.update.state, 'current')

  assert.equal(data.runtime.skills.registered, true)
  assert.equal(data.runtime.commands.available, true)
  assert.equal(data.runtime.hooks.attached, true)
  assert.equal(data.runtime.mcp.available, false)
  assert.deepEqual(data.stats, {
    markets: 1,
    items: 3,
    installable: 1,
    installed: 1,
    updatesAvailable: 0,
    orphans: 0,
    marketsWithError: 0,
  })
  assert.ok(ctx.state.providers.length === 1)
})

test('GET /store：声明级更新（条目 version）与统计', async (t) => {
  const { route, hub, market, marketDir } = await setup(t)
  await hub.install({ market: market.id, name: 'demo-claude' })
  patchMarketplace(marketDir, (manifest) => {
    manifest.plugins[0].version = '0.2.0'
  })
  await hub.marketRefresh(market.id)
  const data = (await get(route, `${API}/store`)).body.data
  assert.equal(data.installed[0].update.state, 'available')
  assert.equal(data.installed[0].update.currentVersion, '0.1.0')
  assert.equal(data.installed[0].update.latestVersion, '0.2.0')
  assert.equal(data.installed[0].update.checkedBy, 'declared')
  assert.equal(data.stats.updatesAvailable, 1)
  const demo = data.items.find((item) => item.name === 'demo-claude')
  assert.equal(demo.update.state, 'available')
})

test('GET /describe：已安装走安装目录，能力分区 + 清单 + update', async (t) => {
  const { route, hub, market } = await setup(t)
  const { record } = await hub.install({ market: market.id, name: 'demo-claude' })
  const result = await get(route, `${API}/describe?key=${encodeURIComponent(record.key)}`)
  assert.equal(result.status, 200, JSON.stringify(result.body))
  const detail = result.body.data
  assert.equal(detail.key, record.key)
  assert.equal(detail.format, 'claude')
  assert.equal(detail.orphan, false)
  assert.equal(detail.installed.installed, true)
  assert.equal(detail.installed.key, record.key)
  assert.equal(detail.installed.version, '0.1.0')
  assert.equal(detail.installed.enabled, true)
  assert.equal(detail.update.state, 'current')
  assert.equal(detail.installable, false)
  assert.equal(detail.display.title, 'demo-claude')
  assert.equal(detail.manifest.name, 'demo-claude')
  assert.equal(detail.manifest.author.name, 'fixture')
  assert.ok(detail.manifest.rawKeys.includes('skills'))

  assert.deepEqual(detail.capabilities.skills.map((item) => item.name), ['greet'])
  assert.deepEqual(detail.capabilities.commands.map((item) => item.name), ['hello'])
  assert.equal(detail.capabilities.commands[0].hostName, 'demo-claude-hello')
  assert.equal(detail.capabilities.commands[0].enabled, true)
  assert.deepEqual(detail.capabilities.hooks.map((item) => item.event), ['PreToolUse', 'PostToolUse', 'Stop', 'Notification'])
  const pre = detail.capabilities.hooks.find((item) => item.event === 'PreToolUse')
  assert.equal(pre.host, 'tools/pre-execute')
  assert.equal(pre.mode, 'waterfall')
  assert.equal(pre.canBlock, true)
  assert.equal(pre.entries, 1)
  assert.equal(pre.effective, true)
  const notification = detail.capabilities.hooks.find((item) => item.event === 'Notification')
  assert.equal(notification.effective, false)
  assert.match(notification.reason, /宿主没有对应事件/u)
  assert.equal(detail.capabilities.mcpServers.length, 2)
  assert.equal(detail.capabilities.mcpServers[0].effective, false)
  assert.match(detail.capabilities.mcpServers[0].reason, /MCP/u)
  assert.equal(detail.hooksSource, 'hooks/hooks.json')
  assert.equal(detail.mcpSource, '.mcp.json')
  assert.deepEqual(detail.counts, { skills: 1, commands: 1, hooks: 4, mcpServers: 2 })
})

test('GET /describe：未安装解析本地源目录，不联网', async (t) => {
  const { route, hub, market } = await setup(t)
  let refreshes = 0
  const original = hub.markets.refresh.bind(hub.markets)
  hub.markets.refresh = async (id) => {
    refreshes += 1
    return await original(id)
  }
  const result = await get(route, `${API}/describe?market=${encodeURIComponent(market.id)}&name=demo-claude`)
  assert.equal(result.status, 200, JSON.stringify(result.body))
  const detail = result.body.data
  assert.equal(detail.installed.installed, false)
  assert.equal(detail.installed.key, null)
  assert.equal(detail.installable, true)
  assert.equal(detail.blockedReason, null)
  assert.equal(detail.update.state, 'none')
  assert.equal(detail.source.kind, 'local')
  assert.equal(detail.source.resolved, true)
  assert.equal(detail.manifest.name, 'demo-claude')
  assert.equal(detail.capabilities.skills[0].name, 'greet')
  assert.equal(refreshes, 0, 'GET /describe 不得触发市场刷新')
  await get(route, `${API}/store`)
  assert.equal(refreshes, 0, 'GET /store 不得触发市场刷新')
})

test('GET /describe：来源缺失/不可安装时降级为 capabilities:null + 可读原因', async (t) => {
  const { route, market } = await setup(t)
  const missing = await get(route, `${API}/describe?market=${encodeURIComponent(market.id)}&name=missing-dir`)
  assert.equal(missing.status, 200)
  const missingData = missing.body.data
  assert.equal(missingData.source.resolved, false)
  assert.match(missingData.source.reason, /插件目录不存在/u)
  assert.equal(missingData.capabilities, null)
  assert.equal(missingData.manifest, null)
  assert.deepEqual(missingData.counts, { skills: 0, commands: 0, hooks: 0, mcpServers: 0 })
  assert.equal(missingData.installable, false)
  assert.match(missingData.blockedReason, /插件目录不存在/u)

  const npm = await get(route, `${API}/describe?market=${encodeURIComponent(market.id)}&name=npm-plugin`)
  assert.equal(npm.status, 200)
  assert.equal(npm.body.data.installable, false)
  assert.match(npm.body.data.blockedReason, /npm/u)
})

test('GET /describe：URL 市场的相对路径源不可解析（零网络）', async (t) => {
  const { route, hub } = await setup(t)
  const market = addMemoryMarket(hub, {
    id: 'url-market-00000001',
    name: 'remote-market',
    title: 'Remote Market',
    type: 'url',
    location: 'https://example.com/marketplace.json',
    plugins: [{
      name: 'remote-plugin',
      version: '1.0.0',
      description: '远端插件',
      source: { kind: 'local', raw: './plugins/remote-plugin' },
      installable: true,
      meta: { displayName: 'Remote Plugin' },
    }],
  })
  const result = await get(route, `${API}/describe?market=${encodeURIComponent(market.id)}&name=remote-plugin`)
  assert.equal(result.status, 200)
  const detail = result.body.data
  assert.equal(detail.source.resolved, false)
  assert.match(detail.source.reason, /URL 市场/u)
  assert.equal(detail.capabilities, null)
  assert.equal(detail.installable, false)
  assert.match(detail.blockedReason, /URL 市场/u)
  assert.equal(detail.display.title, 'Remote Plugin')

  const store = (await get(route, `${API}/store`)).body.data
  const remoteSummary = store.markets.find((entry) => entry.id === market.id)
  assert.equal(remoteSummary.health.status, 'missing')
  const item = store.items.find((entry) => entry.name === 'remote-plugin')
  assert.equal(item.installable, false)
  assert.match(item.source.reason, /URL 市场/u)
})

test('POST /describe：fetch:true 才允许刷新市场（本地市场零网络）', async (t) => {
  const { route, hub, market } = await setup(t)
  let refreshes = 0
  const original = hub.markets.refresh.bind(hub.markets)
  hub.markets.refresh = async (id) => {
    refreshes += 1
    return await original(id)
  }
  const result = await post(route, 'describe', { market: market.id, name: 'demo-claude', fetch: true })
  assert.equal(result.status, 200, JSON.stringify(result.body))
  assert.equal(result.body.data.manifest.name, 'demo-claude')
  assert.equal(refreshes, 1)
  const noFetch = await post(route, 'describe', { market: market.id, name: 'demo-claude', fetch: false })
  assert.equal(noFetch.status, 200)
  assert.equal(refreshes, 1, 'fetch:false 不得刷新')
})

test('GET /describe：未知/歧义/缺参的错误码', async (t) => {
  const { route, hub, market, work } = await setup(t)
  const unknown = await get(route, `${API}/describe?key=${encodeURIComponent('no-such-market/x')}`)
  assert.equal(unknown.status, 404)
  assert.equal(unknown.body.ok, false)
  assert.equal(unknown.body.code, 'not_found')

  const bad = await get(route, `${API}/describe`)
  assert.equal(bad.status, 400)
  assert.equal(bad.body.code, 'bad_request')

  const otherDir = path.join(work, 'claude-market-2')
  copyDir(market.location, otherDir)
  const other = await hub.marketAdd({ type: 'local', location: otherDir })
  const ambiguous = await get(route, `${API}/describe?name=demo-claude`)
  assert.equal(ambiguous.status, 409)
  assert.equal(ambiguous.body.code, 'conflict')
  assert.match(ambiguous.body.error, /多个市场/u)
  assert.ok(other.id !== market.id)
})

test('GET /icon：市场内 raster 图标 200 + nosniff + 缓存头', async (t) => {
  const { route, hub, market } = await setup(t)
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x01, 0x02, 0x03])
  mkdirSync(path.join(market.location, 'plugins', 'demo-claude'), { recursive: true })
  writeFileSync(path.join(market.location, 'plugins', 'demo-claude', 'icon.png'), png)
  patchMarketplace(market.location, (manifest) => {
    manifest.plugins[0].icon = './plugins/demo-claude/icon.png'
  })
  await hub.marketRefresh(market.id)
  const store = (await get(route, `${API}/store`)).body.data
  const item = store.items.find((entry) => entry.name === 'demo-claude')
  assert.equal(item.display.icon.kind, 'route')
  assert.equal(item.display.icon.mime, 'image/png')
  assert.match(item.display.icon.url, new RegExp(`^${API}/icon\\?key=`, 'u'))
  assert.match(item.display.icon.url, /v=0\.1\.0/u)

  const key = `${market.id}/demo-claude`
  const icon = await get(route, `${API}/icon?key=${encodeURIComponent(key)}&v=0.1.0`)
  assert.equal(icon.status, 200)
  assert.equal(icon.headers['content-type'], 'image/png')
  assert.equal(icon.headers['x-content-type-options'], 'nosniff')
  assert.match(icon.headers['cache-control'], /max-age=300/u)
  assert.equal(Buffer.compare(icon.raw, png), 0)
  assert.equal(resolveStoreIconFile(hub, key).mime, 'image/png')
})

test('GET /icon：越界/SVG/https/data/缺失一律 404 JSON 或降级 none', async (t) => {
  const { route, hub, market } = await setup(t)
  const pluginDir = path.join(market.location, 'plugins', 'demo-claude')
  const key = `${market.id}/demo-claude`
  const notFound = async (url) => {
    const result = await get(route, url)
    assert.equal(result.status, 404)
    assert.equal(result.body.ok, false)
    assert.equal(result.body.code, 'not_found')
  }
  await notFound(`${API}/icon`)
  await notFound(`${API}/icon?key=${encodeURIComponent(key)}`)

  const setIcon = async (icon) => {
    patchMarketplace(market.location, (manifest) => {
      if (icon === null) delete manifest.plugins[0].icon
      else manifest.plugins[0].icon = icon
    })
    await hub.marketRefresh(market.id)
    return (await get(route, `${API}/store`)).body.data.items.find((entry) => entry.name === 'demo-claude').display.icon
  }

  // 越界路径：不解析（none）且 /icon 404
  assert.equal((await setIcon('../../escape.png')).kind, 'none')
  await notFound(`${API}/icon?key=${encodeURIComponent(key)}`)

  // SVG：不在 raster 白名单
  writeFileSync(path.join(pluginDir, 'icon.svg'), '<svg xmlns="http://www.w3.org/2000/svg"/>')
  assert.equal((await setIcon('./plugins/demo-claude/icon.svg')).kind, 'none')
  await notFound(`${API}/icon?key=${encodeURIComponent(key)}`)

  // https：直接给客户端 URL，不走 /icon
  const httpIcon = await setIcon('https://cdn.example.com/icon.png')
  assert.deepEqual(httpIcon, { kind: 'http', url: 'https://cdn.example.com/icon.png', mime: null })
  await notFound(`${API}/icon?key=${encodeURIComponent(key)}`)

  // data URL：白名单 MIME + 大小上限
  const small = 'data:image/png;base64,iVBORw0KGgo='
  assert.deepEqual(await setIcon(small), { kind: 'data', url: small, mime: 'image/png' })
  const tooBig = `data:image/png;base64,${'A'.repeat(64 * 1024)}`
  assert.equal((await setIcon(tooBig)).kind, 'none')
  assert.equal((await setIcon('data:image/svg+xml;base64,PHN2Zz4=')).kind, 'none')

  // 缺省：none
  assert.equal((await setIcon(null)).kind, 'none')
})

test('POST /market/add：仅凭 location 自动识别来源；重复添加 409', async (t) => {
  const { route, work, market } = await setup(t)
  const second = path.join(work, 'claude-market-b')
  copyDir(market.location, second)
  const added = await post(route, 'market/add', { location: second })
  assert.equal(added.status, 200, JSON.stringify(added.body))
  const data = added.body.data
  assert.equal(data.detectedType, 'local')
  assert.equal(data.format, 'claude')
  assert.equal(data.pluginCount, 3)
  assert.equal(data.refreshError, null)
  assert.match(data.message, /市场已添加/u)
  assert.equal(data.market.type, 'local')
  assert.equal(data.market.pluginCount, 3)

  const duplicate = await post(route, 'market/add', { location: second })
  assert.equal(duplicate.status, 409)
  assert.equal(duplicate.body.code, 'conflict')
  assert.match(duplicate.body.error, /市场已存在/u)

  const badLocation = await post(route, 'market/add', { location: path.join(work, 'not-there') })
  assert.ok([400, 404].includes(badLocation.status), String(badLocation.status))
  assert.equal(badLocation.body.code, 'not_found')
  assert.match(badLocation.body.error, /不存在/u)
})

test('POST /market/refresh：单个失败进 failures 仍 200，未知 id 404', async (t) => {
  const { route, hub, market } = await setup(t)
  const id = market.id
  writeFileSync(path.join(market.location, '.claude-plugin', 'marketplace.json'), '{ 坏掉的 JSON')
  const failed = await post(route, 'market/refresh', { id })
  assert.equal(failed.status, 200, JSON.stringify(failed.body))
  assert.equal(failed.body.data.refreshed.length, 0)
  assert.equal(failed.body.data.failures.length, 1)
  assert.equal(failed.body.data.failures[0].id, id)
  assert.match(failed.body.data.failures[0].error, /JSON/u)
  assert.equal(failed.body.data.stats.failed, 1)
  assert.match(hub.markets.get(id).refreshError, /JSON/u)

  const missing = await post(route, 'market/refresh', { id: 'no-such-market' })
  assert.equal(missing.status, 404)
  assert.equal(missing.body.code, 'not_found')

  writeFileSync(
    path.join(market.location, '.claude-plugin', 'marketplace.json'),
    `${JSON.stringify({ name: 'fixture-claude-market', plugins: [{ name: 'demo-claude', version: '0.1.0', source: './plugins/demo-claude' }] }, null, 2)}\n`,
  )
  const all = await post(route, 'market/refresh', {})
  assert.equal(all.status, 200)
  assert.equal(all.body.data.stats.ok, 1)
  assert.equal(all.body.data.stats.failed, 0)
})

test('POST /market/remove：允许保留已安装插件并返回 orphaned', async (t) => {
  const { route, hub, market } = await setup(t)
  const { record } = await hub.install({ market: market.id, name: 'demo-claude' })
  const removed = await post(route, 'market/remove', { id: market.id })
  assert.equal(removed.status, 200, JSON.stringify(removed.body))
  assert.deepEqual(removed.body.data.orphaned, ['demo-claude'])
  assert.match(removed.body.data.message, /已移除市场/u)
  assert.equal(hub.markets.list().length, 0)
  assert.equal(hub.state.plugins.length, 1, '安装副本与状态应保留')

  const store = (await get(route, `${API}/store`)).body.data
  assert.equal(store.markets.length, 0)
  assert.equal(store.items.length, 0)
  assert.equal(store.installed.length, 1)
  assert.equal(store.installed[0].orphan, true)
  assert.equal(store.installed[0].market, null)
  assert.equal(store.installed[0].update.state, 'unknown')
  assert.match(store.installed[0].update.reason, /来源市场已移除/u)
  assert.equal(store.stats.orphans, 1)

  const detail = await get(route, `${API}/describe?key=${encodeURIComponent(record.key)}`)
  assert.equal(detail.status, 200)
  assert.equal(detail.body.data.orphan, true)
  assert.equal(detail.body.data.market, null)
  assert.equal(detail.body.data.capabilities.skills[0].name, 'greet')
  assert.ok(hub.state.plugins[0].installedPath.length > 0, '安装目录仍保留')
  assert.equal(resolveStoreIconFile(hub, record.key), null)
})

test('POST /update：声明级升级 + 回滚（previousVersion 与 rollback）', async (t) => {
  const { route, hub, market, marketDir } = await setup(t)
  const { record } = await hub.install({ market: market.id, name: 'demo-claude' })
  patchMarketplace(marketDir, (manifest) => {
    manifest.plugins[0].version = '0.2.0'
  })
  patchPluginManifest(marketDir, 'demo-claude', (manifest) => {
    manifest.version = '0.2.0'
    manifest.description = '0.2.0 夹具'
  })
  const updated = await post(route, 'update', { key: record.key })
  assert.equal(updated.status, 200, JSON.stringify(updated.body))
  assert.equal(updated.body.data.changed, true)
  assert.equal(updated.body.data.previousVersion, '0.1.0')
  assert.equal(updated.body.data.record.version, '0.2.0')
  assert.match(updated.body.data.message, /0\.1\.0 → 0\.2\.0/u)

  const rolled = await post(route, 'rollback', { key: record.key })
  assert.equal(rolled.status, 200, JSON.stringify(rolled.body))
  assert.equal(rolled.body.data.version, '0.1.0')
  assert.equal(rolled.body.data.previousVersion, '0.2.0')
  assert.equal(hub.findRecord(record.key).version, '0.1.0')
})

test('POST /rollback：支持指定目标版本，未知版本报 not_found', async (t) => {
  const { route, hub, market, marketDir } = await setup(t)
  await hub.install({ market: market.id, name: 'demo-claude' })
  patchMarketplace(marketDir, (manifest) => {
    manifest.plugins[0].version = '0.2.0'
  })
  patchPluginManifest(marketDir, 'demo-claude', (manifest) => {
    manifest.version = '0.2.0'
  })
  await post(route, 'update', { key: 'demo-claude' })

  const rolled = await post(route, 'rollback', { key: 'demo-claude', version: '0.1.0' })
  assert.equal(rolled.status, 200, JSON.stringify(rolled.body))
  assert.equal(rolled.body.data.version, '0.1.0')
  assert.equal(hub.findRecord('demo-claude').version, '0.1.0')

  const bad = await post(route, 'rollback', { key: 'demo-claude', version: '9.9.9' })
  assert.equal(bad.status, 404)
  assert.equal(bad.body.code, 'not_found')
})

test('POST /update-all：按市场去重刷新一次、部分失败不中断、一次 saveState', async (t) => {
  const { route, hub, market, work } = await setup(t)
  const marketB = path.join(work, 'claude-market-b')
  copyDir(market.location, marketB)
  const market2 = await hub.marketAdd({ type: 'local', location: marketB })
  await hub.install({ market: market.id, name: 'demo-claude' })
  await hub.install({ market: market2.id, name: 'demo-claude' })

  for (const dir of [market.location, marketB]) {
    patchMarketplace(dir, (manifest) => {
      manifest.plugins[0].version = '0.2.0'
    })
    patchPluginManifest(dir, 'demo-claude', (manifest) => {
      manifest.version = '0.2.0'
    })
  }
  // B 的源目录删掉：刷新市场仍成功，但更新解析源目录失败
  rmSync(path.join(marketB, 'plugins', 'demo-claude'), { recursive: true, force: true })

  const refreshCalls = []
  const originalRefresh = hub.markets.refresh.bind(hub.markets)
  hub.markets.refresh = async (id) => {
    refreshCalls.push(id)
    return await originalRefresh(id)
  }
  let saves = 0
  const originalSave = hub.store.saveState.bind(hub.store)
  hub.store.saveState = (state) => {
    saves += 1
    originalSave(state)
  }

  const result = await post(route, 'update-all', {})
  assert.equal(result.status, 200, JSON.stringify(result.body))
  const data = result.body.data
  assert.equal(data.aborted, false)
  assert.equal(data.succeeded.length, 1)
  assert.equal(data.failed.length, 1)
  assert.equal(data.succeeded[0].key, `${market.id}/demo-claude`)
  assert.equal(data.failed[0].key, `${market2.id}/demo-claude`)
  assert.match(data.failed[0].error, /目录不存在/u)
  assert.deepEqual(data.summary, { total: 2, updated: 1, skipped: 0, failed: 1, markets: 2 })
  assert.deepEqual([...refreshCalls].sort(), [market.id, market2.id].sort(), '每个市场只刷新一次')
  assert.equal(saves, 1, '全部更新只保存一次 state')
  assert.equal(hub.findRecord(`${market.id}/demo-claude`).version, '0.2.0')
  assert.equal(hub.findRecord(`${market2.id}/demo-claude`).version, '0.1.0')
})

test('单写互斥：在途操作期间写接口 409，读接口照常，完成后释放', async (t) => {
  const { route, hub, market } = await setup(t)
  let release = null
  const pending = hub.runOperation('update', { key: 'x/y' }, () => new Promise((resolve) => {
    release = resolve
  }))
  const conflict = await post(route, 'install', { market: market.id, name: 'demo-claude' })
  assert.equal(conflict.status, 409)
  assert.equal(conflict.body.code, 'operation_in_progress')
  assert.equal(conflict.body.details.operation.kind, 'update')
  assert.match(conflict.body.error, /正在进行/u)

  const describeFetch = await post(route, 'describe', { market: market.id, name: 'demo-claude', fetch: true })
  assert.equal(describeFetch.status, 409)

  const store = await get(route, `${API}/store`)
  assert.equal(store.status, 200, '读接口不加锁')
  assert.equal(store.body.data.operations.length, 1)
  assert.equal(store.body.data.operations[0].kind, 'update')
  assert.equal(typeof store.body.data.operations[0].id, 'string')
  assert.equal(typeof store.body.data.operations[0].startedAt, 'string')

  release({ changed: false })
  await pending
  const after = await get(route, `${API}/store`)
  assert.deepEqual(after.body.data.operations, [])
  const installed = await post(route, 'install', { market: market.id, name: 'demo-claude' })
  assert.equal(installed.status, 200, JSON.stringify(installed.body))
})

test('访问控制与错误码：403 / 404 / 405 / 400', async (t) => {
  const { route, market } = await setup(t)
  const remote = await callRoute(route, { url: `${API}/store`, headers: { host: '192.168.1.10:9271' } })
  assert.equal(remote.status, 403)
  assert.equal(remote.body.code, 'forbidden')

  const crossOrigin = await callRoute(route, {
    method: 'POST',
    url: `${API}/market/add`,
    headers: { host: '127.0.0.1:9271', origin: 'http://evil.example', 'content-type': 'application/json' },
    body: '{}',
  })
  assert.equal(crossOrigin.status, 403)

  // https 同源（宿主 webServer 以 https 提供时）同样放行：到达路由层后按 404 报未知接口。
  const httpsOrigin = await callRoute(route, {
    method: 'POST',
    url: `${API}/nope`,
    headers: { host: '127.0.0.1:9271', origin: 'https://127.0.0.1:9271', 'content-type': 'application/json' },
    body: '{}',
  })
  assert.equal(httpsOrigin.status, 404, 'https 同源 Origin 应被放行（404 而非 403）')
  assert.equal(httpsOrigin.body.code, 'not_found')

  const nullOrigin = await callRoute(route, {
    method: 'POST',
    url: `${API}/market/add`,
    headers: { host: '127.0.0.1:9271', origin: 'null', 'content-type': 'application/json' },
    body: '{}',
  })
  assert.equal(nullOrigin.status, 403, 'sandbox iframe 的 Origin: null 仍应拒绝')

  const plain = await callRoute(route, {
    method: 'POST',
    url: `${API}/market/add`,
    headers: { host: '127.0.0.1:9271', origin: 'http://127.0.0.1:9271', 'content-type': 'text/plain' },
    body: '{}',
  })
  assert.equal(plain.status, 403)

  const unknownGet = await get(route, `${API}/nope`)
  assert.equal(unknownGet.status, 404)
  assert.equal(unknownGet.body.code, 'not_found')
  const unknownPost = await post(route, 'nope', {})
  assert.equal(unknownPost.status, 404)

  const wrongMethod = await post(route, 'store', {})
  assert.equal(wrongMethod.status, 405)
  assert.equal(wrongMethod.body.code, 'method_not_allowed')
  const getPost = await get(route, `${API}/install`)
  assert.equal(getPost.status, 405)

  const badJson = await callRoute(route, { method: 'POST', url: `${API}/market/add`, headers: POST_HEADERS, body: '{ 不是 JSON' })
  assert.equal(badJson.status, 400)
  assert.equal(badJson.body.code, 'bad_request')
  assert.match(badJson.body.error, /JSON/u)

  const notInstalled = await post(route, 'uninstall', { key: `${market.id}/demo-claude` })
  assert.equal(notInstalled.status, 404)
  assert.equal(notInstalled.body.code, 'not_found')
  const badKind = await post(route, 'capability', { key: `${market.id}/demo-claude`, kind: 'nope', capability: 'x' })
  assert.equal(badKind.status, 400)
  assert.equal(badKind.body.code, 'bad_request')
})

test('已安装动作：capability / enable / uninstall 经路由生效', async (t) => {
  const { route, hub, market, ctx } = await setup(t)
  const { record } = await hub.install({ market: market.id, name: 'demo-claude' })
  const disabled = await post(route, 'capability', {
    key: record.key,
    kind: 'skills',
    capability: 'greet',
    enabled: false,
  })
  assert.equal(disabled.status, 200, JSON.stringify(disabled.body))
  assert.deepEqual(disabled.body.data.disabledCapabilities.skills, ['greet'])
  assert.deepEqual(await ctx.state.providers[0].list({}), [])

  const detail = await get(route, `${API}/describe?key=${encodeURIComponent(record.key)}`)
  assert.equal(detail.body.data.capabilities.skills[0].enabled, false)
  assert.equal(detail.body.data.capabilities.commands[0].enabled, true)

  const commands = await post(route, 'capability', {
    key: record.key,
    kind: 'commands',
    capability: 'hello',
    enabled: false,
  })
  assert.equal(commands.status, 200)
  assert.equal(ctx.state.commands.has('demo-claude-hello'), false)

  const disabledPlugin = await post(route, 'enable', { key: record.key, enabled: false })
  assert.equal(disabledPlugin.status, 200)
  assert.equal(disabledPlugin.body.data.enabled, false)
  let store = (await get(route, `${API}/store`)).body.data
  assert.equal(store.installed[0].enabled, false)

  const uninstalled = await post(route, 'uninstall', { key: record.key })
  assert.equal(uninstalled.status, 200)
  store = (await get(route, `${API}/store`)).body.data
  assert.equal(store.installed.length, 0)
  assert.equal(store.items.find((item) => item.name === 'demo-claude').installed, false)
})

test('存储迁移：v1 → v2 成功且 /store.migrationError 为 null', async (t) => {
  const work = tempHome('hub-ui-migrate-')
  cleanup(t, work)
  const marketDir = copyFixture('claude-market', work)
  const home = path.join(work, 'hub-home')
  mkdirSync(home, { recursive: true })
  writeFileSync(
    path.join(home, 'state.json'),
    `${JSON.stringify({ schemaVersion: 1, updatedAt: new Date().toISOString(), plugins: [] }, null, 2)}\n`,
  )
  writeFileSync(
    path.join(home, 'marketplaces.json'),
    `${JSON.stringify({
      schemaVersion: 1,
      updatedAt: new Date().toISOString(),
      markets: [{
        id: 'local-old-0001',
        name: 'old-market',
        type: 'local',
        location: marketDir,
        format: 'claude',
        root: marketDir,
        addedAt: new Date().toISOString(),
        lastRefreshed: '',
        plugins: [],
      }],
    }, null, 2)}\n`,
  )
  const ctx = createFakeCtx()
  const webServer = createFakeWebServer()
  ctx.state.services.webServer = webServer
  const hub = new AgentPluginHub({ home, ctx })
  hub.start()
  assert.equal(hub.migrationError, null)
  assert.equal(hub.migration.migrated, true)
  assert.equal(hub.migration.from, 1)
  assert.equal(hub.migration.to, 2)
  assert.equal(typeof hub.migration.backup, 'string')
  assert.equal(JSON.parse(readFileSync(path.join(home, 'state.json'), 'utf8')).schemaVersion, 2)
  assert.equal(JSON.parse(readFileSync(path.join(home, 'marketplaces.json'), 'utf8')).schemaVersion, 2)

  mountUiRoutes(ctx, hub)
  const route = webServer.routes[0]
  const store = (await get(route, `${API}/store`)).body.data
  assert.equal(store.migrationError, null)
  assert.equal(store.markets.length, 1)
  assert.equal(store.markets[0].title, 'old-market')
  assert.equal(store.markets[0].refreshError, null)
})

test('存储迁移失败：/store.migrationError 返回可读原因，读取仍继续', async (t) => {
  const work = tempHome('hub-ui-migrate-fail-')
  cleanup(t, work)
  const marketDir = copyFixture('claude-market', work)
  const home = path.join(work, 'hub-home')
  mkdirSync(home, { recursive: true })
  writeFileSync(
    path.join(home, 'marketplaces.json'),
    `${JSON.stringify({ schemaVersion: 99, markets: [{ id: 'local-x', name: 'x', type: 'local', location: marketDir, format: 'claude', plugins: [] }] }, null, 2)}\n`,
  )
  const ctx = createFakeCtx()
  const webServer = createFakeWebServer()
  ctx.state.services.webServer = webServer
  const hub = new AgentPluginHub({ home, ctx })
  hub.start()
  assert.equal(typeof hub.migrationError, 'string')
  assert.match(hub.migrationError, /schemaVersion/u)
  mountUiRoutes(ctx, hub)
  const store = (await get(webServer.routes[0], `${API}/store`)).body.data
  assert.equal(typeof store.migrationError, 'string')
  assert.match(store.migrationError, /schemaVersion/u)
})

test('ui-data 直接调用：buildStoreSnapshot / buildDescribe 可用', async (t) => {
  const { hub, market } = await setup(t)
  await hub.install({ market: market.id, name: 'demo-claude' })
  const snapshot = await buildStoreSnapshot(hub)
  assert.equal(snapshot.items.length, 3)
  assert.equal(snapshot.installed.length, 1)
  const detail = await buildDescribe(hub, { market: market.id, name: 'demo-claude' })
  assert.equal(detail.capabilities.hooks.length, 4)
  assert.equal(detail.capabilities.mcpServers.length, 2)
  assert.equal(detail.counts.hooks, 4)
})