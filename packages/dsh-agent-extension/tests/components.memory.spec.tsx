// @vitest-environment jsdom

/**
 * Memory tab behavior specs: user-visible behavior only (headings, labels,
 * buttons, list rows) against a mocked `/agent-plugin/api/memory/*` data
 * plane; never asserts hashed class names and never touches the network.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'

import { MemoryView } from '../src/client/MemoryView.tsx'
import { setHostMarkdownTextForTest } from '../src/client/host-ui.ts'
import { createHubController } from '../src/client/store.ts'
import { zh } from '../src/client/locales.ts'

beforeEach(() => {
  setHostMarkdownTextForTest(null)
})

afterEach(() => {
  setHostMarkdownTextForTest(null)
  Reflect.deleteProperty(window.navigator, 'clipboard')
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

/** 伪宿主 MarkdownText：渲染正文文本，供「拿到宿主组件」路径断言。 */
function FakeMarkdownText({ text }: { text: string }) {
  return <div data-testid="fake-markdown">{text}</div>
}

/** 「最近捕获」样本：一条写入成功可撤销，一条被闸门跳过且无写入。 */
const RECENT_CAPTURES = [
  {
    id: 'cap-2',
    at: '2026-11-09T08:30:00.000Z',
    sessionId: 's2',
    written: 2,
    created: [{ id: 'm3', scope: 'project', project: '/repo/new' }],
    undone: false,
  },
  {
    id: 'cap-1',
    at: '2026-11-08T07:00:00.000Z',
    sessionId: 's1',
    written: 0,
    created: [],
    skippedReason: '冷却中',
  },
]

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
      { sessionId: 's1', injected: 10, injectedUsed: 4, searched: 8, searchUsed: 2, overflow: 1, updatedAt: '2026-11-08T10:00:00.000Z' },
      { sessionId: 's2', injected: 10, injectedUsed: 6, searched: 12, searchUsed: 3, overflow: 2, updatedAt: '2026-11-08T11:00:00.000Z' },
    ],
    recentCaptures: RECENT_CAPTURES,
    recentInjections: [
      { sessionId: 's1', at: '2026-11-09T09:00:00.000Z', entries: 12, chars: 1234, truncated: true },
      { sessionId: 's2', at: '2026-11-08T09:00:00.000Z', entries: 4, chars: 300, truncated: false },
    ],
    recentRetrievals: [
      { at: '2026-11-09T10:00:00.000Z', sessionId: 's2', query: '提交', results: 3, ids: ['m1', 'm2', 'm4'] },
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
    tier: 'short',
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
    updatedAt: '2026-11-09T00:00:00.000Z',
  },
]

const DETAIL = {
  ...ENTRIES[0],
  content: '提交信息必须用中文。',
  originSessionId: 's1',
  supersedes: [],
  obsoleteVotes: 0,
}

/** Audit-dialog fixture: one stale, one low-value, and one near-duplicate pair. */
const AUDIT_ENTRIES = [
  { ...ENTRIES[0], obsoleteVotes: 1, usedCount: 0 },
  { ...ENTRIES[1], status: 'active', reinforcement: 0, updatedAt: '2026-09-01T00:00:00.000Z', usedCount: 1 },
  { id: 'd1', name: '提交信息用中文（一）', description: '仓库约定', type: 'preference', tags: [], importance: 40, status: 'active', tier: 'long', reinforcement: 0, usedCount: 1, createdAt: '2026-11-01T00:00:00.000Z', updatedAt: '2026-11-02T00:00:00.000Z', content: '提交信息必须使用中文。' },
  { id: 'd2', name: '提交信息用中文（二）', description: '仓库约定', type: 'preference', tags: [], importance: 80, status: 'active', tier: 'long', reinforcement: 3, usedCount: 1, createdAt: '2026-11-01T00:00:00.000Z', updatedAt: '2026-11-03T00:00:00.000Z', content: '提交信息必须使用中文。' },
]

const SAVED = {
  ...DETAIL,
  id: 'm3',
  name: '新记忆',
  description: '描述内容',
  content: '要记住的内容',
  updatedAt: '2026-11-09T00:00:00.000Z',
}

/** 一次已完成的维护运行（合并 2 / 停用 3 / 恢复 1 / 删除 4）。 */
const RUN_COMPLETED = {
  id: 'run-1',
  at: '2026-11-10T10:00:00.000Z',
  scope: 'global',
  project: '',
  model: null,
  status: 'completed',
  counts: { candidates: 12, merges: 2, staled: 3, restored: 1, deleted: 4 },
  actions: [],
  error: '',
  undone: false,
}

/** 达阈值概览：新增 32 条 / 距上次维护 3 天。 */
const MAINTENANCE_DUE = {
  due: true,
  reason: '新增 32 条，距上次维护 3 天',
  writesSince: 32,
  daysSince: 3,
  lastRunAt: '2026-11-01T09:00:00.000Z',
  recentRuns: [RUN_COMPLETED],
}

/** 未达阈值概览：不弹自动提示。 */
const MAINTENANCE_CLEAR = {
  due: false,
  reason: '',
  writesSince: 5,
  daysSince: 1,
  lastRunAt: '2026-11-09T09:00:00.000Z',
  recentRuns: [],
}

interface Call {
  url: string
  init: RequestInit | undefined
}

function okResponse(data: unknown): Response {
  return new Response(JSON.stringify({ ok: true, data }), { status: 200, headers: { 'content-type': 'application/json' } })
}

function failResponse(message: string, code = 'internal', status = 500): Response {
  return new Response(JSON.stringify({ ok: false, error: message, code }), { status, headers: { 'content-type': 'application/json' } })
}

