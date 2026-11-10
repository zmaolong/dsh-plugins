/**
 * 维护 Run v1（B3）：due 阈值、规则预筛、提示词、计划容错解析、硬规则校验、
 * 执行/trash/撤销，以及 LLM 失败不写记忆库。全部离线（fake LLM）。
 */

import { existsSync, mkdirSync, readFileSync, utimesSync, writeFileSync } from 'node:fs'
import path from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import type {
  HostContext,
  LlmStreamChunkLike,
  LlmStreamOptionsLike,
} from '../src/host.ts'
import { MemoryRuntime } from '../src/memory-host.ts'
import {
  MAINTENANCE_DUE_DAYS,
  MAINTENANCE_DUE_WRITES,
  MAINTENANCE_MAX_CANDIDATES,
  MAINTENANCE_STATE_FILE,
  MaintenanceLog,
  buildMaintenanceMessages,
  computeMaintenanceDue,
  estimateTokens,
  executeMaintenancePlan,
  normalizeMaintenanceState,
  parseMaintenancePlan,
  prescreenMaintenance,
  pruneMaintenanceTrash,
  validateMaintenancePlan,
  type MaintenanceCandidate,
  type MaintenanceCandidateKind,
  type MaintenancePlan,
  type MaintenancePrescreen,
} from '../src/memory/maintenance.ts'
import { MemoryStore } from '../src/memory/store.ts'
import type {
  MaintenanceRun,
  MaintenanceState,
  MemoryEntry,
} from '../src/memory/types.ts'
import { removeDirs, tempHome } from './helpers.ts'

const NOW = Date.parse('2026-11-10T00:00:00.000Z')
const DAY_MS = 24 * 60 * 60 * 1000

/** 相对 NOW 的 ISO 时间。 */
function daysAgo(days: number): string {
  return new Date(NOW - days * DAY_MS).toISOString()
}

/** 构造一条完整记忆（默认 active、90 天前更新）。 */
function makeEntry(overrides: Partial<MemoryEntry> & { id: string, name: string }): MemoryEntry {
  return {
    description: '',
    type: 'reference',
    scope: 'global',
    project: '',
    tags: [],
    importance: 50,
    status: 'active',
    tier: 'long',
    reinforcement: 0,
    obsoleteVotes: 0,
    supersedes: [],
    usedCount: 0,
    confidence: 50,
    pinned: false,
    mergedFrom: [],
    source: 'capture',
    originSessionId: '',
    createdAt: daysAgo(120),
    updatedAt: daysAgo(120),
    content: '',
    ...overrides,
  }
}

/** 手工构造预筛结果，聚焦校验规则。 */
function manualPrescreen(parts: {
  duplicates?: MemoryEntry[]
  first?: MemoryEntry[]
  second?: MemoryEntry[]
  restores?: MemoryEntry[]
  referenced?: string[]
}): MaintenancePrescreen {
  const toCandidate = (kind: MaintenanceCandidateKind, entry: MemoryEntry): MaintenanceCandidate => ({ kind, entry })
  const candidates: MaintenanceCandidate[] = []
  const push = (kind: MaintenanceCandidateKind, list: MemoryEntry[] | undefined): MaintenanceCandidate[] => {
    if (list === undefined) return []
    for (const entry of list) {
      if (!candidates.some(candidate => candidate.entry.id === entry.id)) {
        candidates.push({ kind, entry })
      }
    }
    return list.map(entry => toCandidate(kind, entry))
  }
  push('duplicate', parts.duplicates)
  const first = push('first-stale', parts.first)
  const second = push('second-stale', parts.second)
  const restores = push('restore', parts.restores)
  return {
    candidates,
    pairs: [],
    firstStale: first,
    secondStale: second,
    restores,
    referencedIds: new Set(parts.referenced ?? []),
  }
}

/** 构造一份计划。 */
function makePlan(overrides: Partial<MaintenancePlan> = {}): MaintenancePlan {
  return { merges: [], stale: [], restore: [], delete: [], ...overrides }
}

