/** Hub controller behaviors: loading, race guard, busy queue, toasts, dialogs. */
import { afterEach, describe, expect, it, vi } from 'vitest'

import { createHubController, initialHubState } from '../src/client/store.ts'

const DICT: Record<string, string> = {
  errorInternal: '内部错误',
  errorConflict: '状态冲突',
  errorForbidden: '请求被拒绝',
  operationBusy: '另一个操作正在进行',
  unknownError: '未知错误',
}

const t = (key: string, vars?: Record<string, unknown>): string => {
  let text = DICT[key] ?? key
  if (vars !== undefined) {
    for (const name of Object.keys(vars)) text = text.split(`{${name}}`).join(String(vars[name]))
  }
  return text
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } })
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('createHubController', () => {
  it('loads the store snapshot and transitions to ready', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ ok: true, data: { markets: [], items: [], installed: [] } })))
    const controller = createHubController({ translate: t, getLocaleId: () => 'zh' })
    controller.actions.init()
    await vi.waitFor(() => {
      expect(controller.store.getSnapshot().status).toBe('ready')
    })
    expect(controller.store.getSnapshot().snapshot).toEqual({ markets: [], items: [], installed: [] })
    expect(controller.store.getSnapshot().loading).toBe(false)
  })

  it('surfaces load failures as the error state with a localized message', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ ok: false, error: 'boom', code: 'internal' })))
    const controller = createHubController({ translate: t, getLocaleId: () => 'zh' })
    await controller.actions.load()
    expect(controller.store.getSnapshot().status).toBe('error')
    expect(controller.store.getSnapshot().error).toBe('内部错误')
  })

  it('backfills detail results only for the still-open detail key (race guard)', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/store')) return jsonResponse({ ok: true, data: { items: [{ key: 'm/a', name: 'a', market: { id: 'm' } }, { key: 'm/b', name: 'b', market: { id: 'm' } }], installed: [] } })
      if (url.includes('name=a')) {
        await new Promise(resolve => setTimeout(resolve, 30))
        return jsonResponse({ ok: true, data: { key: 'm/a' } })
      }
      return jsonResponse({ ok: true, data: { key: 'm/b' } })
    }))
    const controller = createHubController({ translate: t, getLocaleId: () => 'zh' })
    await controller.actions.load()
    controller.actions.openDetail('m/a')
    controller.actions.openDetail('m/b')
    await vi.waitFor(() => {
      expect(controller.store.getSnapshot().detailStatus).toBe('ready')
    })
    // The slow m/a response must not overwrite the newer m/b detail.
    expect(controller.store.getSnapshot().detailKey).toBe('m/b')
    expect(controller.store.getSnapshot().detail).toEqual({ key: 'm/b' })
  })

  it('serializes mutating actions and reports failures as error toasts', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.includes('/store')) return jsonResponse({ ok: true, data: { items: [], installed: [], markets: [] } })
      if (url.includes('/install') && init?.method === 'POST') return jsonResponse({ ok: false, error: 'nope', code: 'conflict' })
      return jsonResponse({ ok: true, data: {} })
    }))
    const controller = createHubController({ translate: t, getLocaleId: () => 'zh' })
    await controller.actions.load()
    controller.actions.install({ key: 'm/a', name: 'a', market: { id: 'm' } })
    await vi.waitFor(() => {
      expect(controller.store.getSnapshot().toasts.some(toast => toast.kind === 'error' && toast.message === '状态冲突')).toBe(true)
    })
    expect(controller.store.getSnapshot().busy['m/a']).toBeUndefined()
  })

  it('auto-dismisses toasts and supports manual dismissal', async () => {
    vi.useFakeTimers()
    // The controller schedules dismissal through window.setTimeout; bridge it to the faked timer in node env.
    vi.stubGlobal('window', { setTimeout: (fn: () => void, ms: number) => setTimeout(fn, ms) })
    try {
      const controller = createHubController({ translate: t, getLocaleId: () => 'zh' })
      controller.actions.toast('success', 'done')
      expect(controller.store.getSnapshot().toasts).toHaveLength(1)
      controller.actions.dismissToast(controller.store.getSnapshot().toasts[0]?.id ?? 0)
      expect(controller.store.getSnapshot().toasts).toHaveLength(0)
      controller.actions.toast('info', 'later')
      await vi.advanceTimersByTimeAsync(5000)
      expect(controller.store.getSnapshot().toasts).toHaveLength(0)
    } finally {
      vi.useRealTimers()
    }
  })

  it('stacks dialogs and closes them by id or wholesale', () => {
    const controller = createHubController({ translate: t, getLocaleId: () => 'zh' })
    controller.actions.openSources()
    controller.actions.openAddSource()
    const dialogs = controller.store.getSnapshot().dialogs
    expect(dialogs.map(dialog => dialog.kind)).toEqual(['sources', 'add-source'])
    controller.actions.closeDialog(dialogs[0]?.id)
    expect(controller.store.getSnapshot().dialogs.map(dialog => dialog.kind)).toEqual(['add-source'])
    controller.actions.closeDialog()
    expect(controller.store.getSnapshot().dialogs).toEqual([])
  })

  it('tracks per-capability busy flags', () => {
    const controller = createHubController({ translate: t, getLocaleId: () => 'zh' })
    expect(controller.actions.isCapBusy('m/a', 'skills', 's1')).toBe(false)
  })

  it('keeps the initial state shape stable', () => {
    const state = initialHubState()
    expect(state.view).toBe('store')
    expect(state.status).toBe('loading')
    expect(state.dialogs).toEqual([])
    expect(state.toasts).toEqual([])
  })
})

