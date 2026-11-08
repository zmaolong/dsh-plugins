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
