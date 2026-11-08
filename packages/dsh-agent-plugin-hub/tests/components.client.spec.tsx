// @vitest-environment jsdom

/**
 * Component behavior specs: user-visible behavior only (roles, labels,
 * callbacks), never hashed class names. Components receive stub hooks and a
 * real controller store.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'

import { Panel } from '../src/client/Panel.tsx'
import { StoreView } from '../src/client/StoreView.tsx'
import { MarketView } from '../src/client/MarketView.tsx'
import { StoreCard } from '../src/client/StoreCard.tsx'
import { Switch } from '../src/client/Switch.tsx'
import { Menu } from '../src/client/Menu.tsx'
import { DialogShell } from '../src/client/dialogs.tsx'
import { OverlayHost } from '../src/client/OverlayHost.tsx'
import { createHubController, initialHubState, type HubState, type UseHub } from '../src/client/store.ts'
import { zh } from '../src/client/locales.ts'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

const t = (key: string, vars?: Record<string, unknown>): string => {
  let text: string = zh[key as keyof typeof zh] ?? key
  if (vars !== undefined) {
    for (const name of Object.keys(vars)) text = text.split(`{${name}}`).join(String(vars[name]))
  }
  return text
}

function stubHub(state: HubState): { useHub: UseHub } {
  // The host binds use<Name> hooks straight onto useSyncExternalStoreWithSelector,
  // whose selector is REQUIRED; mirror that so a no-arg call fails here too.
  const useHub = ((selector: (s: HubState) => unknown) => selector(state)) as UseHub
  return { useHub }
}

describe('Switch', () => {
  it('toggles through aria-checked and reports the requested state', () => {
    const onChange = vi.fn()
    render(<Switch checked={false} onChange={onChange} label="启用 demo" />)
    const toggle = screen.getByRole('switch', { name: '启用 demo' })
    expect(toggle.getAttribute('aria-checked')).toBe('false')
    fireEvent.click(toggle)
    expect(onChange).toHaveBeenCalledWith(true)
  })

  it('stops row propagation when clicked inside a card', () => {
    const onChange = vi.fn()
    const onRowClick = vi.fn()
    render(
      <div onClick={onRowClick}>
        <Switch checked onChange={onChange} label="s" />
      </div>,
    )
    fireEvent.click(screen.getByRole('switch', { name: 's' }))
    expect(onRowClick).not.toHaveBeenCalled()
  })

  it('refuses input while disabled', () => {
    const onChange = vi.fn()
    render(<Switch checked={false} onChange={onChange} label="s" disabled />)
    fireEvent.click(screen.getByRole('switch', { name: 's' }))
    expect(onChange).not.toHaveBeenCalled()
  })
})

describe('Menu', () => {
  it('opens on trigger, runs the selected action, and closes', () => {
    const onSelect = vi.fn()
    render(<Menu t={t} items={[{ key: 'a', label: '动作 A', onSelect }]} />)
    fireEvent.click(screen.getByRole('button', { name: t('moreActions') }))
    fireEvent.click(screen.getByRole('menuitem', { name: '动作 A' }))
    expect(onSelect).toHaveBeenCalledOnce()
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('closes on Escape and restores focus to the trigger', () => {
    render(<Menu t={t} items={[{ key: 'a', label: '动作 A', onSelect: () => {} }]} />)
    const trigger = screen.getByRole('button', { name: t('moreActions') })
    fireEvent.click(trigger)
    expect(screen.getByRole('menu')).toBeTruthy()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('menu')).toBeNull()
    expect(document.activeElement).toBe(trigger)
  })
})

describe('DialogShell', () => {
  it('closes on mask click and Escape, and moves focus into the dialog', () => {
    const onClose = vi.fn()
    const outside = document.createElement('button')
    document.body.append(outside)
    outside.focus()
    render(
      <DialogShell t={t} title="标题" onClose={onClose}>
        <p>正文</p>
      </DialogShell>,
    )
    const dialog = screen.getByRole('dialog', { name: '标题' })
    expect(dialog.getAttribute('aria-modal')).toBe('true')
    expect(dialog.contains(document.activeElement) || document.activeElement === dialog).toBe(true)
    fireEvent.click(screen.getByRole('dialog', { name: '标题' }).parentElement ?? dialog, { target: undefined })
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalled()
    outside.remove()
  })
})

describe('StoreCard', () => {
  const baseItem = {
    key: 'm1/demo',
    name: 'demo',
    display: { title: 'Demo', description: 'A demo plugin' },
    market: { id: 'm1', name: 'one', title: 'One' },
    installable: true,
  }

  it('renders an install action that does not trigger row activation', () => {
    const controller = createHubController({ translate: t, getLocaleId: () => 'zh' })
    const install = vi.spyOn(controller.actions, 'install')
    const onOpenDetail = vi.fn()
    const { useHub } = stubHub({ ...initialHubState(), snapshot: { markets: [], items: [], installed: [] } })
    render(<StoreCard item={baseItem} useHub={useHub} actions={controller.actions} t={t} localeId="zh" onOpenDetail={onOpenDetail} />)
    fireEvent.click(screen.getByRole('button', { name: t('install') }))
    expect(install).toHaveBeenCalledWith(baseItem)
    expect(onOpenDetail).not.toHaveBeenCalled()
  })

  it('opens the detail view on card activation', () => {
    const controller = createHubController({ translate: t, getLocaleId: () => 'zh' })
    const onOpenDetail = vi.fn()
    const { useHub } = stubHub({ ...initialHubState(), snapshot: { markets: [], items: [], installed: [] } })
    render(<StoreCard item={baseItem} useHub={useHub} actions={controller.actions} t={t} localeId="zh" onOpenDetail={onOpenDetail} />)
    fireEvent.click(screen.getByRole('button', { name: 'Demo' }))
    expect(onOpenDetail).toHaveBeenCalledWith('m1/demo')
  })

  it('shows the update pill and per-card menu for installed items', () => {
    const controller = createHubController({ translate: t, getLocaleId: () => 'zh' })
    const { useHub } = stubHub({ ...initialHubState(), snapshot: { markets: [], items: [], installed: [] } })
    render(
      <StoreCard
        item={{ ...baseItem, installed: true, installedVersion: '1.0.0', installedEnabled: true, update: { state: 'available' } }}
        useHub={useHub}
        actions={controller.actions}
        t={t}
        localeId="zh"
        onOpenDetail={() => {}}
      />,
    )
    expect(screen.getByRole('button', { name: t('update') })).toBeTruthy()
    expect(screen.getByRole('switch')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: t('moreActions') }))
    expect(screen.getByRole('menuitem', { name: t('menuUninstall') })).toBeTruthy()
  })
})

describe('Panel', () => {
  it('renders the loading block before the first snapshot', () => {
    const controller = createHubController({ translate: t, getLocaleId: () => 'zh' })
    const { useHub } = stubHub(controller.store.getSnapshot())
    render(<Panel useHub={useHub} actions={controller.actions} t={t} />)
    expect(screen.getByText(t('catalogLoading'))).toBeTruthy()
  })

  it('renders the API-unavailable fallback with a retry action', () => {
    const controller = createHubController({ translate: t, getLocaleId: () => 'zh' })
    const load = vi.spyOn(controller.actions, 'load')
    const { useHub } = stubHub({ ...initialHubState(), status: 'error', error: 'errorForbidden' })
    render(<Panel useHub={useHub} actions={controller.actions} t={t} />)
    expect(screen.getByText(t('apiUnavailable'))).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: t('retry') }))
    expect(load).toHaveBeenCalledOnce()
  })

  it('renders store groups from the snapshot and shows the migration banner', () => {
    const controller = createHubController({ translate: t, getLocaleId: () => 'zh' })
    const { useHub } = stubHub({
      ...initialHubState(),
      status: 'ready',
      snapshot: {
        migrationError: '迁移失败',
        markets: [{ id: 'm1', name: 'one', title: 'One' }],
        items: [{ ...{ key: 'm1/demo', name: 'demo', market: { id: 'm1' }, display: { title: 'Demo' } } }],
        installed: [],
      },
    })
    render(<Panel useHub={useHub} actions={controller.actions} t={t} />)
    expect(screen.getByText(/迁移失败/u)).toBeTruthy()
    expect(screen.getByPlaceholderText(t('searchPlaceholder'))).toBeTruthy()
  })
})

describe('StoreView', () => {
  const readyState = (overrides: Partial<HubState> = {}): HubState => ({
    ...initialHubState(),
    status: 'ready',
    snapshot: { markets: [], items: [], installed: [] },
    ...overrides,
  })

  it('renders the sources tab by default and reports tab switches', () => {
    const controller = createHubController({ translate: t, getLocaleId: () => 'zh' })
    const setStoreTab = vi.spyOn(controller.actions, 'setStoreTab')
    const { useHub } = stubHub(readyState())
    render(<StoreView useHub={useHub} actions={controller.actions} t={t} />)
    const sources = screen.getByRole('tab', { name: t('tabSources') })
    expect(sources.getAttribute('aria-selected')).toBe('true')
    expect(screen.getByPlaceholderText(t('searchPlaceholder'))).toBeTruthy()
    fireEvent.click(screen.getByRole('tab', { name: t('tabRecommended') }))
    expect(setStoreTab).toHaveBeenCalledWith('recommended')
  })

  it('moves tab selection with arrow keys', () => {
    const controller = createHubController({ translate: t, getLocaleId: () => 'zh' })
    const setStoreTab = vi.spyOn(controller.actions, 'setStoreTab')
    const { useHub } = stubHub(readyState())
    render(<StoreView useHub={useHub} actions={controller.actions} t={t} />)
    fireEvent.keyDown(screen.getByRole('tab', { name: t('tabSources') }), { key: 'ArrowRight' })
    expect(setStoreTab).toHaveBeenCalledWith('recommended')
    fireEvent.keyDown(screen.getByRole('tab', { name: t('tabSources') }), { key: 'End' })
    expect(setStoreTab).toHaveBeenCalledWith('recommended')
  })

  it('lists recommended sources with add actions on the recommended tab', () => {
    const controller = createHubController({ translate: t, getLocaleId: () => 'zh' })
    const addRecommendedSource = vi.spyOn(controller.actions, 'addRecommendedSource')
    const { useHub } = stubHub(readyState({ storeTab: 'recommended', localeId: 'zh-cn' }))
    render(<StoreView useHub={useHub} actions={controller.actions} t={t} />)
    expect(screen.getByRole('tabpanel')).toBeTruthy()
    expect(screen.getByText('Anthropic 官方插件市场')).toBeTruthy()
    expect(screen.queryByPlaceholderText(t('searchPlaceholder'))).toBeNull()
    fireEvent.click(within(screen.getByRole('tabpanel')).getByRole('button', { name: t('add') }))
    expect(addRecommendedSource).toHaveBeenCalledWith({
      id: 'claude-plugins-official',
      location: 'https://github.com/anthropics/claude-plugins-official',
    })
  })

  it('marks a recommended source as already added by normalized location', () => {
    const controller = createHubController({ translate: t, getLocaleId: () => 'zh' })
    const { useHub } = stubHub(readyState({
      storeTab: 'recommended',
      snapshot: {
        markets: [{ id: 'm1', location: 'https://github.com/anthropics/claude-plugins-official.git/' }],
        items: [],
        installed: [],
      },
    }))
    render(<StoreView useHub={useHub} actions={controller.actions} t={t} />)
    expect(screen.getByText(t('addedBadge'))).toBeTruthy()
    expect(within(screen.getByRole('tabpanel')).queryByRole('button', { name: t('add') })).toBeNull()
  })
})

describe('OverlayHost', () => {
  it('renders the top dialog only and the toast stack', () => {
    const controller = createHubController({ translate: t, getLocaleId: () => 'zh' })
    act(() => {
      controller.actions.openSources()
      controller.actions.openAddSource()
      controller.actions.toast('success', '已就绪')
    })
    const { useHub } = stubHub(controller.store.getSnapshot())
    render(<OverlayHost useHub={useHub} actions={controller.actions} t={t} />)
    // Only the top dialog (add-source) is mounted.
    expect(screen.getByRole('dialog', { name: t('addMarketTitle') })).toBeTruthy()
    expect(screen.queryByRole('dialog', { name: t('sources') })).toBeNull()
    expect(screen.getByText('已就绪')).toBeTruthy()
  })

  it('renders nothing without dialogs or toasts', () => {
    const controller = createHubController({ translate: t, getLocaleId: () => 'zh' })
    const { useHub } = stubHub(controller.store.getSnapshot())
    const { container } = render(<OverlayHost useHub={useHub} actions={controller.actions} t={t} />)
    expect(container.firstChild).toBeNull()
  })
})

describe('market detail view', () => {
  const ENTRY = { id: 'claude-plugins-official', location: 'https://github.com/anthropics/claude-plugins-official' }
  const ADDED_STORE = {
    markets: [{ id: 'm1', location: ENTRY.location, locationKey: 'git:github.com/anthropics/claude-plugins-official', title: 'Anthropic 官方插件市场' }],
    items: [
      { key: 'm1/a', name: 'a', version: '1.0.0', market: { id: 'm1' }, display: { title: '插件 A', description: '描述 A' }, installable: true },
      { key: 'm1/b', name: 'b', version: '1.0.0', market: { id: 'm1' }, display: { title: '插件 B', description: '' }, installable: true },
    ],
    installed: [],
  }

  function jsonResponseData(data: unknown): Response {
    return new Response(JSON.stringify({ ok: true, data }), { status: 200, headers: { 'content-type': 'application/json' } })
  }

  it('StoreView：点击推荐行进入市场详情；行内添加按钮不触发行激活', () => {
    const controller = createHubController({ translate: t, getLocaleId: () => 'zh-cn' })
    const openMarketDetail = vi.spyOn(controller.actions, 'openMarketDetail')
    const addRecommendedSource = vi.spyOn(controller.actions, 'addRecommendedSource')
    const { useHub } = stubHub({
      ...initialHubState(),
      status: 'ready',
      localeId: 'zh-cn',
      storeTab: 'recommended',
      snapshot: { markets: [], items: [], installed: [] },
    })
    render(<StoreView useHub={useHub} actions={controller.actions} t={t} />)
    const row = within(screen.getByRole('tabpanel')).getByRole('button', { name: /claude-plugins-official/u })
    fireEvent.click(row)
    expect(openMarketDetail).toHaveBeenCalledWith({ id: ENTRY.id, location: ENTRY.location })
    fireEvent.click(within(row).getByRole('button', { name: t('add') }))
    expect(addRecommendedSource).toHaveBeenCalledWith({ id: ENTRY.id, location: ENTRY.location })
    expect(openMarketDetail).toHaveBeenCalledTimes(1)
  })

  it('MarketView：已添加态渲染插件卡片网格，卡片进入插件详情', async () => {
    const controller = createHubController({ translate: t, getLocaleId: () => 'zh-cn' })
    const openDetail = vi.spyOn(controller.actions, 'openDetail')
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponseData(ADDED_STORE)))
    await controller.actions.load()
    act(() => {
      controller.actions.openMarketDetail(ENTRY)
    })
    const { useHub } = stubHub(controller.store.getSnapshot())
    render(<MarketView useHub={useHub} actions={controller.actions} t={t} />)
    expect(screen.getByRole('button', { name: t('back') })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Anthropic 官方插件市场' })).toBeTruthy()
    expect(screen.getByText('插件 A')).toBeTruthy()
    expect(screen.getByText('插件 B')).toBeTruthy()
    expect(screen.getAllByRole('button', { name: t('install') }).length).toBe(2)
    fireEvent.click(screen.getByRole('button', { name: '插件 A' }))
    expect(openDetail).toHaveBeenCalledWith('m1/a', 'market')
  })

  it('MarketView：未添加态渲染预览卡片（不可安装），点击进入描述页', async () => {
    const controller = createHubController({ translate: t, getLocaleId: () => 'zh-cn' })
    const openMarketPlugin = vi.spyOn(controller.actions, 'openMarketPlugin')
    const closeMarketPlugin = vi.spyOn(controller.actions, 'closeMarketPlugin')
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.includes('/market/preview') && init?.method === 'POST') {
        return jsonResponseData({ type: 'git', plugins: [{ name: 'a', version: '1.0.0', display: { title: '插件 A', description: '描述 A', category: '工具' } }] })
      }
      return jsonResponseData({ markets: [], items: [], installed: [] })
    }))
    await controller.actions.load()
    act(() => {
      controller.actions.openMarketDetail(ENTRY)
    })
    await vi.waitFor(() => {
      expect(controller.store.getSnapshot().marketDetail?.status).toBe('ready')
    })
    const { useHub } = stubHub(controller.store.getSnapshot())
    const view = render(<MarketView useHub={useHub} actions={controller.actions} t={t} />)
    // The disabled button's accessible name is its tooltip (the blocked reason).
    const blocked = screen.getByRole('button', { name: t('previewInstallBlocked') })
    expect((blocked as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: '插件 A' }))
    expect(openMarketPlugin).toHaveBeenCalledWith('preview:a')
    act(() => {
      controller.actions.openMarketPlugin('preview:a')
    })
    view.rerender(<MarketView useHub={stubHub(controller.store.getSnapshot()).useHub} actions={controller.actions} t={t} />)
    expect(screen.getByText('描述 A')).toBeTruthy()
    expect(screen.getByText('工具')).toBeTruthy()
    expect(screen.getByText(t('previewInstallBlocked'))).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: t('back') }))
    expect(closeMarketPlugin).toHaveBeenCalled()
  })

  it('MarketView：未添加态刷新按钮带 refresh 重新拉取', async () => {
    const controller = createHubController({ translate: t, getLocaleId: () => 'zh-cn' })
    const openMarketDetail = vi.spyOn(controller.actions, 'openMarketDetail')
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.includes('/market/preview') && init?.method === 'POST') {
        return jsonResponseData({ type: 'git', plugins: [{ name: 'a', display: { title: '插件 A' } }] })
      }
      return jsonResponseData({ markets: [], items: [], installed: [] })
    }))
    await controller.actions.load()
    act(() => {
      controller.actions.openMarketDetail(ENTRY)
    })
    await vi.waitFor(() => {
      expect(controller.store.getSnapshot().marketDetail?.status).toBe('ready')
    })
    const { useHub } = stubHub(controller.store.getSnapshot())
    render(<MarketView useHub={useHub} actions={controller.actions} t={t} />)
    fireEvent.click(screen.getByRole('button', { name: t('refresh') }))
    expect(openMarketDetail).toHaveBeenLastCalledWith({ id: ENTRY.id, location: ENTRY.location }, true)
  })
})