describe('computeMaintenanceDue（阈值边界）', () => {
  it('从未运行时 due，daysSince 为 -1', () => {
    expect(computeMaintenanceDue({
      lastRunAt: null,
      capturedEntries: 10,
      capturedEntriesAtLastRun: 0,
      now: NOW,
    })).toEqual({ due: true, reason: 'never', writesSince: 10, daysSince: -1 })
  })

  it('新增/强化累计 30 条触发，29 条且 6 天时未触发', () => {
    expect(computeMaintenanceDue({
      lastRunAt: daysAgo(1),
      capturedEntries: 30,
      capturedEntriesAtLastRun: 0,
      now: NOW,
    })).toMatchObject({ due: true, reason: 'writes', writesSince: 30, daysSince: 1 })

    expect(computeMaintenanceDue({
      lastRunAt: daysAgo(6),
      capturedEntries: 29,
      capturedEntriesAtLastRun: 0,
      now: NOW,
    })).toMatchObject({ due: false, reason: 'none', writesSince: 29, daysSince: 6 })
  })

  it('距上次维护满 7 天触发；统计回退时 writesSince 不为负', () => {
    expect(computeMaintenanceDue({
      lastRunAt: daysAgo(MAINTENANCE_DUE_DAYS),
      capturedEntries: 0,
      capturedEntriesAtLastRun: 0,
      now: NOW,
    })).toMatchObject({ due: true, reason: 'days', daysSince: 7 })

    expect(computeMaintenanceDue({
      lastRunAt: daysAgo(6.5),
      capturedEntries: 2,
      capturedEntriesAtLastRun: 5,
      now: NOW,
    })).toMatchObject({ due: false, writesSince: 0, daysSince: 6 })
  })

  it('达到写入阈值常量时与日期无关', () => {
    expect(computeMaintenanceDue({
      lastRunAt: daysAgo(0),
      capturedEntries: MAINTENANCE_DUE_WRITES,
      capturedEntriesAtLastRun: 0,
      now: NOW,
    }).reason).toBe('writes')
  })
})

