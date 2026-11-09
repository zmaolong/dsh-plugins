// @vitest-environment jsdom

/**
 * Memory tab behavior specs: user-visible behavior only (headings, labels,
 * buttons, list rows) against a mocked `/agent-plugin/api/memory/*` data
 * plane; never asserts hashed class names and never touches the network.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'

import { MemoryView } from '../src/client/MemoryView.tsx'
import { createHubController } from '../src/client/store.ts'
import { zh } from '../src/client/locales.ts'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

const t = (key: string, vars?: Record<string, unknown>): string => {
  let copy: string = zh[key as keyof typeof zh] ?? key
  if (vars !== undefined) {
    for (const name of Object.keys(vars)) copy = copy.split(`{${name}}`).join(String(vars[name]))
  }
  return copy
}

const STATE = {
  settings: {
    captureEnabled: true,
    captureSessionEnd: false,
    injectEnabled: true,
    indexLimitGlobal: 40,
    indexLimitProject: 20,
    maxChars: 8000,
  },
  projects: [
    { key: '/repo/new', displayName: '新项目', source: 'path', remote: '', lastSeen: '2026-11-08T10:00:00.000Z', entryCount: 2 },
    { key: '/repo/old', displayName: '旧项目', source: 'path', remote: '', lastSeen: '2026-10-01T10:00:00.000Z', entryCount: 1 },
  ],
  stats: {
    captureRuns: 7,
    capturedEntries: 12,
    sessions: [
      { sessionId: 's1', injected: 10, injectedUsed: 4, overflow: 1, updatedAt: '2026-11-08T10:00:00.000Z' },
      { sessionId: 's2', injected: 10, injectedUsed: 6, overflow: 2, updatedAt: '2026-11-08T11:00:00.000Z' },
    ],
  },
}

const ENTRIES = [
  {
    id: 'm1',
    name: '提交信息用中文',
    description: '仓库约定',
    type: 'preference',
    tags: ['git'],
    importance: 80,
    status: 'active',
    reinforcement: 2,
    createdAt: '2026-11-01T00:00:00.000Z',
    updatedAt: '2026-11-02T03:04:00.000Z',
  },
  {
    id: 'm2',
    name: '旧决策',
    description: '已归档的决策',
    type: 'decision',
    tags: [],
    importance: 30,
    status: 'archived',
    reinforcement: 0,
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-02T03:04:00.000Z',
  },
]

const DETAIL = {
  ...ENTRIES[0],
  content: '提交信息必须用中文。',
  originSessionId: 's1',
  supersedes: [],
  obsoleteVotes: 0,
}

const SAVED = {
  ...DETAIL,
  id: 'm3',
  name: '新记忆',
  description: '描述内容',
  content: '要记住的内容',
  updatedAt: '2026-11-09T00:00:00.000Z',
}

interface Call {
  url: string
  init: RequestInit | undefined
}

function okResponse(data: unknown): Response {
  return new Response(JSON.stringify({ ok: true, data }), { status: 200, headers: { 'content-type': 'application/json' } })
}

function failResponse(message: string, code = 'internal'): Response {
  return new Response(JSON.stringify({ ok: false, error: message, code }), { status: 500, headers: { 'content-type': 'application/json' } })
}

/** Install a fetch mock answering every memory endpoint; every call is recorded. */
function installFetch(options: { state?: () => Response, list?: (url: string) => Response, get?: (url: string) => Response } = {}): {
  calls: Call[]
  fetchMock: ReturnType<typeof vi.fn>
} {
  const calls: Call[] = []
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = String(input)
    calls.push({ url, init })
    if (url.includes('/memory/state')) return options.state ? options.state() : okResponse(STATE)
    if (url.includes('/memory/list')) return options.list ? options.list(url) : okResponse({ scope: 'project', project: '', total: ENTRIES.length, entries: ENTRIES })
    if (url.includes('/memory/get')) return options.get ? options.get(url) : okResponse({ entry: DETAIL })
    if (url.includes('/memory/save')) return okResponse({ entry: SAVED })
    if (url.includes('/memory/status')) return okResponse({ entry: { ...DETAIL, status: 'stale' } })
    if (url.includes('/memory/delete')) return okResponse({ deleted: true, id: 'm1' })
    if (url.includes('/memory/settings')) return okResponse({ settings: { ...STATE.settings, indexLimitGlobal: 120 } })
    if (url.includes('/memory/export')) return okResponse({ filename: 'memory.md', content: '# 记忆' })
    return okResponse({})
  })
  vi.stubGlobal('fetch', fetchMock)
  return { calls, fetchMock }
}

