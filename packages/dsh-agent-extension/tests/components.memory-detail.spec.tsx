// @vitest-environment jsdom

/**
 * Memory detail page behavior: loading, metadata save, lifecycle actions,
 * two-step delete, missing/error states, fallback target, dirty-discard toast.
 * Only user-visible behavior is asserted against a mocked `/memory/*` plane.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'

import { MemoryDetailTab, type MemoryDetailTabInfo } from '../src/client/memory-detail.tsx'
import { createHubController, initialHubState, type HubState, type MemoryDetailTarget, type UseHub } from '../src/client/store.ts'
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

const ENTRY = {
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
  content: '提交信息必须用中文。',
  originSessionId: 's1',
  supersedes: [],
  obsoleteVotes: 0,
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

/** Answer every memory endpoint; save/status echo the request body merged into the fixture. */
function installFetch(options: {
  get?: (url: string) => Response
  save?: (body: Record<string, unknown>) => Response
  status?: (body: Record<string, unknown>) => Response
} = {}): { calls: Call[] } {
  const calls: Call[] = []
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = String(input)
    calls.push({ url, init })
    const body = init?.body === undefined ? {} : JSON.parse(String(init.body)) as Record<string, unknown>
    if (url.includes('/memory/get')) return options.get ? options.get(url) : okResponse({ entry: ENTRY })
    if (url.includes('/memory/save')) {
      if (options.save) return options.save(body)
      return okResponse({ entry: { ...ENTRY, ...body, id: ENTRY.id } })
    }
    if (url.includes('/memory/status')) {
      if (options.status) return options.status(body)
      return okResponse({ entry: { ...ENTRY, status: body.status } })
    }
    if (url.includes('/memory/delete')) return okResponse({ deleted: true, id: body.id })
    return okResponse({})
  })
  vi.stubGlobal('fetch', fetchMock)
  return { calls }
}

const bodyOf = (call: Call | undefined): Record<string, unknown> => {
  if (call === undefined) throw new Error('missing call')
  return JSON.parse(String(call.init?.body)) as Record<string, unknown>
}

interface DetailProps {
  useTabInfo: () => MemoryDetailTabInfo
  useHub: UseHub
  actions: ReturnType<typeof createHubController>['actions']
  t: (key: string, vars?: Record<string, unknown>) => string
}

/** Build the host props for one navigation state; the actions carry a spy-able toast. */
function detailProps(options: {
  params?: unknown
  revision?: number
  fallback?: MemoryDetailTarget | null
  close?: () => void
  controller?: ReturnType<typeof createHubController>
}): DetailProps & { close: () => void, controller: ReturnType<typeof createHubController> } {
  const controller = options.controller ?? createHubController({ translate: t, getLocaleId: () => 'zh' })
  const close = options.close ?? vi.fn()
  const info: MemoryDetailTabInfo = {
    tab: { navigation: { params: options.params, revision: options.revision ?? 1 }, actions: { close } },
  }
  const state: HubState = { ...initialHubState(), detailTarget: options.fallback ?? null }
  const useHub = (<S,>(selector: (state: HubState) => S): S => selector(state)) as UseHub
  return { useTabInfo: () => info, useHub, actions: controller.actions, t, close, controller }
}

const TARGET = { scope: 'project', project: '/repo/new', id: 'm1' } as const