describe('prescreenMaintenance（规则预筛）', () => {
  it('重复候选：同 scope/project、相似度 ≥0.75，排除归档与钉住', () => {
    const first = makeEntry({ id: 'g1', name: '提交信息用中文', description: '仓库约定', content: '提交信息必须使用中文。', importance: 80 })
    const second = makeEntry({ id: 'g2', name: '提交信息用中文规范', description: '仓库约定', content: '提交信息必须使用中文。', importance: 40 })
    const archived = makeEntry({ id: 'g3', name: '提交信息用中文', description: '仓库约定', content: '提交信息必须使用中文。', status: 'archived' })
    const pinned = makeEntry({ id: 'g4', name: '提交信息用中文规范', description: '仓库约定', content: '提交信息必须使用中文。', pinned: true })
    const otherProject = makeEntry({ id: 'p1', name: '提交信息用中文', description: '仓库约定', content: '提交信息必须使用中文。', scope: 'project', project: 'p_demo' })

    const result = prescreenMaintenance({ entries: [first, second, archived, pinned, otherProject], now: NOW })
    const duplicateIds = result.candidates.filter(candidate => candidate.kind === 'duplicate').map(candidate => candidate.entry.id)
    expect(duplicateIds.sort()).toEqual(['g1', 'g2'])
    expect(result.pairs).toHaveLength(1)
    expect(result.pairs[0]?.keepId).toBe('g1')
    // 跨作用域不同项目不与全局条目配对。
    expect(duplicateIds).not.toContain('p1')
  })

  it('首次低价值：active、0 次使用、≥90 天、importance<60、未钉住', () => {
    const entries = [
      makeEntry({ id: 'hit', name: '命中', importance: 59, updatedAt: daysAgo(90) }),
      makeEntry({ id: 'used', name: '用过', importance: 59, updatedAt: daysAgo(200), usedCount: 3 }),
      makeEntry({ id: 'young', name: '不够旧', importance: 59, updatedAt: daysAgo(89.9) }),
      makeEntry({ id: 'important', name: '太重要', importance: 60, updatedAt: daysAgo(200) }),
      makeEntry({ id: 'pinned', name: '钉住', importance: 10, updatedAt: daysAgo(200), pinned: true }),
      makeEntry({ id: 'stale', name: '已 stale', importance: 10, status: 'stale', updatedAt: daysAgo(200) }),
    ]
    const result = prescreenMaintenance({
      entries,
      usage: { used: { usedCount: 3, lastUsedAt: daysAgo(5) } },
      now: NOW,
    })
    expect(result.firstStale.map(candidate => candidate.entry.id)).toEqual(['hit'])
    // usage 快照优先于条目里的 usedCount。
    const usedBySnapshot = prescreenMaintenance({
      entries: [makeEntry({ id: 'u1', name: '快照用过', importance: 10, updatedAt: daysAgo(200) })],
      usage: { u1: { usedCount: 1, lastUsedAt: daysAgo(10) } },
      now: NOW,
    })
    expect(usedBySnapshot.firstStale).toEqual([])
  })

  it('二次研判：stale、0 次使用、≥7 天；恢复候选：stale 且近期用过', () => {
    const entries = [
      makeEntry({ id: 'second', name: '二次', status: 'stale', updatedAt: daysAgo(7) }),
      makeEntry({ id: 'young', name: '不足七天', status: 'stale', updatedAt: daysAgo(6.9) }),
      makeEntry({ id: 'used', name: '用过', status: 'stale', updatedAt: daysAgo(30) }),
      makeEntry({ id: 'pinned', name: '钉住', status: 'stale', updatedAt: daysAgo(30), pinned: true }),
      makeEntry({ id: 'active', name: 'active', updatedAt: daysAgo(30) }),
    ]
    const result = prescreenMaintenance({
      entries,
      usage: { used: { usedCount: 2, lastUsedAt: daysAgo(3) } },
      now: NOW,
    })
    expect(result.secondStale.map(candidate => candidate.entry.id)).toEqual(['second'])
    expect(result.restores.map(candidate => candidate.entry.id)).toEqual(['used'])
    expect(result.candidates.some(candidate => candidate.entry.id === 'pinned')).toBe(false)
  })

  it('延迟评审：short 条目闲置超观察期进候选（probation），被消费/长期条目不进', () => {
    const entries = [
      makeEntry({ id: 'expired', name: '观察期满', tier: 'short', updatedAt: daysAgo(8) }),
      makeEntry({ id: 'recent', name: '刚写入', tier: 'short', updatedAt: daysAgo(6.9) }),
      // 30 天前写入但 2 天前被消费过：闲置从最近使用起算，不算期满。
      makeEntry({ id: 'used-late', name: '近期用过', tier: 'short', updatedAt: daysAgo(30), lastUsedAt: daysAgo(2) }),
      makeEntry({ id: 'long-idle', name: '长期闲置', tier: 'long', importance: 10, updatedAt: daysAgo(8) }),
    ]
    const result = prescreenMaintenance({ entries, now: NOW, observationDays: 7 })
    expect(result.firstStale.map(candidate => candidate.entry.id)).toEqual(['expired'])
    expect(result.firstStale[0]?.kind).toBe('probation')
  })

  it('候选总数 ≤200 且按四类均衡截断', () => {
    const entries: MemoryEntry[] = []
    for (let index = 0; index < 120; index += 1) {
      entries.push(makeEntry({ id: `f${index}`, name: `首次 ${index}`, importance: 10, updatedAt: daysAgo(100) }))
      entries.push(makeEntry({ id: `s${index}`, name: `二次 ${index}`, status: 'stale', updatedAt: daysAgo(10) }))
    }
    for (let index = 0; index < 120; index += 1) {
      entries.push(makeEntry({
        id: `r${index}`,
        name: `恢复 ${index}`,
        status: 'stale',
        updatedAt: daysAgo(10),
      }))
    }
    const usage: Record<string, { usedCount: number, lastUsedAt: string }> = {}
    for (let index = 0; index < 120; index += 1) usage[`r${index}`] = { usedCount: 1, lastUsedAt: daysAgo(2) }
    for (let index = 0; index < 15; index += 1) {
      entries.push(makeEntry({
        id: `d${index}a`,
        name: `重复事实 ${index}`,
        description: '同一事实',
        content: '完全相同的正文内容，用于制造重复对。',
      }))
      entries.push(makeEntry({
        id: `d${index}b`,
        name: `重复事实 ${index} 副本`,
        description: '同一事实',
        content: '完全相同的正文内容，用于制造重复对。',
      }))
    }
    const result = prescreenMaintenance({ entries, usage, now: NOW })
    expect(result.candidates.length).toBeLessThanOrEqual(MAINTENANCE_MAX_CANDIDATES)
    expect(result.firstStale.length).toBeLessThanOrEqual(50)
    expect(result.secondStale.length).toBeLessThanOrEqual(50)
    expect(result.restores.length).toBeLessThanOrEqual(50)
    const duplicateCount = result.candidates.filter(candidate => candidate.kind === 'duplicate').length
    expect(duplicateCount).toBeLessThanOrEqual(50)
    // 配对只引用仍在候选集合内的 id（截断不会留下半对）。
    const candidateIds = new Set(result.candidates.map(candidate => candidate.entry.id))
    expect(result.pairs.length).toBeGreaterThan(0)
    expect(result.pairs.every(pair => candidateIds.has(pair.ids[0]) && candidateIds.has(pair.ids[1]))).toBe(true)
  })
})

describe('buildMaintenanceMessages（提示词与预算）', () => {
  it('把候选压缩成 JSON，包含利用率与重复对，并受 40k token 估算约束', () => {
    const entries = Array.from({ length: 200 }, (_, index) => makeEntry({
      id: `e${index}`,
      name: `候选 ${index} `.repeat(20),
      description: '很长的描述'.repeat(60),
      content: '很长的正文内容'.repeat(200),
      importance: 10,
      updatedAt: daysAgo(100),
    }))
    const result = prescreenMaintenance({ entries, now: NOW, limit: 200 })
    const messages = buildMaintenanceMessages({ prescreen: result, project: null, now: NOW })
    expect(messages).toHaveLength(2)
    expect(estimateTokens(messages[0]?.content ?? '')).toBeGreaterThan(0)
    expect(estimateTokens(messages[1]?.content ?? '')).toBeLessThanOrEqual(40_000)
    const payload = JSON.parse(messages[1]?.content ?? '{}') as {
      candidates: Array<{ id: string, kind: string, usage: { usedCount: number } }>
      duplicatePairs: unknown[]
    }
    expect(payload.candidates.length).toBeGreaterThan(0)
    expect(payload.candidates[0]).toMatchObject({ kind: expect.any(String), usage: expect.any(Object) })
    expect(Array.isArray(payload.duplicatePairs)).toBe(true)
  })
})

