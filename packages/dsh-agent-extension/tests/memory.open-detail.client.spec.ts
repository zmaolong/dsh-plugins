/**
 * Controller sequence that opens the memory detail surface: exiting the panel,
 * waiting for the mounted Session, reusing an existing detail tab, requesting
 * the preview file, and opening it as a new pane. Uses a structural fake host
 * (offline; no real Sidebar).
 */
import { afterEach, describe, expect, it, vi } from 'vitest'

import { createHubController, MEMORY_DETAIL_TAB, type HubHost } from '../src/client/store.ts'
import { zh } from '../src/client/locales.ts'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

/** Messages the controller queued for the overlay. */
function toasts(controller: ReturnType<typeof createHubController>): string[] {
  return controller.store.getSnapshot().toasts.map(item => item.message)
}

const t = (key: string, vars?: Record<string, unknown>): string => {
  let copy: string = zh[key as keyof typeof zh] ?? key
  if (vars !== undefined) {
    for (const name of Object.keys(vars)) copy = copy.split(`{${name}}`).join(String(vars[name]))
  }
  return copy
}

function okResponse(data: unknown): Response {
  return new Response(JSON.stringify({ ok: true, data }), { status: 200, headers: { 'content-type': 'application/json' } })
}

function failResponse(message: string, code = 'internal'): Response {
  return new Response(JSON.stringify({ ok: false, error: message, code }), { status: 500, headers: { 'content-type': 'application/json' } })
}

/** Poll an assertion-like predicate without depending on DOM utilities. */
async function waitUntil(check: () => boolean, timeoutMs = 3000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (check()) return
    await new Promise<void>((resolve) => { setTimeout(resolve, 10) })
  }
  throw new Error('condition not reached in time')
}

interface FakeHost {
  host: HubHost
  layout: HubHost['layout']
  openTab: ReturnType<typeof vi.fn>
  openResource: ReturnType<typeof vi.fn>
  focus: ReturnType<typeof vi.fn>
  tabsIn: ReturnType<typeof vi.fn>
  setSessionId(id: string | undefined): void
}

/** A host whose `selectPanel(null)` mounts the column for `session-1`, unless told to stay empty. */
function createFakeHost(options: { mountOnSelect?: boolean, tabs?: Array<{ id: string, kind?: string }> } = {}): FakeHost {
  const mountOnSelect = options.mountOnSelect ?? true
  let sessionId: string | undefined = 'session-0'
  const openTab = vi.fn()
  const openResource = vi.fn()
  const focus = vi.fn()
  const tabsIn = vi.fn(() => options.tabs ?? [])
  const layout = {
    selectPanel: vi.fn((id: string | null) => {
      if (id === null) sessionId = mountOnSelect ? 'session-1' : undefined
      else sessionId = undefined
    }),
  }
  const host: HubHost = {
    panelId: 'agent-extension',
    layout,
    sidebarRight: {
      mounted: { getSnapshot: () => sessionId, subscribe: () => () => {} },
      openTab,
      openResource,
      tabsIn,
      focus,
    },
  }
  return {
    host,
    layout,
    openTab,
    openResource,
    focus,
    tabsIn,
    setSessionId(id: string | undefined) { sessionId = id },
  }
}

