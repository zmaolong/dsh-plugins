/**
 * 市场管理测试：local 目录、url 直链、刷新失败记录、路径越界拒绝。
 */

import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import path from 'node:path'
import { test } from 'node:test'

import { AgentPluginHub } from '../lib/hub.js'
import { cleanup, copyFixture, tempHome } from './helpers.mjs'

async function makeHub(t, work) {
  const home = path.join(work, 'hub-home')
  cleanup(t, work)
  const hub = new AgentPluginHub({ home })
  hub.start()
  return hub
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

test('移除市场时若还有已安装插件则拒绝', async (t) => {
  const work = tempHome('hub-market-')
  const marketDir = copyFixture('claude-market', work)
  const hub = await makeHub(t, work)
  const market = await hub.marketAdd({ type: 'local', location: marketDir })
  await hub.install({ name: 'demo-claude', market: market.id })
  assert.throws(() => hub.marketRemove(market.id), /还有已安装插件/)
  hub.uninstall('demo-claude')
  assert.equal(hub.marketRemove(market.id).id, market.id)
})