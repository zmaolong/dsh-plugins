/**
 * 安装器测试：安装 / 重装 / 禁用启用 / 更新 / 回滚 / 卸载 / git 市场。
 */

import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'

import { AgentPluginHub } from '../lib/hub.js'
import { cleanup, copyDir, copyFixture, tempHome } from './helpers.mjs'

async function setup(t, fixture = 'claude-market') {
  const work = tempHome('hub-install-')
  const marketDir = copyFixture(fixture, work)
  cleanup(t, work)
  const hub = new AgentPluginHub({ home: path.join(work, 'hub-home') })
  hub.start()
  const market = await hub.marketAdd({ type: 'local', location: marketDir })
  return { work, marketDir, hub, market }
}

test('安装：复制到 cache、记录状态、能力摘要正确', async (t) => {
  const { hub, market } = await setup(t)
  const result = await hub.install({ name: 'demo-claude', market: market.id })
  const record = result.record
  assert.equal(record.name, 'demo-claude')
  assert.equal(record.version, '0.1.0')
  assert.equal(record.format, 'claude')
  assert.equal(record.enabled, true)
  assert.ok(record.installedPath.includes(path.join('cache', 'claude')))
  assert.equal(existsSync(path.join(record.installedPath, '.claude-plugin', 'plugin.json')), true)
  assert.deepEqual([...record.capabilities.skills].sort(), ['greet'])
  assert.deepEqual([...record.capabilities.commands].sort(), ['hello'])
  assert.deepEqual([...record.capabilities.hooks].sort(), ['Notification', 'PostToolUse', 'PreToolUse', 'Stop'])
  assert.deepEqual([...record.capabilities.mcpServers].sort(), ['fixture-fs', 'fixture-http'])
  assert.equal(hub.state.plugins.length, 1)
})

test('重复安装同版本需 --force', async (t) => {
  const { hub, market } = await setup(t)
  await hub.install({ name: 'demo-claude', market: market.id })
  await assert.rejects(hub.install({ name: 'demo-claude', market: market.id }), /已安装/)
  const forced = await hub.install({ name: 'demo-claude', market: market.id, force: true })
  assert.equal(forced.replaced, true)
})

test('安装 npm / 缺目录插件报错', async (t) => {
  const { hub, market } = await setup(t)
  await assert.rejects(hub.install({ name: 'npm-plugin', market: market.id }), /暂不支持 npm 源/)
  await assert.rejects(hub.install({ name: 'missing-dir', market: market.id }), /插件目录不存在/)
  await assert.rejects(hub.install({ name: '不存在', market: market.id }), /没有插件/)
})

test('从其他市场安装 codebuddy / zcode 格式插件', async (t) => {
  const { work, hub } = await setup(t)
  const cbDir = copyFixture('codebuddy-market', work)
  const zcDir = copyFixture('zcode-market', work)
  const cbMarket = await hub.marketAdd({ type: 'local', location: cbDir })
  const zcMarket = await hub.marketAdd({ type: 'local', location: zcDir })
  const cb = await hub.install({ name: 'demo-codebuddy', market: cbMarket.id })
  const zc = await hub.install({ name: 'demo-zcode', market: zcMarket.id })
  assert.equal(cb.record.format, 'codebuddy')
  assert.equal(zc.record.format, 'zcode')
  assert.deepEqual(cb.record.capabilities.skills, ['cb-greet'])
  assert.deepEqual(zc.record.capabilities.skills, ['zc-greet'])
})

test('启用 / 禁用只改状态，不删文件', async (t) => {
  const { hub, market } = await setup(t)
  const { record } = await hub.install({ name: 'demo-claude', market: market.id })
  const disabled = hub.setEnabled(record.key, false)
  assert.equal(disabled.enabled, false)
  assert.equal(existsSync(record.installedPath), true)
  assert.equal(hub.getEnabledPlugins().length, 0)
  const enabled = hub.setEnabled(record.key, true)
  assert.equal(enabled.enabled, true)
  assert.equal(hub.getEnabledPlugins().length, 1)
})

test('更新：版本升级、保留上一版本、回滚', async (t) => {
  const { hub, marketDir, market } = await setup(t)
  const first = await hub.install({ name: 'demo-claude', market: market.id })
  // 市场未变：update 应为 no-op
  const noop = await hub.update('demo-claude')
  assert.equal(noop.changed, false)
  assert.match(noop.message, /已是最新/)
  const pluginJson = path.join(marketDir, 'plugins', 'demo-claude', '.claude-plugin', 'plugin.json')
  const manifest = JSON.parse(readFileSync(pluginJson, 'utf8'))
  manifest.version = '0.2.0'
  writeFileSync(pluginJson, JSON.stringify(manifest, null, 2))
  await hub.marketRefresh(market.id)
  const updated = await hub.update('demo-claude', true)
  assert.equal(updated.changed, true)
  assert.equal(updated.record.version, '0.2.0')
  assert.equal(updated.record.previousVersions.length, 1)
  assert.equal(updated.record.previousVersions[0].version, '0.1.0')
  assert.equal(existsSync(first.record.installedPath), true)
  const rolled = hub.rollback('demo-claude')
  assert.equal(rolled.record.version, '0.1.0')
  assert.equal(rolled.previousVersion, '0.2.0')
  assert.equal(hub.state.plugins[0].version, '0.1.0')
})

