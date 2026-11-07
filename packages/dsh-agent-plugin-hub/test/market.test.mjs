/**
 * 市场管理测试：local 目录、url 直链、刷新失败记录、路径越界拒绝、
 * 自动识别来源、展示元数据往返、git 重启恢复、图标边界。
 */

import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { cpSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import path from 'node:path'
import { test } from 'node:test'

import { AgentPluginHub } from '../lib/hub.js'
import { detectSource, entryIconFile, marketRoot } from '../lib/market.js'
import { cleanup, copyFixture, tempHome } from './helpers.mjs'

async function makeHub(t, work) {
  const home = path.join(work, 'hub-home')
  cleanup(t, work)
  const hub = new AgentPluginHub({ home })
  hub.start()
  return hub
}

function readJson(file) {
  return JSON.parse(readFileSync(file, 'utf8'))
}

/** 写 marketplace.json 的夹具副本。 */
function editMarketplace(marketDir, edit) {
  const file = path.join(marketDir, '.claude-plugin', 'marketplace.json')
  const manifest = readJson(file)
  edit(manifest)
  writeFileSync(file, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
}

/** 在指定目录初始化本地 git 仓库并提交。 */
function initGitRepo(dir) {
  const git = (args) => {
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

test('local 市场：添加 / 刷新 / 列表 / 移除', async (t) => {
  const work = tempHome('hub-market-')
  const marketDir = copyFixture('claude-market', work)
  const hub = await makeHub(t, work)
  const market = await hub.marketAdd({ type: 'local', location: marketDir })
  assert.equal(market.type, 'local')
  assert.equal(market.format, 'claude')
  assert.equal(market.plugins.length, 3)
  assert.equal(market.refreshError, undefined)
  assert.ok(market.lastRefreshed)
  assert.equal(hub.markets.list().length, 1)
  const refreshed = await hub.marketRefresh(market.id)
  assert.equal(refreshed.refreshed.length, 1)
  const removed = hub.marketRemove(market.id)
  assert.equal(removed.id, market.id)
  assert.equal(hub.markets.list().length, 0)
})

test('root 级 marketplace.json 市场可添加', async (t) => {
  const work = tempHome('hub-market-')
  const marketDir = copyFixture('root-market', work)
  const hub = await makeHub(t, work)
  const market = await hub.marketAdd({ type: 'local', location: marketDir })
  assert.equal(market.plugins.length, 1)
  assert.equal(market.plugins[0].name, 'demo-root')
})

test('单插件目录可直接作为 local 市场', async (t) => {
  const work = tempHome('hub-market-')
  const pluginDir = copyFixture('root-manifest-plugin', work)
  const hub = await makeHub(t, work)
  const market = await hub.marketAdd({ type: 'local', location: pluginDir })
  assert.equal(market.plugins.length, 1)
  assert.equal(market.plugins[0].name, 'demo-root')
})

test('重复添加同一市场被拒绝', async (t) => {
  const work = tempHome('hub-market-')
  const marketDir = copyFixture('claude-market', work)
  const hub = await makeHub(t, work)
  await hub.marketAdd({ type: 'local', location: marketDir })
  await assert.rejects(hub.marketAdd({ type: 'local', location: marketDir }), /市场已存在/)
})

test('不存在的本地目录报中文错误', async (t) => {
  const work = tempHome('hub-market-')
  const hub = await makeHub(t, work)
  await assert.rejects(
    hub.marketAdd({ type: 'local', location: path.join(work, 'nope') }),
    /本地市场目录不存在/,
  )
})

test('URL 市场：成功拉取、失败只记录 refreshError', async (t) => {
  const work = tempHome('hub-market-')
  const hub = await makeHub(t, work)
  const payload = {
    name: 'url-fixture-market',
    plugins: [
      { name: 'remote-plugin', description: '远端插件', source: { source: 'github', repo: 'example/demo' } },
    ],
  }
  const server = createServer((request, response) => {
    response.setHeader('content-type', 'application/json')
    response.end(JSON.stringify(payload))
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  const url = `http://127.0.0.1:${address.port}/marketplace.json`
  try {
    const market = await hub.marketAdd({ type: 'url', location: url })
    assert.equal(market.plugins.length, 1)
    assert.equal(market.plugins[0].source.kind, 'github')
    assert.ok(market.lastRefreshed)
  } finally {
    await new Promise((resolve) => server.close(resolve))
  }
  // 服务已关闭：再次刷新应记录 refreshError 而不是抛出
  const market = hub.markets.list()[0]
  const result = await hub.marketRefresh(market.id)
  assert.equal(result.failures.length, 0)
  assert.ok(result.refreshed[0].refreshError)
  assert.match(result.refreshed[0].refreshError, /拉取|fetch|ECONN/)
})

test('URL 市场首次拉取失败仍添加记录并记录错误', async (t) => {
  const work = tempHome('hub-market-')
  const hub = await makeHub(t, work)
  const market = await hub.marketAdd({ type: 'url', location: 'http://127.0.0.1:1/marketplace.json' })
  assert.ok(market.refreshError)
  assert.equal(market.plugins.length, 0)
})

test('路径穿越与绝对路径插件不能被安装', async (t) => {
  const work = tempHome('hub-market-')
  const marketDir = copyFixture('traversal-market', work)
  const hub = await makeHub(t, work)
  const market = await hub.marketAdd({ type: 'local', location: marketDir })
  assert.equal(market.plugins.length, 2)
  await assert.rejects(
    hub.install({ name: 'escape-plugin', market: market.id }),
    /越出市场根目录|不得包含/,
  )
  await assert.rejects(
    hub.install({ name: 'absolute-plugin', market: market.id }),
    /绝对路径/,
  )
})

test('移除市场时允许保留已安装插件并返回将被孤立的插件名', async (t) => {
  const work = tempHome('hub-market-')
  const marketDir = copyFixture('claude-market', work)
  const hub = await makeHub(t, work)
  const market = await hub.marketAdd({ type: 'local', location: marketDir })
  await hub.install({ name: 'demo-claude', market: market.id })
  const removed = hub.marketRemove(market.id)
  assert.equal(removed.id, market.id)
  assert.deepEqual(removed.orphaned, ['demo-claude'])
  assert.equal(hub.markets.list().length, 0)
  assert.equal(hub.state.plugins.length, 1, '已安装记录保留（进入孤立状态）')
  hub.uninstall('demo-claude')
})

test('市场展示元数据：meta/display/title 持久化，用户别名刷新后保留，重启可读回', async (t) => {
  const work = tempHome('hub-meta-')
  const marketDir = copyFixture('claude-market', work)
  editMarketplace(marketDir, (manifest) => {
    manifest.description = '市场描述'
    manifest.owner = { name: 'owner-name', email: 'owner@example.com' }
    const entry = manifest.plugins.find((item) => item.name === 'demo-claude')
    entry.displayName = '演示插件'
    entry.category = 'tool'
    entry.author = { name: '作者', url: 'https://author.example' }
    entry.homepage = 'https://home.example'
    entry.repository = 'https://repo.example'
    entry.license = 'MIT'
    entry.keywords = ['demo', 'claude']
    entry.featured = true
  })
  const hub = await makeHub(t, work)
  const market = await hub.marketAdd({ type: 'local', location: marketDir, name: '我的市场' })
  assert.equal(market.name, '我的市场', '用户别名不被上游 name 覆盖')
  assert.equal(market.title, 'fixture-claude-market', '上游 name 存 title')
  assert.equal(market.display.title, 'fixture-claude-market')
  assert.equal(market.display.description, '市场描述')
  assert.equal(market.display.owner.name, 'owner-name')
  assert.deepEqual(market.featured, ['demo-claude'])
  const entry = market.plugins.find((item) => item.name === 'demo-claude')
  assert.equal(entry.meta.displayName, '演示插件')
  assert.equal(entry.meta.category, 'tool')
  assert.deepEqual(entry.meta.author, { name: '作者', url: 'https://author.example' })
  assert.equal(entry.meta.homepage, 'https://home.example')
  assert.equal(entry.meta.repository, 'https://repo.example')
  assert.equal(entry.meta.license, 'MIT')
  assert.deepEqual(entry.meta.keywords, ['demo', 'claude'])
  assert.equal(Object.prototype.hasOwnProperty.call(entry, 'raw'), false, '不持久化完整 raw')

  // 重启：meta/display/title/别名都从 marketplaces.json 读回
  const restarted = new AgentPluginHub({ home: path.join(work, 'hub-home') })
  restarted.start()
  const reloaded = restarted.markets.get(market.id)
  assert.equal(reloaded.name, '我的市场')
  assert.equal(reloaded.title, 'fixture-claude-market')
  assert.equal(reloaded.display.description, '市场描述')
  assert.equal(reloaded.plugins[0].meta.displayName, '演示插件')
})

test('detectSource：local / git / url 各分支自动识别', async (t) => {
  const work = tempHome('hub-detect-')
  const hub = await makeHub(t, work)

  const marketDir = copyFixture('claude-market', work)
  const local = await detectSource(marketDir, { store: hub.store })
  assert.deepEqual(local, { type: 'local', location: path.resolve(marketDir) })

  const pluginDir = copyFixture('root-manifest-plugin', work)
  assert.equal((await detectSource(pluginDir, { store: hub.store })).type, 'local')

  const gitDir = path.join(work, 'plain-git-repo')
  mkdirSync(gitDir, { recursive: true })
  writeFileSync(path.join(gitDir, 'README.md'), 'git repo', 'utf8')
  initGitRepo(gitDir)
  const git = await detectSource(gitDir, { store: hub.store })
  assert.equal(git.type, 'git')
  assert.equal(git.location, path.resolve(gitDir))

  const emptyDir = path.join(work, 'empty-dir')
  mkdirSync(emptyDir, { recursive: true })
  await assert.rejects(detectSource(emptyDir, { store: hub.store }), /目录不是市场/)

  for (const location of ['git@github.com:owner/repo.git', 'ssh://git@example.com/owner/repo', 'file:///E:/repo']) {
    assert.equal((await detectSource(location, { store: hub.store })).type, 'git', location)
  }

  // URL：JSON 探测成功
  const fetchOk = async () => ({
    ok: true,
    text: async () => JSON.stringify({ name: 'remote-market', plugins: [{ name: 'p', source: './p' }] }),
  })
  const urlResult = await detectSource('https://example.com/marketplace.json', { store: hub.store, fetchImpl: fetchOk })
  assert.deepEqual(urlResult, { type: 'url', location: 'https://example.com/marketplace.json' })

  // URL：JSON 失败 → git 克隆成功
  const gitFallback = await detectSource('https://example.com/repo.git', {
    store: hub.store,
    fetchImpl: async () => {
      throw new Error('HTTP 404')
    },
    cloneImpl: (location, target) => {
      mkdirSync(target, { recursive: true })
    },
  })
  assert.deepEqual(gitFallback, { type: 'git', location: 'https://example.com/repo.git' })

  // URL：JSON 与 git 都失败 → 中文错误
  await assert.rejects(
    detectSource('https://example.com/nope', {
      store: hub.store,
      fetchImpl: async () => {
        throw new Error('HTTP 404')
      },
      cloneImpl: () => {
        throw new Error('git clone 失败')
      },
    }),
    /无法识别的市场地址/,
  )

  await assert.rejects(detectSource('not-a-market', { store: hub.store }), /无法识别/)
})

test('marketAdd 在 type 缺省时自动识别来源', async (t) => {
  const work = tempHome('hub-auto-')
  const marketDir = copyFixture('claude-market', work)
  const hub = await makeHub(t, work)
  const market = await hub.marketAdd({ location: marketDir })
  assert.equal(market.type, 'local')
  assert.equal(market.plugins.length, 3)
})

test('git 市场重启后：marketRoot 可推导，refresh / install / update 正常（P0 回归）', async (t) => {
  const work = tempHome('hub-git-restart-')
  cleanup(t, work)
  const repoDir = path.join(work, 'git-market-repo')
  const source = path.join(work, 'claude-market')
  copyFixture('claude-market', work)
  cpSync(source, repoDir, { recursive: true })
  initGitRepo(repoDir)

  const home = path.join(work, 'hub-home')
  const hub = new AgentPluginHub({ home })
  hub.start()
  const market = await hub.marketAdd({ type: 'git', location: repoDir })
  assert.equal(market.type, 'git')
  assert.equal(market.plugins.length, 3)
  const expectedRoot = path.join(hub.store.paths.markets, market.id, 'repo')
  assert.equal(marketRoot(market, hub.store), expectedRoot)
  await hub.install({ name: 'demo-claude', market: market.id })
  assert.equal(hub.state.plugins.length, 1)

  const restarted = new AgentPluginHub({ home })
  restarted.start()
  const reloaded = restarted.markets.get(market.id)
  assert.equal(reloaded.root, undefined, '持久化记录不应带 root')
  assert.equal(marketRoot(reloaded, restarted.store), expectedRoot)

  // 重启后的三条关键路径都不应再抛 Node 英文 TypeError
  await restarted.marketRefresh(market.id)
  const reinstalled = await restarted.install({ name: 'demo-claude', market: market.id, force: true })
  assert.equal(reinstalled.record.version, '0.1.0')
  const updated = await restarted.update('demo-claude')
  assert.equal(updated.changed, false)
  assert.match(updated.message, /已是最新/)
})

test('entryIconFile：只接受市场根内 raster 文件（≤256 KiB），越界/SVG/data/https 返回 null', async (t) => {
  const work = tempHome('hub-icon-')
  const marketDir = copyFixture('claude-market', work)
  mkdirSync(path.join(marketDir, 'assets'), { recursive: true })
  writeFileSync(path.join(marketDir, 'assets', 'icon.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47]))
  writeFileSync(path.join(marketDir, 'assets', 'icon.svg'), '<svg xmlns="http://www.w3.org/2000/svg"/>')
  writeFileSync(path.join(marketDir, 'assets', 'big.png'), Buffer.alloc(256 * 1024 + 1, 1))
  editMarketplace(marketDir, (manifest) => {
    const entry = manifest.plugins.find((item) => item.name === 'demo-claude')
    entry.icon = 'assets/icon.png'
  })
  const hub = await makeHub(t, work)
  const market = await hub.marketAdd({ type: 'local', location: marketDir })
  const entry = market.plugins.find((item) => item.name === 'demo-claude')
  const icon = entryIconFile(market, entry, hub.store)
  assert.equal(typeof icon, 'string')
  assert.ok(icon.endsWith(path.join('assets', 'icon.png')))

  assert.equal(entryIconFile(market, { meta: { icon: 'assets/big.png' } }, hub.store), null)
  assert.equal(entryIconFile(market, { meta: { icon: 'assets/icon.svg' } }, hub.store), null)
  assert.equal(entryIconFile(market, { meta: { icon: '../outside.png' } }, hub.store), null)
  assert.equal(entryIconFile(market, { meta: { icon: 'assets/missing.png' } }, hub.store), null)
  assert.equal(entryIconFile(market, { meta: { icon: 'data:image/png;base64,AAAA' } }, hub.store), null)
  assert.equal(entryIconFile(market, { meta: { icon: 'https://example.com/i.png' } }, hub.store), null)

  // url 市场没有本地源目录
  const urlMarket = { id: 'url-x', type: 'url', location: 'https://example.com/marketplace.json' }
  assert.equal(entryIconFile(urlMarket, { meta: { icon: 'assets/icon.png' } }, hub.store), null)
})