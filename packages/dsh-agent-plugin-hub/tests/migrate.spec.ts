/**
 * Migration specs, ported from test/migrate.test.mjs (node:test → vitest):
 * schema v1 → v2 upgrade, backup, idempotency, v2 skip, failure keeps files.
 * Fully offline; every test runs in a temp hub home removed in afterEach.
 */

import { afterEach, describe, expect, it } from 'vitest'
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'

import { runMigrations } from '../src/migrate.ts'
import { HubStore, STATE_SCHEMA } from '../src/store.ts'
import { removeDirs, tempHome } from './helpers.ts'

/** Narrow view of the persisted state.json fields these specs assert on. */
interface PersistedState {
  schemaVersion: number
  plugins: Array<{ key: string }>
}

/** Narrow view of the persisted marketplaces.json fields these specs assert on. */
interface PersistedMarkets {
  schemaVersion: number
  markets: Array<{
    title: string
    display: { title: string, description: string, owner: { name: string } }
    owner: { name: string }
    featured: string[]
    plugins: Array<{ meta: { description: string } }>
  }>
}

function readJson<T>(file: string): T {
  return JSON.parse(readFileSync(file, 'utf8')) as T
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

describe('schema v1 → v2 迁移：升级、备份、幂等、跳过、失败保护', () => {
  // Temp dirs registered by each test; removed in afterEach (old cleanup(t, home)).
  let tempDirs: string[] = []

  afterEach(() => {
    removeDirs(...tempDirs)
    tempDirs = []
  })

  function makeStore(): HubStore {
    const home = tempHome('hub-migrate-')
    tempDirs.push(home)
    const store = new HubStore(home)
    store.ensureDirs()
    return store
  }

  it('v1 → v2：两文件升级、市场补 title/display/meta、state 记录规整', () => {
    const store = makeStore()
    store.atomicWriteJson(store.paths.state, v1State())
    store.atomicWriteJson(store.paths.marketplaces, v1Markets())

    const result = runMigrations(store)
    expect(result.migrated).toBe(true)
    expect(result.from).toBe(1)
    expect(result.to).toBe(STATE_SCHEMA)
    expect(typeof result.backup).toBe('string')
    expect(existsSync(result.backup!)).toBe(true)

    const state = readJson<PersistedState>(store.paths.state)
    expect(state.schemaVersion).toBe(2)
    expect(state.plugins.length, '字段不全的记录应被规整丢弃').toBe(1)
    expect(state.plugins[0]?.key).toBe('m/demo')

    const markets = readJson<PersistedMarkets>(store.paths.marketplaces)
    expect(markets.schemaVersion).toBe(2)
    const market = markets.markets[0]!
    expect(market.title).toBe('my-market')
    expect(market.display.title).toBe('my-market')
    expect(market.display.description).toBe('')
    expect(market.display.owner.name).toBe('')
    expect(market.owner.name).toBe('')
    expect(Object.prototype.hasOwnProperty.call(market, 'root')).toBe(false)
    expect(market.plugins[0]?.meta.description).toBe('旧描述')
    expect(market.featured).toEqual([])

    // 备份是迁移前内容
    const backedState = readJson<PersistedState>(path.join(result.backup!, 'state.json'))
    const backedMarkets = readJson<{ schemaVersion: number }>(path.join(result.backup!, 'marketplaces.json'))
    expect(backedState.schemaVersion).toBe(1)
    expect(backedState.plugins.length).toBe(2)
    expect(backedMarkets.schemaVersion).toBe(1)
  })

  it('已是 v2 时跳过：migrated=false、不产生备份、文件内容不变', () => {
    const store = makeStore()
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
    expect(result.migrated).toBe(false)
    expect(result.from).toBe(STATE_SCHEMA)
    expect(result.to).toBe(STATE_SCHEMA)
    expect(result.backup).toBe(null)
    expect(readFileSync(store.paths.state, 'utf8')).toBe(before)
    const migrationRoot = path.join(store.paths.logs, 'migrations')
    expect(existsSync(migrationRoot) ? readdirSync(migrationRoot).length : 0).toBe(0)
  })

  it('迁移幂等：第二次调用跳过', () => {
    const store = makeStore()
    store.atomicWriteJson(store.paths.state, v1State())
    store.atomicWriteJson(store.paths.marketplaces, v1Markets())
    expect(runMigrations(store).migrated).toBe(true)
    const second = runMigrations(store)
    expect(second.migrated).toBe(false)
    expect(second.backup).toBe(null)
  })

  it('未知 schemaVersion：抛错且原文件不变、不产生备份', () => {
    const store = makeStore()
    store.atomicWriteJson(store.paths.state, v1State())
    const badMarkets = { schemaVersion: 3, markets: [] }
    store.atomicWriteJson(store.paths.marketplaces, badMarkets)
    const stateBefore = readFileSync(store.paths.state, 'utf8')
    const marketsBefore = readFileSync(store.paths.marketplaces, 'utf8')

    expect(() => runMigrations(store)).toThrow(/不支持的 schemaVersion=3/)
    expect(readFileSync(store.paths.state, 'utf8')).toBe(stateBefore)
    expect(readFileSync(store.paths.marketplaces, 'utf8')).toBe(marketsBefore)
    const migrationRoot = path.join(store.paths.logs, 'migrations')
    expect(existsSync(migrationRoot) ? readdirSync(migrationRoot).length : 0).toBe(0)
  })

  it('JSON 损坏：抛错且不写盘', () => {
    const store = makeStore()
    writeFileSync(store.paths.state, '{ 这不是 JSON')
    expect(() => runMigrations(store)).toThrow(/不是合法 JSON/)
    expect(readFileSync(store.paths.state, 'utf8')).toBe('{ 这不是 JSON')
  })

  it('只有 state.json 存在：仅迁移存在的文件，备份只含该文件', () => {
    const store = makeStore()
    store.atomicWriteJson(store.paths.state, v1State())
    const result = runMigrations(store)
    expect(result.migrated).toBe(true)
    expect(existsSync(store.paths.marketplaces)).toBe(false)
    expect(readdirSync(result.backup!).sort()).toEqual(['state.json'])
    expect(readJson<PersistedState>(store.paths.state).schemaVersion).toBe(2)
  })

  it('无状态文件：直接跳过', () => {
    const store = makeStore()
    const result = runMigrations(store)
    expect(result.migrated).toBe(false)
    expect(result.backup).toBe(null)
  })
})