describe('openMemoryDetail', () => {
  it('退出面板、等待 mounted、打开页签并把预览文件开成新窗格', async () => {
    const fake = createFakeHost()
    const previewCalls: string[] = []
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL): Promise<Response> => {
      const url = String(input)
      previewCalls.push(url)
      return okResponse({ path: 'C:\\Temp\\preview\\记忆.md', name: '记忆', empty: false })
    }))
    const controller = createHubController({ translate: t, getLocaleId: () => 'zh', host: fake.host })
    controller.actions.openMemoryDetail({ scope: 'project', project: '/repo/new', id: 'm1' })
    await waitUntil(() => fake.openResource.mock.calls.length > 0)

    expect(fake.layout.selectPanel).toHaveBeenNthCalledWith(1, null)
    expect(fake.openTab).toHaveBeenCalledWith(MEMORY_DETAIL_TAB, {
      params: { scope: 'project', project: '/repo/new', id: 'm1' },
    })
    expect(previewCalls.some(url => url.includes('/memory/preview-file'))).toBe(true)
    expect(previewCalls.find(url => url.includes('/memory/preview-file'))).toContain('scope=project')
    expect(previewCalls.find(url => url.includes('/memory/preview-file'))).toContain('id=m1')
    const [address, options] = fake.openResource.mock.calls[0] as [string, Record<string, unknown>]
    expect(address.startsWith('dsh-resource://file/session/session-1/')).toBe(true)
    expect(address).toContain('C:/Temp/preview/')
    expect(decodeURIComponent(address)).toContain('记忆.md')
    expect(options).toEqual({ preferNewPane: true })
  })

  it('复用已打开的详情页签：先聚焦再 openTab', async () => {
    const fake = createFakeHost({ tabs: [{ id: 'tab-1', kind: MEMORY_DETAIL_TAB }] })
    vi.stubGlobal('fetch', vi.fn(async (): Promise<Response> => okResponse({ path: 'C:\\Temp\\a.md', name: 'a', empty: false })))
    const controller = createHubController({ translate: t, getLocaleId: () => 'zh', host: fake.host })
    controller.actions.openMemoryDetail({ scope: 'global', project: '', id: 'm1' })
    await waitUntil(() => fake.openTab.mock.calls.length > 0)
    expect(fake.focus).toHaveBeenCalledWith('tab-1')
    expect(fake.openTab).toHaveBeenCalledWith(MEMORY_DETAIL_TAB, { params: { scope: 'global', project: '', id: 'm1' } })
  })

  it('无前台会话时提示并回退插件面板，不打开页签', async () => {
    const fake = createFakeHost({ mountOnSelect: false })
    fake.setSessionId(undefined)
    const controller = createHubController({ translate: t, getLocaleId: () => 'zh', host: fake.host })
    controller.actions.openMemoryDetail({ scope: 'global', project: '', id: 'm1' })
    await waitUntil(() => toasts(controller).some(message => message === t('memoryDetailNoSession')))
    expect(fake.openTab).not.toHaveBeenCalled()
    expect(fake.layout.selectPanel).toHaveBeenLastCalledWith('agent-extension')
  })

  it('正文为空时不打开预览页签', async () => {
    const fake = createFakeHost()
    vi.stubGlobal('fetch', vi.fn(async (): Promise<Response> => okResponse({ path: 'C:\\Temp\\a.md', name: 'a', empty: true })))
    const controller = createHubController({ translate: t, getLocaleId: () => 'zh', host: fake.host })
    controller.actions.openMemoryDetail({ scope: 'global', project: '', id: 'm1' })
    await waitUntil(() => fake.openTab.mock.calls.length > 0)
    await new Promise<void>((resolve) => { setTimeout(resolve, 50) })
    expect(fake.openResource).not.toHaveBeenCalled()
  })

  it('预览请求失败时提示但保留详情页签', async () => {
    const fake = createFakeHost()
    vi.stubGlobal('fetch', vi.fn(async (): Promise<Response> => failResponse('临时目录不可写')))
    const controller = createHubController({ translate: t, getLocaleId: () => 'zh', host: fake.host })
    controller.actions.openMemoryDetail({ scope: 'global', project: '', id: 'm1' })
    await waitUntil(() => toasts(controller)
      .some(message => message === t('memoryDetailPreviewFailed', { message: t('errorInternal') })))
    expect(fake.openTab).toHaveBeenCalled()
    expect(fake.openResource).not.toHaveBeenCalled()
  })

  it('showMemoryList 切回插件主面板并保持记忆分区', () => {
    const fake = createFakeHost()
    const controller = createHubController({ translate: t, getLocaleId: () => 'zh', host: fake.host })
    controller.actions.showMemoryList()
    expect(fake.layout.selectPanel).toHaveBeenLastCalledWith('agent-extension')
    expect(controller.store.getSnapshot().sectionTab).toBe('memory')
  })

  it('没有宿主服务时只提示，不影响面板', async () => {
    const controller = createHubController({ translate: t, getLocaleId: () => 'zh' })
    controller.actions.openMemoryDetail({ scope: 'global', project: '', id: 'm1' })
    expect(toasts(controller)).toContain(t('memoryDetailNoSession'))
  })
})
