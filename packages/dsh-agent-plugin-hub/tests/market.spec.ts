/**
 * 市场管理测试：local 目录、url 直链、刷新失败记录、路径越界拒绝、
 * 自动识别来源、展示元数据往返、git 重启恢复、图标边界。
 */

import { spawnSync } from 'node:child_process'
import { cpSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import path from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { AgentPluginHub } from '../src/hub.ts'
import { detectSource, entryIconFile, marketRoot } from '../src/market.ts'
import type { MarketRecord, StoredEntry } from '../src/store.ts'
import { copyFixture, removeDirs, tempHome } from './helpers.ts'

async function makeHub(work: string): Promise<AgentPluginHub> {
  const home = path.join(work, 'hub-home')
  const hub = new AgentPluginHub({ home })
  hub.start()
  return hub
}

/** 写 marketplace.json 的夹具副本。 */
function editMarketplace(marketDir: string, edit: (manifest: Record<string, unknown>) => void): void {
  const file = path.join(marketDir, '.claude-plugin', 'marketplace.json')
  const manifest = JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>
  edit(manifest)
  writeFileSync(file, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
}

/** 按名称取市场条目；缺失时让用例失败。 */
function entryOf(market: MarketRecord, name: string): StoredEntry {
  const entry = market.plugins.find(item => item.name === name)
  if (!entry) throw new Error(`市场 ${market.id} 里没有插件条目：${name}`)
  return entry
}

/** 在指定目录初始化本地 git 仓库并提交。 */
function initGitRepo(dir: string): void {
  const git = (args: string[]): string => {
    const result = spawnSync('git', args, {
      cwd: dir,
      encoding: 'utf8',
      env: {
        ...process.env,
        GIT_TERMINAL_PROMPT: '0',
        GCM_INTERACTIVE: 'Never',
      },
    })
    if (result.status !== 0) throw new Error(`git ${args.join(' ')} 失败：${result.stderr}`)
    return result.stdout
  }
  git(['init', '-b', 'main'])
  git(['add', '-A'])
  git(['-c', 'user.name=fixture', '-c', 'user.email=fixture@example.com', 'commit', '-m', 'fixture'])
}

describe('市场管理', () => {
  // Temp work dirs registered per test; removed in afterEach.
  const workDirs: string[] = []
  const makeWork = (prefix: string): string => {
    const dir = tempHome(prefix)
    workDirs.push(dir)
    return dir
  }
  afterEach(() => {
    removeDirs(...workDirs.splice(0))
  })

  it('local 市场：添加 / 刷新 / 列表 / 移除', async () => {
    const work = makeWork('hub-market-')
    const marketDir = copyFixture('claude-market', work)
    const hub = await makeHub(work)
    const market = await hub.marketAdd({ type: 'local', location: marketDir })
    expect(market.type).toBe('local')
    expect(market.format).toBe('claude')
    expect(market.plugins.length).toBe(3)
    expect(market.refreshError).toBeUndefined()
    expect(market.lastRefreshed).toBeTruthy()
    expect(hub.markets.list().length).toBe(1)
    const refreshed = await hub.marketRefresh(market.id)
    expect(refreshed.refreshed.length).toBe(1)
    const removed = hub.marketRemove(market.id)
    expect(removed.id).toBe(market.id)
    expect(hub.markets.list().length).toBe(0)
  })

  it('root 级 marketplace.json 市场可添加', async () => {
    const work = makeWork('hub-market-')
    const marketDir = copyFixture('root-market', work)
    const hub = await makeHub(work)
    const market = await hub.marketAdd({ type: 'local', location: marketDir })
    expect(market.plugins.length).toBe(1)
    expect(market.plugins[0]?.name).toBe('demo-root')
  })

  it('单插件目录可直接作为 local 市场', async () => {
    const work = makeWork('hub-market-')
    const pluginDir = copyFixture('root-manifest-plugin', work)
    const hub = await makeHub(work)
    const market = await hub.marketAdd({ type: 'local', location: pluginDir })
    expect(market.plugins.length).toBe(1)
    expect(market.plugins[0]?.name).toBe('demo-root')
  })

  it('重复添加同一市场被拒绝', async () => {
    const work = makeWork('hub-market-')
    const marketDir = copyFixture('claude-market', work)
    const hub = await makeHub(work)
    await hub.marketAdd({ type: 'local', location: marketDir })
    await expect(hub.marketAdd({ type: 'local', location: marketDir })).rejects.toThrow(/市场已存在/)
  })

  it('不存在的本地目录报中文错误', async () => {
    const work = makeWork('hub-market-')
    const hub = await makeHub(work)
    await expect(
      hub.marketAdd({ type: 'local', location: path.join(work, 'nope') }),
    ).rejects.toThrow(/本地市场目录不存在/)
  })

  it('URL 市场：成功拉取、失败只记录 refreshError', async () => {
    const work = makeWork('hub-market-')
    const hub = await makeHub(work)
    const payload = {
      name: 'url-fixture-market',
      plugins: [
        { name: 'remote-plugin', description: '远端插件', source: { source: 'github', repo: 'example/demo' } },
      ],
    }
    const server = createServer((_request, response) => {
      response.setHeader('content-type', 'application/json')
      response.end(JSON.stringify(payload))
    })
    await new Promise<void>((resolve) => { server.listen(0, '127.0.0.1', () => resolve()) })
    const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/marketplace.json`
    try {
      const market = await hub.marketAdd({ type: 'url', location: url })
      expect(market.plugins.length).toBe(1)
      expect(market.plugins[0]?.source.kind).toBe('github')
      expect(market.lastRefreshed).toBeTruthy()
    } finally {
      await new Promise<void>((resolve) => { server.close(() => resolve()) })
    }
    // 服务已关闭：再次刷新应记录 refreshError 而不是抛出
    const market = hub.markets.list()[0]!
    const result = await hub.marketRefresh(market.id)
    expect(result.failures.length).toBe(0)
    expect(result.refreshed[0]?.refreshError).toBeTruthy()
    expect(result.refreshed[0]?.refreshError ?? '').toMatch(/拉取|fetch|ECONN/)
  })

  it('URL 市场首次拉取失败仍添加记录并记录错误', async () => {
    const work = makeWork('hub-market-')
    const hub = await makeHub(work)
    const market = await hub.marketAdd({ type: 'url', location: 'http://127.0.0.1:1/marketplace.json' })
    expect(market.refreshError).toBeTruthy()
    expect(market.plugins.length).toBe(0)
  })

  it('路径穿越与绝对路径插件不能被安装', async () => {
    const work = makeWork('hub-market-')
    const marketDir = copyFixture('traversal-market', work)
    const hub = await makeHub(work)
    const market = await hub.marketAdd({ type: 'local', location: marketDir })
    expect(market.plugins.length).toBe(2)
    await expect(
      hub.install({ name: 'escape-plugin', market: market.id }),
    ).rejects.toThrow(/越出市场根目录|不得包含/)
    await expect(
      hub.install({ name: 'absolute-plugin', market: market.id }),
    ).rejects.toThrow(/绝对路径/)
  })

  it('移除市场时允许保留已安装插件并返回将被孤立的插件名', async () => {
    const work = makeWork('hub-market-')
    const marketDir = copyFixture('claude-market', work)
    const hub = await makeHub(work)
    const market = await hub.marketAdd({ type: 'local', location: marketDir })
    await hub.install({ name: 'demo-claude', market: market.id })
    const removed = hub.marketRemove(market.id)
    expect(removed.id).toBe(market.id)
    expect(removed.orphaned).toEqual(['demo-claude'])
    expect(hub.markets.list().length).toBe(0)
    expect(hub.state.plugins.length, '已安装记录保留（进入孤立状态）').toBe(1)
    hub.uninstall('demo-claude')
  })

  it('市场展示元数据：meta/display/title 持久化，用户别名刷新后保留，重启可读回', async () => {
    const work = makeWork('hub-meta-')
    const marketDir = copyFixture('claude-market', work)
    editMarketplace(marketDir, (manifest) => {
      manifest.description = '市场描述'
      manifest.owner = { name: 'owner-name', email: 'owner@example.com' }
      const plugins = manifest.plugins as Array<Record<string, unknown>>
      const entry = plugins.find(item => item.name === 'demo-claude')!
      entry.displayName = '演示插件'
      entry.category = 'tool'
      entry.author = { name: '作者', url: 'https://author.example' }
      entry.homepage = 'https://home.example'
      entry.repository = 'https://repo.example'
      entry.license = 'MIT'
      entry.keywords = ['demo', 'claude']
      entry.featured = true
    })
    const hub = await makeHub(work)
    const market = await hub.marketAdd({ type: 'local', location: marketDir, name: '我的市场' })
    expect(market.name, '用户别名不被上游 name 覆盖').toBe('我的市场')
    expect(market.title, '上游 name 存 title').toBe('fixture-claude-market')
    expect(market.display.title).toBe('fixture-claude-market')
    expect(market.display.description).toBe('市场描述')
    expect(market.display.owner.name).toBe('owner-name')
    expect(market.featured).toEqual(['demo-claude'])
    const entry = entryOf(market, 'demo-claude')
    expect(entry.meta.displayName).toBe('演示插件')
    expect(entry.meta.category).toBe('tool')
    expect(entry.meta.author).toEqual({ name: '作者', url: 'https://author.example' })
    expect(entry.meta.homepage).toBe('https://home.example')
    expect(entry.meta.repository).toBe('https://repo.example')
    expect(entry.meta.license).toBe('MIT')
    expect(entry.meta.keywords).toEqual(['demo', 'claude'])
    expect(Object.prototype.hasOwnProperty.call(entry, 'raw'), '不持久化完整 raw').toBe(false)

    // 重启：meta/display/title/别名都从 marketplaces.json 读回
    const restarted = new AgentPluginHub({ home: path.join(work, 'hub-home') })
    restarted.start()
    const reloaded = restarted.markets.get(market.id)!
    expect(reloaded.name).toBe('我的市场')
    expect(reloaded.title).toBe('fixture-claude-market')
    expect(reloaded.display.description).toBe('市场描述')
    expect(reloaded.plugins[0]?.meta.displayName).toBe('演示插件')
  })

  it('detectSource：local / git / url 各分支自动识别', async () => {
    const work = makeWork('hub-detect-')
    const hub = await makeHub(work)

    const marketDir = copyFixture('claude-market', work)
    const local = await detectSource(marketDir, { store: hub.store })
    expect(local).toEqual({ type: 'local', location: path.resolve(marketDir) })

    const pluginDir = copyFixture('root-manifest-plugin', work)
    expect((await detectSource(pluginDir, { store: hub.store })).type).toBe('local')

    const gitDir = path.join(work, 'plain-git-repo')
    mkdirSync(gitDir, { recursive: true })
    writeFileSync(path.join(gitDir, 'README.md'), 'git repo', 'utf8')
    initGitRepo(gitDir)
    const git = await detectSource(gitDir, { store: hub.store })
    expect(git.type).toBe('git')
    expect(git.location).toBe(path.resolve(gitDir))

    const emptyDir = path.join(work, 'empty-dir')
    mkdirSync(emptyDir, { recursive: true })
    await expect(detectSource(emptyDir, { store: hub.store })).rejects.toThrow(/目录不是市场/)

    for (const location of ['git@github.com:owner/repo.git', 'ssh://git@example.com/owner/repo', 'file:///E:/repo']) {
      expect((await detectSource(location, { store: hub.store })).type, location).toBe('git')
    }

    // URL：JSON 探测成功
    const fetchOk = async (): Promise<{ ok: true, text: () => Promise<string> }> => ({
      ok: true,
      text: async () => JSON.stringify({ name: 'remote-market', plugins: [{ name: 'p', source: './p' }] }),
    })
    const urlResult = await detectSource('https://example.com/marketplace.json', { store: hub.store, fetchImpl: fetchOk })
    expect(urlResult).toEqual({ type: 'url', location: 'https://example.com/marketplace.json' })

    // URL：JSON 失败 → git 克隆成功
    const gitFallback = await detectSource('https://example.com/repo.git', {
      store: hub.store,
      fetchImpl: async () => {
        throw new Error('HTTP 404')
      },
      cloneImpl: (_location, target) => {
        mkdirSync(target, { recursive: true })
      },
    })
    expect(gitFallback).toEqual({ type: 'git', location: 'https://example.com/repo.git' })

    // URL：JSON 与 git 都失败 → 中文错误
    await expect(
      detectSource('https://example.com/nope', {
        store: hub.store,
        fetchImpl: async () => {
          throw new Error('HTTP 404')
        },
        cloneImpl: () => {
          throw new Error('git clone 失败')
        },
      }),
    ).rejects.toThrow(/无法识别的市场地址/)

    await expect(detectSource('not-a-market', { store: hub.store })).rejects.toThrow(/无法识别/)
  })

  it('marketAdd 在 type 缺省时自动识别来源', async () => {
    const work = makeWork('hub-auto-')
    const marketDir = copyFixture('claude-market', work)
    const hub = await makeHub(work)
    const market = await hub.marketAdd({ location: marketDir })
    expect(market.type).toBe('local')
    expect(market.plugins.length).toBe(3)
  })

  it('git 市场重启后：marketRoot 可推导，refresh / install / update 正常（P0 回归）', async () => {
    const work = makeWork('hub-git-restart-')
    const repoDir = path.join(work, 'git-market-repo')
    const source = path.join(work, 'claude-market')
    copyFixture('claude-market', work)
    cpSync(source, repoDir, { recursive: true })
    initGitRepo(repoDir)

    const home = path.join(work, 'hub-home')
    const hub = new AgentPluginHub({ home })
    hub.start()
    const market = await hub.marketAdd({ type: 'git', location: repoDir })
    expect(market.type).toBe('git')
    expect(market.plugins.length).toBe(3)
    const expectedRoot = path.join(hub.store.paths.markets, market.id, 'repo')
    expect(marketRoot(market, hub.store)).toBe(expectedRoot)
    await hub.install({ name: 'demo-claude', market: market.id })
    expect(hub.state.plugins.length).toBe(1)

    const restarted = new AgentPluginHub({ home })
    restarted.start()
    const reloaded = restarted.markets.get(market.id)!
    // root 不是持久化字段，重启后只能由 marketRoot 推导。
    expect((reloaded as { root?: unknown }).root, '持久化记录不应带 root').toBeUndefined()
    expect(marketRoot(reloaded, restarted.store)).toBe(expectedRoot)

    // 重启后的三条关键路径都不应再抛 Node 英文 TypeError
    await restarted.marketRefresh(market.id)
    const reinstalled = await restarted.install({ name: 'demo-claude', market: market.id, force: true })
    expect(reinstalled.record.version).toBe('0.1.0')
    const updated = await restarted.update('demo-claude')
    expect(updated.changed).toBe(false)
    expect(updated.message).toMatch(/已是最新/)
  })

  it('entryIconFile：只接受市场根内 raster 文件（≤256 KiB），越界/SVG/data/https 返回 null', async () => {
    const work = makeWork('hub-icon-')
    const marketDir = copyFixture('claude-market', work)
    mkdirSync(path.join(marketDir, 'assets'), { recursive: true })
    writeFileSync(path.join(marketDir, 'assets', 'icon.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47]))
    writeFileSync(path.join(marketDir, 'assets', 'icon.svg'), '<svg xmlns="http://www.w3.org/2000/svg"/>')
    writeFileSync(path.join(marketDir, 'assets', 'big.png'), Buffer.alloc(256 * 1024 + 1, 1))
    editMarketplace(marketDir, (manifest) => {
      const plugins = manifest.plugins as Array<Record<string, unknown>>
      const entry = plugins.find(item => item.name === 'demo-claude')!
      entry.icon = 'assets/icon.png'
    })
    const hub = await makeHub(work)
    const market = await hub.marketAdd({ type: 'local', location: marketDir })
    const entry = entryOf(market, 'demo-claude')
    const icon = entryIconFile(market, entry, hub.store)
    expect(typeof icon).toBe('string')
    expect(icon?.endsWith(path.join('assets', 'icon.png'))).toBe(true)

    // 只携带 meta.icon 的假条目（entryIconFile 只读该字段）。
    const entryWithIcon = (icon: string): StoredEntry => ({ meta: { icon } }) as unknown as StoredEntry
    expect(entryIconFile(market, entryWithIcon('assets/big.png'), hub.store)).toBeNull()
    expect(entryIconFile(market, entryWithIcon('assets/icon.svg'), hub.store)).toBeNull()
    expect(entryIconFile(market, entryWithIcon('../outside.png'), hub.store)).toBeNull()
    expect(entryIconFile(market, entryWithIcon('assets/missing.png'), hub.store)).toBeNull()
    expect(entryIconFile(market, entryWithIcon('data:image/png;base64,AAAA'), hub.store)).toBeNull()
    expect(entryIconFile(market, entryWithIcon('https://example.com/i.png'), hub.store)).toBeNull()

    // url 市场没有本地源目录
    const urlMarket = { id: 'url-x', type: 'url', location: 'https://example.com/marketplace.json' } as unknown as MarketRecord
    expect(entryIconFile(urlMarket, entryWithIcon('assets/icon.png'), hub.store)).toBeNull()
  })
})