describe('store tabs and recommended sources', () => {
  it('switches the store tab', () => {
    const controller = createHubController({ translate: t, getLocaleId: () => 'zh' })
    expect(controller.store.getSnapshot().storeTab).toBe('sources')
    controller.actions.setStoreTab('recommended')
    expect(controller.store.getSnapshot().storeTab).toBe('recommended')
    controller.actions.setStoreTab('sources')
    expect(controller.store.getSnapshot().storeTab).toBe('sources')
  })

  it('switches the sources-tab market filter', () => {
    const controller = createHubController({ translate: t, getLocaleId: () => 'zh' })
    expect(controller.store.getSnapshot().storeSourceFilter).toBe('')
    controller.actions.setStoreSourceFilter('m1')
    expect(controller.store.getSnapshot().storeSourceFilter).toBe('m1')
    controller.actions.setStoreSourceFilter('')
    expect(controller.store.getSnapshot().storeSourceFilter).toBe('')
  })

  it('adds a recommended source with a success toast and clears busy', async () => {
    const bodies: unknown[] = []
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.includes('/market/add') && init?.method === 'POST') {
        bodies.push(JSON.parse(String(init.body)))
        return jsonResponse({
          ok: true,
          data: { detectedType: 'git', market: { name: 'claude-plugins-official', title: 'Anthropic Official' }, pluginCount: 12 },
        })
      }
      return jsonResponse({ ok: true, data: { items: [], installed: [], markets: [] } })
    }))
    const controller = createHubController({ translate: t, getLocaleId: () => 'zh' })
    await controller.actions.load()
    controller.actions.addRecommendedSource({ id: 'claude-plugins-official', location: 'https://github.com/anthropics/claude-plugins-official' })
    await vi.waitFor(() => {
      expect(controller.store.getSnapshot().toasts.some(toast => toast.kind === 'success')).toBe(true)
    })
    expect(bodies).toEqual([{ location: 'https://github.com/anthropics/claude-plugins-official' }])
    expect(controller.store.getSnapshot().marketBusy['rec:claude-plugins-official']).toBeUndefined()
  })

  it('surfaces a failed recommended add as an error toast and clears busy', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.includes('/market/add') && init?.method === 'POST') return jsonResponse({ ok: false, error: 'boom', code: 'internal' })
      return jsonResponse({ ok: true, data: { items: [], installed: [], markets: [] } })
    }))
    const controller = createHubController({ translate: t, getLocaleId: () => 'zh' })
    await controller.actions.load()
    controller.actions.addRecommendedSource({ id: 'x', location: 'https://example.com/x' })
    await vi.waitFor(() => {
      expect(controller.store.getSnapshot().toasts.some(toast => toast.kind === 'error' && toast.message === '内部错误')).toBe(true)
    })
    expect(controller.store.getSnapshot().marketBusy['rec:x']).toBeUndefined()
  })

  it('guards concurrent recommended adds for the same entry', async () => {
    let addCalls = 0
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.includes('/market/add') && init?.method === 'POST') {
        addCalls += 1
        await new Promise(resolve => setTimeout(resolve, 20))
        return jsonResponse({ ok: true, data: { detectedType: 'git', market: {}, pluginCount: 0 } })
      }
      return jsonResponse({ ok: true, data: { items: [], installed: [], markets: [] } })
    }))
    const controller = createHubController({ translate: t, getLocaleId: () => 'zh' })
    await controller.actions.load()
    controller.actions.addRecommendedSource({ id: 'x', location: 'https://example.com/x' })
    controller.actions.addRecommendedSource({ id: 'x', location: 'https://example.com/x' })
    await vi.waitFor(() => {
      expect(controller.store.getSnapshot().marketBusy['rec:x']).toBeUndefined()
    })
    expect(addCalls).toBe(1)
  })
})

