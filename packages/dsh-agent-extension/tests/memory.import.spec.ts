/**
 * 外部记忆导入桥：解析形态、计划三判定（create/reinforce/conflict）、
 * apply 幂等与路由往返。
 */

import { afterEach, describe, expect, it } from 'vitest'

import { applyImport, parseImportSource, planImport } from '../src/memory/import.ts'
import { dispatchMemoryPost } from '../src/memory-routes.ts'
import { MemoryStore } from '../src/memory/store.ts'
import { removeDirs, tempHome } from './helpers.ts'

describe('导入解析：parseImportSource', () => {
  it('frontmatter 连排多文档：metadata.type 嵌套映射、description 缺省取正文', () => {
    const source = [
      '---',
      'name: 用 pnpm',
      'description: 包管理器约定',
      'metadata:',
      '  type: user',
      '---',
      '',
      '统一使用 pnpm 安装依赖。',
      '',
      '---',
      'name: 构建先 check',
      'metadata:',
      '  type: project',
      '---',
      '',
      '构建前先 npm run check。',
      '',
    ].join('\n')
    const parsed = parseImportSource(source)
    expect(parsed).toHaveLength(2)
    expect(parsed[0]).toMatchObject({ name: '用 pnpm', type: 'preference', description: '包管理器约定' })
    expect(parsed[0]?.content).toContain('统一使用 pnpm')
    expect(parsed[1]).toMatchObject({ name: '构建先 check', type: 'project' })
    expect(parsed[1]?.description).toContain('构建前先 npm run check')
  })

  it('朴素 Markdown 按二级标题分条', () => {
    const source = [
      '一些前言说明会被忽略。',
      '',
      '## 部署走 green 渠道',
      '',
      '部署统一走 green。',
      '',
      '## 沙箱写盘限制',
      '',
      'link 安装要在普通终端。',
    ].join('\n')
    const parsed = parseImportSource(source)
    expect(parsed).toHaveLength(2)
    expect(parsed[0]).toMatchObject({ name: '部署走 green 渠道', type: 'reference' })
    expect(parsed[0]?.content).toContain('部署统一走 green')
    expect(parsed[1]?.name).toBe('沙箱写盘限制')
  })

  it('无结构的普通文本作为单条候选；空输入返回空', () => {
    const single = parseImportSource('提交信息一律用中文，一句话说清做了什么。')
    expect(single).toHaveLength(1)
    expect(single[0]?.name).toContain('提交信息一律用中文')
    expect(parseImportSource('   \n  ')).toEqual([])
  })
})

