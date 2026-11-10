/**
 * 记忆存储与召回：一事实一文件（schema v2）、手改生效、指纹去重、
 * 标签/取代语义、类型下推、并发写串行、统计面 v2 与导出。
 */

import { afterEach, describe, expect, it } from 'vitest'
import { existsSync, readFileSync, utimesSync, writeFileSync } from 'node:fs'
import path from 'node:path'

import { MemoryStore } from '../src/memory/store.ts'
import { renderRecallContext } from '../src/memory/recall.ts'
import { defaultSettings } from '../src/memory/types.ts'
import { removeDirs, tempHome } from './helpers.ts'

describe('记忆存储：Markdown 事实、手改、去重与生命周期', () => {
  let tempDirs: string[] = []

  afterEach(() => {
    removeDirs(...tempDirs)
    tempDirs = []
  })

  function makeStore(): MemoryStore {
    const home = tempHome('memory-store-')
    tempDirs.push(home)
    const store = new MemoryStore({ home })
    store.start()
    return store
  }

  function add(store: MemoryStore, overrides: Partial<Parameters<MemoryStore['save']>[0]> = {}) {
    return store.save({
      name: '使用 pnpm',
      description: '本仓库统一使用 pnpm 安装依赖',
      type: 'preference',
      scope: 'global',
      content: '不要使用 npm 或 yarn，统一 pnpm。',
      ...overrides,
    })
  }

  it('写入一条记忆：schema v3 字段、默认值（模型写入定级短期），且不再生成 MEMORY.md', () => {
    const store = makeStore()
    const entry = add(store)
    expect(entry.id).toMatch(/^m-/u)
    expect(entry.status).toBe('active')
    // schema v3 默认值：capture/tool 写入先进短期观察
    expect(entry).toMatchObject({
      usedCount: 0,
      confidence: 50,
      pinned: false,
      mergedFrom: [],
      source: 'capture',
      tier: 'short',
    })
    expect(entry.lastUsedAt).toBeUndefined()

    const file = path.join(store.root, 'global', `${entry.id}.md`)
    expect(existsSync(file)).toBe(true)
    const written = readFileSync(file, 'utf8')
    expect(written).toContain('schema: 3')
    expect(written).toContain('tier: short')
    expect(written).toContain('name: "使用 pnpm"')
    expect(written).toContain('usedCount: 0')
    expect(written).toContain('confidence: 50')
    expect(written).toContain('pinned: false')
    expect(written).toContain('mergedFrom: []')
    expect(written).toContain('source: capture')
    expect(written).not.toContain('lastUsedAt:')
    expect(written).toContain('不要使用 npm 或 yarn')
    // B0 起旧索引只写不读：新写入不再生成 MEMORY.md。
    expect(existsSync(path.join(store.root, 'global', 'MEMORY.md'))).toBe(false)
    expect(store.get('global', '', entry.id)?.content).toContain('pnpm')
    expect(store.list('global').map(item => item.id)).toEqual([entry.id])
  })

  it('写入定级：用户显式途径（source=user）直接长期；显式 tier 优先', () => {
    const store = makeStore()
    const userEntry = add(store, { source: 'user' })
    expect(userEntry.tier).toBe('long')
    const forced = add(store, { name: '另一条', description: 'x', content: 'y', tier: 'long' })
    expect(forced.tier).toBe('long')
  })

  it('相同指纹的写入只强化原条目，不重复新增', () => {
    const store = makeStore()
    const first = add(store)
    const second = add(store, { importance: 80 })
    expect(second.id).toBe(first.id)
    expect(second.reinforcement).toBe(1)
    expect(second.importance).toBe(80)
    expect(store.list('global')).toHaveLength(1)
  })

  it('手改 Markdown 立即生效（按文件 mtime+size 失效，不再看目录 mtime）', () => {
    const store = makeStore()
    const entry = add(store)
    const file = path.join(store.root, 'global', `${entry.id}.md`)
    const original = readFileSync(file, 'utf8')

    // 第一次：改名称（字节数变化）。
    writeFileSync(file, original.replace('name: "使用 pnpm"', 'name: "手改名称"'), 'utf8')
    expect(store.get('global', '', entry.id)?.name).toBe('手改名称')

    // 第二次：同字节长度的改动 + 显式推进 mtime，仍必须失效重读。
    const sameLength = original.replace('统一 pnpm。', '统一 pnom。')
    writeFileSync(file, sameLength, 'utf8')
    const future = new Date(Date.now() + 5000)
    utimesSync(file, future, future)
    expect(store.get('global', '', entry.id)?.content).toContain('统一 pnom')

    // 改正文也生效，且不会因为缓存返回旧正文。
    writeFileSync(file, sameLength.replace('统一 pnom。', '统一使用 pnpm。'), 'utf8')
    expect(store.get('global', '', entry.id)?.content).toContain('统一使用 pnpm')
  })

  it('tags 显式传 [] 清空；缺省时保留旧标签', () => {
    const store = makeStore()
    const entry = add(store, { tags: ['pnpm', '约定'] })
    expect(entry.tags).toEqual(['pnpm', '约定'])

    const updated = store.save({
      id: entry.id,
      name: entry.name,
      description: entry.description,
      type: entry.type,
      scope: 'global',
      content: '更新后的正文，标签要清空。',
      tags: [],
    })
    expect(updated.tags).toEqual([])
    expect(store.get('global', '', entry.id)?.tags).toEqual([])
    expect(readFileSync(path.join(store.root, 'global', `${entry.id}.md`), 'utf8')).toContain('tags: []')

    // 未传 tags（undefined）时保留当前值。
    const kept = store.save({
      id: entry.id,
      name: entry.name,
      description: entry.description,
      type: entry.type,
      scope: 'global',
      content: '再次更新，不传 tags。',
    })
    expect(kept.tags).toEqual([])
  })

  it('update 分支处理 supersedes：替换关系写入并标记旧条目 stale', () => {
    const store = makeStore()
    const oldEntry = add(store, { name: '使用 npm', description: '旧约定', content: '用 npm 安装。' })
    const replacement = add(store, { name: '使用 pnpm', description: '新约定', content: '统一 pnpm。' })

    const updated = store.save({
      id: replacement.id,
      name: replacement.name,
      description: replacement.description,
      type: replacement.type,
      scope: 'global',
      content: replacement.content,
      supersedes: [oldEntry.id],
    })
    expect(updated.supersedes).toEqual([oldEntry.id])
    expect(store.get('global', '', oldEntry.id)?.status).toBe('stale')

    // 重复更新不会重复计票，避免把旧条目误归档。
    store.save({
      id: replacement.id,
      name: replacement.name,
      description: replacement.description,
      type: replacement.type,
      scope: 'global',
      content: replacement.content,
      supersedes: [oldEntry.id],
    })
    const old = store.get('global', '', oldEntry.id)
    expect(old?.status).toBe('stale')
    expect(old?.obsoleteVotes).toBe(1)
  })

  it('同指纹强化分支也处理 supersedes，且只对新 id 计票', () => {
    const store = makeStore()
    const target = add(store, { name: '将要被取代', description: '旧事实', content: '旧正文内容。' })
    const keeper = add(store, { name: '保留条目', description: '稳定事实', content: '稳定正文。' })

    const reinforced = store.save({
      name: keeper.name,
      description: keeper.description,
      content: keeper.content,
      type: keeper.type,
      scope: 'global',
      supersedes: [target.id],
    })
    expect(reinforced.id).toBe(keeper.id)
    expect(reinforced.reinforcement).toBe(1)
    expect(reinforced.supersedes).toContain(target.id)
    expect(store.get('global', '', target.id)?.status).toBe('stale')

    // 再次强化：不重复计票。
    store.save({
      name: keeper.name,
      description: keeper.description,
      content: keeper.content,
      type: keeper.type,
      scope: 'global',
      supersedes: [target.id],
    })
    const stale = store.get('global', '', target.id)
    expect(stale?.status).toBe('stale')
    expect(stale?.obsoleteVotes).toBe(1)
  })

  it('supersedes 把旧条目降为 stale，两次 forget 后归档', () => {
    const store = makeStore()
    const oldEntry = add(store, { name: '使用 npm', description: '旧约定', content: '用 npm 安装。' })
    const newEntry = add(store, {
      name: '使用 pnpm',
      description: '新约定',
      content: '统一 pnpm。',
      supersedes: [oldEntry.id],
    })
    expect(newEntry.supersedes).toEqual([oldEntry.id])
    expect(store.get('global', '', oldEntry.id)?.status).toBe('stale')

    const first = store.forget('global', '', newEntry.id)
    expect(first.entry.status).toBe('stale')
    expect(first.archived).toBe(false)
    const second = store.forget('global', '', newEntry.id)
    expect(second.entry.status).toBe('archived')
    expect(second.archived).toBe(true)
    expect(store.list('global').some(item => item.id === newEntry.id)).toBe(false)
    expect(store.list('global', '', { includeArchived: true }).some(item => item.id === newEntry.id)).toBe(true)
  })

  it('未知 frontmatter 字段在后续写入时原样保留（含嵌套结构）', () => {
    const store = makeStore()
    const entry = add(store)
    const file = path.join(store.root, 'global', `${entry.id}.md`)
    const original = readFileSync(file, 'utf8')
    const withExtra = original.replace(
      '\n---\n\n',
      '\ncustomField: "保留我"\ncustomBlock:\n  nested: 1\n中文键: "也保留"\n---\n\n',
    )
    writeFileSync(file, withExtra, 'utf8')
    // 先让缓存读到透传字段，再走 update 写回。
    expect(store.get('global', '', entry.id)?.name).toBe('使用 pnpm')
    const updated = store.save({
      id: entry.id,
      name: '使用 pnpm（更新）',
      description: entry.description,
      type: entry.type,
      scope: 'global',
      content: '重写后的正文。',
    })
    expect(updated.name).toBe('使用 pnpm（更新）')
    const written = readFileSync(file, 'utf8')
    expect(written).toContain('schema: 3')
    expect(written).toContain('customField: "保留我"')
    expect(written).toContain('customBlock:')
    expect(written).toContain('  nested: 1')
    expect(written).toContain('中文键: "也保留"')
  })

  it('search 的 type/includeArchived/limit 先过滤后截断（两种调用形式都可用）', () => {
    const store = makeStore()
    add(store, { name: '高优先偏好', description: '排序靠前', content: '偏好正文。', type: 'preference', importance: 90 })
    const decision = add(store, { name: '低优先决策', description: '排序靠后', content: '决策正文。', type: 'decision', importance: 10 })
    const archived = add(store, { name: '归档决策', description: '已归档', content: '归档正文。', type: 'decision', importance: 99 })
    store.setStatus('global', '', archived.id, 'archived')

    // 旧位置参数 + 第 5 个可选下推参数：type 过滤先于 limit，不能被高优先的其它类型挤掉。
    const legacy = store.search('global', '', '', 1, { type: 'decision' })
    expect(legacy.map(item => item.id)).toEqual([decision.id])

    // 新 options 对象形式（运行时使用）。
    const pushed = store.search('global', '', { query: '', type: 'decision', limit: 1 })
    expect(pushed.map(item => item.id)).toEqual([decision.id])

    // 默认不含 archived；显式 includeArchived 才返回。
    expect(store.search('global', '', { query: '', type: 'decision', limit: 5 }).some(item => item.id === archived.id)).toBe(false)
    expect(store.search('global', '', { query: '', type: 'decision', includeArchived: true, limit: 5 }).some(item => item.id === archived.id)).toBe(true)
    // 不限类型时排序第一仍是高优先偏好。
    expect(store.search('global', '', '', 1)[0]?.id).not.toBe(decision.id)
  })

  it('并发 saveAsync 经进程内写队列串行，不丢条目', async () => {
    const store = makeStore()
    const writes = Array.from({ length: 12 }, (_, index) => store.saveAsync({
      name: `并发条目 ${index}`,
      description: `第 ${index} 条`,
      type: 'decision',
      scope: 'global',
      content: `并发正文 ${index}`,
    }))
    const saved = await Promise.all(writes)
    await store.flushWrites()
    expect(new Set(saved.map(entry => entry.id)).size).toBe(12)
    expect(store.list('global')).toHaveLength(12)
    expect(store.search('global', '', { query: '', limit: 50 })).toHaveLength(12)
  })

  it('相似吸收：模型写入与既有条目极相似时转为强化而非新增；大改写与短文本不吸收', () => {
    const store = makeStore()
    const existing = add(store, {
      name: '提交信息必须使用中文',
      description: '仓库约定：git commit 的提交信息统一使用中文书写',
      content: '所有 git commit 的提交信息必须使用中文，不要混用英文或拼音，这是仓库级硬性约定。',
    })
    expect(existing.tier).toBe('short')
    // 同源提炼的微小措辞差异：指纹不同但 bigram 极相似 → 吸收为强化。
    const nearIdentical = store.save({
      name: '提交信息必须使用中文',
      description: '仓库约定：git commit 的提交信息统一使用中文书写',
      content: '所有 git commit 的提交信息必须使用中文，不要混用英文或拼音，这是仓库级硬性约定!',
      scope: 'global',
      type: 'decision',
    })
    expect(nearIdentical.id).toBe(existing.id)
    expect(nearIdentical.reinforcement).toBe(1)
    expect(nearIdentical.tier).toBe('long')
    expect(store.list('global')).toHaveLength(1)

    // 大幅改写的跨会话重复：相似度不到吸收阈值，交给维护流水线收尾。
    const rephrased = store.save({
      name: '提交信息要用中文',
      description: '本仓库的 git 提交信息统一使用中文，不要混用英文或拼音的仓库级约定',
      content: 'git commit 的提交信息一律使用中文书写，不要混用英文或拼音，这是仓库级的硬性约定。',
      scope: 'global',
      type: 'decision',
    })
    expect(rephrased.id).not.toBe(existing.id)
    expect(store.list('global')).toHaveLength(2)

    // 短模板文本（「条目 1」vs「条目 2」）bigram 虚高，不做吸收。
    add(store, { name: '条目一', description: '描述甲', content: '内容甲的说明' })
    const second = store.save({
      name: '条目二',
      description: '描述乙',
      content: '内容乙的说明',
      scope: 'global',
      type: 'decision',
    })
    expect(second.id).not.toBe(existing.id)
    expect(store.list('global')).toHaveLength(4)

    // 用户显式写入（tier=long）不做吸收：即使与既有条目相似也保留。
    const userSave = store.save({
      name: '提交信息必须使用中文（补充）',
      description: '仓库约定：git commit 的提交信息统一使用中文书写',
      content: '所有 git commit 的提交信息必须使用中文，不要混用英文或拼音，这是仓库级硬性约定。包含 CHANGELOG。',
      scope: 'global',
      type: 'decision',
      source: 'user',
    })
    expect(userSave.id).not.toBe(existing.id)
    expect(userSave.tier).toBe('long')
    expect(store.list('global')).toHaveLength(5)
  })

  it('统计数据面 v2：skipReasons 与最近样本有界、落盘并可容错重读', () => {
    const store = makeStore()
    store.recordCapture(2, false, { sessionId: 's-1' })
    store.recordCapture(0, true, { sessionId: 's-2', skippedReason: 'trivial' })
    store.recordCapture(0, true, { sessionId: 's-3', skippedReason: '', error: '模型失败' })
    store.recordSkip('empty')
    store.recordInjection({ sessionId: 's-1', entries: 3, chars: 120, truncated: true })
    for (let index = 0; index < 60; index += 1) {
      store.recordInjection({ sessionId: 's-1', entries: index, chars: index })
    }
    store.recordRecall('s-1', ['a', 'b'], ['b'], 3)

    const stats = store.stats()
    expect(stats.captureRuns).toBe(1)
    expect(stats.capturedEntries).toBe(2)
    expect(stats.captureSkips).toBe(2)
    expect(stats.skipReasons).toMatchObject({ trivial: 1, empty: 1 })
    expect(stats.recentCaptures).toHaveLength(3)
    expect(stats.recentCaptures[0]).toMatchObject({ sessionId: 's-3', written: 0, error: '模型失败' })
    expect(stats.recentCaptures[1]).toMatchObject({ sessionId: 's-2', skippedReason: 'trivial' })
    // 有界 50，最新在前。
    expect(stats.recentInjections).toHaveLength(50)
    expect(stats.recentInjections[0]?.entries).toBe(59)
    expect(stats.sessions[0]).toMatchObject({ sessionId: 's-1', injected: 2, injectedUsed: 1, overflow: 3 })

    const raw = JSON.parse(readFileSync(path.join(store.root, 'stats.json'), 'utf8')) as Record<string, unknown>
    expect(raw.schema).toBe(2)
    expect(raw.skipReasons).toMatchObject({ trivial: 1, empty: 1 })
    expect(Array.isArray(raw.recentInjections)).toBe(true)
    expect(Array.isArray(raw.recentCaptures)).toBe(true)

    // 旧 stats.json（schema 1）读取时补默认字段。
    const legacy = new MemoryStore({ home: path.dirname(store.root) })
    writeFileSync(path.join(store.root, 'stats.json'), JSON.stringify({ schema: 1, captureRuns: 7 }), 'utf8')
    expect(legacy.stats()).toMatchObject({
      captureRuns: 7,
      skipReasons: {},
      recentInjections: [],
      recentCaptures: [],
      recentRetrievals: [],
    })
  })

  it('recordRetrieval 写入最近检索：最新在前、ids 截前 10、有界 50 并落盘', () => {
    const store = makeStore()
    const manyIds = Array.from({ length: 12 }, (_, index) => `m-${index}`)
    store.recordRetrieval({ sessionId: 's-r1', query: '  pnpm  ', ids: manyIds })
    store.recordRetrieval({ sessionId: 's-r2', query: 'tsdown', ids: ['m-a', 'm-b'] })

    const rows = store.stats().recentRetrievals
    expect(rows).toHaveLength(2)
    expect(rows[0]).toMatchObject({ sessionId: 's-r2', query: 'tsdown', results: 2, ids: ['m-a', 'm-b'] })
    expect(rows[0]?.at).toMatch(/^\d{4}-\d{2}-\d{2}T/u)
    // results 是完整命中的条数；ids 只留前 10 个。
    expect(rows[1]).toMatchObject({ sessionId: 's-r1', query: 'pnpm', results: 12 })
    expect(rows[1]?.ids).toHaveLength(10)
    expect(rows[1]?.ids[0]).toBe('m-0')

    // 有界 50，最新在前。
    for (let index = 0; index < 60; index += 1) {
      store.recordRetrieval({ sessionId: 's-bulk', query: `q-${index}`, ids: ['m-x'] })
    }
    const bounded = store.stats().recentRetrievals
    expect(bounded).toHaveLength(50)
    expect(bounded[0]?.query).toBe('q-59')

    const persisted = JSON.parse(readFileSync(path.join(store.root, 'stats.json'), 'utf8')) as {
      recentRetrievals: Array<Record<string, unknown>>
    }
    expect(persisted.recentRetrievals).toHaveLength(50)
    expect(persisted.recentRetrievals[0]).toMatchObject({ sessionId: 's-bulk', query: 'q-59', results: 1, ids: ['m-x'] })
  })

  it('旧 stats.json 的检索样本容错：非法行丢弃、缺字段按默认补齐', () => {
    const store = makeStore()
    writeFileSync(path.join(store.root, 'stats.json'), JSON.stringify({
      schema: 2,
      captureRuns: 3,
      recentRetrievals: [
        { at: '2026-01-01T00:00:00.000Z', sessionId: 's-old', query: 'pnpm', results: 3, ids: ['m-1', 'm-2', 'm-3'] },
        'junk',
        null,
        { sessionId: 's-bad-ids', query: 5, ids: 'not-an-array' },
      ],
    }), 'utf8')

    const reloaded = new MemoryStore({ home: path.dirname(store.root) })
    const rows = reloaded.stats().recentRetrievals
    expect(rows).toHaveLength(2)
    expect(rows[0]).toMatchObject({ sessionId: 's-old', query: 'pnpm', results: 3, ids: ['m-1', 'm-2', 'm-3'] })
    expect(rows[1]).toMatchObject({ sessionId: 's-bad-ids', query: '', results: 0, ids: [] })
    expect(rows[1]?.at).toMatch(/^\d{4}-\d{2}-\d{2}T/u)
  })

  it('recordCapture 生成样本 id 与新增引用；undoCapture 归档新增条目、标记 undone 且幂等', () => {
    const store = makeStore()
    const createdA = add(store, { name: '新增事实 A', description: 'A', content: 'A 正文。' })
    const createdB = add(store, {
      name: '新增事实 B',
      description: 'B',
      type: 'project',
      scope: 'project',
      project: 'p_demo',
      content: 'B 正文。',
    })
    const outside = add(store, { name: '不在样本里', description: 'C', content: 'C 正文。' })

    store.recordCapture(2, false, {
      sessionId: 's-undo',
      created: [
        { id: createdA.id, scope: 'global', project: '' },
        { id: createdB.id, scope: 'project', project: 'p_demo' },
        { id: 'm-missing', scope: 'global', project: '' },
      ],
    })
    const sample = store.stats().recentCaptures[0]
    expect(sample?.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u)
    expect(sample?.created).toHaveLength(3)
    expect(sample?.undone).toBeUndefined()

    const result = store.undoCapture(sample?.id ?? '')
    expect(new Set(result.archived)).toEqual(new Set([createdA.id, createdB.id]))
    expect(store.get('global', '', createdA.id)?.status).toBe('archived')
    expect(store.get('project', 'p_demo', createdB.id)?.status).toBe('archived')
    expect(store.get('global', '', outside.id)?.status).toBe('active')
    expect(store.stats().recentCaptures[0]?.undone).toBe(true)

    const persisted = JSON.parse(readFileSync(path.join(store.root, 'stats.json'), 'utf8')) as {
      recentCaptures: Array<Record<string, unknown>>
    }
    expect(persisted.recentCaptures[0]).toMatchObject({ undone: true })
    expect(persisted.recentCaptures[0]?.created).toHaveLength(3)

    // 重复撤销：条目已归档，返回空数组且保持 undone。
    const again = store.undoCapture(sample?.id ?? '')
    expect(again.archived).toEqual([])
    expect(store.stats().recentCaptures[0]?.undone).toBe(true)
    expect(() => store.undoCapture('m-no-such-sample')).toThrow(/捕获样本不存在/u)
  })

  it('旧 stats.json 的捕获样本缺 id/created/undone 时容错，非法引用丢弃', () => {
    const store = makeStore()
    writeFileSync(path.join(store.root, 'stats.json'), JSON.stringify({
      schema: 2,
      recentCaptures: [
        { at: '2026-01-01T00:00:00.000Z', sessionId: 's-old', written: 1 },
        {
          id: 'old-2',
          at: '2026-01-02T00:00:00.000Z',
          sessionId: 's-old-2',
          written: 0,
          undone: true,
          created: [
            { id: 'm-x', scope: 'project', project: 'p_1' },
            { id: '', scope: 'global', project: '' },
            { id: 'm-y', scope: 'bogus', project: 'ignored' },
            'junk',
          ],
        },
      ],
    }), 'utf8')

    const reloaded = new MemoryStore({ home: path.dirname(store.root) })
    const rows = reloaded.stats().recentCaptures
    expect(rows).toHaveLength(2)
    expect(rows[0]).toMatchObject({ id: '', sessionId: 's-old', written: 1, created: [] })
    expect(rows[0]?.undone).toBeUndefined()
    expect(rows[1]?.id).toBe('old-2')
    expect(rows[1]?.created).toEqual([
      { id: 'm-x', scope: 'project', project: 'p_1' },
      { id: 'm-y', scope: 'global', project: '' },
    ])
    expect(rows[1]?.undone).toBe(true)
  })

  it('注入索引受条数与字符预算约束，并返回注入的 id', () => {
    const store = makeStore()
    for (let index = 0; index < 6; index += 1) {
      add(store, {
        name: `偏好 ${index}`,
        description: `第 ${index} 条描述的填充内容`,
        content: `正文 ${index}`,
        importance: index,
        source: 'user',
      })
    }
    store.updateSettings({ indexLimitGlobal: 3, maxChars: 1000 })
    const snapshot = renderRecallContext({ store, identity: null, settings: store.settings() })
    expect(snapshot.ids).toHaveLength(3)
    expect(snapshot.text).toContain('Memory (long-term)')
    expect(snapshot.text).toContain('偏好 5')
    expect(snapshot.text.length).toBeLessThan(1000)

    store.updateSettings({ indexLimitGlobal: 50, maxChars: 12000 })
    const full = renderRecallContext({ store, identity: null, settings: store.settings() })
    expect(full.ids).toHaveLength(6)
    expect(full.truncated).toBe(false)

    store.updateSettings({ indexLimitGlobal: 1, maxChars: 200 })
    const tiny = renderRecallContext({ store, identity: null, settings: store.settings() })
    // maxChars is clamped to the 1000-char floor, and the rendered block never exceeds it.
    expect(tiny.ids).toHaveLength(1)
    expect(tiny.text.length).toBeLessThanOrEqual(1000)
  })

  it('注入只放长期条目：短期条目检索可见，升级后进入索引', () => {
    const store = makeStore()
    add(store, { name: '长期偏好', description: '已证明', content: '长期正文', type: 'preference', source: 'user' })
    const shortEntry = add(store, { name: '短期偏好', description: '待证明', content: '短期正文', type: 'preference' })

    const snapshot = renderRecallContext({ store, identity: null, settings: store.settings() })
    expect(snapshot.ids).not.toContain(shortEntry.id)
    expect(snapshot.text).not.toContain('短期偏好')

    // 短期条目仍可被检索到。
    const found = store.search('global', '', { query: '短期偏好' })
    expect(found.map(item => item.id)).toContain(shortEntry.id)

    // 正文被读取后升级，下次渲染进入索引。
    store.promoteRead('global', '', shortEntry.id)
    expect(readFileSync(path.join(store.root, 'global', `${shortEntry.id}.md`), 'utf8')).toContain('tier: long')
    const after = renderRecallContext({ store, identity: null, settings: store.settings() })
    expect(after.ids).toContain(shortEntry.id)
  })

  it('设置、捕获计数与命中率持久化到磁盘', () => {
    const store = makeStore()
    store.updateSettings({ captureEnabled: false, indexLimitProject: 12 })
    const reloaded = new MemoryStore({ home: path.dirname(store.root) })
    expect(reloaded.settings().captureEnabled).toBe(false)
    expect(reloaded.settings().indexLimitProject).toBe(12)
    store.recordCapture(2, false)
    store.recordCapture(0, true)
    store.recordRecall('s-1', ['a', 'b'], ['b'], 3)
    const stats = store.stats()
    expect(stats.captureRuns).toBe(1)
    expect(stats.capturedEntries).toBe(2)
    expect(stats.captureSkips).toBe(1)
    expect(stats.sessions[0]).toMatchObject({ sessionId: 's-1', injected: 2, injectedUsed: 1, overflow: 3 })
  })

  it('维护模型设置默认空串、持久化并容错旧字段', () => {
    const store = makeStore()
    expect(store.settings()).toMatchObject({ maintenanceProvider: '', maintenanceModel: '' })
    store.updateSettings({ maintenanceProvider: '  provider-x  ', maintenanceModel: '  model-y  ' })
    expect(store.settings()).toMatchObject({ maintenanceProvider: 'provider-x', maintenanceModel: 'model-y' })

    const persisted = JSON.parse(readFileSync(path.join(store.root, 'settings.json'), 'utf8')) as Record<string, unknown>
    expect(persisted).toMatchObject({ maintenanceProvider: 'provider-x', maintenanceModel: 'model-y' })

    const reloaded = new MemoryStore({ home: path.dirname(store.root) })
    expect(reloaded.settings()).toMatchObject({ maintenanceProvider: 'provider-x', maintenanceModel: 'model-y' })

    // 旧文件缺字段或类型非法：按空串读取（=继承宿主默认模型）。
    writeFileSync(path.join(store.root, 'settings.json'), JSON.stringify({
      schema: 1,
      captureEnabled: true,
      maintenanceProvider: 5,
      maintenanceModel: null,
    }), 'utf8')
    const legacy = new MemoryStore({ home: path.dirname(store.root) })
    expect(legacy.settings()).toMatchObject({ maintenanceProvider: '', maintenanceModel: '' })
  })

  it('导出为单个 Markdown 文档，默认设置 20/20 与 3,000 字符预算', () => {
    const store = makeStore()
    add(store)
    const exported = store.exportMarkdown('global')
    expect(exported.filename).toMatch(/^memory-global-\d{4}-\d{2}-\d{2}\.md$/u)
    expect(exported.content).toContain('# 全局记忆')
    expect(exported.content).toContain('使用 pnpm')
    expect(exported.content).toContain('schema: 3')
    expect(defaultSettings()).toMatchObject({ indexLimitGlobal: 20, indexLimitProject: 20, maxChars: 3000 })
  })

  it('touchProject 落盘的项目登记带实时 entryCount（不再恒 0）', () => {
    const store = makeStore()
    add(store, { scope: 'project', type: 'project', project: 'p_test' })
    add(store, { scope: 'project', type: 'gotcha', project: 'p_test', name: '另一条', description: 'x', content: 'y' })
    store.touchProject({
      projectKey: 'p_test',
      identity: 'example.com/demo',
      source: 'git-remote',
      displayName: 'demo',
      root: 'E:/demo',
    })
    const raw = JSON.parse(readFileSync(path.join(store.root, 'projects.json'), 'utf8'))
    expect(raw.projects).toHaveLength(1)
    expect(raw.projects[0].entryCount).toBe(2)
  })
})