describe('parseMaintenancePlan（容错解析）', () => {
  it('支持围栏、前后散文、尾逗号与裸换行', () => {
    const raw = `维护结果如下：\n\`\`\`json\n{"merges":[{"keepId":"a","mergeIds":["b"],"mergedName":"合并","mergedDescription":"描述","mergedContent":"正文","reason":"重复",},],"stale":["c",],"restore":[],"delete":["d"],}\n\`\`\`\n完成。`
    expect(parseMaintenancePlan(raw)).toEqual({
      merges: [{
        keepId: 'a',
        mergeIds: ['b'],
        mergedName: '合并',
        mergedDescription: '描述',
        mergedContent: '正文',
        reason: '重复',
      }],
      stale: ['c'],
      restore: [],
      delete: ['d'],
    })
  })

  it('没有可用 JSON 或缺少关键字段时降级', () => {
    expect(parseMaintenancePlan('模型拒绝输出')).toBeNull()
    expect(parseMaintenancePlan({})).toBeNull()
    expect(parseMaintenancePlan('{"merges":[{"mergeIds":["b"]}],"stale":[],"restore":[],"delete":[]}')).toEqual({
      merges: [],
      stale: [],
      restore: [],
      delete: [],
    })
    expect(parseMaintenancePlan('{"merges":[{"keepId":"a","mergeIds":[]}],"stale":[],"restore":[],"delete":[]}')?.merges)
      .toEqual([])
  })
})

describe('validateMaintenancePlan（硬规则不可绕过）', () => {
  it('跨 scope/project 的合并被拒绝', () => {
    const global = makeEntry({ id: 'g', name: '全局事实' })
    const project = makeEntry({ id: 'p', name: '项目事实', scope: 'project', project: 'p_demo' })
    const prescreen = manualPrescreen({ duplicates: [global, project] })
    const result = validateMaintenancePlan(makePlan({
      merges: [{ keepId: 'g', mergeIds: ['p'], mergedName: '', mergedDescription: '', mergedContent: '', reason: '' }],
    }), prescreen)
    expect(result.merges).toEqual([])
    expect(result.rejected[0]?.reason).toContain('作用域')
  })

  it('pinned 或 importance ≥80 的保留条目不能作为合并目标', () => {
    const pinned = makeEntry({ id: 'pin', name: '钉住', pinned: true })
    const high = makeEntry({ id: 'high', name: '高重要', importance: 80 })
    const other = makeEntry({ id: 'other', name: '另一条' })
    const prescreen = manualPrescreen({ duplicates: [pinned, other, high] })
    const result = validateMaintenancePlan(makePlan({
      merges: [
        { keepId: 'pin', mergeIds: ['other'], mergedName: '', mergedDescription: '', mergedContent: '', reason: '' },
        { keepId: 'high', mergeIds: ['other'], mergedName: '', mergedDescription: '', mergedContent: '', reason: '' },
      ],
    }), prescreen)
    expect(result.merges).toEqual([])
    expect(result.rejected.map(item => item.reason)).toEqual(expect.arrayContaining([
      '保留条目已钉住',
      '保留条目重要性 ≥ 80',
    ]))
  })

  it('删除只允许二次研判候选：pinned、importance≥80、supersedes 引用、首次候选都不行', () => {
    const first = makeEntry({ id: 'first', name: '首次候选' })
    const pinned = makeEntry({ id: 'pin', name: '钉住', status: 'stale', pinned: true, updatedAt: daysAgo(10) })
    const high = makeEntry({ id: 'high', name: '高重要', status: 'stale', importance: 80, updatedAt: daysAgo(10) })
    const referenced = makeEntry({ id: 'ref', name: '被引用', status: 'stale', updatedAt: daysAgo(10) })
    const normal = makeEntry({ id: 'normal', name: '可删', status: 'stale', updatedAt: daysAgo(10) })
    const prescreen = manualPrescreen({
      first: [first],
      second: [pinned, high, referenced, normal],
      referenced: ['ref'],
    })
    const result = validateMaintenancePlan(makePlan({ delete: ['first', 'pin', 'high', 'ref', 'normal', 'missing'] }), prescreen)
    expect(result.delete).toEqual(['normal'])
    expect(result.rejected.map(item => item.reason)).toEqual(expect.arrayContaining([
      '删除只允许二次研判候选',
      '条目已钉住',
      '条目重要性 ≥ 80',
      '被其它条目的 supersedes 引用',
      '不在预筛候选内',
    ]))
  })

  it('恢复 active 条目或候选外 id 被拒绝；恢复 stale 通过', () => {
    const active = makeEntry({ id: 'active', name: '活跃' })
    const stale = makeEntry({ id: 'stale', name: '过期', status: 'stale' })
    const prescreen = manualPrescreen({ first: [active], restores: [stale] })
    const result = validateMaintenancePlan(makePlan({ restore: ['active', 'ghost', 'stale'] }), prescreen)
    expect(result.restore).toEqual(['stale'])
    expect(result.rejected.map(item => item.id)).toEqual(['active', 'ghost'])
  })

  it('stale 只允许首次/二次候选；同一 id 不能跨动作重复', () => {
    const first = makeEntry({ id: 'first', name: '首次' })
    const second = makeEntry({ id: 'second', name: '二次', status: 'stale' })
    const restore = makeEntry({ id: 'restore', name: '恢复', status: 'stale' })
    const prescreen = manualPrescreen({ first: [first], second: [second], restores: [restore] })
    const result = validateMaintenancePlan(makePlan({
      stale: ['first', 'second', 'restore', 'missing'],
      restore: ['second'],
      delete: ['first'],
    }), prescreen)
    expect(result.stale.sort()).toEqual(['first', 'second'])
    expect(result.restore).toEqual([])
    expect(result.delete).toEqual([])
    expect(result.rejected.length).toBeGreaterThan(0)
  })

  it('单 Run 动作数超过 50 时截断并标记', () => {
    const entries = Array.from({ length: 60 }, (_, index) => makeEntry({ id: `e${index}`, name: `候选 ${index}` }))
    const prescreen = manualPrescreen({ first: entries })
    const result = validateMaintenancePlan(makePlan({ stale: entries.map(entry => entry.id) }), prescreen)
    expect(result.stale).toHaveLength(50)
    expect(result.actions).toBe(50)
    expect(result.truncated).toBe(true)
    expect(result.rejected.filter(item => item.reason === '动作数超过上限')).toHaveLength(10)
  })
})

