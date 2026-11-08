/**
 * 商店面板 Host API 测试：`/store` 聚合、`/describe` 两条路径与降级、`/icon`、
 * 市场/插件动作、`/update-all`、单写互斥 409、错误码与访问控制。
 *
 * Ported from test/ui.test.mjs (node:test → vitest). The route handler takes
 * node:http faces (IncomingMessage/ServerResponse); fakes are cast into them
 * and no server is ever opened.
 *
 * 全程零网络：市场夹具是本地目录；`fetch:true` 的 /describe 只触发本地市场刷新。
 */

import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import path from 'node:path'
import { Readable } from 'node:stream'

import { afterEach, describe, expect, it } from 'vitest'

import { AgentPluginHub } from '../src/hub.ts'
import type { HostContext } from '../src/host.ts'
import type { MarketRecord, MarketsFile, StoredEntry } from '../src/store.ts'
import { buildDescribe, buildStoreSnapshot, resolveStoreIconFile } from '../src/ui-data.ts'
import { isAdmitted, mountUiRoutes } from '../src/ui-routes.ts'
import {
  copyDir,
  copyFixture,
  createFakeCtx,
  createFakeExecutor,
  removeDirs,
  tempHome,
} from './helpers.ts'

const API = '/agent-plugin/api'

/** Loose JSON shape for reading/mutating fixture manifests and route payloads. */
type AnyJson = Record<string, any>

/** Prefix route captured from the fake webServer (handler takes node:http faces). */
interface CapturedRoute {
  kind: string
  path: string
  handler: (request: IncomingMessage, response: ServerResponse) => Promise<void>
}

/** Fake Host webServer：记录路由并返回注销函数。 */
function createFakeWebServer() {
  const routes: CapturedRoute[] = []
  return {
    routes,
    getOrigin() {
      return 'http://127.0.0.1:9271'
    },
    register(route: CapturedRoute) {
      routes.push(route)
      return () => {
        const index = routes.indexOf(route)
        if (index >= 0) routes.splice(index, 1)
      }
    },
  }
}

type FakeWebServer = ReturnType<typeof createFakeWebServer>

/** The first captured route; missing means the webServer saw no registration. */
function firstRoute(webServer: FakeWebServer): CapturedRoute {
  const route = webServer.routes[0]
  if (!route) throw new Error('webServer 未捕获到路由')
  return route
}