describe('MemoryDetailTab', () => {
  it('加载后展示名称、类型徽章、只读提示与自动维护说明', async () => {
    const { calls } = installFetch()
    const props = detailProps({ params: TARGET })
    render(<MemoryDetailTab {...props} />)
    expect(screen.getByText(t('memoryLoading'))).toBeTruthy()
    expect(await screen.findByRole('heading', { name: '提交信息用中文' })).toBeTruthy()
    expect(screen.getAllByText(t('memoryTypePreference')).length).toBeGreaterThan(0)
    expect(screen.getByText(t('memoryDetailPreviewHint'))).toBeTruthy()
    expect(screen.getByText(t('memoryDetailAutoMaintained'))).toBeTruthy()
    const getCall = calls.find(call => call.url.includes('/memory/get'))
    expect(getCall?.url).toContain('scope=project')
    expect(getCall?.url).toContain(`project=${encodeURIComponent('/repo/new')}`)
    expect(getCall?.url).toContain('id=m1')
  })

  it('修改元信息后保存命中 /memory/save 且带 id 与只读正文', async () => {
    const { calls } = installFetch()
    const props = detailProps({ params: TARGET })
    const toast = vi.spyOn(props.actions, 'toast')
    render(<MemoryDetailTab {...props} />)
    await screen.findByRole('heading', { name: '提交信息用中文' })

    const save = screen.getByRole('button', { name: t('memorySave') }) as HTMLButtonElement
    expect(save.disabled).toBe(true)
    fireEvent.change(screen.getByLabelText(t('memoryFieldDescription')), { target: { value: '新的描述' } })
    fireEvent.click(screen.getByRole('button', { name: t('memoryFieldType') }))
    fireEvent.click(await screen.findByRole('menuitemradio', { name: t('memoryTypeDecision') }))
    fireEvent.change(screen.getByLabelText(t('memoryFieldImportance')), { target: { value: '90' } })
    const tagInput = screen.getByLabelText(t('memoryFieldTags'))
    fireEvent.change(tagInput, { target: { value: '约定' } })
    fireEvent.keyDown(tagInput, { key: 'Enter' })
    expect((screen.getByRole('button', { name: t('memorySave') }) as HTMLButtonElement).disabled).toBe(false)

    fireEvent.click(screen.getByRole('button', { name: t('memorySave') }))
    await waitFor(() => {
      expect(calls.some(call => call.url.includes('/memory/save'))).toBe(true)
    })
    const saveCall = calls.find(call => call.url.includes('/memory/save'))
    expect(bodyOf(saveCall)).toMatchObject({
      id: 'm1',
      scope: 'project',
      project: '/repo/new',
      name: '提交信息用中文',
      description: '新的描述',
      type: 'decision',
      tags: ['git', '约定'],
      importance: 90,
      content: '提交信息必须用中文。',
    })
    await waitFor(() => {
      expect(toast).toHaveBeenCalledWith('success', t('memorySaved'))
    })
  })

  it('停用记忆命中 /memory/status 并刷新状态徽章', async () => {
    const { calls } = installFetch()
    const props = detailProps({ params: TARGET })
    render(<MemoryDetailTab {...props} />)
    await screen.findByRole('heading', { name: '提交信息用中文' })
    fireEvent.click(screen.getByRole('button', { name: t('memoryDeactivate') }))
    await waitFor(() => {
      expect(calls.some(call => call.url.includes('/memory/status'))).toBe(true)
    })
    const statusCall = calls.find(call => call.url.includes('/memory/status'))
    expect(bodyOf(statusCall)).toEqual({ scope: 'project', project: '/repo/new', id: 'm1', status: 'stale' })
    expect(await screen.findByText(t('memoryStatusStale'))).toBeTruthy()
  })

  it('删除需两步确认，成功后关闭页签', async () => {
    const { calls } = installFetch()
    const close = vi.fn()
    const props = detailProps({ params: TARGET, close })
    const toast = vi.spyOn(props.actions, 'toast')
    render(<MemoryDetailTab {...props} />)
    await screen.findByRole('heading', { name: '提交信息用中文' })
    fireEvent.click(screen.getByRole('button', { name: t('memoryDelete') }))
    expect(screen.getByText(t('memoryDeleteDescription', { name: '提交信息用中文' }))).toBeTruthy()
    expect(calls.some(call => call.url.includes('/memory/delete'))).toBe(false)
    fireEvent.click(screen.getByRole('button', { name: t('memoryDeleteConfirm') }))
    await waitFor(() => {
      expect(calls.some(call => call.url.includes('/memory/delete'))).toBe(true)
    })
    expect(bodyOf(calls.find(call => call.url.includes('/memory/delete')))).toEqual({ scope: 'project', project: '/repo/new', id: 'm1' })
    await waitFor(() => {
      expect(toast).toHaveBeenCalledWith('success', t('memoryDeleted', { name: '提交信息用中文' }))
      expect(close).toHaveBeenCalledTimes(1)
    })
  })

  it('导航参数缺失时回退到 controller 记住的最近目标', async () => {
    const { calls } = installFetch()
    const props = detailProps({ params: undefined, fallback: TARGET })
    render(<MemoryDetailTab {...props} />)
    expect(await screen.findByRole('heading', { name: '提交信息用中文' })).toBeTruthy()
    const getCall = calls.find(call => call.url.includes('/memory/get'))
    expect(getCall?.url).toContain('id=m1')
  })

  it('导航参数优先于回退目标', async () => {
    const { calls } = installFetch()
    const props = detailProps({ params: TARGET, fallback: { scope: 'global', project: '', id: 'm2' } })
    render(<MemoryDetailTab {...props} />)
    await screen.findByRole('heading', { name: '提交信息用中文' })
    expect(calls.find(call => call.url.includes('/memory/get'))?.url).toContain('id=m1')
  })

  it('记忆不存在时显示空态与关闭按钮', async () => {
    installFetch({ get: () => failResponse('记忆不存在：m1', 'not_found') })
    const close = vi.fn()
    const props = detailProps({ params: TARGET, close })
    render(<MemoryDetailTab {...props} />)
    expect(await screen.findByText(t('memoryDetailMissing'))).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: t('close') }))
    expect(close).toHaveBeenCalledTimes(1)
  })

  it('读取失败可重试并恢复', async () => {
    let attempts = 0
    installFetch({
      get: () => {
        attempts += 1
        return attempts === 1 ? failResponse('boom') : okResponse({ entry: ENTRY })
      },
    })
    const props = detailProps({ params: TARGET })
    render(<MemoryDetailTab {...props} />)
    expect(await screen.findByText(t('memoryDetailReadError', { message: t('errorInternal') }))).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: t('memoryRetry') }))
    expect(await screen.findByRole('heading', { name: '提交信息用中文' })).toBeTruthy()
  })

  it('切换记忆时丢弃未保存修改并提示', async () => {
    installFetch({
      get: (url) => okResponse({
        entry: new URL(url, 'http://localhost').searchParams.get('id') === 'm2'
          ? { ...ENTRY, id: 'm2', name: '另一条记忆' }
          : ENTRY,
      }),
    })
    const controller = createHubController({ translate: t, getLocaleId: () => 'zh' })
    const toast = vi.spyOn(controller.actions, 'toast')
    const first = detailProps({ params: TARGET, controller })
    const view = render(<MemoryDetailTab {...first} />)
    await screen.findByRole('heading', { name: '提交信息用中文' })
    fireEvent.change(screen.getByLabelText(t('memoryFieldName')), { target: { value: '改过的名称' } })
    const second = detailProps({ params: { scope: 'project', project: '/repo/new', id: 'm2' }, revision: 2, controller })
    view.rerender(<MemoryDetailTab {...second} />)
    await waitFor(() => {
      expect(toast).toHaveBeenCalledWith('info', t('memoryDetailDirtyDiscarded'))
    })
    expect(await screen.findByRole('heading', { name: '另一条记忆' })).toBeTruthy()
  })
})