// ---------------------------------------------------------------------------
// 真实 store + 临时 home
// ---------------------------------------------------------------------------

let tempDirs: string[] = []
let runtimes: MemoryRuntime[] = []

afterEach(async () => {
  for (const runtime of runtimes) await runtime.dispose()
  runtimes = []
  removeDirs(...tempDirs)
  tempDirs = []
})

function makeStore(): MemoryStore {
  const home = tempHome('memory-maintenance-')
  tempDirs.push(home)
  const store = new MemoryStore({ home })
  store.start()
  return store
}

/** 条目文件路径（测试已知项目 key 是目录安全值）。 */
function entryFile(store: MemoryStore, entry: MemoryEntry): string {
  return entry.scope === 'global'
    ? path.join(store.root, 'global', `${entry.id}.md`)
    : path.join(store.root, 'projects', entry.project, `${entry.id}.md`)
}

/** 把条目的 updatedAt 改到指定时间（必要时先改状态），并推进 mtime 让缓存失效。 */
function ageEntry(store: MemoryStore, entry: MemoryEntry, at: string, status?: MemoryEntry['status']): void {
  if (status !== undefined) store.setStatus(entry.scope, entry.project, entry.id, status)
  const file = entryFile(store, entry)
  const source = readFileSync(file, 'utf8')
  writeFileSync(file, source.replace(/^updatedAt: ".*"$/mu, `updatedAt: "${at}"`), 'utf8')
  const future = new Date(Date.now() + 5000)
  utimesSync(file, future, future)
}

/** 读维护状态文件。 */
function readMaintenanceState(store: MemoryStore): MaintenanceState {
  return JSON.parse(readFileSync(path.join(store.root, MAINTENANCE_STATE_FILE), 'utf8')) as MaintenanceState
}

interface FakeLlm {
  calls: LlmStreamOptionsLike[]
  responses: string[]
  error: Error | null
  stream(options: LlmStreamOptionsLike): AsyncIterable<LlmStreamChunkLike>
}

function createFakeLlm(): FakeLlm {
  const llm: FakeLlm = {
    calls: [],
    responses: [],
    error: null,
    stream(options) {
      llm.calls.push(options)
      if (llm.error !== null) {
        return (async function* (): AsyncGenerator<LlmStreamChunkLike> {
          throw llm.error
        })()
      }
      const content = llm.responses.shift() ?? '{"merges":[],"stale":[],"restore":[],"delete":[]}'
      return (async function* (): AsyncGenerator<LlmStreamChunkLike> {
        yield { type: 'text-delta', text: content }
        yield { type: 'finish', reason: 'stop' }
      })()
    },
  }
  return llm
}