/** 调一次 API 路由，返回 {status, headers, body(JSON|null), raw}。 */
async function callRoute(
  route: CapturedRoute,
  {
    method = 'GET',
    url = `${API}/store`,
    headers = {},
    body = '',
  }: { method?: string, url?: string, headers?: Record<string, string>, body?: string } = {},
): Promise<{ status: number, headers: AnyJson, body: any, raw: unknown }> {
  const request = new Readable({ read() {} })
  Object.assign(request, { method, url, headers })
  if (body !== '') request.push(body)
  request.push(null)
  const response = {
    status: 0,
    headers: {} as AnyJson,
    raw: null as unknown,
    writeHead(status: number, responseHeaders: AnyJson) {
      this.status = status
      this.headers = responseHeaders
    },
    end(chunk?: unknown) {
      this.raw = chunk ?? null
    },
  }
  // 假 request/response 是 Readable + 捕获对象，按 handler 形参转型为 node:http 类型。
  await route.handler(request as unknown as IncomingMessage, response as unknown as ServerResponse)
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

const LOOPBACK_HEADERS: Record<string, string> = { host: '127.0.0.1:9271' }
const POST_HEADERS: Record<string, string> = {
  host: '127.0.0.1:9271',
  origin: 'http://127.0.0.1:9271',
  'content-type': 'application/json',
}

/** GET/POST 便捷封装。 */
function get(route: CapturedRoute, url: string) {
  return callRoute(route, { headers: LOOPBACK_HEADERS, url })
}

function post(route: CapturedRoute, name: string, body?: unknown) {
  return callRoute(route, {
    method: 'POST',
    url: `${API}/${name}`,
    headers: POST_HEADERS,
    body: JSON.stringify(body ?? {}),
  })
}

/** 修改市场夹具里的 marketplace.json。 */
function patchMarketplace(marketDir: string, mutate: (manifest: AnyJson) => void): void {
  const file = path.join(marketDir, '.claude-plugin', 'marketplace.json')
  const manifest = JSON.parse(readFileSync(file, 'utf8')) as AnyJson
  mutate(manifest)
  writeFileSync(file, `${JSON.stringify(manifest, null, 2)}\n`)
}

/** 修改插件清单 plugin.json。 */
function patchPluginManifest(marketDir: string, pluginName: string, mutate: (manifest: AnyJson) => void): void {
  const file = path.join(marketDir, 'plugins', pluginName, '.claude-plugin', 'plugin.json')
  const manifest = JSON.parse(readFileSync(file, 'utf8')) as AnyJson
  mutate(manifest)
  writeFileSync(file, `${JSON.stringify(manifest, null, 2)}\n`)
}

/** 把一个内存市场记录塞进 marketplaces（用于构造 url 市场，不触发任何网络）。 */
function addMemoryMarket(
  hub: AgentPluginHub,
  record: {
    id: string
    name?: string
    title?: string
    format?: string
    type: MarketRecord['type']
    location: string
    plugins?: StoredEntry[]
  },
): MarketRecord {
  const name = record.name ?? record.id
  const title = record.title ?? name
  const market: MarketRecord = {
    id: record.id,
    name,
    title,
    format: record.format ?? 'claude',
    type: record.type,
    location: record.location,
    addedAt: new Date().toISOString(),
    lastRefreshed: new Date().toISOString(),
    display: { title, description: '', owner: { name: '' } },
    owner: { name: '' },
    featured: [],
    plugins: record.plugins ?? [],
    warnings: [],
  }
  // markets.data is a private class cache; push the in-memory record through a cast.
  const data = (hub.markets as unknown as { data: MarketsFile }).data
  data.markets.push(market)
  hub.markets.save()
  return market
}

describe('商店面板 Host API', () => {
  // Temp dirs registered by each test; removed in afterEach (old cleanup(t, ...)).
  let tempDirs: string[] = []

  afterEach(() => {
    removeDirs(...tempDirs)
    tempDirs = []
  })

  /** 基础环境：临时 home + 本地 claude 市场 + 假 ctx/webServer + 已挂载路由。 */
  async function setup(): Promise<{
    work: string
    marketDir: string
    ctx: ReturnType<typeof createFakeCtx>
    webServer: FakeWebServer
    hub: AgentPluginHub
    route: CapturedRoute
    market: MarketRecord
  }> {
    const work = tempHome('hub-ui-')
    tempDirs.push(work)
    const marketDir = copyFixture('claude-market', work)
    const webServer = createFakeWebServer()
    const ctx = createFakeCtx({ webServer })
    const hub = new AgentPluginHub({
      home: path.join(work, 'hub-home'),
      // FakeCtx mirrors the hub's HostContext face structurally; cast to satisfy tsc.
      ctx: ctx as unknown as HostContext,
      hookExecutor: createFakeExecutor(),
    })
    hub.start()
    const market = await hub.marketAdd({ type: 'local', location: marketDir })
    const ui = mountUiRoutes(ctx, hub)
    expect(ui.active).toBe(true)
    return { work, marketDir, ctx, webServer, hub, route: firstRoute(webServer), market }
  }

  it('路由挂载：前缀路由 + GET /store 聚合市场、商品与已安装项', async () => {
    const { route, hub, market, ctx } = await setup()
    expect(route.kind).toBe('prefix')
    expect(route.path).toBe(API)
    await hub.install({ market: market.id, name: 'demo-claude' })
    const result = await get(route, `${API}/store`)
    expect(result.status, JSON.stringify(result.body)).toBe(200)
    const data = result.body.data
    expect(data.ok, '信封由路由添加').toBeUndefined()
    expect(data.version).toMatch(/^\d+\.\d+\.\d+/u)
    expect(data.started).toBe(true)
    expect(data.ui.active).toBe(true)
    expect(data.migrationError).toBeNull()
    expect(data.operations).toEqual([])
    expect('cache' in data, '/store 不应含 cache').toBe(false)

    expect(data.markets.length).toBe(1)
    const summary = data.markets[0]
    expect(summary.id).toBe(market.id)
    expect(summary.type).toBe('local')
    expect(summary.format).toBe('claude')
    expect(summary.location).toBe(market.location)
    expect(summary.refreshError).toBeNull()
    expect(summary.pluginCount).toBe(3)
    expect(typeof summary.lastRefreshed).toBe('string')
    expect(summary.display.title).toBe('fixture-claude-market')
    expect(summary.display.owner.name).toBe('dsh-agent-plugin-hub fixtures')
    expect(summary.health.status).toBe('ok')
    expect(summary.refreshing).toBe(false)

    expect(data.items.length).toBe(3)
    const demo = data.items.find((item: AnyJson) => item.name === 'demo-claude')
    expect(demo.key).toBe(`${market.id}/demo-claude`)
    expect(demo.version).toBe('0.1.0')
    expect(demo.versionValid).toBe(true)
    expect(demo.format).toBe('claude')
    expect(demo.market.id).toBe(market.id)
    expect(demo.installed).toBe(true)
    expect(demo.installedVersion).toBe('0.1.0')
    expect(demo.installedEnabled).toBe(true)
    expect(demo.update.state).toBe('current')
    expect(demo.source.kind).toBe('local')
    expect(demo.source.resolved).toBe(true)
    expect(demo.source.cloneRequired).toBe(false)
    expect(demo.installable).toBe(true)
    expect(demo.blockedReason).toBeNull()
    const npm = data.items.find((item: AnyJson) => item.name === 'npm-plugin')
    expect(npm.installable).toBe(false)
    expect(npm.blockedReason).toMatch(/npm/u)

    expect(data.installed.length).toBe(1)
    const installed = data.installed[0]
    expect(installed.key).toBe(`${market.id}/demo-claude`)
    expect(typeof installed.installedAt).toBe('string')
    expect(typeof installed.installedPath).toBe('string')
    expect(installed.previousVersions).toEqual([])
    expect(installed.capabilities.skills).toEqual(['greet'])
    expect(installed.orphan).toBe(false)
    expect(installed.market.id).toBe(market.id)
    expect(installed.display.title).toBe('demo-claude')
    expect(installed.displaySource).toBe('market')
    expect(installed.update.state).toBe('current')

    expect(data.runtime.skills.registered).toBe(true)
    expect(data.runtime.commands.available).toBe(true)
    expect(data.runtime.hooks.attached).toBe(true)
    expect(data.runtime.mcp.available).toBe(false)
    expect(data.stats).toEqual({
      markets: 1,
      items: 3,
      installable: 1,
      installed: 1,
      updatesAvailable: 0,
      orphans: 0,
      marketsWithError: 0,
    })
    expect(ctx.state.providers.length).toBe(1)
  })

  it('GET /store：声明级更新（条目 version）与统计', async () => {
    const { route, hub, market, marketDir } = await setup()
    await hub.install({ market: market.id, name: 'demo-claude' })
    patchMarketplace(marketDir, (manifest) => {
      manifest.plugins[0].version = '0.2.0'
    })
    await hub.marketRefresh(market.id)
    const data = (await get(route, `${API}/store`)).body.data
    expect(data.installed[0].update.state).toBe('available')
    expect(data.installed[0].update.currentVersion).toBe('0.1.0')
    expect(data.installed[0].update.latestVersion).toBe('0.2.0')
    expect(data.installed[0].update.checkedBy).toBe('declared')
    expect(data.stats.updatesAvailable).toBe(1)
    const demo = data.items.find((item: AnyJson) => item.name === 'demo-claude')
    expect(demo.update.state).toBe('available')
  })

  it('GET /describe：已安装走安装目录，能力分区 + 清单 + update', async () => {
    const { route, hub, market } = await setup()
    const { record } = await hub.install({ market: market.id, name: 'demo-claude' })
    const result = await get(route, `${API}/describe?key=${encodeURIComponent(record.key)}`)
    expect(result.status, JSON.stringify(result.body)).toBe(200)
    const detail = result.body.data
    expect(detail.key).toBe(record.key)
    expect(detail.format).toBe('claude')
    expect(detail.orphan).toBe(false)
    expect(detail.installed.installed).toBe(true)
    expect(detail.installed.key).toBe(record.key)
    expect(detail.installed.version).toBe('0.1.0')
    expect(detail.installed.enabled).toBe(true)
    expect(detail.update.state).toBe('current')
    expect(detail.installable).toBe(false)
    expect(detail.display.title).toBe('demo-claude')
    expect(detail.manifest.name).toBe('demo-claude')
    expect(detail.manifest.author.name).toBe('fixture')
    expect(detail.manifest.rawKeys.includes('skills')).toBe(true)

    expect(detail.capabilities.skills.map((item: AnyJson) => item.name)).toEqual(['greet'])
    expect(detail.capabilities.commands.map((item: AnyJson) => item.name)).toEqual(['hello'])
    expect(detail.capabilities.commands[0].hostName).toBe('demo-claude-hello')
    expect(detail.capabilities.commands[0].enabled).toBe(true)
    expect(detail.capabilities.hooks.map((item: AnyJson) => item.event)).toEqual(['PreToolUse', 'PostToolUse', 'Stop', 'Notification'])
    const pre = detail.capabilities.hooks.find((item: AnyJson) => item.event === 'PreToolUse')
    expect(pre.host).toBe('tools/pre-execute')
    expect(pre.mode).toBe('waterfall')
    expect(pre.canBlock).toBe(true)
    expect(pre.entries).toBe(1)
    expect(pre.effective).toBe(true)
    const notification = detail.capabilities.hooks.find((item: AnyJson) => item.event === 'Notification')
    expect(notification.effective).toBe(false)
    expect(notification.reason).toMatch(/宿主没有对应事件/u)
    expect(detail.capabilities.mcpServers.length).toBe(2)
    expect(detail.capabilities.mcpServers[0].effective).toBe(false)
    expect(detail.capabilities.mcpServers[0].reason).toMatch(/MCP/u)
    expect(detail.hooksSource).toBe('hooks/hooks.json')
    expect(detail.mcpSource).toBe('.mcp.json')
    expect(detail.counts).toEqual({ skills: 1, commands: 1, hooks: 4, mcpServers: 2 })
  })

  it('GET /describe：未安装解析本地源目录，不联网', async () => {
    const { route, hub, market } = await setup()
    let refreshes = 0
    const original = hub.markets.refresh.bind(hub.markets)
    hub.markets.refresh = async (id) => {
      refreshes += 1
      return await original(id)
    }
    const result = await get(route, `${API}/describe?market=${encodeURIComponent(market.id)}&name=demo-claude`)
    expect(result.status, JSON.stringify(result.body)).toBe(200)
    const detail = result.body.data
    expect(detail.installed.installed).toBe(false)
    expect(detail.installed.key).toBeNull()
    expect(detail.installable).toBe(true)
    expect(detail.blockedReason).toBeNull()
    expect(detail.update.state).toBe('none')
    expect(detail.source.kind).toBe('local')
    expect(detail.source.resolved).toBe(true)
    expect(detail.manifest.name).toBe('demo-claude')
    expect(detail.capabilities.skills[0].name).toBe('greet')
    expect(refreshes, 'GET /describe 不得触发市场刷新').toBe(0)
    await get(route, `${API}/store`)
    expect(refreshes, 'GET /store 不得触发市场刷新').toBe(0)
  })

  it('GET /describe：来源缺失/不可安装时降级为 capabilities:null + 可读原因', async () => {
    const { route, market } = await setup()
    const missing = await get(route, `${API}/describe?market=${encodeURIComponent(market.id)}&name=missing-dir`)
    expect(missing.status).toBe(200)
    const missingData = missing.body.data
    expect(missingData.source.resolved).toBe(false)
    expect(missingData.source.reason).toMatch(/插件目录不存在/u)
    expect(missingData.capabilities).toBeNull()
    expect(missingData.manifest).toBeNull()
    expect(missingData.counts).toEqual({ skills: 0, commands: 0, hooks: 0, mcpServers: 0 })
    expect(missingData.installable).toBe(false)
    expect(missingData.blockedReason).toMatch(/插件目录不存在/u)

    const npm = await get(route, `${API}/describe?market=${encodeURIComponent(market.id)}&name=npm-plugin`)
    expect(npm.status).toBe(200)
    expect(npm.body.data.installable).toBe(false)
    expect(npm.body.data.blockedReason).toMatch(/npm/u)
  })

  it('GET /describe：URL 市场的相对路径源不可解析（零网络）', async () => {
    const { route, hub } = await setup()
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
      } as unknown as StoredEntry],
    })
    const result = await get(route, `${API}/describe?market=${encodeURIComponent(market.id)}&name=remote-plugin`)
    expect(result.status).toBe(200)
    const detail = result.body.data
    expect(detail.source.resolved).toBe(false)
    expect(detail.source.reason).toMatch(/URL 市场/u)
    expect(detail.capabilities).toBeNull()
    expect(detail.installable).toBe(false)
    expect(detail.blockedReason).toMatch(/URL 市场/u)
    expect(detail.display.title).toBe('Remote Plugin')

    const store = (await get(route, `${API}/store`)).body.data
    const remoteSummary = store.markets.find((entry: AnyJson) => entry.id === market.id)
    expect(remoteSummary.health.status).toBe('missing')
    const item = store.items.find((entry: AnyJson) => entry.name === 'remote-plugin')
    expect(item.installable).toBe(false)
    expect(item.source.reason).toMatch(/URL 市场/u)
  })

  it('POST /describe：fetch:true 才允许刷新市场（本地市场零网络）', async () => {
    const { route, hub, market } = await setup()
    let refreshes = 0
    const original = hub.markets.refresh.bind(hub.markets)
    hub.markets.refresh = async (id) => {
      refreshes += 1
      return await original(id)
    }
    const result = await post(route, 'describe', { market: market.id, name: 'demo-claude', fetch: true })
    expect(result.status, JSON.stringify(result.body)).toBe(200)
    expect(result.body.data.manifest.name).toBe('demo-claude')
    expect(refreshes).toBe(1)
    const noFetch = await post(route, 'describe', { market: market.id, name: 'demo-claude', fetch: false })
    expect(noFetch.status).toBe(200)
    expect(refreshes, 'fetch:false 不得刷新').toBe(1)
  })

  it('GET /describe：未知/歧义/缺参的错误码', async () => {
    const { route, hub, market, work } = await setup()
    const unknown = await get(route, `${API}/describe?key=${encodeURIComponent('no-such-market/x')}`)
    expect(unknown.status).toBe(404)
    expect(unknown.body.ok).toBe(false)
    expect(unknown.body.code).toBe('not_found')

    const bad = await get(route, `${API}/describe`)
    expect(bad.status).toBe(400)
    expect(bad.body.code).toBe('bad_request')

    const otherDir = path.join(work, 'claude-market-2')
    copyDir(market.location, otherDir)
    const other = await hub.marketAdd({ type: 'local', location: otherDir })
    const ambiguous = await get(route, `${API}/describe?name=demo-claude`)
    expect(ambiguous.status).toBe(409)
    expect(ambiguous.body.code).toBe('conflict')
    expect(ambiguous.body.error).toMatch(/多个市场/u)
    expect(other.id !== market.id).toBe(true)
  })

  it('GET /icon：市场内 raster 图标 200 + nosniff + 缓存头', async () => {
    const { route, hub, market } = await setup()
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x01, 0x02, 0x03])
    mkdirSync(path.join(market.location, 'plugins', 'demo-claude'), { recursive: true })
    writeFileSync(path.join(market.location, 'plugins', 'demo-claude', 'icon.png'), png)
    patchMarketplace(market.location, (manifest) => {
      manifest.plugins[0].icon = './plugins/demo-claude/icon.png'
    })
    await hub.marketRefresh(market.id)
    const store = (await get(route, `${API}/store`)).body.data
    const item = store.items.find((entry: AnyJson) => entry.name === 'demo-claude')
    expect(item.display.icon.kind).toBe('route')
    expect(item.display.icon.mime).toBe('image/png')
    expect(item.display.icon.url).toMatch(new RegExp(`^${API}/icon\\?key=`, 'u'))
    expect(item.display.icon.url).toMatch(/v=0\.1\.0/u)

    const key = `${market.id}/demo-claude`
    const icon = await get(route, `${API}/icon?key=${encodeURIComponent(key)}&v=0.1.0`)
    expect(icon.status).toBe(200)
    expect(icon.headers['content-type']).toBe('image/png')
    expect(icon.headers['x-content-type-options']).toBe('nosniff')
    expect(icon.headers['cache-control']).toMatch(/max-age=300/u)
    expect(Buffer.compare(icon.raw as Buffer, png)).toBe(0)
    expect(resolveStoreIconFile(hub, key)!.mime).toBe('image/png')
  })

  it('GET /icon：越界/SVG/https/data/缺失一律 404 JSON 或降级 none', async () => {
    const { route, hub, market } = await setup()
    const pluginDir = path.join(market.location, 'plugins', 'demo-claude')
    const key = `${market.id}/demo-claude`
    const notFound = async (url: string) => {
      const result = await get(route, url)
      expect(result.status).toBe(404)
      expect(result.body.ok).toBe(false)
      expect(result.body.code).toBe('not_found')
    }
    await notFound(`${API}/icon`)
    await notFound(`${API}/icon?key=${encodeURIComponent(key)}`)

    const setIcon = async (icon: string | null) => {
      patchMarketplace(market.location, (manifest) => {
        if (icon === null) delete manifest.plugins[0].icon
        else manifest.plugins[0].icon = icon
      })
      await hub.marketRefresh(market.id)
      return (await get(route, `${API}/store`)).body.data.items
        .find((entry: AnyJson) => entry.name === 'demo-claude').display.icon
    }

    // 越界路径：不解析（none）且 /icon 404
    expect((await setIcon('../../escape.png')).kind).toBe('none')
    await notFound(`${API}/icon?key=${encodeURIComponent(key)}`)

    // SVG：不在 raster 白名单
    writeFileSync(path.join(pluginDir, 'icon.svg'), '<svg xmlns="http://www.w3.org/2000/svg"/>')
    expect((await setIcon('./plugins/demo-claude/icon.svg')).kind).toBe('none')
    await notFound(`${API}/icon?key=${encodeURIComponent(key)}`)

    // https：直接给客户端 URL，不走 /icon
    const httpIcon = await setIcon('https://cdn.example.com/icon.png')
    expect(httpIcon).toEqual({ kind: 'http', url: 'https://cdn.example.com/icon.png', mime: null })
    await notFound(`${API}/icon?key=${encodeURIComponent(key)}`)

    // data URL：白名单 MIME + 大小上限
    const small = 'data:image/png;base64,iVBORw0KGgo='
    expect(await setIcon(small)).toEqual({ kind: 'data', url: small, mime: 'image/png' })
    const tooBig = `data:image/png;base64,${'A'.repeat(64 * 1024)}`
    expect((await setIcon(tooBig)).kind).toBe('none')
    expect((await setIcon('data:image/svg+xml;base64,PHN2Zz4=')).kind).toBe('none')

    // 缺省：none
    expect((await setIcon(null)).kind).toBe('none')
  })

  it('POST /market/add：仅凭 location 自动识别来源；重复添加 409', async () => {
    const { route, work, market } = await setup()
    const second = path.join(work, 'claude-market-b')
    copyDir(market.location, second)
    const added = await post(route, 'market/add', { location: second })
    expect(added.status, JSON.stringify(added.body)).toBe(200)
    const data = added.body.data
    expect(data.detectedType).toBe('local')
    expect(data.format).toBe('claude')
    expect(data.pluginCount).toBe(3)
    expect(data.refreshError).toBeNull()
    expect(data.message).toMatch(/市场已添加/u)
    expect(data.market.type).toBe('local')
    expect(data.market.pluginCount).toBe(3)

    const duplicate = await post(route, 'market/add', { location: second })
    expect(duplicate.status).toBe(409)
    expect(duplicate.body.code).toBe('conflict')
    expect(duplicate.body.error).toMatch(/市场已存在/u)

    const badLocation = await post(route, 'market/add', { location: path.join(work, 'not-there') })
    expect([400, 404]).toContain(badLocation.status)
    expect(badLocation.body.code).toBe('not_found')
    expect(badLocation.body.error).toMatch(/不存在/u)
  })

  it('POST /market/refresh：单个失败进 failures 仍 200，未知 id 404', async () => {
    const { route, hub, market } = await setup()
    const id = market.id
    writeFileSync(path.join(market.location, '.claude-plugin', 'marketplace.json'), '{ 坏掉的 JSON')
    const failed = await post(route, 'market/refresh', { id })
    expect(failed.status, JSON.stringify(failed.body)).toBe(200)
    expect(failed.body.data.refreshed.length).toBe(0)
    expect(failed.body.data.failures.length).toBe(1)
    expect(failed.body.data.failures[0].id).toBe(id)
    expect(failed.body.data.failures[0].error).toMatch(/JSON/u)
    expect(failed.body.data.stats.failed).toBe(1)
    expect(hub.markets.get(id)!.refreshError).toMatch(/JSON/u)

    const missing = await post(route, 'market/refresh', { id: 'no-such-market' })
    expect(missing.status).toBe(404)
    expect(missing.body.code).toBe('not_found')

    writeFileSync(
      path.join(market.location, '.claude-plugin', 'marketplace.json'),
      `${JSON.stringify({ name: 'fixture-claude-market', plugins: [{ name: 'demo-claude', version: '0.1.0', source: './plugins/demo-claude' }] }, null, 2)}\n`,
    )
    const all = await post(route, 'market/refresh', {})
    expect(all.status).toBe(200)
    expect(all.body.data.stats.ok).toBe(1)
    expect(all.body.data.stats.failed).toBe(0)
  })

  it('POST /market/remove：允许保留已安装插件并返回 orphaned', async () => {
    const { route, hub, market } = await setup()
    const { record } = await hub.install({ market: market.id, name: 'demo-claude' })
    const removed = await post(route, 'market/remove', { id: market.id })
    expect(removed.status, JSON.stringify(removed.body)).toBe(200)
    expect(removed.body.data.orphaned).toEqual(['demo-claude'])
    expect(removed.body.data.message).toMatch(/已移除市场/u)
    expect(hub.markets.list().length).toBe(0)
    expect(hub.state.plugins.length, '安装副本与状态应保留').toBe(1)

    const store = (await get(route, `${API}/store`)).body.data
    expect(store.markets.length).toBe(0)
    expect(store.items.length).toBe(0)
    expect(store.installed.length).toBe(1)
    expect(store.installed[0].orphan).toBe(true)
    expect(store.installed[0].market).toBeNull()
    expect(store.installed[0].update.state).toBe('unknown')
    expect(store.installed[0].update.reason).toMatch(/来源市场已移除/u)
    expect(store.stats.orphans).toBe(1)

    const detail = await get(route, `${API}/describe?key=${encodeURIComponent(record.key)}`)
    expect(detail.status).toBe(200)
    expect(detail.body.data.orphan).toBe(true)
    expect(detail.body.data.market).toBeNull()
    expect(detail.body.data.capabilities.skills[0].name).toBe('greet')
    expect(hub.state.plugins[0]!.installedPath.length > 0, '安装目录仍保留').toBe(true)
    expect(resolveStoreIconFile(hub, record.key)).toBeNull()
  })

  it('POST /update：声明级升级 + 回滚（previousVersion 与 rollback）', async () => {
    const { route, hub, market, marketDir } = await setup()
    const { record } = await hub.install({ market: market.id, name: 'demo-claude' })
    patchMarketplace(marketDir, (manifest) => {
      manifest.plugins[0].version = '0.2.0'
    })
    patchPluginManifest(marketDir, 'demo-claude', (manifest) => {
      manifest.version = '0.2.0'
      manifest.description = '0.2.0 夹具'
    })
    const updated = await post(route, 'update', { key: record.key })
    expect(updated.status, JSON.stringify(updated.body)).toBe(200)
    expect(updated.body.data.changed).toBe(true)
    expect(updated.body.data.previousVersion).toBe('0.1.0')
    expect(updated.body.data.record.version).toBe('0.2.0')
    expect(updated.body.data.message).toMatch(/0\.1\.0 → 0\.2\.0/u)

    const rolled = await post(route, 'rollback', { key: record.key })
    expect(rolled.status, JSON.stringify(rolled.body)).toBe(200)
    expect(rolled.body.data.version).toBe('0.1.0')
    expect(rolled.body.data.previousVersion).toBe('0.2.0')
    expect(hub.findRecord(record.key).version).toBe('0.1.0')
  })

  it('POST /rollback：支持指定目标版本，未知版本报 not_found', async () => {
    const { route, hub, market, marketDir } = await setup()
    await hub.install({ market: market.id, name: 'demo-claude' })
    patchMarketplace(marketDir, (manifest) => {
      manifest.plugins[0].version = '0.2.0'
    })
    patchPluginManifest(marketDir, 'demo-claude', (manifest) => {
      manifest.version = '0.2.0'
    })
    await post(route, 'update', { key: 'demo-claude' })

    const rolled = await post(route, 'rollback', { key: 'demo-claude', version: '0.1.0' })
    expect(rolled.status, JSON.stringify(rolled.body)).toBe(200)
    expect(rolled.body.data.version).toBe('0.1.0')
    expect(hub.findRecord('demo-claude').version).toBe('0.1.0')

    const bad = await post(route, 'rollback', { key: 'demo-claude', version: '9.9.9' })
    expect(bad.status).toBe(404)
    expect(bad.body.code).toBe('not_found')
  })

  it('POST /update-all：按市场去重刷新一次、部分失败不中断、一次 saveState', async () => {
    const { route, hub, market, work } = await setup()
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

    const refreshCalls: string[] = []
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
    expect(result.status, JSON.stringify(result.body)).toBe(200)
    const data = result.body.data
    expect(data.aborted).toBe(false)
    expect(data.succeeded.length).toBe(1)
    expect(data.failed.length).toBe(1)
    expect(data.succeeded[0].key).toBe(`${market.id}/demo-claude`)
    expect(data.failed[0].key).toBe(`${market2.id}/demo-claude`)
    expect(data.failed[0].error).toMatch(/目录不存在/u)
    expect(data.summary).toEqual({ total: 2, updated: 1, skipped: 0, failed: 1, markets: 2 })
    expect([...refreshCalls].sort(), '每个市场只刷新一次').toEqual([market.id, market2.id].sort())
    expect(saves, '全部更新只保存一次 state').toBe(1)
    expect(hub.findRecord(`${market.id}/demo-claude`).version).toBe('0.2.0')
    expect(hub.findRecord(`${market2.id}/demo-claude`).version).toBe('0.1.0')
  })

  it('单写互斥：在途操作期间写接口 409，读接口照常，完成后释放', async () => {
    const { route, hub, market } = await setup()
    let release: (value: unknown) => void = () => {}
    const pending = hub.runOperation('update', { key: 'x/y' }, () => new Promise((resolve) => {
      release = resolve
    }))
    const conflict = await post(route, 'install', { market: market.id, name: 'demo-claude' })
    expect(conflict.status).toBe(409)
    expect(conflict.body.code).toBe('operation_in_progress')
    expect(conflict.body.details.operation.kind).toBe('update')
    expect(conflict.body.error).toMatch(/正在进行/u)

    const describeFetch = await post(route, 'describe', { market: market.id, name: 'demo-claude', fetch: true })
    expect(describeFetch.status).toBe(409)

    const store = await get(route, `${API}/store`)
    expect(store.status, '读接口不加锁').toBe(200)
    expect(store.body.data.operations.length).toBe(1)
    expect(store.body.data.operations[0].kind).toBe('update')
    expect(typeof store.body.data.operations[0].id).toBe('string')
    expect(typeof store.body.data.operations[0].startedAt).toBe('string')

    release({ changed: false })
    await pending
    const after = await get(route, `${API}/store`)
    expect(after.body.data.operations).toEqual([])
    const installed = await post(route, 'install', { market: market.id, name: 'demo-claude' })
    expect(installed.status, JSON.stringify(installed.body)).toBe(200)
  })

  it('访问控制与错误码：403 / 404 / 405 / 400', async () => {
    const { route, market } = await setup()
    const remote = await callRoute(route, { url: `${API}/store`, headers: { host: '192.168.1.10:9271' } })
    expect(remote.status).toBe(403)
    expect(remote.body.code).toBe('forbidden')

    const crossOrigin = await callRoute(route, {
      method: 'POST',
      url: `${API}/market/add`,
      headers: { host: '127.0.0.1:9271', origin: 'http://evil.example', 'content-type': 'application/json' },
      body: '{}',
    })
    expect(crossOrigin.status).toBe(403)

    // https 同源（宿主 webServer 以 https 提供时）同样放行：到达路由层后按 404 报未知接口。
    const httpsOrigin = await callRoute(route, {
      method: 'POST',
      url: `${API}/nope`,
      headers: { host: '127.0.0.1:9271', origin: 'https://127.0.0.1:9271', 'content-type': 'application/json' },
      body: '{}',
    })
    expect(httpsOrigin.status, 'https 同源 Origin 应被放行（404 而非 403）').toBe(404)
    expect(httpsOrigin.body.code).toBe('not_found')

    const nullOrigin = await callRoute(route, {
      method: 'POST',
      url: `${API}/market/add`,
      headers: { host: '127.0.0.1:9271', origin: 'null', 'content-type': 'application/json' },
      body: '{}',
    })
    expect(nullOrigin.status, 'sandbox iframe 的 Origin: null 仍应拒绝').toBe(403)

    const plain = await callRoute(route, {
      method: 'POST',
      url: `${API}/market/add`,
      headers: { host: '127.0.0.1:9271', origin: 'http://127.0.0.1:9271', 'content-type': 'text/plain' },
      body: '{}',
    })
    expect(plain.status).toBe(403)

    const unknownGet = await get(route, `${API}/nope`)
    expect(unknownGet.status).toBe(404)
    expect(unknownGet.body.code).toBe('not_found')
    const unknownPost = await post(route, 'nope', {})
    expect(unknownPost.status).toBe(404)

    const wrongMethod = await post(route, 'store', {})
    expect(wrongMethod.status).toBe(405)
    expect(wrongMethod.body.code).toBe('method_not_allowed')
    const getPost = await get(route, `${API}/install`)
    expect(getPost.status).toBe(405)

    const badJson = await callRoute(route, { method: 'POST', url: `${API}/market/add`, headers: POST_HEADERS, body: '{ 不是 JSON' })
    expect(badJson.status).toBe(400)
    expect(badJson.body.code).toBe('bad_request')
    expect(badJson.body.error).toMatch(/JSON/u)

    const notInstalled = await post(route, 'uninstall', { key: `${market.id}/demo-claude` })
    expect(notInstalled.status).toBe(404)
    expect(notInstalled.body.code).toBe('not_found')
    const badKind = await post(route, 'capability', { key: `${market.id}/demo-claude`, kind: 'nope', capability: 'x' })
    expect(badKind.status).toBe(400)
    expect(badKind.body.code).toBe('bad_request')
  })

  it('访问控制：sec-fetch-site: cross-site 一律拒绝（GET/HEAD 除外）', async () => {
    const { route } = await setup()
    // 浏览器 attest 的跨站 POST：即使 Origin 同源 + JSON 也拒绝。
    const crossSitePost = await callRoute(route, {
      method: 'POST',
      url: `${API}/market/refresh`,
      headers: {
        host: '127.0.0.1:9271',
        origin: 'http://127.0.0.1:9271',
        'content-type': 'application/json',
        'sec-fetch-site': 'cross-site',
      },
      body: '{}',
    })
    expect(crossSitePost.status).toBe(403)
    expect(crossSitePost.body.code).toBe('forbidden')

    // same-origin 标注 + 同源 Origin + JSON：放行。
    const sameSitePost = await callRoute(route, {
      method: 'POST',
      url: `${API}/market/refresh`,
      headers: {
        host: '127.0.0.1:9271',
        origin: 'http://127.0.0.1:9271',
        'content-type': 'application/json',
        'sec-fetch-site': 'same-origin',
      },
      body: '{}',
    })
    expect(sameSitePost.status).toBe(200)

    // GET/HEAD 例外：cross-site 标注的 GET 仍可读（/store 零网络）。
    const crossSiteGet = await callRoute(route, {
      url: `${API}/store`,
      headers: { host: '127.0.0.1:9271', 'sec-fetch-site': 'cross-site' },
    })
    expect(crossSiteGet.status).toBe(200)

    // isAdmitted 单元面：cross-site 的 POST 拒绝，同源 POST 通过。
    expect(isAdmitted({
      method: 'POST',
      url: `${API}/market/refresh`,
      headers: {
        host: '127.0.0.1:9271',
        origin: 'http://127.0.0.1:9271',
        'content-type': 'application/json',
        'sec-fetch-site': 'cross-site',
      },
    })).toBe(false)
    expect(isAdmitted({
      method: 'POST',
      url: `${API}/market/refresh`,
      headers: {
        host: '127.0.0.1:9271',
        origin: 'http://127.0.0.1:9271',
        'content-type': 'application/json',
        'sec-fetch-site': 'same-origin',
      },
    })).toBe(true)
  })

  it('已安装动作：capability / enable / uninstall 经路由生效', async () => {
    const { route, hub, market, ctx } = await setup()
    const { record } = await hub.install({ market: market.id, name: 'demo-claude' })
    const disabled = await post(route, 'capability', {
      key: record.key,
      kind: 'skills',
      capability: 'greet',
      enabled: false,
    })
    expect(disabled.status, JSON.stringify(disabled.body)).toBe(200)
    expect(disabled.body.data.disabledCapabilities.skills).toEqual(['greet'])
    expect(await ctx.state.providers[0]!.list({})).toEqual([])

    const detail = await get(route, `${API}/describe?key=${encodeURIComponent(record.key)}`)
    expect(detail.body.data.capabilities.skills[0].enabled).toBe(false)
    expect(detail.body.data.capabilities.commands[0].enabled).toBe(true)

    const commands = await post(route, 'capability', {
      key: record.key,
      kind: 'commands',
      capability: 'hello',
      enabled: false,
    })
    expect(commands.status).toBe(200)
    expect(ctx.state.commands.has('demo-claude-hello')).toBe(false)

    const disabledPlugin = await post(route, 'enable', { key: record.key, enabled: false })
    expect(disabledPlugin.status).toBe(200)
    expect(disabledPlugin.body.data.enabled).toBe(false)
    let store = (await get(route, `${API}/store`)).body.data
    expect(store.installed[0].enabled).toBe(false)

    const uninstalled = await post(route, 'uninstall', { key: record.key })
    expect(uninstalled.status).toBe(200)
    store = (await get(route, `${API}/store`)).body.data
    expect(store.installed.length).toBe(0)
    expect(store.items.find((item: AnyJson) => item.name === 'demo-claude').installed).toBe(false)
  })

  it('存储迁移：v1 → v2 成功且 /store.migrationError 为 null', async () => {
    const work = tempHome('hub-ui-migrate-')
    tempDirs.push(work)
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
    const webServer = createFakeWebServer()
    const ctx = createFakeCtx({ webServer })
    const hub = new AgentPluginHub({
      home,
      // FakeCtx mirrors the hub's HostContext face structurally; cast to satisfy tsc.
      ctx: ctx as unknown as HostContext,
    })
    hub.start()
    expect(hub.migrationError).toBeNull()
    expect(hub.migration?.migrated).toBe(true)
    expect(hub.migration?.from).toBe(1)
    expect(hub.migration?.to).toBe(2)
    expect(typeof hub.migration?.backup).toBe('string')
    expect((JSON.parse(readFileSync(path.join(home, 'state.json'), 'utf8')) as { schemaVersion: number }).schemaVersion).toBe(2)
    expect((JSON.parse(readFileSync(path.join(home, 'marketplaces.json'), 'utf8')) as { schemaVersion: number }).schemaVersion).toBe(2)

    mountUiRoutes(ctx, hub)
    const store = (await get(firstRoute(webServer), `${API}/store`)).body.data
    expect(store.migrationError).toBeNull()
    expect(store.markets.length).toBe(1)
    expect(store.markets[0].title).toBe('old-market')
    expect(store.markets[0].refreshError).toBeNull()
  })

  it('存储迁移失败：/store.migrationError 返回可读原因，读取仍继续', async () => {
    const work = tempHome('hub-ui-migrate-fail-')
    tempDirs.push(work)
    const marketDir = copyFixture('claude-market', work)
    const home = path.join(work, 'hub-home')
    mkdirSync(home, { recursive: true })
    writeFileSync(
      path.join(home, 'marketplaces.json'),
      `${JSON.stringify({ schemaVersion: 99, markets: [{ id: 'local-x', name: 'x', type: 'local', location: marketDir, format: 'claude', plugins: [] }] }, null, 2)}\n`,
    )
    const webServer = createFakeWebServer()
    const ctx = createFakeCtx({ webServer })
    const hub = new AgentPluginHub({
      home,
      // FakeCtx mirrors the hub's HostContext face structurally; cast to satisfy tsc.
      ctx: ctx as unknown as HostContext,
    })
    hub.start()
    expect(typeof hub.migrationError).toBe('string')
    expect(hub.migrationError).toMatch(/schemaVersion/u)
    mountUiRoutes(ctx, hub)
    const store = (await get(firstRoute(webServer), `${API}/store`)).body.data
    expect(typeof store.migrationError).toBe('string')
    expect(store.migrationError).toMatch(/schemaVersion/u)
  })

  it('ui-data 直接调用：buildStoreSnapshot / buildDescribe 可用', async () => {
    const { hub, market } = await setup()
    await hub.install({ market: market.id, name: 'demo-claude' })
    const snapshot = await buildStoreSnapshot(hub)
    expect(snapshot.items.length).toBe(3)
    expect(snapshot.installed.length).toBe(1)
    const detail = await buildDescribe(hub, { market: market.id, name: 'demo-claude' })
    const capabilities = detail.capabilities as { hooks: unknown[], mcpServers: unknown[] }
    expect(capabilities.hooks.length).toBe(4)
    expect(capabilities.mcpServers.length).toBe(2)
    expect((detail.counts as { hooks: number }).hooks).toBe(4)
  })
})
