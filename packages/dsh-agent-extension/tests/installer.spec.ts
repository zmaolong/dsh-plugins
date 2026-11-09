/**
 * Installer specs, ported from test/installer.test.mjs (node:test → vitest):
 * install / reinstall / enable-disable / update / rollback / uninstall /
 * git market. Fully offline: markets are local fixture directories; the only
 * subprocess is system git against a local repository.
 */

import { afterEach, describe, expect, it } from 'vitest'
import { spawnSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'

import { AgentPluginHub } from '../src/hub.ts'
import type { CapabilityMap } from '../src/capabilities.ts'
import type { PluginRecord, PreviousVersion } from '../src/store.ts'
import { copyDir, copyFixture, FIXTURES, removeDirs, tempHome } from './helpers.ts'

describe('安装器：安装 / 重装 / 禁用启用 / 更新 / 回滚 / 卸载 / git 市场', () => {
  // Temp dirs registered by each test; removed in afterEach (old cleanup(t, ...)).
  let tempDirs: string[] = []

  afterEach(() => {
    removeDirs(...tempDirs)
    tempDirs = []
  })

  async function setup(fixture = 'claude-market') {
    const work = tempHome('hub-install-')
    tempDirs.push(work)
    const marketDir = copyFixture(fixture, work)
    const hub = new AgentPluginHub({ home: path.join(work, 'hub-home') })
    hub.start()
    const market = await hub.marketAdd({ type: 'local', location: marketDir })
    return { work, marketDir, hub, market }
  }

  it('安装：复制到 cache、记录状态、能力摘要正确', async () => {
    const { hub, market } = await setup()
    const result = await hub.install({ name: 'demo-claude', market: market.id })
    const record = result.record
    expect(record.name).toBe('demo-claude')
    expect(record.version).toBe('0.1.0')
    expect(record.format).toBe('claude')
    expect(record.enabled).toBe(true)
    expect(record.installedPath.includes(path.join('cache', 'claude'))).toBeTruthy()
    expect(existsSync(path.join(record.installedPath, '.claude-plugin', 'plugin.json'))).toBe(true)
    const caps = record.capabilities as CapabilityMap
    expect([...caps.skills].sort()).toEqual(['greet'])
    expect([...caps.commands].sort()).toEqual(['hello'])
    expect([...caps.hooks].sort()).toEqual(['Notification', 'PostToolUse', 'PreToolUse', 'Stop'])
    expect([...caps.mcpServers].sort()).toEqual(['fixture-fs', 'fixture-http'])
    expect(hub.state.plugins.length).toBe(1)
  })

  it('安装无 version 的插件：记录 0.0.0、目录 …/0.0.0/，更新不误报', async () => {
    const { hub, market, work } = await setup('versionless-market')
    const result = await hub.install({ name: 'demo-versionless', market: market.id })
    const record = result.record
    expect(record.name).toBe('demo-versionless')
    expect(record.version).toBe('0.0.0')
    expect(record.installedPath.includes(path.join('demo-versionless', '0.0.0'))).toBeTruthy()
    expect(existsSync(path.join(record.installedPath, '.claude-plugin', 'plugin.json'))).toBe(true)
    const caps = record.capabilities as CapabilityMap
    expect([...caps.skills].sort()).toEqual(['greet'])
    // 清单无 version：更新比较恒等 → 不产生更新动作
    const updated = await hub.update('demo-versionless')
    expect(updated.changed).toBe(false)
    // 重启自检不卸载（validate 已放宽）
    const reloaded = new AgentPluginHub({ home: path.join(work, 'hub-home') })
    reloaded.start()
    expect(reloaded.state.plugins.length).toBe(1)
    expect(reloaded.state.plugins[0]?.version).toBe('0.0.0')
  })

  it('重复安装同版本需 --force', async () => {
    const { hub, market } = await setup()
    await hub.install({ name: 'demo-claude', market: market.id })
    await expect(hub.install({ name: 'demo-claude', market: market.id })).rejects.toThrow(/已安装/)
    const forced = await hub.install({ name: 'demo-claude', market: market.id, force: true })
    expect(forced.replaced).toBe(true)
  })

  it('安装 --force：旧目录原子替换，不残留 replace-* 备份', async () => {
    const { hub, market } = await setup()
    await hub.install({ name: 'demo-claude', market: market.id })
    const forced = await hub.install({ name: 'demo-claude', market: market.id, force: true })
    expect(existsSync(forced.record.installedPath)).toBe(true)
    const tmpEntries = readdirSync(hub.store.paths.tmp)
    expect(
      tmpEntries.filter((name) => name.startsWith('replace-')).length,
      '覆盖安装成功后不应残留 replace-* 备份目录',
    ).toBe(0)
  })

  it('安装 npm / 缺目录插件报错', async () => {
    const { hub, market } = await setup()
    await expect(hub.install({ name: 'npm-plugin', market: market.id })).rejects.toThrow(/暂不支持 npm 源/)
    await expect(hub.install({ name: 'missing-dir', market: market.id })).rejects.toThrow(/插件目录不存在/)
    await expect(hub.install({ name: '不存在', market: market.id })).rejects.toThrow(/没有插件/)
  })

  it('从其他市场安装 codebuddy / zcode 格式插件', async () => {
    const { work, hub } = await setup()
    const cbDir = copyFixture('codebuddy-market', work)
    const zcDir = copyFixture('zcode-market', work)
    const cbMarket = await hub.marketAdd({ type: 'local', location: cbDir })
    const zcMarket = await hub.marketAdd({ type: 'local', location: zcDir })
    const cb = await hub.install({ name: 'demo-codebuddy', market: cbMarket.id })
    const zc = await hub.install({ name: 'demo-zcode', market: zcMarket.id })
    expect(cb.record.format).toBe('codebuddy')
    expect(zc.record.format).toBe('zcode')
    expect((cb.record.capabilities as CapabilityMap).skills).toEqual(['cb-greet'])
    expect((zc.record.capabilities as CapabilityMap).skills).toEqual(['zc-greet'])
  })

  it('启用 / 禁用只改状态，不删文件', async () => {
    const { hub, market } = await setup()
    const { record } = await hub.install({ name: 'demo-claude', market: market.id })
    const disabled = hub.setEnabled(record.key, false)
    expect(disabled.enabled).toBe(false)
    expect(existsSync(record.installedPath)).toBe(true)
    expect(hub.getEnabledPlugins().length).toBe(0)
    const enabled = hub.setEnabled(record.key, true)
    expect(enabled.enabled).toBe(true)
    expect(hub.getEnabledPlugins().length).toBe(1)
  })

  it('更新：版本升级、保留上一版本、回滚', async () => {
    const { hub, marketDir, market } = await setup()
    const first = await hub.install({ name: 'demo-claude', market: market.id })
    // 市场未变：update 应为 no-op
    const noop = await hub.update('demo-claude')
    expect(noop.changed).toBe(false)
    expect(noop.message).toMatch(/已是最新/)
    const pluginJson = path.join(marketDir, 'plugins', 'demo-claude', '.claude-plugin', 'plugin.json')
    const manifest = JSON.parse(readFileSync(pluginJson, 'utf8')) as { version: string }
    manifest.version = '0.2.0'
    writeFileSync(pluginJson, JSON.stringify(manifest, null, 2))
    await hub.marketRefresh(market.id)
    const updated = await hub.update('demo-claude', true)
    expect(updated.changed).toBe(true)
    expect(updated.record.version).toBe('0.2.0')
    expect(updated.record.previousVersions.length).toBe(1)
    expect(updated.record.previousVersions[0]?.version).toBe('0.1.0')
    expect(existsSync(first.record.installedPath)).toBe(true)
    const rolled = hub.rollback('demo-claude')
    expect(rolled.record.version).toBe('0.1.0')
    expect(rolled.previousVersion).toBe('0.2.0')
    expect(hub.state.plugins[0]?.version).toBe('0.1.0')
  })

  it('没有历史版本时回滚报错', async () => {
    const { hub, market } = await setup()
    await hub.install({ name: 'demo-claude', market: market.id })
    expect(() => hub.rollback('demo-claude')).toThrow(/没有可回滚的历史版本/)
  })

  it('回滚：可指定目标版本，当前版本转入历史', async () => {
    const { hub, marketDir, market } = await setup()
    await hub.install({ name: 'demo-claude', market: market.id })
    const pluginJson = path.join(marketDir, 'plugins', 'demo-claude', '.claude-plugin', 'plugin.json')
    const bump = (version: string) => {
      const manifest = JSON.parse(readFileSync(pluginJson, 'utf8')) as { version: string }
      manifest.version = version
      writeFileSync(pluginJson, JSON.stringify(manifest, null, 2))
    }
    bump('0.2.0')
    await hub.marketRefresh(market.id)
    await hub.update('demo-claude', true)
    bump('0.3.0')
    await hub.marketRefresh(market.id)
    await hub.update('demo-claude', true)

    const record = hub.findRecord('demo-claude')
    expect(record.version).toBe('0.3.0')
    expect(record.previousVersions.map((item) => item.version)).toEqual(['0.1.0', '0.2.0'])

    const rolled = hub.rollback('demo-claude', '0.1.0')
    expect(rolled.record.version).toBe('0.1.0')
    expect(rolled.previousVersion).toBe('0.3.0')
    const after = hub.findRecord('demo-claude')
    expect(after.previousVersions.map((item) => item.version)).toEqual(['0.2.0', '0.3.0'])
  })

  it('回滚：指定不存在或目录已被清理的版本时报错，历史版本不丢', async () => {
    const { hub, marketDir, market } = await setup()
    await hub.install({ name: 'demo-claude', market: market.id })
    const pluginJson = path.join(marketDir, 'plugins', 'demo-claude', '.claude-plugin', 'plugin.json')
    const manifest = JSON.parse(readFileSync(pluginJson, 'utf8')) as { version: string }
    manifest.version = '0.2.0'
    writeFileSync(pluginJson, JSON.stringify(manifest, null, 2))
    await hub.marketRefresh(market.id)
    await hub.update('demo-claude', true)

    const record = hub.findRecord('demo-claude')
    const historyLength = record.previousVersions.length
    const historyPath = (record.previousVersions[0] as PreviousVersion).installedPath
    expect(historyLength).toBe(1)

    expect(() => hub.rollback('demo-claude', '9.9.9')).toThrow(/未找到历史版本 9\.9\.9/u)
    expect(hub.findRecord('demo-claude').previousVersions.length, '报错不得丢历史版本').toBe(historyLength)

    rmSync(historyPath, { force: true, recursive: true })
    expect(() => hub.rollback('demo-claude', '0.1.0')).toThrow(/目录已被清理/u)
    const after = hub.findRecord('demo-claude')
    expect(after.version, '失败回滚不得改动当前版本').toBe('0.2.0')
    expect(after.previousVersions.length, '报错不得丢历史版本').toBe(historyLength)
  })

  it('卸载：删除安装副本与状态', async () => {
    const { hub, market } = await setup()
    const { record } = await hub.install({ name: 'demo-claude', market: market.id })
    hub.uninstall('demo-claude')
    expect(hub.state.plugins.length).toBe(0)
    expect(existsSync(record.installedPath)).toBe(false)
  })

  it('重启恢复：新 hub 读回状态与启用项', async () => {
    const { work, hub, market } = await setup()
    const home = path.join(work, 'hub-home')
    await hub.install({ name: 'demo-claude', market: market.id })
    hub.setEnabled('demo-claude', false)

    const restarted = new AgentPluginHub({ home })
    restarted.start()
    expect(restarted.state.plugins.length).toBe(1)
    expect(restarted.state.plugins[0]?.enabled).toBe(false)
    expect(restarted.getEnabledPlugins().length).toBe(0)
  })

  it('git 市场：从本地 git 仓库浅克隆并安装', async () => {
    const work = tempHome('hub-git-')
    tempDirs.push(work)
    const repoDir = path.join(work, 'git-market-repo')
    copyDir(path.join(FIXTURES, 'claude-market'), repoDir)
    const git = (cwd: string, args: readonly string[]): string => {
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
    expect(market.type).toBe('git')
    expect(market.plugins.length).toBe(3)
    const cloned = path.join(hub.store.paths.markets, market.id, 'repo')
    expect(existsSync(path.join(cloned, '.git'))).toBe(true)
    const installed = await hub.install({ name: 'demo-claude', market: market.id })
    expect(installed.record.version).toBe('0.1.0')
    // 刷新（fetch + reset）不应破坏已安装副本
    await hub.marketRefresh(market.id)
    expect(existsSync(installed.record.installedPath)).toBe(true)
  })

  it('update refresh:false：跳过市场刷新，仍能读取源清单升级', async () => {
    const { hub, marketDir, market } = await setup()
    await hub.install({ name: 'demo-claude', market: market.id })
    const pluginJson = path.join(marketDir, 'plugins', 'demo-claude', '.claude-plugin', 'plugin.json')
    const manifest = JSON.parse(readFileSync(pluginJson, 'utf8')) as { version: string }
    manifest.version = '0.2.0'
    writeFileSync(pluginJson, JSON.stringify(manifest, null, 2))

    let refreshCalls = 0
    const originalRefresh = hub.markets.refresh.bind(hub.markets)
    hub.markets.refresh = async (id: string) => {
      refreshCalls += 1
      return await originalRefresh(id)
    }
    try {
      const result = await hub.installer.update(hub.state, 'demo-claude', { refresh: false })
      expect(refreshCalls, 'refresh:false 不应刷新市场').toBe(0)
      expect(result.changed).toBe(true)
      expect(result.record.version).toBe('0.2.0')
    } finally {
      hub.markets.refresh = originalRefresh
    }
  })

  it('update：不可比较版本判 unknown，不误报可更新也不安装', async () => {
    const { hub, marketDir, market } = await setup()
    await hub.install({ name: 'demo-claude', market: market.id })
    ;(hub.state.plugins[0] as PluginRecord).version = 'not-a-version'
    const pluginJson = path.join(marketDir, 'plugins', 'demo-claude', '.claude-plugin', 'plugin.json')
    const manifest = JSON.parse(readFileSync(pluginJson, 'utf8')) as { version: string }
    manifest.version = '0.2.0'
    writeFileSync(pluginJson, JSON.stringify(manifest, null, 2))

    const result = await hub.installer.update(hub.state, 'demo-claude', { refresh: false })
    expect(result.changed).toBe(false)
    expect(result.updateState).toBe('unknown')
    expect(result.message).toMatch(/无法比较版本/)
    expect(result.message).toMatch(/未更新/)
    expect((hub.state.plugins[0] as PluginRecord).version, '不应安装新版本').toBe('not-a-version')
  })

  it('update：预发布版本按 SemVer 排序（beta.10 > beta.2，不降级）', async () => {
    const { hub, marketDir, market } = await setup()
    await hub.install({ name: 'demo-claude', market: market.id })
    ;(hub.state.plugins[0] as PluginRecord).version = '1.0.0-beta.10'
    const pluginJson = path.join(marketDir, 'plugins', 'demo-claude', '.claude-plugin', 'plugin.json')
    const manifest = JSON.parse(readFileSync(pluginJson, 'utf8')) as { version: string }
    manifest.version = '1.0.0-beta.2'
    writeFileSync(pluginJson, JSON.stringify(manifest, null, 2))

    const result = await hub.installer.update(hub.state, 'demo-claude', { refresh: false })
    expect(result.changed).toBe(false)
    expect(result.updateState).toBe('installed-newer')
    expect(result.message).toMatch(/不高于已安装版本/)
  })
})