/** 最小宿主 ctx：只提供 llm 与默认模型服务。 */
function createRuntime(store: MemoryStore, llm: FakeLlm, defaultModel?: unknown): MemoryRuntime {
  const ctx = {
    get(name: string) {
      if (name === 'llm') return llm
      if (name === 'agentDefaultModel' && defaultModel !== undefined) {
        return { currentSelection: () => defaultModel }
      }
      return undefined
    },
    on() {
      return () => {}
    },
    effect() {
      return () => {}
    },
    inject() {},
  } as unknown as HostContext
  const runtime = new MemoryRuntime({ ctx, store, log: () => {} })
  runtimes.push(runtime)
  return runtime
}

describe('executeMaintenancePlan + undo（trash 与撤销）', () => {
  it('合并/停用/恢复/删除执行后状态正确，trash 快照齐全，undo 全部回滚且幂等', async () => {
    const store = makeStore()
    const g1 = store.save({
      name: '提交信息用中文',
      description: '仓库约定',
      type: 'preference',
      scope: 'global',
      content: '提交信息必须使用中文。',
      importance: 50,
      tags: ['约定'],
    })
    const g2 = store.save({
      name: '提交信息用中文规范',
      description: '仓库约定',
      type: 'preference',
      scope: 'global',
      content: '提交信息必须使用中文。',
      tags: ['中文'],
      importance: 70,
    })
    const first = store.save({
      name: '低价值事实',
      description: '从未用过',
      type: 'reference',
      scope: 'global',
      content: '旧正文。',
      importance: 30,
    })
    const second = store.save({
      name: '二次候选',
      description: '过期事实',
      type: 'reference',
      scope: 'global',
      content: '待删除。',
      importance: 20,
    })
    const restore = store.save({
      name: '恢复候选',
      description: '近期用过',
      type: 'reference',
      scope: 'global',
      content: '仍有用。',
      importance: 40,
    })
    ageEntry(store, first, daysAgo(100))
    ageEntry(store, second, daysAgo(10), 'stale')
    ageEntry(store, restore, daysAgo(10), 'stale')

    const usage = { [restore.id]: { usedCount: 3, lastUsedAt: daysAgo(2) } }
    const prescreen = prescreenMaintenance({ entries: store.entries('global'), usage, now: NOW })
    expect(prescreen.candidates.length).toBe(5)
    const validated = validateMaintenancePlan(makePlan({
      merges: [{
        keepId: g1.id,
        mergeIds: [g2.id],
        mergedName: '提交信息用中文（合并）',
        mergedDescription: '仓库约定（合并）',
        mergedContent: '提交信息必须使用中文。',
        reason: '重复',
      }],
      stale: [first.id],
      restore: [restore.id],
      delete: [second.id],
    }), prescreen)
    expect(validated.rejected).toEqual([])
    expect(validated.actions).toBe(4)

    const runId = 'mnt-test-run'
    const trashRoot = path.join(store.root, 'trash', runId)
    const execution = executeMaintenancePlan(store, validated, prescreen, {
      trashRoot,
      candidates: prescreen.candidates.length,
    })
    expect(execution.error).toBe('')
    expect(execution.counts).toMatchObject({ candidates: 5, merges: 1, staled: 1, restored: 1, deleted: 1 })

    const kept = store.get('global', '', g1.id)
    expect(kept?.name).toBe('提交信息用中文（合并）')
    expect(kept?.tags.sort()).toEqual(['中文', '约定'])
    expect(kept?.importance).toBe(70)
    expect(kept?.mergedFrom).toEqual([g2.id])
    expect(store.get('global', '', g2.id)?.status).toBe('archived')
    expect(store.get('global', '', first.id)?.status).toBe('stale')
    expect(store.get('global', '', restore.id)?.status).toBe('active')
    expect(store.get('global', '', second.id)).toBeUndefined()

    for (const id of [g1.id, g2.id, first.id, second.id, restore.id]) {
      expect(existsSync(path.join(trashRoot, 'global', `${id}.md`))).toBe(true)
    }

    // 把执行结果写成维护流水，再用运行时撤销。
    const log = new MaintenanceLog(store.root)
    const run: MaintenanceRun = {
      id: runId,
      at: new Date(NOW).toISOString(),
      scope: 'global',
      project: '',
      model: { provider: 'fake', model: 'fake' },
      status: 'completed',
      counts: execution.counts,
      actions: execution.actions,
      error: '',
      undone: false,
    }
    log.record(run, store.stats().capturedEntries)
    expect(readMaintenanceState(store).runs[0]).toMatchObject({ id: runId, undone: false })

    const runtime = createRuntime(store, createFakeLlm())
    expect(runtime.undoMaintenance(runId)).toEqual({ restored: 5 })
    expect(store.get('global', '', g1.id)?.name).toBe('提交信息用中文')
    expect(store.get('global', '', g1.id)?.mergedFrom).toEqual([])
    expect(store.get('global', '', g2.id)?.status).toBe('active')
    expect(store.get('global', '', first.id)?.status).toBe('active')
    expect(store.get('global', '', restore.id)?.status).toBe('stale')
    expect(store.get('global', '', second.id)?.status).toBe('stale')
    expect(readMaintenanceState(store).runs[0]?.undone).toBe(true)

    // 幂等：已撤销的 Run 不再重复写回。
    expect(runtime.undoMaintenance(runId)).toEqual({ restored: 0 })
    expect(() => runtime.undoMaintenance('mnt-missing')).toThrow(/不存在/u)
  })

  it('项目条目删除后可从 trash 的 projects 相对路径恢复', () => {
    const store = makeStore()
    store.touchProject({
      projectKey: 'p_demo',
      identity: 'github.com/acme/demo',
      source: 'git-remote',
      displayName: 'demo',
      root: tempDirs[0] as string,
    })
    const entry = store.save({
      name: '项目事实',
      description: '待删除',
      type: 'project',
      scope: 'project',
      project: 'p_demo',
      content: '项目正文。',
      importance: 20,
    })
    ageEntry(store, entry, daysAgo(10), 'stale')
    const prescreen = prescreenMaintenance({
      entries: store.entries('global').concat(store.entries('project', 'p_demo')),
      now: NOW,
    })
    const validated = validateMaintenancePlan(makePlan({ delete: [entry.id] }), prescreen)
    const trashRoot = path.join(store.root, 'trash', 'mnt-project')
    expect(executeMaintenancePlan(store, validated, prescreen, { trashRoot, candidates: 1 }).counts.deleted).toBe(1)
    expect(store.get('project', 'p_demo', entry.id)).toBeUndefined()
    expect(existsSync(path.join(trashRoot, 'projects', 'p_demo', `${entry.id}.md`))).toBe(true)

    expect(store.restoreTrashRun(trashRoot)).toBe(1)
    expect(store.get('project', 'p_demo', entry.id)?.status).toBe('stale')
  })
})

