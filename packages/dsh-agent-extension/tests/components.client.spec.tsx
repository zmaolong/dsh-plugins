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
import { DetailView } from '../src/client/DetailView.tsx'
import { StoreCard } from '../src/client/StoreCard.tsx'
import { Switch } from '../src/client/Switch.tsx'
import { SearchBox } from '../src/client/controls.tsx'
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

describe('SearchBox (compact trigger + floating input)', () => {
  it('shows only the icon trigger until clicked, reports typing, closes on Escape and restores focus', () => {
    const onChange = vi.fn()
    render(<SearchBox value="" onChange={onChange} placeholder="搜索插件" clearable clearLabel="清除搜索" />)
    const trigger = screen.getByRole('button', { name: '搜索插件' })
    expect(trigger.getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByPlaceholderText('搜索插件')).toBeNull()
    fireEvent.click(trigger)
    expect(trigger.getAttribute('aria-expanded')).toBe('true')
    const input = screen.getByPlaceholderText('搜索插件')
    expect(document.activeElement).toBe(input)
    fireEvent.change(input, { target: { value: 'abc' } })
    expect(onChange).toHaveBeenCalledWith('abc')
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByPlaceholderText('搜索插件')).toBeNull()
    expect(document.activeElement).toBe(trigger)
  })

  it('offers clearing while a query is present and keeps it after closing', () => {
    const onChange = vi.fn()
    render(<SearchBox value="demo" onChange={onChange} placeholder="搜索插件" clearable clearLabel="清除搜索" />)
    fireEvent.click(screen.getByRole('button', { name: '搜索插件' }))
    fireEvent.click(screen.getByRole('button', { name: '清除搜索' }))
    expect(onChange).toHaveBeenCalledWith('')
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

  it('traps Tab and Shift+Tab inside the dialog', () => {
    render(
      <DialogShell t={t} title="焦点陷阱">
        <button type="button">第一个</button>
        <button type="button">最后一个</button>
      </DialogShell>,
    )
    const dialog = screen.getByRole('dialog', { name: '焦点陷阱' })
    const first = screen.getByRole('button', { name: '第一个' })
    const last = screen.getByRole('button', { name: '最后一个' })
    // 初始焦点在面板容器上：Tab 进入第一个可聚焦元素。
    expect(document.activeElement).toBe(dialog)
    fireEvent.keyDown(dialog, { key: 'Tab' })
    expect(document.activeElement).toBe(first)
    // 最后一个继续 Tab 回绕到第一个；第一个 Shift+Tab 回到最后一个。
    last.focus()
    fireEvent.keyDown(last, { key: 'Tab' })
    expect(document.activeElement).toBe(first)
    first.focus()
    fireEvent.keyDown(first, { key: 'Tab', shiftKey: true })
    expect(document.activeElement).toBe(last)
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
    fireEvent.click(screen.getByRole('button', { name: t('searchPlaceholder') }))
    expect(screen.getByPlaceholderText(t('searchPlaceholder'))).toBeTruthy()
  })

  it('puts the section tabs where the actions used to be and keeps the store actions in the toolbar', () => {
    const controller = createHubController({ translate: t, getLocaleId: () => 'zh' })
    const openManage = vi.spyOn(controller.actions, 'openManage')
    const openSources = vi.spyOn(controller.actions, 'openSources')
    const setSectionTab = vi.spyOn(controller.actions, 'setSectionTab')
    const { useHub } = stubHub({
      ...initialHubState(),
      status: 'ready',
      snapshot: { markets: [], items: [], installed: [] },
    })
    render(<Panel useHub={useHub} actions={controller.actions} t={t} />)
    const plugins = screen.getByRole('tab', { name: t('tabPlugins') })
    expect(plugins.getAttribute('aria-selected')).toBe('true')
    expect(screen.getByRole('tab', { name: t('tabMemory') })).toBeTruthy()
    expect(screen.getByRole('tab', { name: t('tabSkills') })).toBeTruthy()
    // 下移后的操作按钮仍在同一工具行内可用。
    fireEvent.click(screen.getByRole('button', { name: t('manage') }))
    expect(openManage).toHaveBeenCalledOnce()
    fireEvent.click(screen.getByRole('button', { name: t('sources') }))
    expect(openSources).toHaveBeenCalledOnce()
    // 子 tab 切换交给控制器。
    fireEvent.click(screen.getByRole('tab', { name: t('tabMemory') }))
    expect(setSectionTab).toHaveBeenCalledWith('memory')
  })

  it('renders the skills placeholder instead of the plugin store (memory has its own view)', () => {
    const controller = createHubController({ translate: t, getLocaleId: () => 'zh' })
    render(
      <Panel
        useHub={stubHub({ ...initialHubState(), status: 'ready', sectionTab: 'skills' }).useHub}
        actions={controller.actions}
        t={t}
      />,
    )
    expect(screen.getByRole('tab', { name: t('tabSkills') }).getAttribute('aria-selected')).toBe('true')
    expect(screen.getByText(t('comingSoon'))).toBeTruthy()
    expect(screen.getByText(t('skillsPlaceholder'))).toBeTruthy()
    expect(screen.queryByPlaceholderText(t('searchPlaceholder'))).toBeNull()
    expect(screen.queryByRole('button', { name: t('searchPlaceholder') })).toBeNull()
  })
})

describe('DetailView', () => {
  it('来源未缓存时提供联网获取详情；已解析但无组件时保持空态', () => {
    const controller = createHubController({ translate: t, getLocaleId: () => 'zh' })
    const loadDetail = vi.spyOn(controller.actions, 'loadDetail')
    const snapshot = {
      markets: [{ id: 'm1', title: 'One' }],
      items: [{ key: 'm1/ai', name: 'ai', market: { id: 'm1' }, display: { title: 'ai-plugins' } }],
      installed: [],
    }
    const base = { ...initialHubState(), status: 'ready' as const, snapshot, view: 'detail' as const, detailKey: 'm1/ai', detailStatus: 'ready' as const }
    // 未缓存来源：describe 成功但 source.resolved === false → 必须提供联网入口
    const degraded = { ...base, detail: { key: 'm1/ai', name: 'ai', source: { resolved: false, cloneRequired: true } } }
    render(<DetailView useHub={stubHub(degraded).useHub} actions={controller.actions} t={t} />)
    fireEvent.click(screen.getByRole('button', { name: t('fetchDetail') }))
    expect(loadDetail).toHaveBeenCalledWith(true)
    cleanup()

    // 已解析但确实没有组件：保持空态，不出现联网按钮
    const resolved = { ...base, detail: { key: 'm1/ai', name: 'ai', source: { resolved: true } } }
    render(<DetailView useHub={stubHub(resolved).useHub} actions={controller.actions} t={t} />)
    expect(screen.getByText(t('componentsEmpty'))).toBeTruthy()
    expect(screen.queryByRole('button', { name: t('fetchDetail') })).toBeNull()
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
    const search = screen.getByRole('button', { name: t('searchPlaceholder') })
    expect(search.getAttribute('aria-expanded')).toBe('false')
    fireEvent.click(search)
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
    expect(screen.getByText('Superpowers 技能合集')).toBeTruthy()
    expect(screen.getByText('Matt Pocock 技能市场')).toBeTruthy()
    expect(screen.queryByPlaceholderText(t('searchPlaceholder'))).toBeNull()
    expect(screen.queryByRole('button', { name: t('searchPlaceholder') })).toBeNull()
    const row = within(screen.getByRole('tabpanel')).getByRole('button', { name: /claude-plugins-official/u })
    fireEvent.click(within(row).getByRole('button', { name: t('add') }))
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
    const row = within(screen.getByRole('tabpanel')).getByRole('button', { name: /claude-plugins-official/u })
    expect(within(row).getByText(t('addedBadge'))).toBeTruthy()
    expect(within(row).queryByRole('button', { name: t('add') })).toBeNull()
  })

  it('多个市场源时提供来源筛选，分组与搜索都按源过滤', () => {
    const controller = createHubController({ translate: t, getLocaleId: () => 'zh' })
    const setStoreSourceFilter = vi.spyOn(controller.actions, 'setStoreSourceFilter')
    const snapshot = {
      markets: [
        { id: 'm1', name: 'one', title: '市场一' },
        { id: 'm2', name: 'two', title: '市场二' },
      ],
      items: [
        { key: 'm1/a', name: 'alpha', market: { id: 'm1' }, display: { title: 'Alpha' } },
        { key: 'm2/b', name: 'beta', market: { id: 'm2' }, display: { title: 'Beta' } },
      ],
      installed: [],
    }
    const { useHub } = stubHub(readyState({ localeId: 'zh', snapshot }))
    render(<StoreView useHub={useHub} actions={controller.actions} t={t} />)
    const group = screen.getByRole('group', { name: t('allSources') })
    expect(within(group).getByRole('button', { name: '全部来源' }).getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(within(group).getByRole('button', { name: '市场二' }))
    expect(setStoreSourceFilter).toHaveBeenCalledWith('m2')

    // 选中市场二后的实际渲染：只显示 Beta；搜索也被限定在该源内
    const filteredState = controller.store.getSnapshot()
    void filteredState
    const filtered = { ...readyState({ localeId: 'zh', snapshot }), storeSourceFilter: 'm2', query: '' }
    cleanup()
    render(<StoreView useHub={stubHub(filtered).useHub} actions={controller.actions} t={t} />)
    expect(screen.getByText('Beta')).toBeTruthy()
    expect(screen.queryByText('Alpha')).toBeNull()
    expect(within(screen.getByRole('group', { name: t('allSources') })).getByRole('button', { name: '市场二' }).getAttribute('aria-pressed')).toBe('true')
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
