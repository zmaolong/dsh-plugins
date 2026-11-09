/**
 * 记忆存储与召回：一事实一文件、索引重写、指纹去重、过时投票、检索、注入预算、导出。
 */

import { afterEach, describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'

import { MemoryStore } from '../src/memory/store.ts'
import { renderRecallContext } from '../src/memory/recall.ts'
import { defaultSettings } from '../src/memory/types.ts'
import { removeDirs, tempHome } from './helpers.ts'

describe('记忆存储：Markdown 事实、索引、去重与生命周期', () => {
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

  it('写入一条记忆：生成 Markdown 文件与 MEMORY.md 索引', () => {
    const store = makeStore()
    const entry = add(store)
    expect(entry.id).toMatch(/^m-/u)
    expect(entry.status).toBe('active')
    const file = path.join(store.root, 'global', `${entry.id}.md`)
    expect(existsSync(file)).toBe(true)
    const text = readFileSync(file, 'utf8')
    expect(text).toContain('name: "使用 pnpm"')
    expect(text).toContain('不要使用 npm 或 yarn')
    const index = readFileSync(path.join(store.root, 'global', 'MEMORY.md'), 'utf8')
    expect(index).toContain(entry.id)
    expect(index).toContain('使用 pnpm')
    expect(store.get('global', '', entry.id)?.content).toContain('pnpm')
    expect(store.list('global').map(item => item.id)).toEqual([entry.id])
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

  it('中英文关键词检索命中名称、描述与正文', () => {
    const store = makeStore()
    add(store, { name: '依赖管理', description: '统一 pnpm', content: 'pnpm 与 workspace。' })
    add(store, { name: '提交规范', description: '中文提交信息', content: '禁止 Co-Authored-By。' })
    const chinese = store.search('all', '', '提交')
    expect(chinese[0]?.name).toBe('提交规范')
    const english = store.search('all', '', 'workspace')
    expect(english[0]?.name).toBe('依赖管理')
    expect(store.search('all', '', '不存在的词')).toHaveLength(0)
  })

  it('注入索引受条数与字符预算约束，并返回注入的 id', () => {
    const store = makeStore()
    for (let index = 0; index < 6; index += 1) {
      add(store, {
        name: `偏好 ${index}`,
        description: `第 ${index} 条描述的填充内容`,
        content: `正文 ${index}`,
        importance: index,
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

  it('导出为单个 Markdown 文档，默认设置 50/50 与 12k 预算', () => {
    const store = makeStore()
    add(store)
    const exported = store.exportMarkdown('global')
    expect(exported.filename).toMatch(/^memory-global-\d{4}-\d{2}-\d{2}\.md$/u)
    expect(exported.content).toContain('# 全局记忆')
    expect(exported.content).toContain('使用 pnpm')
    expect(defaultSettings()).toMatchObject({ indexLimitGlobal: 50, indexLimitProject: 50, maxChars: 12000 })
  })
})