describe('market detail view', () => {
  const ENTRY = { id: 'claude-plugins-official', location: 'https://github.com/anthropics/claude-plugins-official' }
  const ADDED_STORE = {
    markets: [{ id: 'm1', location: ENTRY.location, locationKey: 'git:github.com/anthropics/claude-plugins-official', title: 'Anthropic 官方插件市场' }],
    items: [{ key: 'm1/a', name: 'a', market: { id: 'm1' }, display: { title: 'A' } }],
    installed: [],
  }

  function jsonResponseData(data: unknown): Response {
    return jsonResponse({ ok: true, data })
  }

  it('added market: zero-request open projects snapshot items and routes to the market view', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.includes('/market/preview') && init?.method === 'POST') {
        return jsonResponse({ ok: false, error: 'preview must not be called', code: 'internal' })
      }
      return jsonResponseData(ADDED_STORE)
    })
    vi.stubGlobal('fetch', fetchMock)
    const controller = createHubController({ translate: t, getLocaleId: () => 'zh' })
    await controller.actions.load()
    controller.actions.openMarketDetail(ENTRY)
    const state = controller.store.getSnapshot()
    expect(state.view).toBe('market')
    expect(state.marketDetail?.status).toBe('ready')
    expect(state.marketDetail?.data?.plugins).toHaveLength(1)
    // Only /store loads — the market view itself made no request.
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('un-added market: fetches /market/preview for the plugin list', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.includes('/market/preview') && init?.method === 'POST') {
        return jsonResponseData({ type: 'git', via: 'raw', plugins: [{ name: 'demo', display: { title: 'Demo', description: '演示' } }] })
      }
      return jsonResponseData({ items: [], installed: [], markets: [] })
    }))
    const controller = createHubController({ translate: t, getLocaleId: () => 'zh' })
    await controller.actions.load()
    controller.actions.openMarketDetail(ENTRY)
    expect(controller.store.getSnapshot().marketDetail?.status).toBe('loading')
    await vi.waitFor(() => {
      expect(controller.store.getSnapshot().marketDetail?.status).toBe('ready')
    })
    expect(controller.store.getSnapshot().marketDetail?.data?.plugins).toHaveLength(1)
  })

  it('openMarketDetail failure surfaces in the view error state', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.includes('/market/preview') && init?.method === 'POST') return jsonResponse({ ok: false, error: '拉取失败', code: 'network_error' })
      return jsonResponseData({ items: [], installed: [], markets: [] })
    }))
    const controller = createHubController({ translate: t, getLocaleId: () => 'zh' })
    await controller.actions.load()
    controller.actions.openMarketDetail(ENTRY)
    await vi.waitFor(() => {
      expect(controller.store.getSnapshot().marketDetail?.status).toBe('error')
    })
    expect(controller.store.getSnapshot().marketDetail?.error).not.toBe('')
    expect(controller.store.getSnapshot().toasts).toHaveLength(0)
  })

  it('refresh keeps previous data visible while re-fetching with the refresh flag', async () => {
    let calls = 0
    const bodies: unknown[] = []
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.includes('/market/preview') && init?.method === 'POST') {
        calls += 1
        bodies.push(JSON.parse(String(init?.body)))
        if (calls === 1) return jsonResponseData({ type: 'git', plugins: [{ name: 'a', display: { title: 'A' } }] })
        await new Promise(resolve => setTimeout(resolve, 20))
        return jsonResponseData({ type: 'git', plugins: [{ name: 'b', display: { title: 'B' } }] })
      }
      return jsonResponseData({ items: [], installed: [], markets: [] })
    }))
    const controller = createHubController({ translate: t, getLocaleId: () => 'zh' })
    await controller.actions.load()
    controller.actions.openMarketDetail(ENTRY)
    await vi.waitFor(() => {
      expect(controller.store.getSnapshot().marketDetail?.status).toBe('ready')
    })
    controller.actions.openMarketDetail(ENTRY, true)
    const refreshing = controller.store.getSnapshot().marketDetail
    expect(refreshing?.status).toBe('loading')
    expect(refreshing?.data?.plugins).toHaveLength(1)
    await vi.waitFor(() => {
      expect(controller.store.getSnapshot().marketDetail?.status).toBe('ready')
    })
    expect(bodies[1]).toMatchObject({ location: ENTRY.location, refresh: true })
  })

  it('closeMarketDetail returns to the store keeping the recommended tab', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponseData(ADDED_STORE)))
    const controller = createHubController({ translate: t, getLocaleId: () => 'zh' })
    await controller.actions.load()
    controller.actions.setStoreTab('recommended')
    controller.actions.openMarketDetail(ENTRY)
    expect(controller.store.getSnapshot().view).toBe('market')
    controller.actions.closeMarketDetail()
    const state = controller.store.getSnapshot()
    expect(state.view).toBe('store')
    expect(state.storeTab).toBe('recommended')
    expect(state.marketDetail).toBeNull()
  })

  it('openDetail from the market view backs into the market view, otherwise into the store', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/describe')) return jsonResponseData({ key: 'm1/a' })
      return jsonResponseData(ADDED_STORE)
    }))
    const controller = createHubController({ translate: t, getLocaleId: () => 'zh' })
    await controller.actions.load()
    controller.actions.openMarketDetail(ENTRY)
    controller.actions.openDetail('m1/a', 'market')
    expect(controller.store.getSnapshot().view).toBe('detail')
    controller.actions.backFromDetail()
    expect(controller.store.getSnapshot().view).toBe('market')
    controller.actions.openDetail('m1/a')
    expect(controller.store.getSnapshot().detailReturn).toBe('store')
    controller.actions.backFromDetail()
    expect(controller.store.getSnapshot().view).toBe('store')
  })

  it('openMarketPlugin/closeMarketPlugin toggle the preview plugin pane', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponseData({ items: [], installed: [], markets: [] })))
    const controller = createHubController({ translate: t, getLocaleId: () => 'zh' })
    await controller.actions.load()
    controller.actions.openMarketDetail(ENTRY)
    controller.actions.openMarketPlugin('preview:a')
    expect(controller.store.getSnapshot().marketPluginKey).toBe('preview:a')
    controller.actions.closeMarketPlugin()
    expect(controller.store.getSnapshot().marketPluginKey).toBeNull()
  })
})