test('没有历史版本时回滚报错', async (t) => {
  const { hub, market } = await setup(t)
  await hub.install({ name: 'demo-claude', market: market.id })
  assert.throws(() => hub.rollback('demo-claude'), /没有可回滚的历史版本/)
})

test('卸载：删除安装副本与状态', async (t) => {
  const { hub, market } = await setup(t)
  const { record } = await hub.install({ name: 'demo-claude', market: market.id })
  hub.uninstall('demo-claude')
  assert.equal(hub.state.plugins.length, 0)
  assert.equal(existsSync(record.installedPath), false)
})

test('重启恢复：新 hub 读回状态与启用项', async (t) => {
  const { work, hub, market } = await setup(t)
  const home = path.join(work, 'hub-home')
  await hub.install({ name: 'demo-claude', market: market.id })
  hub.setEnabled('demo-claude', false)

  const restarted = new AgentPluginHub({ home })
  restarted.start()
  assert.equal(restarted.state.plugins.length, 1)
  assert.equal(restarted.state.plugins[0].enabled, false)
  assert.equal(restarted.getEnabledPlugins().length, 0)
})

test('git 市场：从本地 git 仓库浅克隆并安装', async (t) => {
  const work = tempHome('hub-git-')
  cleanup(t, work)
  const repoDir = path.join(work, 'git-market-repo')
  copyDir(path.join(process.cwd(), 'test', 'fixtures', 'claude-market'), repoDir)
  const git = (cwd, args) => {
    const result = spawnSync('git', args, {
      cwd,
      encoding: 'utf8',
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'Never' },
    })
    if (result.status !== 0) throw new Error(`git ${args.join(' ')} 失败：${result.stderr}`)
    return result.stdout
  }
  git(repoDir, ['init', '-b', 'main'])
  git(repoDir, ['add', '-A'])
  git(repoDir, ['-c', 'user.name=fixture', '-c', 'user.email=fixture@example.com', 'commit', '-m', 'fixture'])
  const hub = new AgentPluginHub({ home: path.join(work, 'hub-home') })
  hub.start()
  const market = await hub.marketAdd({ type: 'git', location: repoDir })
  assert.equal(market.type, 'git')
  assert.equal(market.plugins.length, 3)
  const cloned = path.join(hub.store.paths.markets, market.id, 'repo')
  assert.equal(existsSync(path.join(cloned, '.git')), true)
  const installed = await hub.install({ name: 'demo-claude', market: market.id })
  assert.equal(installed.record.version, '0.1.0')
  // 刷新（fetch + reset）不应破坏已安装副本
  await hub.marketRefresh(market.id)
  assert.equal(existsSync(installed.record.installedPath), true)
})

test('update refresh:false：跳过市场刷新，仍能读取源清单升级', async (t) => {
  const { hub, marketDir, market } = await setup(t)
  await hub.install({ name: 'demo-claude', market: market.id })
  const pluginJson = path.join(marketDir, 'plugins', 'demo-claude', '.claude-plugin', 'plugin.json')
  const manifest = JSON.parse(readFileSync(pluginJson, 'utf8'))
  manifest.version = '0.2.0'
  writeFileSync(pluginJson, JSON.stringify(manifest, null, 2))

  let refreshCalls = 0
  const originalRefresh = hub.markets.refresh.bind(hub.markets)
  hub.markets.refresh = async (id) => {
    refreshCalls += 1
    return await originalRefresh(id)
  }
  try {
    const result = await hub.installer.update(hub.state, 'demo-claude', { refresh: false })
    assert.equal(refreshCalls, 0, 'refresh:false 不应刷新市场')
    assert.equal(result.changed, true)
    assert.equal(result.record.version, '0.2.0')
  } finally {
    hub.markets.refresh = originalRefresh
  }
})

test('update：不可比较版本判 unknown，不误报可更新也不安装', async (t) => {
  const { hub, marketDir, market } = await setup(t)
  await hub.install({ name: 'demo-claude', market: market.id })
  hub.state.plugins[0].version = 'not-a-version'
  const pluginJson = path.join(marketDir, 'plugins', 'demo-claude', '.claude-plugin', 'plugin.json')
  const manifest = JSON.parse(readFileSync(pluginJson, 'utf8'))
  manifest.version = '0.2.0'
  writeFileSync(pluginJson, JSON.stringify(manifest, null, 2))

  const result = await hub.installer.update(hub.state, 'demo-claude', { refresh: false })
  assert.equal(result.changed, false)
  assert.equal(result.updateState, 'unknown')
  assert.match(result.message, /无法比较版本/)
  assert.match(result.message, /未更新/)
  assert.equal(hub.state.plugins[0].version, 'not-a-version', '不应安装新版本')
})

test('update：预发布版本按 SemVer 排序（beta.10 > beta.2，不降级）', async (t) => {
  const { hub, marketDir, market } = await setup(t)
  await hub.install({ name: 'demo-claude', market: market.id })
  hub.state.plugins[0].version = '1.0.0-beta.10'
  const pluginJson = path.join(marketDir, 'plugins', 'demo-claude', '.claude-plugin', 'plugin.json')
  const manifest = JSON.parse(readFileSync(pluginJson, 'utf8'))
  manifest.version = '1.0.0-beta.2'
  writeFileSync(pluginJson, JSON.stringify(manifest, null, 2))

  const result = await hub.installer.update(hub.state, 'demo-claude', { refresh: false })
  assert.equal(result.changed, false)
  assert.equal(result.updateState, 'installed-newer')
  assert.match(result.message, /不高于已安装版本/)
})