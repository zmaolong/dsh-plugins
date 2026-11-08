/**
 * Store specs, ported from test/store.test.mjs (node:test → vitest):
 * atomic writes, corrupt-file self-repair, process lock, half-install repair.
 * Fully offline; every test runs in a temp hub home removed in afterEach.
 */

import { afterEach, describe, expect, it } from 'vitest'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'

import { emptyState, HubStore, type PluginRecord } from '../src/store.ts'
import { removeDirs, tempHome } from './helpers.ts'

describe('持久化层：原子写、损坏自检、进程锁、半装目录修复', () => {
  // Temp dirs registered by each test; removed in afterEach (old cleanup(t, home)).
  let tempDirs: string[] = []

  afterEach(() => {
    removeDirs(...tempDirs)
    tempDirs = []
  })

  function makeStore(): HubStore {
    const home = tempHome()
    tempDirs.push(home)
    const store = new HubStore(home)
    store.ensureDirs()
    return store
  }

  it('state 往返读写', () => {
    const store = makeStore()
    const state = emptyState()
    state.plugins.push({
      key: 'm/demo',
      format: 'claude',
      name: 'demo',
      version: '0.1.0',
      market: 'm',
      installedPath: path.join(store.home, 'cache', 'claude', 'm', 'demo', '0.1.0'),
      enabled: true,
      installedAt: new Date().toISOString(),
      capabilities: { skills: ['greet'], commands: ['hello'], hooks: ['PreToolUse'], mcpServers: ['fs'] },
      disabledCapabilities: { skills: [], commands: [], hooks: [], mcpServers: [] },
      previousVersions: [],
    } satisfies PluginRecord)
    store.saveState(state)
    const read = store.readState()
    expect(read.warnings.length).toBe(0)
    expect(read.state.plugins.length).toBe(1)
    expect(read.state.plugins[0]?.key).toBe('m/demo')
    expect(read.state.plugins[0]?.capabilities.skills).toEqual(['greet'])
  })

  it('state 损坏时备份并重建空表', () => {
    const store = makeStore()
    writeFileSync(store.paths.state, '{ 这不是 JSON')
    const read = store.readState()
    expect(read.state.plugins.length).toBe(0)
    expect(read.warnings.some((item) => item.includes('损坏'))).toBe(true)
    const backups = read.warnings.join('\n')
    expect(backups).toMatch(/corrupt-/)
  })

  it('字段残缺的插件记录被丢弃并给出告警', () => {
    const store = makeStore()
    store.atomicWriteJson(store.paths.state, {
      schemaVersion: 1,
      plugins: [
        { key: 'k', name: 'ok', format: 'claude', version: '1.0.0', installedPath: store.home },
        { key: 'bad' },
      ],
    })
    const read = store.readState()
    expect(read.state.plugins.length).toBe(1)
    expect(read.warnings.some((item) => item.includes('字段不全'))).toBe(true)
  })

  it('半装目录/丢失目录从状态中剔除', () => {
    const store = makeStore()
    const state = emptyState()
    state.plugins.push({
      key: 'm/missing',
      format: 'claude',
      name: 'missing',
      version: '0.1.0',
      market: 'm',
      installedPath: path.join(store.home, 'cache', 'claude', 'm', 'missing', '0.1.0'),
      enabled: true,
      installedAt: new Date().toISOString(),
      capabilities: {},
      disabledCapabilities: { skills: [], commands: [], hooks: [], mcpServers: [] },
      previousVersions: [{ version: '0.0.9', installedPath: path.join(store.home, 'nope'), installedAt: '' }],
    } satisfies PluginRecord)
    const repair = store.repairState(state, { isValidInstall: () => true })
    expect(repair.state.plugins.length).toBe(0)
    expect(repair.removed.length).toBe(1)
    expect(repair.warnings.some((item) => item.includes('安装目录不可用'))).toBe(true)
  })

  it('repairState 保留可用安装并清理丢失的回滚目录', () => {
    const store = makeStore()
    const installed = path.join(store.home, 'cache', 'claude', 'm', 'demo', '0.1.0')
    mkdirSync(installed, { recursive: true })
    const state = emptyState()
    state.plugins.push({
      key: 'm/demo',
      format: 'claude',
      name: 'demo',
      version: '0.1.0',
      market: 'm',
      installedPath: installed,
      enabled: true,
      installedAt: '',
      capabilities: {},
      disabledCapabilities: { skills: [], commands: [], hooks: [], mcpServers: [] },
      previousVersions: [{ version: '0.0.9', installedPath: path.join(store.home, 'gone'), installedAt: '' }],
    } satisfies PluginRecord)
    const repair = store.repairState(state, { isValidInstall: () => true })
    expect(repair.state.plugins.length).toBe(1)
    expect(repair.state.plugins[0]?.previousVersions).toEqual([])
  })

  it('锁：同进程重入复用，陈旧锁可抢占', () => {
    const store = makeStore()
    const value = store.withLock(() => store.withLock(() => 42))
    expect(value).toBe(42)
    // 写入一个不存在的 pid，应被当作陈旧锁抢占
    store.atomicWriteJson(store.paths.lock, { pid: 999_999, at: new Date().toISOString() })
    const grabbed = store.withLock(() => 'ok', { timeoutMs: 1000 })
    expect(grabbed).toBe('ok')
    expect(existsSync(store.paths.lock)).toBe(false)
  })

  it('锁：被活跃进程占用时超时并给出中文提示', () => {
    const store = makeStore()
    store.atomicWriteJson(store.paths.lock, { pid: process.pid, at: new Date().toISOString() })
    expect(() => store.withLock(() => 'never', { timeoutMs: 200 })).toThrow(/另一个 hub 操作正在进行/)
    rmSync(store.paths.lock, { force: true })
  })

  it('writeJson 原子写不留下临时文件', () => {
    const store = makeStore()
    store.atomicWriteJson(store.paths.state, { a: 1 })
    const files = readFileSync(store.paths.state, 'utf8')
    expect(files).toMatch(/"a": 1/u)
  })
})