const bodyOf = (call: Call | undefined): Record<string, unknown> => {
  if (call === undefined) throw new Error('missing call')
  return JSON.parse(String(call.init?.body)) as Record<string, unknown>
}

describe('MemoryView', () => {
  it('先显示加载态，随后渲染全局/项目条目列表', async () => {
    const { calls } = installFetch()
    const controller = createHubController({ translate: t, getLocaleId: () => 'zh' })
    render(<MemoryView actions={controller.actions} t={t} />)
    expect(screen.getAllByText(t('memoryLoading')).length).toBeGreaterThan(0)
    const row = await screen.findByRole('button', { name: /提交信息用中文/u })
    expect(within(row).getByText('仓库约定')).toBeTruthy()
    expect(within(row).getByText(t('memoryTypePreference'))).toBeTruthy()
    // 生效中的条目不挂状态徽章；标签以 chip 形式展示。
    expect(within(row).queryByText(t('memoryStatusActive'))).toBeNull()
    expect(within(row).getByText('git')).toBeTruthy()
    const archivedRow = screen.getByRole('button', { name: /旧决策/u })
    expect(within(archivedRow).getByText(t('memoryStatusArchived'))).toBeTruthy()
    // 默认选中的项目作用域是 lastSeen 最新的项目。
    const listCall = calls.find(call => call.url.includes('/memory/list'))
    expect(listCall?.url).toContain('scope=project')
    expect(listCall?.url).toContain(encodeURIComponent('/repo/new'))
  })

  it('切换作用域时按新 scope 重新请求列表，项目下拉默认最新项目', async () => {
    const { calls } = installFetch()
    const controller = createHubController({ translate: t, getLocaleId: () => 'zh' })
    render(<MemoryView actions={controller.actions} t={t} />)
    await screen.findByRole('button', { name: /提交信息用中文/u })
    const projectSelect = screen.getByRole('combobox', { name: t('memoryProjectLabel') })
    expect((projectSelect as HTMLSelectElement).value).toBe('/repo/new')
    fireEvent.click(screen.getByRole('button', { name: t('memoryScopeGlobal') }))
    await waitFor(() => {
      expect(calls.some(call => call.url.includes('/memory/list') && call.url.includes('scope=global'))).toBe(true)
    })
    expect(screen.queryByRole('combobox', { name: t('memoryProjectLabel') })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: t('memoryScopeProject') }))
    const restored = await screen.findByRole('combobox', { name: t('memoryProjectLabel') })
    expect((restored as HTMLSelectElement).value).toBe('/repo/new')
  })

  it('类型筛选与回车搜索把条件带入 /memory/list', async () => {
    const { calls } = installFetch()
    const controller = createHubController({ translate: t, getLocaleId: () => 'zh' })
    render(<MemoryView actions={controller.actions} t={t} />)
    await screen.findByRole('button', { name: /提交信息用中文/u })
    const filterTrigger = screen.getByRole('button', { name: t('memoryTypeFilterLabel') })
    fireEvent.click(filterTrigger)
    fireEvent.click(await screen.findByRole('menuitemradio', { name: t('memoryTypeDecision') }))
    await waitFor(() => {
      expect(calls.some(call => call.url.includes('/memory/list') && call.url.includes('type=decision'))).toBe(true)
    })
    const search = screen.getByRole('searchbox', { name: t('memorySearchPlaceholder') })
    fireEvent.change(search, { target: { value: '提交' } })
    fireEvent.keyDown(search, { key: 'Enter' })
    await waitFor(() => {
      expect(calls.some(call => call.url.includes('/memory/list') && call.url.includes(`query=${encodeURIComponent('提交')}`))).toBe(true)
    })
  })

  it('新建记忆保存时调用 /memory/save 并携带表单内容', async () => {
    const { calls } = installFetch()
    const controller = createHubController({ translate: t, getLocaleId: () => 'zh' })
    const toast = vi.spyOn(controller.actions, 'toast')
    render(<MemoryView actions={controller.actions} t={t} />)
    await screen.findByRole('button', { name: /提交信息用中文/u })
    fireEvent.click(screen.getByRole('button', { name: t('memoryNew') }))
    expect(screen.getByRole('heading', { name: t('memoryCreateTitle') })).toBeTruthy()
    fireEvent.change(screen.getByLabelText(t('memoryFieldName')), { target: { value: '新记忆' } })
    fireEvent.change(screen.getByLabelText(t('memoryFieldDescription')), { target: { value: '描述内容' } })
    fireEvent.change(screen.getByLabelText(t('memoryFieldTags')), { target: { value: 'git, 约定' } })
    fireEvent.change(screen.getByLabelText(t('memoryFieldContent')), { target: { value: '要记住的内容' } })
    fireEvent.click(screen.getByRole('button', { name: t('memorySave') }))
    await waitFor(() => {
      expect(calls.some(call => call.url.includes('/memory/save'))).toBe(true)
    })
    const saveCall = calls.find(call => call.url.includes('/memory/save'))
    expect(saveCall?.init?.method).toBe('POST')
    expect(bodyOf(saveCall)).toMatchObject({
      scope: 'project',
      project: '/repo/new',
      name: '新记忆',
      description: '描述内容',
      content: '要记住的内容',
      tags: ['git', '约定'],
      type: 'preference',
    })
    expect(bodyOf(saveCall).id).toBeUndefined()
    await waitFor(() => {
      expect(toast).toHaveBeenCalledWith('success', t('memorySaved'))
    })
  })

  it('删除需要二次确认：第一次点击只展开确认，确认后才调用 /memory/delete', async () => {
    const { calls } = installFetch()
    const controller = createHubController({ translate: t, getLocaleId: () => 'zh' })
    render(<MemoryView actions={controller.actions} t={t} />)
    const row = await screen.findByRole('button', { name: /提交信息用中文/u })
    fireEvent.click(row)
    expect(await screen.findByText('提交信息必须用中文。')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: t('memoryDelete') }))
    expect(screen.getByText(t('memoryDeleteDescription', { name: '提交信息用中文' }))).toBeTruthy()
    expect(calls.some(call => call.url.includes('/memory/delete'))).toBe(false)
    fireEvent.click(screen.getByRole('button', { name: t('memoryDeleteConfirm') }))
    await waitFor(() => {
      expect(calls.some(call => call.url.includes('/memory/delete'))).toBe(true)
    })
    const deleteCall = calls.find(call => call.url.includes('/memory/delete'))
    expect(bodyOf(deleteCall)).toEqual({ scope: 'project', project: '/repo/new', id: 'm1' })
    await waitFor(() => {
      expect(screen.queryByRole('heading', { name: t('memoryEditTitle') })).toBeNull()
    })
  })

  it('设置对话框展示统计，开关即时保存、数字输入防抖保存', async () => {
    const { calls } = installFetch()
    const controller = createHubController({ translate: t, getLocaleId: () => 'zh' })
    render(<MemoryView actions={controller.actions} t={t} />)
    await screen.findByRole('button', { name: /提交信息用中文/u })
    // 统计与设置都在对话框内：齿轮打开后可见。
    fireEvent.click(screen.getByRole('button', { name: t('memorySettingsButton') }))
    expect(await screen.findByRole('dialog', { name: t('memorySettingsTitle') })).toBeTruthy()
    expect(screen.getByText('50%')).toBeTruthy()
    expect(screen.getByText('12')).toBeTruthy()
    // 开关即时保存：第一次请求只翻转 injectEnabled，其余保持服务端值。
    fireEvent.click(screen.getByRole('switch', { name: t('memorySettingsInject') }))
    await waitFor(() => {
      expect(calls.some(call => call.url.includes('/memory/settings'))).toBe(true)
    })
    const settingsCalls = calls.filter(call => call.url.includes('/memory/settings'))
    expect(settingsCalls[0]?.init?.method).toBe('POST')
    expect(bodyOf(settingsCalls[0])).toMatchObject({
      injectEnabled: false,
      indexLimitGlobal: 40,
      captureEnabled: true,
      captureSessionEnd: false,
      maxChars: 8000,
    })
    // 数字输入防抖 500ms 后自动保存，携带翻转后的完整设置。
    fireEvent.change(screen.getByLabelText(t('memorySettingsIndexGlobal')), { target: { value: '120' } })
    await waitFor(() => {
      expect(calls.filter(call => call.url.includes('/memory/settings')).length).toBe(2)
    }, { timeout: 2000 })
    const lastSettings = calls.filter(call => call.url.includes('/memory/settings')).at(-1)
    expect(bodyOf(lastSettings)).toMatchObject({
      injectEnabled: false,
      indexLimitGlobal: 120,
      captureEnabled: true,
      captureSessionEnd: false,
      maxChars: 8000,
    })
  })

  it('项目作用域下没有项目时显示引导文案，全局作用域仍可用', async () => {
    installFetch({ state: () => okResponse({ ...STATE, projects: [] }) })
    const controller = createHubController({ translate: t, getLocaleId: () => 'zh' })
    render(<MemoryView actions={controller.actions} t={t} />)
    // 没有项目时默认落在全局作用域并正常加载条目。
    expect(await screen.findByRole('button', { name: /提交信息用中文/u })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: t('memoryScopeProject') }))
    expect(await screen.findByText(t('memoryProjectEmpty'))).toBeTruthy()
    expect((screen.getByRole('button', { name: t('memoryNew') }) as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByRole('button', { name: t('memoryScopeGlobal') }) as HTMLButtonElement).disabled).toBe(false)
  })

  it('状态接口失败时显示重试按钮，重试后恢复列表', async () => {
    let stateCalls = 0
    installFetch({
      state: () => {
        stateCalls += 1
        return stateCalls === 1 ? failResponse('boom') : okResponse(STATE)
      },
    })
    const controller = createHubController({ translate: t, getLocaleId: () => 'zh' })
    render(<MemoryView actions={controller.actions} t={t} />)
    fireEvent.click(await screen.findByRole('button', { name: t('memoryRetry') }))
    expect(await screen.findByRole('button', { name: /提交信息用中文/u })).toBeTruthy()
  })

  it('导出 Markdown 调用 /memory/export', async () => {
    const { calls } = installFetch()
    const controller = createHubController({ translate: t, getLocaleId: () => 'zh' })
    render(<MemoryView actions={controller.actions} t={t} />)
    await screen.findByRole('button', { name: /提交信息用中文/u })
    fireEvent.click(screen.getByRole('button', { name: t('memoryExportMarkdown') }))
    await waitFor(() => {
      expect(calls.some(call => call.url.includes('/memory/export'))).toBe(true)
    })
    const exportCall = calls.find(call => call.url.includes('/memory/export'))
    expect(exportCall?.init?.method).toBe('POST')
    expect(bodyOf(exportCall)).toEqual({ scope: 'project', project: '/repo/new' })
  })
})