/**
 * 记忆 HTTP 路由：数据面契约、项目作用域解析与写入校验。
 */

import { afterEach, describe, expect, it } from 'vitest'

import { MemoryStore } from '../src/memory/store.ts'
import { dispatchMemoryGet, dispatchMemoryPost } from '../src/memory-routes.ts'
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
    expect(settings.settings.maxChars).toBe(5000)

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
})