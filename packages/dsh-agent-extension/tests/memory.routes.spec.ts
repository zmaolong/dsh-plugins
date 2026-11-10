/**
 * 记忆 HTTP 路由：数据面契约、项目作用域解析与写入校验。
 */

import { writeFileSync } from 'node:fs'
import path from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { MemoryStore } from '../src/memory/store.ts'
import { MEMORY_GET_ROUTES, MEMORY_POST_ROUTES, dispatchMemoryGet, dispatchMemoryPost } from '../src/memory-routes.ts'
import type { MaintenanceStatusWire } from '../src/memory/types.ts'
import { removeDirs, tempHome } from './helpers.ts'

describe('记忆 API：state/list/get/save/status/delete/settings/export', () => {
  let tempDirs: string[] = []

  afterEach(() => {
    removeDirs(...tempDirs)
    tempDirs = []
  })

  function makeStore(): MemoryStore {
    const home = tempHome('memory-routes-')
    tempDirs.push(home)
    const store = new MemoryStore({ home })
    store.start()
    return store
  }

  it('state 返回设置、项目与统计；list/get 读取记忆', async () => {
    const store = makeStore()
    const saved = await dispatchMemoryPost(store, '/memory/save', {
      scope: 'global',
      name: '提交格式',
      description: '提交信息用中文',
      type: 'preference',
      content: '提交信息一句话说清做了什么。',
    }) as { entry: { id: string } }
    const state = await dispatchMemoryGet(store, '/memory/state', new URLSearchParams()) as {
      settings: { captureEnabled: boolean }
      projects: unknown[]
      stats: { captureRuns: number }
    }
    expect(state.settings.captureEnabled).toBe(true)
    expect(state.projects).toEqual([])
    expect(state.stats.captureRuns).toBe(0)

    const list = await dispatchMemoryGet(store, '/memory/list', new URLSearchParams({ scope: 'global' })) as {
      total: number
      entries: Array<{ id: string }>
    }
    expect(list.total).toBe(1)
    expect(list.entries[0]?.id).toBe(saved.entry.id)

    // 默认 list 不携带正文；content=1 供体检拉全量。
    expect((list.entries[0] as { content?: string }).content).toBeUndefined()
    const full = await dispatchMemoryGet(store, '/memory/list', new URLSearchParams({ scope: 'global', content: '1' })) as {
      entries: Array<{ id: string, content?: string }>
    }
    expect(full.entries[0]?.content).toContain('一句话说清')

    const got = await dispatchMemoryGet(store, '/memory/get', new URLSearchParams({ scope: 'global', id: saved.entry.id })) as {
      entry: { content: string }
    }
    expect(got.entry.content).toContain('一句话说清')
  })

  it('state 返回最近检索样本 recentRetrievals', async () => {
    const store = makeStore()
    store.recordRetrieval({ sessionId: 's-route', query: 'pnpm workspace', ids: ['m-1', 'm-2'] })
    const state = await dispatchMemoryGet(store, '/memory/state', new URLSearchParams()) as unknown as {
      stats: { recentRetrievals: Array<Record<string, unknown>> }
    }
    expect(state.stats.recentRetrievals).toHaveLength(1)
    expect(state.stats.recentRetrievals[0]).toMatchObject({
      sessionId: 's-route',
      query: 'pnpm workspace',
      results: 2,
      ids: ['m-1', 'm-2'],
    })
    expect(state.stats.recentRetrievals[0]?.at).toMatch(/^\d{4}-\d{2}-\d{2}T/u)
  })

  it('save/status/delete 生命周期与参数校验', async () => {
    const store = makeStore()
    const saved = await dispatchMemoryPost(store, '/memory/save', {
      scope: 'global',
      name: '坑',
      description: '构建前要清缓存',
      type: 'gotcha',
      content: '先删 dist 再构建。',
    }) as { entry: { id: string, status: string } }
    expect(saved.entry.status).toBe('active')

    const stale = await dispatchMemoryPost(store, '/memory/status', {
      scope: 'global',
      id: saved.entry.id,
      status: 'stale',
    }) as { entry: { status: string } }
    expect(stale.entry.status).toBe('stale')

    const removed = await dispatchMemoryPost(store, '/memory/delete', { scope: 'global', id: saved.entry.id })
    expect(removed).toEqual({ deleted: true, id: saved.entry.id })

    await expect(dispatchMemoryPost(store, '/memory/save', { name: '', content: '' })).rejects.toMatchObject({ code: 'bad_request' })
    await expect(dispatchMemoryPost(store, '/memory/status', { scope: 'global', id: 'x', status: 'bogus' })).rejects.toMatchObject({ code: 'bad_request' })
    await expect(dispatchMemoryGet(store, '/memory/get', new URLSearchParams({ scope: 'global', id: 'missing' }))).rejects.toMatchObject({ code: 'not_found' })
  })

  it('undo-capture：缺 id / 未知样本返回 bad_request，成功撤销并幂等', async () => {
    const store = makeStore()
    expect(MEMORY_POST_ROUTES).toContain('/memory/undo-capture')

    const target = await dispatchMemoryPost(store, '/memory/save', {
      scope: 'global',
      name: '该次新增',
      description: '撤销时要归档',
      type: 'decision',
      content: '新增正文。',
    }) as { entry: { id: string } }
    const outside = await dispatchMemoryPost(store, '/memory/save', {
      scope: 'global',
      name: '不由该次新增',
      description: '保持 active',
      type: 'reference',
      content: '其它正文。',
    }) as { entry: { id: string } }

    store.recordCapture(1, false, {
      sessionId: 's-undo',
      created: [{ id: target.entry.id, scope: 'global', project: '' }],
    })
    const sampleId = store.stats().recentCaptures[0]?.id ?? ''
    expect(sampleId).not.toBe('')

    await expect(dispatchMemoryPost(store, '/memory/undo-capture', {})).rejects.toMatchObject({ code: 'bad_request' })
    await expect(dispatchMemoryPost(store, '/memory/undo-capture', { id: 'missing-sample' })).rejects.toMatchObject({ code: 'bad_request' })

    const result = await dispatchMemoryPost(store, '/memory/undo-capture', { id: sampleId })
    expect(result).toEqual({ archived: [target.entry.id], undone: true })
    expect(store.get('global', '', target.entry.id)?.status).toBe('archived')
    expect(store.get('global', '', outside.entry.id)?.status).toBe('active')
    expect(store.stats().recentCaptures[0]?.undone).toBe(true)

    // 重复撤销幂等：条目已归档，返回空数组。
    await expect(dispatchMemoryPost(store, '/memory/undo-capture', { id: sampleId }))
      .resolves.toEqual({ archived: [], undone: true })
  })

  it('项目作用域无项目时给出明确错误；settings/export 正常工作', async () => {
    const store = makeStore()
    await expect(dispatchMemoryGet(store, '/memory/list', new URLSearchParams({ scope: 'project' }))).rejects.toMatchObject({ code: 'not_found' })

    const settings = await dispatchMemoryPost(store, '/memory/settings', {
      captureEnabled: false,
      indexLimitGlobal: 20,
      maxChars: 5000,
      injectEnabled: true,
    }) as { settings: { captureEnabled: boolean, indexLimitGlobal: number, maxChars: number } }
    expect(settings.settings.captureEnabled).toBe(false)
    expect(settings.settings.indexLimitGlobal).toBe(20)
    expect(settings.settings.maxChars).toBe(3000)

    await dispatchMemoryPost(store, '/memory/save', { scope: 'global', name: 'a', description: 'b', type: 'reference', content: 'c' })
    const exported = await dispatchMemoryPost(store, '/memory/export', { scope: 'global' }) as { filename: string, content: string }
    expect(exported.filename).toContain('memory-global')
    expect(exported.content).toContain('# 全局记忆')
  })

  it('项目记忆可通过已知项目 key 读写', async () => {
    const store = makeStore()
    store.touchProject({
      projectKey: 'p_0123456789abcdef',
      identity: 'github.com/acme/repo',
      source: 'git-remote',
      displayName: 'repo',
      root: tempDirs[0] as string,
    })
    const saved = await dispatchMemoryPost(store, '/memory/save', {
      scope: 'project',
      project: 'p_0123456789abcdef',
      name: '项目事实',
      description: '这个子包用 tsdown',
      type: 'project',
      content: 'packages/dsh-agent-extension 用 tsdown 构建。',
    }) as { entry: { id: string, scope: string } }
    expect(saved.entry.scope).toBe('project')
    const list = await dispatchMemoryGet(store, '/memory/list', new URLSearchParams({
      scope: 'project',
      project: 'p_0123456789abcdef',
    })) as { total: number }
    expect(list.total).toBe(1)
  })

  it('refresh-index 在 MEMORY_POST_ROUTES 中，且只调用一次 refreshRecall', async () => {
    const store = makeStore()
    let calls = 0
    expect(MEMORY_POST_ROUTES).toContain('/memory/refresh-index')
    const result = await dispatchMemoryPost(store, '/memory/refresh-index', {}, {
      refreshRecall: () => {
        calls += 1
      },
    })
    expect(result).toEqual({ refreshed: true })
    expect(calls).toBe(1)
  })

  it('refresh-index 未提供 hooks 时不崩', async () => {
    const store = makeStore()
    await expect(dispatchMemoryPost(store, '/memory/refresh-index')).resolves.toEqual({ refreshed: true })
  })

  it('maintenance GET：缺省安全降级，hook 存在时原样返回', async () => {
    const store = makeStore()
    expect(MEMORY_GET_ROUTES).toContain('/memory/maintenance')
    const fallback = await dispatchMemoryGet(store, '/memory/maintenance', new URLSearchParams())
    expect(fallback).toMatchObject({
      due: false,
      reason: 'unavailable',
      writesSince: 0,
      daysSince: -1,
      lastRunAt: null,
      recentRuns: [],
    })

    const payload: MaintenanceStatusWire = {
      due: true,
      reason: 'never',
      writesSince: 4,
      daysSince: -1,
      lastRunAt: null,
      recentRuns: [],
    }
    await expect(dispatchMemoryGet(store, '/memory/maintenance', new URLSearchParams(), {
      maintenanceStatus: () => payload,
    })).resolves.toBe(payload)
  })

  it('maintenance/run：参数校验、项目透传与 hooks 缺省降级', async () => {
    const store = makeStore()
    expect(MEMORY_POST_ROUTES).toContain('/memory/maintenance/run')
    const calls: Array<{ scope?: string, project?: string }> = []
    const hook = {
      runMaintenance: (request: { scope?: 'global' | 'project', project?: string }) => {
        calls.push(request)
        return { run: { id: `mnt-${calls.length}` } }
      },
    }

    await expect(dispatchMemoryPost(store, '/memory/maintenance/run', {}, hook))
      .resolves.toEqual({ run: { id: 'mnt-1' } })
    await expect(dispatchMemoryPost(store, '/memory/maintenance/run', { scope: 'project', project: 'p_1' }, hook))
      .resolves.toEqual({ run: { id: 'mnt-2' } })
    expect(calls).toEqual([{}, { scope: 'project', project: 'p_1' }])

    await expect(dispatchMemoryPost(store, '/memory/maintenance/run', { scope: 'bogus' }, hook))
      .rejects.toMatchObject({ code: 'bad_request' })
    await expect(dispatchMemoryPost(store, '/memory/maintenance/run', { scope: 'global', project: 'p_1' }, hook))
      .rejects.toMatchObject({ code: 'bad_request' })
    await expect(dispatchMemoryPost(store, '/memory/maintenance/run', {}))
      .rejects.toMatchObject({ code: 'internal' })
  })

  it('maintenance/undo：runId 必填、响应归一化与 hooks 缺省降级', async () => {
    const store = makeStore()
    expect(MEMORY_POST_ROUTES).toContain('/memory/maintenance/undo')
    const ids: string[] = []
    await expect(dispatchMemoryPost(store, '/memory/maintenance/undo', { runId: 'mnt-1' }, {
      undoMaintenance: (runId: string) => {
        ids.push(runId)
        return { restored: 3 }
      },
    })).resolves.toEqual({ undone: true, restored: 3 })
    expect(ids).toEqual(['mnt-1'])

    await expect(dispatchMemoryPost(store, '/memory/maintenance/undo', {}))
      .rejects.toMatchObject({ code: 'bad_request' })
    await expect(dispatchMemoryPost(store, '/memory/maintenance/undo', { runId: 'mnt-1' }))
      .rejects.toMatchObject({ code: 'internal' })
  })

  it('settings 接受维护模型字符串（trim/长度上限），非法类型忽略', async () => {
    const store = makeStore()
    expect(store.settings()).toMatchObject({ maintenanceProvider: '', maintenanceModel: '' })
    const long = 'm'.repeat(200)
    const updated = await dispatchMemoryPost(store, '/memory/settings', {
      maintenanceProvider: '  provider-x  ',
      maintenanceModel: long,
    }) as { settings: { maintenanceProvider: string, maintenanceModel: string } }
    expect(updated.settings.maintenanceProvider).toBe('provider-x')
    expect(updated.settings.maintenanceModel).toHaveLength(120)

    const ignored = await dispatchMemoryPost(store, '/memory/settings', {
      maintenanceProvider: 42,
      maintenanceModel: '  keep-model  ',
    }) as { settings: { maintenanceProvider: string, maintenanceModel: string } }
    expect(ignored.settings.maintenanceProvider).toBe('provider-x')
    expect(ignored.settings.maintenanceModel).toBe('keep-model')
  })

  it('旧 stats.json 缺 searched/searchUsed 时按 0 返回', async () => {
    const home = tempHome('memory-routes-legacy-')
    tempDirs.push(home)
    const store = new MemoryStore({ home })
    store.start()
    writeFileSync(path.join(store.root, 'stats.json'), JSON.stringify({
      schema: 2,
      sessions: [{
        sessionId: 's-old',
        injected: 3,
        injectedUsed: 1,
        overflow: 2,
        updatedAt: '2026-01-01T00:00:00.000Z',
      }],
    }), 'utf8')

    const reloaded = new MemoryStore({ home })
    reloaded.start()
    const state = await dispatchMemoryGet(reloaded, '/memory/state', new URLSearchParams()) as unknown as {
      stats: { sessions: Array<Record<string, unknown>>, recentRetrievals: Array<Record<string, unknown>> }
    }
    expect(state.stats.sessions[0]).toMatchObject({ sessionId: 's-old', searched: 0, searchUsed: 0 })
    expect(state.stats.recentRetrievals).toEqual([])
  })
})