describe('导入计划与执行：planImport / applyImport', () => {
  let tempDirs: string[] = []

  afterEach(() => {
    removeDirs(...tempDirs)
    tempDirs = []
  })

  function makeStore(): MemoryStore {
    const home = tempHome('memory-import-')
    tempDirs.push(home)
    const store = new MemoryStore({ home })
    store.start()
    return store
  }

  it('create / reinforce / conflict 三判定', () => {
    const store = makeStore()
    store.save({
      name: '用 pnpm', description: '包管理器约定', type: 'preference', scope: 'global',
      content: '统一使用 pnpm 安装依赖。', source: 'user', tier: 'long',
    })
    const source = [
      '---',
      'name: 用 pnpm',
      'description: 包管理器约定',
      '---',
      '统一使用 pnpm 安装依赖。',
      '---',
      'name: 用 npm',
      'description: 旧约定',
      '---',
      '统一使用 npm。',
      '---',
      'name: 用 pnpm',
      'description: 另一种说法',
      '---',
      '本仓库用 pnpm，不用 npm。',
    ].join('\n')
    const plan = planImport(store, source, 'global')
    // 第 1 条与既有条目指纹一致 → 强化；第 2 条名字未出现过 → 新建；
    // 第 3 条与既有「用 pnpm」同名不同内容 → 冲突。
    expect(plan.items.map(item => item.action)).toEqual(['reinforce', 'create', 'conflict'])
    expect(plan.items[0]?.existingId).toBeDefined()
    expect(plan.items[2]?.reason).toContain('同名')
  })

  it('批内同名不同内容判冲突；批内同指纹由 apply 转强化', () => {
    const store = makeStore()
    const plan = planImport(store, [
      '## 条目甲',
      '',
      '内容甲。',
      '## 条目甲',
      '',
      '内容甲的另一种说法。',
    ].join('\n'), 'global')
    expect(plan.items.map(item => item.action)).toEqual(['create', 'conflict'])
    expect(plan.items[1]?.reason).toContain('本次导入的前一条')
    const result = applyImport(store, '## 条目乙\n\n内容乙。\n## 条目乙\n\n内容乙。', 'global')
    expect(result.created).toBe(1)
    expect(result.reinforced).toBe(1)
    expect(store.countEntries('global')).toBe(1)
  })

  it('apply 幂等：同一来源导两次第二次全转强化；tier 落 long、source 落 import', () => {
    const store = makeStore()
    const source = [
      '## 部署约定',
      '',
      '部署走 green。',
      '## 测试约定',
      '',
      '提交前 vitest 全绿。',
    ].join('\n')
    const first = applyImport(store, source, 'global')
    expect(first.created).toBe(2)
    expect(first.failed).toBe(0)
    expect(store.get('global', '', first.ids[0] ?? '')?.tier).toBe('long')
    expect(store.get('global', '', first.ids[0] ?? '')?.source).toBe('import')
    const second = applyImport(store, source, 'global')
    expect(second.created).toBe(0)
    expect(second.reinforced).toBe(2)
    expect(store.countEntries('global')).toBe(2)
  })

  it('项目作用域：project key 传给 save，冲突条目照建', () => {
    const store = makeStore()
    store.save({
      name: '沙箱限制', description: '旧记录', type: 'gotcha', scope: 'project', project: 'demo-key',
      content: '旧的沙箱记录。', source: 'user', tier: 'long',
    })
    const result = applyImport(store, '## 沙箱限制\n\n新的沙箱记录内容。', 'project', 'demo-key')
    expect(result.conflicts).toBe(1)
    expect(store.countEntries('project', 'demo-key')).toBe(2)
    expect(store.list('project', 'demo-key').every(item => item.scope === 'project')).toBe(true)
  })
})

describe('导入路由：/memory/import/plan 与 apply', () => {
  let tempDirs: string[] = []

  afterEach(() => {
    removeDirs(...tempDirs)
    tempDirs = []
  })

  function makeStore(): MemoryStore {
    const home = tempHome('memory-import-routes-')
    tempDirs.push(home)
    const store = new MemoryStore({ home })
    store.start()
    return store
  }

  it('plan 返回计划不落盘；apply 写入并刷新索引', async () => {
    const store = makeStore()
    const refreshed: number[] = []
    const source = '## 导入条目甲\n\n内容甲。'
    const planned = await dispatchMemoryPost(store, '/memory/import/plan', { source, scope: 'global' }, {
      refreshRecall: () => { refreshed.push(1) },
    }) as { plan: { items: Array<{ name: string, action: string }> }, scope: string }
    expect(planned.scope).toBe('global')
    expect(planned.plan.items).toHaveLength(1)
    expect(planned.plan.items[0]).toMatchObject({ name: '导入条目甲', action: 'create' })
    expect(store.countEntries('global')).toBe(0)

    const applied = await dispatchMemoryPost(store, '/memory/import/apply', { source, scope: 'global' }, {
      refreshRecall: () => { refreshed.push(1) },
    }) as { result: { created: number } }
    expect(applied.result.created).toBe(1)
    expect(store.countEntries('global')).toBe(1)
    expect(refreshed).toHaveLength(1)
  })

  it('空来源与未知路由校验', async () => {
    const store = makeStore()
    await expect(dispatchMemoryPost(store, '/memory/import/plan', { source: '  ', scope: 'global' }))
      .rejects.toMatchObject({ code: 'bad_request' })
    await expect(dispatchMemoryPost(store, '/memory/import/nope', { source: 'x', scope: 'global' }))
      .rejects.toMatchObject({ code: 'not_found' })
  })
})