describe('MemoryRuntime.runMaintenance（fake LLM）', () => {
  it('完整流水线：选宿主默认模型、执行计划、写 maintenance.json', async () => {
    const store = makeStore()
    const g1 = store.save({ name: '重复 A', description: '同一个事实', type: 'reference', scope: 'global', content: '相同正文内容。' })
    const g2 = store.save({ name: '重复 A 副本', description: '同一个事实', type: 'reference', scope: 'global', content: '相同正文内容。' })
    const stale = store.save({ name: '低价值', description: '旧', type: 'reference', scope: 'global', content: '旧。', importance: 10 })
    const second = store.save({ name: '应删除', description: '过时', type: 'reference', scope: 'global', content: '删除。', importance: 10 })
    ageEntry(store, stale, daysAgo(100))
    ageEntry(store, second, daysAgo(10), 'stale')

    const llm = createFakeLlm()
    llm.responses.push(JSON.stringify({
      merges: [{
        keepId: g1.id,
        mergeIds: [g2.id],
        mergedName: '重复 A（合并）',
        mergedDescription: '同一个事实',
        mergedContent: '合并后的正文。',
        reason: '重复',
      }],
      stale: [stale.id],
      restore: [],
      delete: [second.id],
    }))
    const runtime = createRuntime(store, llm, { provider: 'host-provider', model: 'host-model' })

    const { run } = await runtime.runMaintenance({ scope: 'global' })
    expect(run.status).toBe('completed')
    expect(run.model).toEqual({ provider: 'host-provider', model: 'host-model' })
    expect(run.counts).toMatchObject({ candidates: expect.any(Number), merges: 1, staled: 1, deleted: 1 })
    expect(llm.calls).toHaveLength(1)
    expect(llm.calls[0]).toMatchObject({
      provider: 'host-provider',
      model: 'host-model',
      maxTokens: 2000,
      temperature: 0.2,
      reasoningEffort: 'off',
      purpose: 'memory-maintenance',
    })
    expect(store.get('global', '', g2.id)?.status).toBe('archived')
    expect(store.get('global', '', second.id)).toBeUndefined()

    const state = readMaintenanceState(store)
    expect(state.schema).toBe(1)
    expect(state.lastRunAt).toBe(run.at)
    expect(state.capturedEntriesAtLastRun).toBe(store.stats().capturedEntries)
    expect(state.runs[0]).toMatchObject({ id: run.id, status: 'completed', undone: false })
    expect(state.runs[0]?.actions.map(action => action.kind).sort()).toEqual(['delete', 'merge', 'stale'])
  })

  it('设置里指定维护模型时覆盖宿主默认模型', async () => {
    const store = makeStore()
    store.updateSettings({ maintenanceProvider: 'maintenance-provider', maintenanceModel: 'maintenance-model' })
    const old = store.save({ name: '旧候选', description: '过期', type: 'reference', scope: 'global', content: '旧。', importance: 10 })
    ageEntry(store, old, daysAgo(100))
    const llm = createFakeLlm()
    const runtime = createRuntime(store, llm, { provider: 'host-provider', model: 'host-model' })
    const { run } = await runtime.runMaintenance({ scope: 'global' })
    expect(run.status).toBe('empty')
    expect(llm.calls[0]).toMatchObject({ provider: 'maintenance-provider', model: 'maintenance-model' })
  })

  it('LLM 失败：failed Run 落流水、不写记忆库、不推进 lastRunAt', async () => {
    const store = makeStore()
    const old = store.save({ name: '旧候选', description: '过期', type: 'reference', scope: 'global', content: '旧。', importance: 10 })
    ageEntry(store, old, daysAgo(100))
    store.updateSettings({ maintenanceProvider: 'p', maintenanceModel: 'm' })
    const llm = createFakeLlm()
    llm.error = new Error('模型不可用')
    const runtime = createRuntime(store, llm)
    const { run } = await runtime.runMaintenance({ scope: 'global' })
    expect(run.status).toBe('failed')
    expect(run.error).toContain('模型不可用')
    expect(store.get('global', '', old.id)?.status).toBe('active')
    expect(store.get('global', '', old.id)?.content).toBe('旧。')
    const state = readMaintenanceState(store)
    expect(state.lastRunAt).toBeNull()
    expect(state.runs[0]).toMatchObject({ status: 'failed', error: expect.stringContaining('模型不可用') })
  })

  it('没有候选时不调用模型，落 empty Run', async () => {
    const store = makeStore()
    const llm = createFakeLlm()
    const runtime = createRuntime(store, llm, { provider: 'p', model: 'm' })
    const { run } = await runtime.runMaintenance({ scope: 'global' })
    expect(run.status).toBe('empty')
    expect(run.model).toBeNull()
    expect(llm.calls).toHaveLength(0)
    expect(readMaintenanceState(store).runs[0]?.status).toBe('empty')
  })

  it('维护状态与 due 读数、最近流水有界', () => {
    const store = makeStore()
    const runtime = createRuntime(store, createFakeLlm())
    const before = runtime.maintenanceStatus()
    expect(before).toMatchObject({ due: true, reason: 'never', writesSince: 0, lastRunAt: null, recentRuns: [] })

    const log = new MaintenanceLog(store.root)
    for (let index = 0; index < 25; index += 1) {
      const run: MaintenanceRun = {
        id: `mnt-${index}`,
        at: new Date(NOW + index * 1000).toISOString(),
        scope: 'global',
        project: '',
        model: null,
        status: 'empty',
        counts: { candidates: 0, merges: 0, staled: 0, restored: 0, deleted: 0 },
        actions: [],
        error: '',
        undone: false,
      }
      log.record(run, index)
    }
    const state = log.state()
    expect(state.runs).toHaveLength(20)
    expect(state.projectRuns).toEqual({})

    // 损坏/旧数据容错。
    const normalized = normalizeMaintenanceState({
      schema: 99,
      lastRunAt: 'not-a-date',
      capturedEntriesAtLastRun: '42',
      projectRuns: { p_1: '2026-01-01T00:00:00.000Z', '': 'bad' },
      runs: [{ id: 'x', status: 'bogus', counts: { candidates: 9999 }, actions: [{ kind: 'merge', ids: ['a'] }, { kind: 'bogus' }] }],
    })
    expect(normalized.lastRunAt).toBeNull()
    expect(normalized.capturedEntriesAtLastRun).toBe(42)
    expect(normalized.projectRuns).toEqual({ p_1: '2026-01-01T00:00:00.000Z' })
    expect(normalized.runs[0]).toMatchObject({ id: 'x', status: 'failed', counts: { candidates: 200 } })
    expect(normalized.runs[0]?.actions).toHaveLength(1)
  })
})

describe('trash prune', () => {
  it('清理超过 30 天的 Run 目录，保留较新的', () => {
    const store = makeStore()
    const trashRoot = path.join(store.root, 'trash')
    const oldDir = path.join(trashRoot, 'mnt-old', 'global')
    const newDir = path.join(trashRoot, 'mnt-new', 'global')
    // 直接在 trash 下建目录与文件，再回拨旧目录 mtime。
    mkdirSync(trashRoot, { recursive: true })
    writeFileSync(path.join(trashRoot, 'placeholder'), 'x')
    mkdirSync(oldDir, { recursive: true })
    mkdirSync(newDir, { recursive: true })
    writeFileSync(path.join(oldDir, 'a.md'), 'old')
    writeFileSync(path.join(newDir, 'b.md'), 'new')
    const past = new Date(NOW - 40 * DAY_MS)
    utimesSync(path.join(trashRoot, 'mnt-old'), past, past)

    expect(pruneMaintenanceTrash(trashRoot, NOW)).toBe(1)
    expect(existsSync(path.join(trashRoot, 'mnt-old'))).toBe(false)
    expect(existsSync(path.join(trashRoot, 'mnt-new'))).toBe(true)
  })
})