/** Install a fetch mock answering every memory endpoint; every call is recorded. */
function installFetch(options: {
  state?: () => Response
  list?: (url: string) => Response
  get?: (url: string) => Response
  undo?: () => Response
  maintenance?: () => Response
  run?: () => Response | Promise<Response>
  undoRun?: () => Response
} = {}): {
  calls: Call[]
  fetchMock: ReturnType<typeof vi.fn>
} {
  const calls: Call[] = []
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = String(input)
    calls.push({ url, init })
    if (url.includes('/memory/state')) return options.state ? options.state() : okResponse(STATE)
    if (url.includes('/memory/list')) {
      if (options.list) return options.list(url)
      // 模拟服务端过滤：只有请求带 includeArchived=1 才返回归档条目。
      const list = url.includes('includeArchived=1') ? ENTRIES : ENTRIES.filter(entry => entry.status !== 'archived')
      return okResponse({ scope: 'project', project: '', total: list.length, entries: list })
    }
    if (url.includes('/memory/get')) return options.get ? options.get(url) : okResponse({ entry: DETAIL })
    if (url.includes('/memory/save')) return okResponse({ entry: SAVED })
    if (url.includes('/memory/status')) return okResponse({ entry: { ...DETAIL, status: 'stale' } })
    if (url.includes('/memory/tier')) return okResponse({ entry: { ...DETAIL, tier: 'long' } })
    if (url.includes('/memory/delete')) return okResponse({ deleted: true, id: 'm1' })
    if (url.includes('/memory/settings')) return okResponse({ settings: { ...STATE.settings, indexLimitGlobal: 120 } })
    if (url.includes('/memory/undo-capture')) return options.undo ? options.undo() : okResponse({ archived: ['m3'], undone: true })
    if (url.includes('/memory/maintenance/run')) return options.run ? options.run() : okResponse({ run: RUN_COMPLETED })
    if (url.includes('/memory/maintenance/undo')) return options.undoRun ? options.undoRun() : okResponse({ undone: true, restored: 1 })
    if (url.includes('/memory/maintenance')) return options.maintenance ? options.maintenance() : okResponse(MAINTENANCE_CLEAR)
    if (url.includes('/memory/export')) return okResponse({ filename: 'memory.md', content: '# 记忆' })
    if (url.includes('/memory/refresh-index')) return okResponse({ refreshed: true })
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
    // 归档条目默认隐藏，列表请求也不带 includeArchived。
    expect(screen.queryByRole('button', { name: /旧决策/u })).toBeNull()
    // 默认选中的项目作用域是 lastSeen 最新的项目。
    const listCall = calls.find(call => call.url.includes('/memory/list'))
    expect(listCall?.url).toContain('scope=project')
    expect(listCall?.url).toContain(encodeURIComponent('/repo/new'))
    expect(listCall?.url).not.toContain('includeArchived')
  })

  it('切换作用域时按新 scope 重新请求列表，项目下拉默认最新项目', async () => {
    const { calls } = installFetch()
    const controller = createHubController({ translate: t, getLocaleId: () => 'zh' })
    render(<MemoryView actions={controller.actions} t={t} />)
    await screen.findByRole('button', { name: /提交信息用中文/u })
    const projectSelect = screen.getByRole('button', { name: t('memoryProjectLabel'), expanded: false })
    expect(projectSelect.textContent).toContain('新项目')
    // 下拉菜单列出全部项目，当前项目带 aria-checked 标记；选中即切换项目。
    fireEvent.click(projectSelect)
    expect((await screen.findByRole('menuitemradio', { name: '新项目' })).getAttribute('aria-checked')).toBe('true')
    fireEvent.click(screen.getByRole('menuitemradio', { name: '旧项目' }))
    await waitFor(() => {
      expect(calls.some(call => call.url.includes('/memory/list') && call.url.includes(encodeURIComponent('/repo/old')))).toBe(true)
    })
    expect(screen.getByRole('button', { name: t('memoryProjectLabel'), expanded: false }).textContent).toContain('旧项目')
    fireEvent.click(screen.getByRole('button', { name: t('memoryScopeGlobal') }))
    await waitFor(() => {
      expect(calls.some(call => call.url.includes('/memory/list') && call.url.includes('scope=global'))).toBe(true)
    })
    expect(screen.queryByRole('button', { name: t('memoryProjectLabel'), expanded: false })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: t('memoryScopeProject') }))
    const restored = await screen.findByRole('button', { name: t('memoryProjectLabel'), expanded: false })
    expect(restored.textContent).toContain('旧项目')
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
    // 类型是单选项下拉：展开菜单选择「决策」，不再是原生 select。
    fireEvent.click(screen.getByRole('button', { name: t('memoryFieldType') }))
    fireEvent.click(await screen.findByRole('menuitemradio', { name: t('memoryTypeDecision') }))
    fireEvent.change(screen.getByLabelText(t('memoryFieldName')), { target: { value: '新记忆' } })
    fireEvent.change(screen.getByLabelText(t('memoryFieldDescription')), { target: { value: '描述内容' } })
    // 标签为 chip 输入：尾逗号与回车各提交一枚；重要性为滑块。
    const tagInput = screen.getByLabelText(t('memoryFieldTags'))
    fireEvent.change(tagInput, { target: { value: 'git,' } })
    fireEvent.change(tagInput, { target: { value: '约定' } })
    fireEvent.keyDown(tagInput, { key: 'Enter' })
    fireEvent.change(screen.getByLabelText(t('memoryFieldImportance')), { target: { value: '90' } })
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
      importance: 90,
      type: 'decision',
    })
    expect(bodyOf(saveCall).id).toBeUndefined()
    await waitFor(() => {
      expect(toast).toHaveBeenCalledWith('success', t('memorySaved'))
    })
  })

  it('详情弹窗不展示正文源码，提供用系统应用打开入口', async () => {
    installFetch()
    const controller = createHubController({ translate: t, getLocaleId: () => 'zh' })
    const openNative = vi.spyOn(controller.actions, 'openMemoryInApp')
    render(<MemoryView actions={controller.actions} t={t} />)
    const row = await screen.findByRole('button', { name: /提交信息用中文/u })
    fireEvent.click(row)
    const openButton = await screen.findByText(t('memoryOpenNative'))
    expect(screen.getByRole('heading', { name: t('memoryEditTitle') })).toBeTruthy()
    expect(screen.getByText(t('memoryBodyReadOnlyHint'))).toBeTruthy()
    expect(screen.queryByLabelText(t('memoryFieldContent'))).toBeNull()
    fireEvent.click(openButton)
    expect(openNative).toHaveBeenCalledWith({ scope: 'project', project: '/repo/new', id: 'm1' })
  })

  it('短期条目显示层级徽章，详情弹窗切换层级调用 /memory/tier', async () => {
    const { calls } = installFetch()
    const controller = createHubController({ translate: t, getLocaleId: () => 'zh' })
    const toast = vi.spyOn(controller.actions, 'toast')
    render(<MemoryView actions={controller.actions} t={t} />)
    // 列表卡片上的短期徽章（长期条目不显示徽章）。
    await screen.findByText(t('memoryTierShort'))
    fireEvent.click(screen.getByRole('button', { name: /提交信息用中文/u }))
    await screen.findByText(t('memoryOpenNative'))
    // 详情弹窗显示层级徽章与升为长期按钮。
    const promote = screen.getByRole('button', { name: t('memoryTierPromote') })
    fireEvent.click(promote)
    await waitFor(() => {
      expect(calls.some(call => call.url.includes('/memory/tier'))).toBe(true)
    })
    const tierCall = calls.find(call => call.url.includes('/memory/tier'))
    expect(bodyOf(tierCall)).toMatchObject({ scope: 'project', id: 'm1', tier: 'long' })
    await waitFor(() => {
      expect(toast).toHaveBeenCalledWith('success', t('memoryTierDone'))
    })
    // 升级成功后按钮翻转为「降为短期」。
    expect(await screen.findByRole('button', { name: t('memoryTierDemote') })).toBeTruthy()
  })

  it('注入宿主 MarkdownText 时详情弹窗渲染正文预览并保留系统打开入口', async () => {
    setHostMarkdownTextForTest(FakeMarkdownText)
    installFetch()
    const controller = createHubController({ translate: t, getLocaleId: () => 'zh' })
    render(<MemoryView actions={controller.actions} t={t} />)
    const row = await screen.findByRole('button', { name: /提交信息用中文/u })
    fireEvent.click(row)
    const preview = await screen.findByTestId('fake-markdown')
    expect(preview.textContent).toContain('提交信息必须用中文。')
    expect(screen.getByText(t('memoryOpenNative'))).toBeTruthy()
    expect(screen.queryByText(t('memoryBodyReadOnlyHint'))).toBeNull()
  })

  it('宿主不提供 MarkdownText 时退回只读提示并保留系统打开入口', async () => {
    setHostMarkdownTextForTest(null)
    installFetch()
    const controller = createHubController({ translate: t, getLocaleId: () => 'zh' })
    render(<MemoryView actions={controller.actions} t={t} />)
    const row = await screen.findByRole('button', { name: /提交信息用中文/u })
    fireEvent.click(row)
    expect(await screen.findByText(t('memoryBodyReadOnlyHint'))).toBeTruthy()
    expect(screen.queryByTestId('fake-markdown')).toBeNull()
    expect(screen.getByText(t('memoryOpenNative'))).toBeTruthy()
  })

  it('详情弹窗标题区展示记忆 id，复制成功提示 memoryIdCopied', async () => {
    const writeText = vi.fn(async () => {})
    Object.defineProperty(window.navigator, 'clipboard', { configurable: true, value: { writeText } })
    installFetch()
    const controller = createHubController({ translate: t, getLocaleId: () => 'zh' })
    const toast = vi.spyOn(controller.actions, 'toast')
    render(<MemoryView actions={controller.actions} t={t} />)
    const row = await screen.findByRole('button', { name: /提交信息用中文/u })
    fireEvent.click(row)
    const dialog = await screen.findByRole('dialog', { name: t('memoryEditTitle') })
    expect(within(dialog).getByText('m1')).toBeTruthy()
    fireEvent.click(within(dialog).getByRole('button', { name: t('memoryCopyId') }))
    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith('m1')
    })
    await waitFor(() => {
      expect(toast).toHaveBeenCalledWith('success', t('memoryIdCopied'))
    })
    Reflect.deleteProperty(window.navigator, 'clipboard')
  })

  it('删除需要二次确认：第一次点击只展开确认，确认后才调用 /memory/delete', async () => {
    const { calls } = installFetch()
    const controller = createHubController({ translate: t, getLocaleId: () => 'zh' })
    render(<MemoryView actions={controller.actions} t={t} />)
    const row = await screen.findByRole('button', { name: /提交信息用中文/u })
    fireEvent.click(row)
    expect(await screen.findByText(t('memoryOpenNative'))).toBeTruthy()
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
    // 统计口径：Σ injectedUsed/Σ injected = 10/20 → 50%；Σ searchUsed/Σ searched = 5/20 → 25%。
    expect(screen.getByText(t('memoryInjectionRate'))).toBeTruthy()
    expect(screen.getByText(t('memoryRetrievalRate'))).toBeTruthy()
    expect(screen.getByText('50%')).toBeTruthy()
    expect(screen.getByText('25%')).toBeTruthy()
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
      // 服务端旧值 40 / 8000 超出 ADR-0005 上限，客户端归一化后按 20 / 3000 保存。
      indexLimitGlobal: 20,
      captureEnabled: true,
      captureSessionEnd: false,
      maxChars: 3000,
    })
    // 数字输入防抖 500ms 后自动保存；输入 120 会被压到每层上限 20。
    fireEvent.change(screen.getByLabelText(t('memorySettingsIndexGlobal')), { target: { value: '120' } })
    await waitFor(() => {
      expect(calls.filter(call => call.url.includes('/memory/settings')).length).toBe(2)
    }, { timeout: 2000 })
    const lastSettings = calls.filter(call => call.url.includes('/memory/settings')).at(-1)
    expect(bodyOf(lastSettings)).toMatchObject({
      injectEnabled: false,
      indexLimitGlobal: 20,
      captureEnabled: true,
      captureSessionEnd: false,
      maxChars: 3000,
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

  it('工具条只保留一个刷新按钮，刷新索引收进设置对话框', async () => {
    installFetch()
    const controller = createHubController({ translate: t, getLocaleId: () => 'zh' })
    render(<MemoryView actions={controller.actions} t={t} />)
    await screen.findByRole('button', { name: /提交信息用中文/u })
    expect(screen.getAllByRole('button', { name: t('refresh') })).toHaveLength(1)
    expect(screen.queryByRole('button', { name: t('memoryRefreshIndex') })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: t('memorySettingsButton') }))
    expect(await screen.findByRole('button', { name: t('memoryRefreshIndex') })).toBeTruthy()
  })

  it('设置对话框内刷新索引调用 /memory/refresh-index 并提示成功，不重载列表', async () => {
    const { calls } = installFetch()
    const controller = createHubController({ translate: t, getLocaleId: () => 'zh' })
    const toast = vi.spyOn(controller.actions, 'toast')
    render(<MemoryView actions={controller.actions} t={t} />)
    await screen.findByRole('button', { name: /提交信息用中文/u })
    const listCallCount = (): number => calls.filter(call => call.url.includes('/memory/list')).length
    const listCallsBefore = listCallCount()
    fireEvent.click(screen.getByRole('button', { name: t('memorySettingsButton') }))
    fireEvent.click(await screen.findByRole('button', { name: t('memoryRefreshIndex') }))
    await waitFor(() => {
      expect(calls.some(call => call.url.includes('/memory/refresh-index'))).toBe(true)
    })
    const refreshCall = calls.find(call => call.url.includes('/memory/refresh-index'))
    expect(refreshCall?.url).toBe('/agent-plugin/api/memory/refresh-index')
    expect(refreshCall?.init?.method).toBe('POST')
    // 无请求体：全局索引重建不依赖作用域参数。
    expect(refreshCall?.init?.body).toBeUndefined()
    await waitFor(() => {
      expect(toast).toHaveBeenCalledWith('success', t('memoryRefreshIndexDone'))
    })
    // 只刷新提示词索引，不触发列表重载。
    expect(listCallCount()).toBe(listCallsBefore)
  })

  it('弹窗浮层锚定到宿主主面板区域，而不是整个窗口', async () => {
    installFetch()
    const controller = createHubController({ translate: t, getLocaleId: () => 'zh' })
    const { container } = render(
      <div style={{ overflowY: 'auto' }}>
        <MemoryView actions={controller.actions} t={t} />
      </div>,
    )
    await screen.findByRole('button', { name: /提交信息用中文/u })
    // 宿主主面板：一个可滚动的定位容器（真实宿主里是面板滚动层）。
    const panel = container.firstElementChild as HTMLDivElement
    Object.defineProperty(panel, 'clientWidth', { configurable: true, value: 1000 })
    Object.defineProperty(panel, 'clientHeight', { configurable: true, value: 700 })
    vi.spyOn(panel, 'getBoundingClientRect').mockReturnValue({
      left: 280,
      top: 12,
      width: 1000,
      height: 700,
      right: 1280,
      bottom: 712,
      x: 280,
      y: 12,
      toJSON: () => ({}),
    } as DOMRect)
    fireEvent.click(screen.getByRole('button', { name: t('memorySettingsButton') }))
    const dialog = await screen.findByRole('dialog', { name: t('memorySettingsTitle') })
    const layer = dialog.parentElement?.parentElement as HTMLDivElement
    expect(layer.style.left).toBe('280px')
    expect(layer.style.top).toBe('12px')
    expect(layer.style.width).toBe('1000px')
    expect(layer.style.height).toBe('700px')
  })

  it('类型筛选激活时在搜索框内显示可清除的筛选 chip', async () => {
    installFetch()
    const controller = createHubController({ translate: t, getLocaleId: () => 'zh' })
    render(<MemoryView actions={controller.actions} t={t} />)
    await screen.findByRole('button', { name: /提交信息用中文/u })
    expect(screen.queryByRole('button', { name: t('memoryClearTypeFilter') })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: t('memoryTypeFilterLabel') }))
    fireEvent.click(await screen.findByRole('menuitemradio', { name: t('memoryTypeDecision') }))
    expect(await screen.findByRole('button', { name: t('memoryClearTypeFilter') })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: t('memoryClearTypeFilter') }))
    expect(screen.queryByRole('button', { name: t('memoryClearTypeFilter') })).toBeNull()
  })

  it('多个筛选同时生效时只显示一个 chip，其余用省略号提示', async () => {
    installFetch()
    const controller = createHubController({ translate: t, getLocaleId: () => 'zh' })
    render(<MemoryView actions={controller.actions} t={t} />)
    await screen.findByRole('button', { name: /提交信息用中文/u })
    // 先选类型筛选，再点卡片标签叠加标签筛选。
    fireEvent.click(screen.getByRole('button', { name: t('memoryTypeFilterLabel') }))
    fireEvent.click(await screen.findByRole('menuitemradio', { name: t('memoryTypePreference') }))
    fireEvent.click(await screen.findByRole('button', { name: 'git' }))
    expect(screen.getByRole('button', { name: t('memoryClearTypeFilter') })).toBeTruthy()
    expect(screen.queryByRole('button', { name: t('memoryClearTagFilter') })).toBeNull()
    expect(screen.getByText('…')).toBeTruthy()
    // 清掉类型筛选后，标签筛连接棒成为可见 chip。
    fireEvent.click(screen.getByRole('button', { name: t('memoryClearTypeFilter') }))
    expect(await screen.findByRole('button', { name: t('memoryClearTagFilter') })).toBeTruthy()
    expect(screen.queryByText('…')).toBeNull()
  })

  it('空库空态提供新建按钮，点击直接打开新建弹窗', async () => {
    installFetch({ list: () => okResponse({ scope: 'project', project: '', total: 0, entries: [] }) })
    const controller = createHubController({ translate: t, getLocaleId: () => 'zh' })
    render(<MemoryView actions={controller.actions} t={t} />)
    expect(await screen.findByText(t('memoryListEmpty'))).toBeTruthy()
    const emptyAction = screen.getAllByRole('button', { name: t('memoryNew') }).at(-1)
    expect(emptyAction).toBeTruthy()
    fireEvent.click(emptyAction as HTMLElement)
    expect(screen.getByRole('heading', { name: t('memoryCreateTitle') })).toBeTruthy()
  })

  it('点击卡片上的标签按该标签筛选，清除 chip 后恢复全量', async () => {
    installFetch()
    const controller = createHubController({ translate: t, getLocaleId: () => 'zh' })
    render(<MemoryView actions={controller.actions} t={t} />)
    await screen.findByRole('button', { name: /提交信息用中文/u })
    // 归档条目默认不显示（不计入未筛选的全量）。
    expect(screen.queryByRole('button', { name: /旧决策/u })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'git' }))
    expect(screen.getByRole('button', { name: t('memoryClearTagFilter') })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /旧决策/u })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: t('memoryClearTagFilter') }))
    expect(await screen.findByRole('button', { name: /提交信息用中文/u })).toBeTruthy()
  })

  it('归档条目默认隐藏，开启「显示已归档」后按 includeArchived=1 重载并可见', async () => {
    const { calls } = installFetch()
    const controller = createHubController({ translate: t, getLocaleId: () => 'zh' })
    render(<MemoryView actions={controller.actions} t={t} />)
    await screen.findByRole('button', { name: /提交信息用中文/u })
    expect(screen.queryByRole('button', { name: /旧决策/u })).toBeNull()
    const firstList = calls.find(call => call.url.includes('/memory/list'))
    expect(firstList?.url).not.toContain('includeArchived')
    const toggle = screen.getByRole('button', { name: t('memoryShowArchived') })
    expect(toggle.getAttribute('aria-pressed')).toBe('false')
    fireEvent.click(toggle)
    expect(await screen.findByRole('button', { name: /旧决策/u })).toBeTruthy()
    expect(toggle.getAttribute('aria-pressed')).toBe('true')
    const latestList = calls.filter(call => call.url.includes('/memory/list')).at(-1)
    expect(latestList?.url).toContain('includeArchived=1')
  })

  it('标签 chip 的 Enter/Space 不冒泡打开详情', async () => {
    installFetch()
    const controller = createHubController({ translate: t, getLocaleId: () => 'zh' })
    render(<MemoryView actions={controller.actions} t={t} />)
    await screen.findByRole('button', { name: /提交信息用中文/u })
    const tagButton = screen.getByRole('button', { name: 'git' })
    fireEvent.keyDown(tagButton, { key: 'Enter' })
    expect(screen.queryByRole('heading', { name: t('memoryEditTitle') })).toBeNull()
    fireEvent.keyDown(tagButton, { key: ' ' })
    expect(screen.queryByRole('heading', { name: t('memoryEditTitle') })).toBeNull()
  })

  it('排序切换为最近更新时客户端重排卡片顺序', async () => {
    installFetch()
    const controller = createHubController({ translate: t, getLocaleId: () => 'zh' })
    render(<MemoryView actions={controller.actions} t={t} />)
    await screen.findByRole('button', { name: /提交信息用中文/u })
    // 先开启「显示已归档」，让旧决策进入列表。
    fireEvent.click(screen.getByRole('button', { name: t('memoryShowArchived') }))
    await screen.findByRole('button', { name: /旧决策/u })
    // 默认顺序保持服务端返回序（重要度优先）：m1 在前。
    const defaultCards = screen.getAllByRole('button', { name: /提交信息用中文|旧决策/u })
    expect(defaultCards[0]?.textContent).toContain('提交信息用中文')
    fireEvent.click(screen.getByRole('button', { name: t('memorySortLabel') }))
    fireEvent.click(await screen.findByRole('menuitemradio', { name: t('memorySortRecent') }))
    const recentCards = screen.getAllByRole('button', { name: /提交信息用中文|旧决策/u })
    expect(recentCards[0]?.textContent).toContain('旧决策')
  })

  it('体检对话框：content=1 拉全量算出三组问题，勾选后批量归档调用 /memory/status', async () => {
    const { calls } = installFetch({
      list: (url) => url.includes('content=1')
        ? okResponse({ scope: 'project', project: '', total: 4, entries: AUDIT_ENTRIES })
        : okResponse({ scope: 'project', project: '', total: ENTRIES.length, entries: ENTRIES }),
    })
    const controller = createHubController({ translate: t, getLocaleId: () => 'zh' })
    const toast = vi.spyOn(controller.actions, 'toast')
    render(<MemoryView actions={controller.actions} t={t} />)
    await screen.findByRole('button', { name: /提交信息用中文/u })
    fireEvent.click(screen.getByRole('button', { name: t('memoryAuditButton') }))
    expect(await screen.findByRole('dialog', { name: t('memoryAuditTitle') })).toBeTruthy()
    expect(calls.some(call => call.url.includes('/memory/list') && call.url.includes('content=1'))).toBe(true)
    // 四组问题：过时 1 条、疑似重复对 1（两条）、低价值 1 条、从未消费 1 条（与过时同条）。
    expect(screen.getAllByRole('checkbox').length).toBe(5)
    expect(screen.getByText(t('memoryAuditNeverUsedTitle'))).toBeTruthy()
    expect(screen.getByText(t('memoryAuditKeep', { name: '提交信息用中文（二）' }))).toBeTruthy()
    // 勾选「旧决策」并批量归档。
    fireEvent.click(screen.getByRole('checkbox', { name: '旧决策' }))
    expect(screen.getByText(t('memoryAuditSelected', { count: 1 }))).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: t('memoryArchive') }))
    await waitFor(() => {
      expect(calls.some(call => call.url.includes('/memory/status'))).toBe(true)
    })
    const statusCall = calls.find(call => call.url.includes('/memory/status'))
    expect(bodyOf(statusCall)).toEqual({ scope: 'project', project: '/repo/new', id: 'm2', status: 'archived' })
    await waitFor(() => {
      expect(toast).toHaveBeenCalledWith('success', t('memoryAuditDone', { count: 1 }))
    })
    expect(screen.queryByRole('dialog', { name: t('memoryAuditTitle') })).toBeNull()
  })

  it('体检批量删除需要二次确认后才调用 /memory/delete', async () => {
    const { calls } = installFetch({
      list: (url) => url.includes('content=1')
        ? okResponse({ scope: 'project', project: '', total: 1, entries: AUDIT_ENTRIES.slice(0, 1) })
        : okResponse({ scope: 'project', project: '', total: ENTRIES.length, entries: ENTRIES }),
    })
    const controller = createHubController({ translate: t, getLocaleId: () => 'zh' })
    render(<MemoryView actions={controller.actions} t={t} />)
    await screen.findByRole('button', { name: /提交信息用中文/u })
    fireEvent.click(screen.getByRole('button', { name: t('memoryAuditButton') }))
    expect(await screen.findByRole('dialog', { name: t('memoryAuditTitle') })).toBeTruthy()
    fireEvent.click(screen.getAllByRole('checkbox')[0]!)
    fireEvent.click(screen.getByRole('button', { name: t('memoryDelete') }))
    // 第一步只展开确认区，不发送请求。
    expect(screen.getByText(t('memoryAuditDeleteConfirm', { count: 1 }))).toBeTruthy()
    expect(calls.some(call => call.url.includes('/memory/delete'))).toBe(false)
    fireEvent.click(screen.getByRole('button', { name: t('memoryDeleteConfirm') }))
    await waitFor(() => {
      expect(calls.some(call => call.url.includes('/memory/delete'))).toBe(true)
    })
    const deleteCall = calls.find(call => call.url.includes('/memory/delete'))
    expect(bodyOf(deleteCall)).toEqual({ scope: 'project', project: '/repo/new', id: 'm1' })
  })

  it('设置对话框展示最近捕获，点击撤销调用 /memory/undo-capture 并刷新统计', async () => {
    let stateCalls = 0
    const { calls } = installFetch({
      state: () => {
        stateCalls += 1
        return okResponse(STATE)
      },
    })
    const controller = createHubController({ translate: t, getLocaleId: () => 'zh' })
    const toast = vi.spyOn(controller.actions, 'toast')
    render(<MemoryView actions={controller.actions} t={t} />)
    await screen.findByRole('button', { name: /提交信息用中文/u })
    fireEvent.click(screen.getByRole('button', { name: t('memorySettingsButton') }))
    const dialog = await screen.findByRole('dialog', { name: t('memorySettingsTitle') })
    // 标题、两种样本（写入条数 + 跳过原因）与撤销按钮都存在。
    expect(within(dialog).getByText(t('memoryRecentCaptures'))).toBeTruthy()
    expect(within(dialog).getByText(t('memoryCaptureWritten', { count: 2 }))).toBeTruthy()
    expect(within(dialog).getByText(t('memoryCaptureWritten', { count: 0 }))).toBeTruthy()
    expect(within(dialog).getByText(t('memoryCaptureSkipped', { reason: '冷却中' }))).toBeTruthy()
    expect(within(dialog).getByRole('button', { name: t('memoryUndoCapture') })).toBeTruthy()
    const stateCallsBefore = stateCalls
    fireEvent.click(within(dialog).getByRole('button', { name: t('memoryUndoCapture') }))
    await waitFor(() => {
      expect(calls.some(call => call.url.includes('/memory/undo-capture'))).toBe(true)
    })
    const undoCall = calls.find(call => call.url.includes('/memory/undo-capture'))
    expect(undoCall?.url).toBe('/agent-plugin/api/memory/undo-capture')
    expect(undoCall?.init?.method).toBe('POST')
    expect(bodyOf(undoCall)).toEqual({ id: 'cap-2' })
    await waitFor(() => {
      expect(toast).toHaveBeenCalledWith('success', t('memoryUndoCaptureDone'))
    })
    // 成功后重拉 /memory/state 刷新统计，该行改为「已撤销」且不再有撤销按钮。
    await waitFor(() => {
      expect(stateCalls).toBeGreaterThan(stateCallsBefore)
    })
    expect(await within(dialog).findByText(t('memoryCaptureUndone'))).toBeTruthy()
    expect(within(dialog).queryByRole('button', { name: t('memoryUndoCapture') })).toBeNull()
  })

  it('撤销失败时提示失败文案并保留撤销按钮', async () => {
    installFetch({ undo: () => failResponse('捕获已过期', 'bad_request', 400) })
    const controller = createHubController({ translate: t, getLocaleId: () => 'zh' })
    const toast = vi.spyOn(controller.actions, 'toast')
    render(<MemoryView actions={controller.actions} t={t} />)
    await screen.findByRole('button', { name: /提交信息用中文/u })
    fireEvent.click(screen.getByRole('button', { name: t('memorySettingsButton') }))
    const undoButton = await screen.findByRole('button', { name: t('memoryUndoCapture') })
    fireEvent.click(undoButton)
    // 400 的 bad_request 保留服务端文本，经 errorMessageFor 进入失败文案。
    await waitFor(() => {
      expect(toast).toHaveBeenCalledWith('error', t('memoryUndoCaptureFailed', { message: '捕获已过期' }))
    })
    expect(screen.getByRole('button', { name: t('memoryUndoCapture') })).toBeTruthy()
    expect(screen.queryByText(t('memoryCaptureUndone'))).toBeNull()
  })

  it('维护 due 不再自动弹窗（自动后台执行）；手动打开仍走确认运行与整次撤销', async () => {
    let stateCalls = 0
    const { calls } = installFetch({
      state: () => {
        stateCalls += 1
        return okResponse(STATE)
      },
      maintenance: () => okResponse(MAINTENANCE_DUE),
    })
    const controller = createHubController({ translate: t, getLocaleId: () => 'zh' })
    const toast = vi.spyOn(controller.actions, 'toast')
    render(<MemoryView actions={controller.actions} t={t} />)
    await screen.findByRole('button', { name: /提交信息用中文/u })
    // due 时面板不自动打断：等探针落地后仍无弹窗。
    await waitFor(() => {
      expect(calls.some(call => call.url.endsWith('/memory/maintenance'))).toBe(true)
    })
    expect(screen.queryByRole('dialog', { name: t('memoryMaintenanceDueTitle') })).toBeNull()
    // 手动打开：确认视图内显示 due 原因 → 确认运行 → 结果 → 整次撤销。
    fireEvent.click(screen.getByRole('button', { name: t('memoryMaintenanceButton') }))
    const confirmDialog = await screen.findByRole('dialog', { name: t('memoryMaintenanceConfirmTitle') })
    expect(within(confirmDialog).getByText(t('memoryMaintenanceDueHint', { days: 3, writes: 32 }))).toBeTruthy()
    expect(within(confirmDialog).getByText(t('memoryMaintenanceConfirmHint'))).toBeTruthy()
    // 确认视图不会立刻发运行请求。
    expect(calls.some(call => call.url.includes('/memory/maintenance/run'))).toBe(false)
    fireEvent.click(within(confirmDialog).getByRole('button', { name: t('memoryMaintenanceRun') }))
    await waitFor(() => {
      expect(calls.some(call => call.url.includes('/memory/maintenance/run'))).toBe(true)
    })
    const runCall = calls.find(call => call.url.includes('/memory/maintenance/run'))
    expect(runCall?.init?.method).toBe('POST')
    expect(bodyOf(runCall)).toEqual({})
    const resultDialog = await screen.findByRole('dialog', { name: t('memoryMaintenanceResultTitle') })
    expect(within(resultDialog).getByText(t('memoryMaintenanceResult', RUN_COMPLETED.counts))).toBeTruthy()
    const stateCallsBefore = stateCalls
    fireEvent.click(within(resultDialog).getByRole('button', { name: t('memoryMaintenanceUndo') }))
    await waitFor(() => {
      expect(calls.some(call => call.url.includes('/memory/maintenance/undo'))).toBe(true)
    })
    const undoCall = calls.find(call => call.url.includes('/memory/maintenance/undo'))
    expect(undoCall?.init?.method).toBe('POST')
    expect(bodyOf(undoCall)).toEqual({ runId: 'run-1' })
    await waitFor(() => {
      expect(toast).toHaveBeenCalledWith('success', t('memoryMaintenanceUndone'))
    })
    // 撤销成功后重拉 /memory/state，结果视图标记为已撤销且不再提供撤销按钮。
    await waitFor(() => {
      expect(stateCalls).toBeGreaterThan(stateCallsBefore)
    })
    expect(await within(resultDialog).findByText(t('memoryMaintenanceStatusUndone'))).toBeTruthy()
    expect(within(resultDialog).queryByRole('button', { name: t('memoryMaintenanceUndo') })).toBeNull()
  })

  it('从未维护时（daysSince = -1）提示原因不显示负数天数（手动打开）', async () => {
    installFetch({
      maintenance: () => okResponse({
        due: true,
        reason: 'never',
        writesSince: 4,
        daysSince: -1,
        lastRunAt: null,
        recentRuns: [],
      }),
    })
    const controller = createHubController({ translate: t, getLocaleId: () => 'zh' })
    render(<MemoryView actions={controller.actions} t={t} />)
    await screen.findByRole('button', { name: /提交信息用中文/u })
    fireEvent.click(screen.getByRole('button', { name: t('memoryMaintenanceButton') }))
    const dialog = await screen.findByRole('dialog', { name: t('memoryMaintenanceConfirmTitle') })
    expect(within(dialog).getByText(t('memoryMaintenanceDueNeverHint', { writes: 4 }))).toBeTruthy()
  })

  it('未达阈值时工具条入口先提示，确认后才 POST 运行', async () => {
    const { calls } = installFetch({ maintenance: () => okResponse(MAINTENANCE_CLEAR) })
    const controller = createHubController({ translate: t, getLocaleId: () => 'zh' })
    render(<MemoryView actions={controller.actions} t={t} />)
    await screen.findByRole('button', { name: /提交信息用中文/u })
    fireEvent.click(screen.getByRole('button', { name: t('memoryMaintenanceButton') }))
    const dialog = await screen.findByRole('dialog', { name: t('memoryMaintenanceConfirmTitle') })
    expect(within(dialog).getByText(t('memoryMaintenanceNotDueHint'))).toBeTruthy()
    expect(within(dialog).getByText(t('memoryMaintenanceConfirmHint'))).toBeTruthy()
    expect(calls.some(call => call.url.includes('/memory/maintenance/run'))).toBe(false)
    fireEvent.click(within(dialog).getByRole('button', { name: t('memoryMaintenanceRun') }))
    await waitFor(() => {
      expect(calls.some(call => call.url.includes('/memory/maintenance/run'))).toBe(true)
    })
    const resultDialog = await screen.findByRole('dialog', { name: t('memoryMaintenanceResultTitle') })
    expect(within(resultDialog).getByText(t('memoryMaintenanceResult', RUN_COMPLETED.counts))).toBeTruthy()
  })

  it('运行中显示进度态并禁用运行按钮，完成后展示结果', async () => {
    let releaseRun: (() => void) | null = null
    installFetch({
      maintenance: () => okResponse(MAINTENANCE_CLEAR),
      run: () => new Promise<Response>((resolve) => {
        releaseRun = () => { resolve(okResponse({ run: RUN_COMPLETED })) }
      }),
    })
    const controller = createHubController({ translate: t, getLocaleId: () => 'zh' })
    render(<MemoryView actions={controller.actions} t={t} />)
    await screen.findByRole('button', { name: /提交信息用中文/u })
    fireEvent.click(screen.getByRole('button', { name: t('memoryMaintenanceButton') }))
    const dialog = await screen.findByRole('dialog', { name: t('memoryMaintenanceConfirmTitle') })
    fireEvent.click(within(dialog).getByRole('button', { name: t('memoryMaintenanceRun') }))
    expect(await within(dialog).findByText(t('memoryMaintenanceRunning'))).toBeTruthy()
    expect((within(dialog).getByRole('button', { name: t('memoryMaintenanceRun') }) as HTMLButtonElement).disabled).toBe(true)
    releaseRun!()
    expect(await screen.findByRole('dialog', { name: t('memoryMaintenanceResultTitle') })).toBeTruthy()
  })

  it('运行失败时提示 memoryMaintenanceFailed 并保留确认对话框', async () => {
    installFetch({
      maintenance: () => okResponse(MAINTENANCE_CLEAR),
      run: () => failResponse('模型调用失败', '', 500),
    })
    const controller = createHubController({ translate: t, getLocaleId: () => 'zh' })
    const toast = vi.spyOn(controller.actions, 'toast')
    render(<MemoryView actions={controller.actions} t={t} />)
    await screen.findByRole('button', { name: /提交信息用中文/u })
    fireEvent.click(screen.getByRole('button', { name: t('memoryMaintenanceButton') }))
    const dialog = await screen.findByRole('dialog', { name: t('memoryMaintenanceConfirmTitle') })
    fireEvent.click(within(dialog).getByRole('button', { name: t('memoryMaintenanceRun') }))
    await waitFor(() => {
      expect(toast).toHaveBeenCalledWith('error', t('memoryMaintenanceFailed', { message: '模型调用失败' }))
    })
    expect(screen.getByRole('dialog', { name: t('memoryMaintenanceConfirmTitle') })).toBeTruthy()
  })

  it('设置对话框提供维护模型两个输入，防抖保存时随设置一起提交', async () => {
    const { calls } = installFetch()
    const controller = createHubController({ translate: t, getLocaleId: () => 'zh' })
    render(<MemoryView actions={controller.actions} t={t} />)
    await screen.findByRole('button', { name: /提交信息用中文/u })
    fireEvent.click(screen.getByRole('button', { name: t('memorySettingsButton') }))
    const dialog = await screen.findByRole('dialog', { name: t('memorySettingsTitle') })
    const provider = within(dialog).getByLabelText(t('memoryMaintenanceProvider')) as HTMLInputElement
    const model = within(dialog).getByLabelText(t('memoryMaintenanceModel')) as HTMLInputElement
    // 缺省为空：继承宿主默认模型，占位文案说明该行为。
    expect(provider.value).toBe('')
    expect(model.value).toBe('')
    expect(provider.getAttribute('placeholder')).toBe(t('memoryMaintenanceModelInherit'))
    fireEvent.change(provider, { target: { value: 'openai' } })
    fireEvent.change(model, { target: { value: 'gpt-5' } })
    await waitFor(() => {
      expect(calls.filter(call => call.url.includes('/memory/settings')).length).toBeGreaterThan(0)
    }, { timeout: 2000 })
    const lastSettings = calls.filter(call => call.url.includes('/memory/settings')).at(-1)
    expect(lastSettings?.init?.method).toBe('POST')
    expect(bodyOf(lastSettings)).toMatchObject({
      maintenanceProvider: 'openai',
      maintenanceModel: 'gpt-5',
    })
  })

  it('撤销失败时提示 memoryMaintenanceUndoFailed 并保留撤销按钮', async () => {
    installFetch({
      maintenance: () => okResponse({ ...MAINTENANCE_CLEAR, recentRuns: [RUN_COMPLETED] }),
      undoRun: () => failResponse('维护流水不存在', 'bad_request', 400),
    })
    const controller = createHubController({ translate: t, getLocaleId: () => 'zh' })
    const toast = vi.spyOn(controller.actions, 'toast')
    render(<MemoryView actions={controller.actions} t={t} />)
    await screen.findByRole('button', { name: /提交信息用中文/u })
    fireEvent.click(screen.getByRole('button', { name: t('memoryMaintenanceButton') }))
    const dialog = await screen.findByRole('dialog', { name: t('memoryMaintenanceConfirmTitle') })
    fireEvent.click(within(dialog).getByRole('button', { name: t('memoryMaintenanceUndo') }))
    await waitFor(() => {
      expect(toast).toHaveBeenCalledWith('error', t('memoryMaintenanceUndoFailed', { message: '维护流水不存在' }))
    })
    expect(within(dialog).getByRole('button', { name: t('memoryMaintenanceUndo') })).toBeTruthy()
  })

  it('确认对话框展示最近 3 条运行，已完成且未撤销的可直接撤销并刷新概览', async () => {
    let undone = false
    const failedRun = {
      ...RUN_COMPLETED,
      id: 'run-2',
      at: '2026-11-09T10:00:00.000Z',
      status: 'failed',
      error: '模型超时',
      counts: { candidates: 5, merges: 0, staled: 0, restored: 0, deleted: 0 },
    }
    const emptyRun = {
      ...RUN_COMPLETED,
      id: 'run-3',
      at: '2026-11-08T10:00:00.000Z',
      status: 'empty',
      counts: { candidates: 0, merges: 0, staled: 0, restored: 0, deleted: 0 },
    }
    const { calls } = installFetch({
      maintenance: () => okResponse({
        ...MAINTENANCE_CLEAR,
        recentRuns: undone ? [{ ...RUN_COMPLETED, undone: true }] : [RUN_COMPLETED, failedRun, emptyRun],
      }),
      undoRun: () => {
        undone = true
        return okResponse({ undone: true, restored: 1 })
      },
    })
    const controller = createHubController({ translate: t, getLocaleId: () => 'zh' })
    const toast = vi.spyOn(controller.actions, 'toast')
    render(<MemoryView actions={controller.actions} t={t} />)
    await screen.findByRole('button', { name: /提交信息用中文/u })
    fireEvent.click(screen.getByRole('button', { name: t('memoryMaintenanceButton') }))
    const dialog = await screen.findByRole('dialog', { name: t('memoryMaintenanceConfirmTitle') })
    expect(within(dialog).getByText(t('memoryMaintenanceRecent'))).toBeTruthy()
    expect(within(dialog).getByText(t('memoryMaintenanceStatusCompleted'))).toBeTruthy()
    expect(within(dialog).getByText(t('memoryMaintenanceStatusFailed'))).toBeTruthy()
    expect(within(dialog).getByText(t('memoryMaintenanceStatusEmpty'))).toBeTruthy()
    const undoButtons = within(dialog).getAllByRole('button', { name: t('memoryMaintenanceUndo') })
    expect(undoButtons).toHaveLength(1)
    fireEvent.click(undoButtons[0]!)
    await waitFor(() => {
      expect(calls.some(call => call.url.includes('/memory/maintenance/undo'))).toBe(true)
    })
    const undoCall = calls.find(call => call.url.includes('/memory/maintenance/undo'))
    expect(bodyOf(undoCall)).toEqual({ runId: 'run-1' })
    await waitFor(() => {
      expect(toast).toHaveBeenCalledWith('success', t('memoryMaintenanceUndone'))
    })
    // 概览重拉后该行标记已撤销，不再显示撤销按钮。
    expect(await within(dialog).findByText(t('memoryMaintenanceStatusUndone'))).toBeTruthy()
    await waitFor(() => {
      expect(within(dialog).queryByRole('button', { name: t('memoryMaintenanceUndo') })).toBeNull()
    })
  })

  it('诊断对话框展示注入/捕获/检索/维护四块，撤销维护后重拉数据并可关闭', async () => {
    let undone = false
    let maintenanceCalls = 0
    const { calls } = installFetch({
      maintenance: () => {
        maintenanceCalls += 1
        return okResponse({
          ...MAINTENANCE_CLEAR,
          recentRuns: undone ? [{ ...RUN_COMPLETED, undone: true }] : [RUN_COMPLETED],
        })
      },
      undoRun: () => {
        undone = true
        return okResponse({ undone: true, restored: 1 })
      },
    })
    const controller = createHubController({ translate: t, getLocaleId: () => 'zh' })
    const toast = vi.spyOn(controller.actions, 'toast')
    render(<MemoryView actions={controller.actions} t={t} />)
    await screen.findByRole('button', { name: /提交信息用中文/u })
    fireEvent.click(screen.getByRole('button', { name: t('memoryDiagnosisButton') }))
    const dialog = await screen.findByRole('dialog', { name: t('memoryDiagnosisTitle') })
    expect(calls.some(call => call.url.includes('/memory/state'))).toBe(true)
    expect(calls.some(call => call.url.includes('/memory/maintenance'))).toBe(true)
    // 四块标题与注入样本（条数/字符/截断）。
    expect(within(dialog).getByText(t('memoryDiagnosisInjections'))).toBeTruthy()
    expect(within(dialog).getByText(t('memoryDiagnosisCaptures'))).toBeTruthy()
    expect(within(dialog).getByText(t('memoryDiagnosisRetrievals'))).toBeTruthy()
    expect(within(dialog).getByText(t('memoryDiagnosisMaintenance'))).toBeTruthy()
    expect(within(dialog).getByText(t('memoryDiagnosisEntries', { count: 12 }))).toBeTruthy()
    expect(within(dialog).getByText(t('memoryDiagnosisChars', { count: 1234 }))).toBeTruthy()
    expect(within(dialog).getByText(t('memoryDiagnosisTruncated'))).toBeTruthy()
    // 捕获样本、检索样本（query / 结果数 / 前几个 id）与维护流水。
    expect(within(dialog).getByText(t('memoryCaptureWritten', { count: 2 }))).toBeTruthy()
    expect(within(dialog).getByText(t('memoryDiagnosisQuery', { query: '提交' }))).toBeTruthy()
    expect(within(dialog).getByText(t('memoryDiagnosisResults', { count: 3 }))).toBeTruthy()
    expect(within(dialog).getByText('m1, m2, m4')).toBeTruthy()
    expect(within(dialog).getByText(t('memoryMaintenanceResult', RUN_COMPLETED.counts))).toBeTruthy()

    const stateCallsBefore = calls.filter(call => call.url.includes('/memory/state')).length
    const maintenanceCallsBefore = maintenanceCalls
    fireEvent.click(within(dialog).getByRole('button', { name: t('memoryDiagnosisUndo') }))
    await waitFor(() => {
      expect(calls.some(call => call.url.includes('/memory/maintenance/undo'))).toBe(true)
    })
    const undoCall = calls.find(call => call.url.includes('/memory/maintenance/undo'))
    expect(undoCall?.init?.method).toBe('POST')
    expect(bodyOf(undoCall)).toEqual({ runId: 'run-1' })
    await waitFor(() => {
      expect(toast).toHaveBeenCalledWith('success', t('memoryDiagnosisUndoDone'))
    })
    // 成功后重拉两块数据，该运行标记已撤销且不再提供撤销按钮。
    await waitFor(() => {
      expect(calls.filter(call => call.url.includes('/memory/state')).length).toBeGreaterThan(stateCallsBefore)
      expect(maintenanceCalls).toBeGreaterThan(maintenanceCallsBefore)
    })
    expect(await within(dialog).findByText(t('memoryMaintenanceStatusUndone'))).toBeTruthy()
    await waitFor(() => {
      expect(within(dialog).queryByRole('button', { name: t('memoryDiagnosisUndo') })).toBeNull()
    })
    // 关闭按钮收起对话框。
    fireEvent.click(within(dialog).getAllByRole('button', { name: t('close') }).at(-1)!)
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: t('memoryDiagnosisTitle') })).toBeNull()
    })
  })
})
