/**
 * 持久化层单元测试：原子写、损坏自检、进程锁、半装目录修复。
 */

import assert from 'node:assert/strict'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'

import { emptyState, HubStore } from '../lib/store.js'
import { cleanup, tempHome } from './helpers.mjs'

test('state 往返读写', (t) => {
  const home = tempHome()
  cleanup(t, home)
  const store = new HubStore(home)
  store.ensureDirs()
  const state = emptyState()
  state.plugins.push({
    key: 'm/demo',
    format: 'claude',
    name: 'demo',
    version: '0.1.0',
    market: 'm',
    installedPath: path.join(home, 'cache', 'claude', 'm', 'demo', '0.1.0'),
    enabled: true,
    installedAt: new Date().toISOString(),
    capabilities: { skills: ['greet'], commands: ['hello'], hooks: ['PreToolUse'], mcpServers: ['fs'] },
    previousVersions: [],
  })
  store.saveState(state)
  const read = store.readState()
  assert.equal(read.warnings.length, 0)
  assert.equal(read.state.plugins.length, 1)
  assert.equal(read.state.plugins[0].key, 'm/demo')
  assert.deepEqual(read.state.plugins[0].capabilities.skills, ['greet'])
})

test('state 损坏时备份并重建空表', (t) => {
  const home = tempHome()
  cleanup(t, home)
  const store = new HubStore(home)
  store.ensureDirs()
  writeFileSync(store.paths.state, '{ 这不是 JSON')
  const read = store.readState()
  assert.equal(read.state.plugins.length, 0)
  assert.ok(read.warnings.some((item) => item.includes('损坏')))
  const backups = read.warnings.join('\n')
  assert.match(backups, /corrupt-/)
})

test('字段残缺的插件记录被丢弃并给出告警', (t) => {
  const home = tempHome()
  cleanup(t, home)
  const store = new HubStore(home)
  store.ensureDirs()
  store.atomicWriteJson(store.paths.state, {
    schemaVersion: 1,
    plugins: [
      { key: 'k', name: 'ok', format: 'claude', version: '1.0.0', installedPath: home },
      { key: 'bad' },
    ],
  })
  const read = store.readState()
  assert.equal(read.state.plugins.length, 1)
  assert.ok(read.warnings.some((item) => item.includes('字段不全')))
})

test('半装目录/丢失目录从状态中剔除', (t) => {
  const home = tempHome()
  cleanup(t, home)
  const store = new HubStore(home)
  store.ensureDirs()
  const state = emptyState()
  state.plugins.push({
    key: 'm/missing',
    format: 'claude',
    name: 'missing',
    version: '0.1.0',
    market: 'm',
    installedPath: path.join(home, 'cache', 'claude', 'm', 'missing', '0.1.0'),
    enabled: true,
    installedAt: new Date().toISOString(),
    capabilities: {},
    previousVersions: [{ version: '0.0.9', installedPath: path.join(home, 'nope'), installedAt: '' }],
  })
  const repair = store.repairState(state, { isValidInstall: () => true })
  assert.equal(repair.state.plugins.length, 0)
  assert.equal(repair.removed.length, 1)
  assert.ok(repair.warnings.some((item) => item.includes('安装目录不可用')))
})

test('repairState 保留可用安装并清理丢失的回滚目录', (t) => {
  const home = tempHome()
  cleanup(t, home)
  const store = new HubStore(home)
  store.ensureDirs()
  const installed = path.join(home, 'cache', 'claude', 'm', 'demo', '0.1.0')
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
    previousVersions: [{ version: '0.0.9', installedPath: path.join(home, 'gone'), installedAt: '' }],
  })
  const repair = store.repairState(state, { isValidInstall: () => true })
  assert.equal(repair.state.plugins.length, 1)
  assert.deepEqual(repair.state.plugins[0].previousVersions, [])
})

test('锁：同进程重入复用，陈旧锁可抢占', (t) => {
  const home = tempHome()
  cleanup(t, home)
  const store = new HubStore(home)
  store.ensureDirs()
  const value = store.withLock(() => store.withLock(() => 42))
  assert.equal(value, 42)
  // 写入一个不存在的 pid，应被当作陈旧锁抢占
  store.atomicWriteJson(store.paths.lock, { pid: 999_999, at: new Date().toISOString() })
  const grabbed = store.withLock(() => 'ok', { timeoutMs: 1000 })
  assert.equal(grabbed, 'ok')
  assert.equal(existsSync(store.paths.lock), false)
})

test('锁：被活跃进程占用时超时并给出中文提示', (t) => {
  const home = tempHome()
  cleanup(t, home)
  const store = new HubStore(home)
  store.ensureDirs()
  store.atomicWriteJson(store.paths.lock, { pid: process.pid, at: new Date().toISOString() })
  assert.throws(() => store.withLock(() => 'never', { timeoutMs: 200 }), /另一个 hub 操作正在进行/)
  rmSync(store.paths.lock, { force: true })
})

test('writeJson 原子写不留下临时文件', (t) => {
  const home = tempHome()
  cleanup(t, home)
  const store = new HubStore(home)
  store.ensureDirs()
  store.atomicWriteJson(store.paths.state, { a: 1 })
  const files = readFileSync(store.paths.state, 'utf8')
  assert.match(files, /"a": 1/u)
})