/**
 * schema v1 → v2 迁移测试：升级、备份、幂等、已是 v2 跳过、失败保留原文件。
 */

import assert from 'node:assert/strict'
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'

import { runMigrations } from '../lib/migrate.js'
import { HubStore, STATE_SCHEMA } from '../lib/store.js'
import { cleanup, tempHome } from './helpers.mjs'

function readJson(file) {
  return JSON.parse(readFileSync(file, 'utf8'))
}

function v1State() {
  return {
    schemaVersion: 1,
    updatedAt: '2026-01-01T00:00:00.000Z',
    plugins: [
      {
        key: 'm/demo',
        format: 'claude',
        name: 'demo',
        version: '0.1.0',
        market: 'm',
        installedPath: 'C:\\cache\\claude\\m\\demo\\0.1.0',
        enabled: true,
        installedAt: '2026-01-01T00:00:00.000Z',
        capabilities: { skills: ['greet'], commands: [], hooks: [], mcpServers: [] },
        previousVersions: [],
      },
      { key: '字段不全' },
    ],
  }
}

function v1Markets() {
  return {
    schemaVersion: 1,
    updatedAt: '2026-01-01T00:00:00.000Z',
    markets: [
      {
        id: 'm',
        name: 'my-market',
        format: 'claude',
        type: 'local',
        location: 'E:\\my-market',
        // 不应出现在持久化文件里的内存字段
        root: 'E:\\my-market',
        addedAt: '2026-01-01T00:00:00.000Z',
        lastRefreshed: '2026-01-01T00:00:00.000Z',
        plugins: [
          {
            name: 'demo',
            version: '0.1.0',
            description: '旧描述',
            source: { kind: 'local', raw: './plugins/demo' },
            installable: true,
          },
        ],
        warnings: [],
      },
    ],
  }
}

function makeStore(t) {
  const home = tempHome('hub-migrate-')
  cleanup(t, home)
  const store = new HubStore(home)
  store.ensureDirs()
  return store
}

test('v1 → v2：两文件升级、市场补 title/display/meta、state 记录规整', (t) => {
  const store = makeStore(t)
  store.atomicWriteJson(store.paths.state, v1State())
  store.atomicWriteJson(store.paths.marketplaces, v1Markets())

  const result = runMigrations(store)
  assert.equal(result.migrated, true)
  assert.equal(result.from, 1)
  assert.equal(result.to, STATE_SCHEMA)
  assert.equal(typeof result.backup, 'string')
  assert.equal(existsSync(result.backup), true)

  const state = readJson(store.paths.state)
  assert.equal(state.schemaVersion, 2)
  assert.equal(state.plugins.length, 1, '字段不全的记录应被规整丢弃')
  assert.equal(state.plugins[0].key, 'm/demo')

  const markets = readJson(store.paths.marketplaces)
  assert.equal(markets.schemaVersion, 2)
  const market = markets.markets[0]
  assert.equal(market.title, 'my-market')
  assert.equal(market.display.title, 'my-market')
  assert.equal(market.display.description, '')
  assert.equal(market.display.owner.name, '')
  assert.equal(market.owner.name, '')
  assert.equal(Object.prototype.hasOwnProperty.call(market, 'root'), false)
  assert.equal(market.plugins[0].meta.description, '旧描述')
  assert.deepEqual(market.featured, [])

  // 备份是迁移前内容
  const backedState = readJson(path.join(result.backup, 'state.json'))
  const backedMarkets = readJson(path.join(result.backup, 'marketplaces.json'))
  assert.equal(backedState.schemaVersion, 1)
  assert.equal(backedState.plugins.length, 2)
  assert.equal(backedMarkets.schemaVersion, 1)
})

test('已是 v2 时跳过：migrated=false、不产生备份、文件内容不变', (t) => {
  const store = makeStore(t)
  store.atomicWriteJson(store.paths.state, {
    schemaVersion: 2,
    updatedAt: '2026-02-02T00:00:00.000Z',
    plugins: [],
  })
  store.atomicWriteJson(store.paths.marketplaces, {
    schemaVersion: 2,
    updatedAt: '2026-02-02T00:00:00.000Z',
    markets: [],
  })
  const before = readFileSync(store.paths.state, 'utf8')
  const result = runMigrations(store)
  assert.equal(result.migrated, false)
  assert.equal(result.from, STATE_SCHEMA)
  assert.equal(result.to, STATE_SCHEMA)
  assert.equal(result.backup, null)
  assert.equal(readFileSync(store.paths.state, 'utf8'), before)
  const migrationRoot = path.join(store.paths.logs, 'migrations')
  assert.equal(existsSync(migrationRoot) ? readdirSync(migrationRoot).length : 0, 0)
})

test('迁移幂等：第二次调用跳过', (t) => {
  const store = makeStore(t)
  store.atomicWriteJson(store.paths.state, v1State())
  store.atomicWriteJson(store.paths.marketplaces, v1Markets())
  assert.equal(runMigrations(store).migrated, true)
  const second = runMigrations(store)
  assert.equal(second.migrated, false)
  assert.equal(second.backup, null)
})

test('未知 schemaVersion：抛错且原文件不变、不产生备份', (t) => {
  const store = makeStore(t)
  store.atomicWriteJson(store.paths.state, v1State())
  const badMarkets = { schemaVersion: 3, markets: [] }
  store.atomicWriteJson(store.paths.marketplaces, badMarkets)
  const stateBefore = readFileSync(store.paths.state, 'utf8')
  const marketsBefore = readFileSync(store.paths.marketplaces, 'utf8')

  assert.throws(() => runMigrations(store), /不支持的 schemaVersion=3/)
  assert.equal(readFileSync(store.paths.state, 'utf8'), stateBefore)
  assert.equal(readFileSync(store.paths.marketplaces, 'utf8'), marketsBefore)
  const migrationRoot = path.join(store.paths.logs, 'migrations')
  assert.equal(existsSync(migrationRoot) ? readdirSync(migrationRoot).length : 0, 0)
})

test('JSON 损坏：抛错且不写盘', (t) => {
  const store = makeStore(t)
  writeFileSync(store.paths.state, '{ 这不是 JSON')
  assert.throws(() => runMigrations(store), /不是合法 JSON/)
  assert.equal(readFileSync(store.paths.state, 'utf8'), '{ 这不是 JSON')
})

test('只有 state.json 存在：仅迁移存在的文件，备份只含该文件', (t) => {
  const store = makeStore(t)
  store.atomicWriteJson(store.paths.state, v1State())
  const result = runMigrations(store)
  assert.equal(result.migrated, true)
  assert.equal(existsSync(store.paths.marketplaces), false)
  assert.deepEqual(readdirSync(result.backup).sort(), ['state.json'])
  assert.equal(readJson(store.paths.state).schemaVersion, 2)
})

test('无状态文件：直接跳过', (t) => {
  const store = makeStore(t)
  const result = runMigrations(store)
  assert.equal(result.migrated, false)
  assert.equal(result.backup, null)
})