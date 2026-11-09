// @vitest-environment jsdom

/**
 * Launcher and dialog behavior specs: user-visible behavior only (roles,
 * labels, callbacks, state hooks), never hashed class names. Components
 * receive stub hooks and real controller actions.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'

import { Panel, qrSvg } from '../src/client/Panel.tsx'
import { Launcher } from '../src/client/Launcher.tsx'
import { createRemoteController, identity, type PanelActions, type PanelState, type UseRemote } from '../src/client/store.ts'
import { zh } from '../src/client/locales.ts'
import type { PanelStatus } from '../src/remote-ctrl.ts'

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

function stubRemote(state: PanelState): { useRemote: UseRemote } {
  // The host binds use<Name> hooks straight onto useSyncExternalStoreWithSelector,
  // whose selector is REQUIRED; mirror that so a no-arg call fails here too.
  const useRemote = ((selector: (s: PanelState) => unknown) => selector(state)) as UseRemote
  return { useRemote }
}

function panelActions(overrides: Partial<PanelActions> = {}): PanelActions {
  return {
    init: vi.fn(),
    load: vi.fn(),
    copy: vi.fn().mockResolvedValue(undefined),
    start: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn().mockResolvedValue(undefined),
    refreshToken: vi.fn().mockResolvedValue(undefined),
    destroy: vi.fn(),
    ...overrides,
  }
}

function runningState(overrides: Partial<PanelStatus> = {}, state: Partial<PanelState> = {}): PanelState {
  const data: PanelStatus = {
    enabled: true,
    active: true,
    listening: true,
    error: '',
    host: '0.0.0.0',
    port: 47291,
    addresses: [
      { address: '192.168.1.5', scope: 'private', url: 'http://192.168.1.5:47291/' },
      { address: '10.0.0.2', scope: 'private', url: 'http://10.0.0.2:47291/' },
    ],
    recommendedUrl: 'http://192.168.1.5:47291/',
    qrUrl: 'http://192.168.1.5:47291/?token=tkn',
    tokenPinned: false,
    token: 'tkn-value',
    clientCount: 2,
    upstream: { origin: 'http://127.0.0.1:3081', ready: true },
    ...overrides,
  }
  return { status: 'ready', error: '', data, copied: null, pending: false, ...state }
}

function stoppedState(): PanelState {
  return runningState({ enabled: false, active: false, listening: false, clientCount: 0 })
}

function openDialog(useRemote: UseRemote, actions: PanelActions = panelActions()): void {
  render(<Launcher wide useRemote={useRemote} actions={actions} t={t} />)
  fireEvent.click(screen.getByRole('button', { name: t('title') }))
}

describe('Launcher', () => {
  it('opens the modal dialog from the sidebar-foot icon and takes focus', () => {
    const actions = panelActions()
    render(<Launcher wide useRemote={stubRemote(runningState()).useRemote} actions={actions} t={t} />)
    const trigger = screen.getByRole('button', { name: t('title') })
    expect(trigger.getAttribute('aria-haspopup')).toBe('dialog')
    expect(trigger.getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByRole('dialog')).toBeNull()

    fireEvent.click(trigger)
    expect(trigger.getAttribute('aria-expanded')).toBe('true')
    const dialog = screen.getByRole('dialog', { name: t('title') })
    expect(dialog.getAttribute('aria-modal')).toBe('true')
    expect(document.activeElement).toBe(dialog)
    expect(screen.getByTestId('qr')).toBeDefined()
    expect(actions.init).toHaveBeenCalledTimes(1)
  })

  it('starts a stopped gateway when the dialog opens (ZCode parity)', () => {
    const stoppedActions = panelActions()
    render(<Launcher wide useRemote={stubRemote(stoppedState()).useRemote} actions={stoppedActions} t={t} />)
    fireEvent.click(screen.getByRole('button', { name: t('title') }))
    expect(stoppedActions.start).toHaveBeenCalledTimes(1)

    cleanup()
    const runningActions = panelActions()
    render(<Launcher wide useRemote={stubRemote(runningState()).useRemote} actions={runningActions} t={t} />)
    fireEvent.click(screen.getByRole('button', { name: t('title') }))
    expect(runningActions.start).not.toHaveBeenCalled()
  })

  it('marks the entry active only while the gateway is enabled', () => {
    const actions = panelActions()
    const { rerender } = render(<Launcher wide useRemote={stubRemote(runningState()).useRemote} actions={actions} t={t} />)
    expect(screen.getByRole('button', { name: t('title') }).getAttribute('data-active')).toBe('true')

    rerender(<Launcher wide useRemote={stubRemote(stoppedState()).useRemote} actions={actions} t={t} />)
    expect(screen.getByRole('button', { name: t('title') }).getAttribute('data-active')).toBe('false')
  })

  it('polls only while the dialog is open', () => {
    const actions = panelActions()
    render(<Launcher wide={false} useRemote={stubRemote(runningState()).useRemote} actions={actions} t={t} />)
    expect(actions.init).not.toHaveBeenCalled()
    const trigger = screen.getByRole('button', { name: t('title') })

    fireEvent.click(trigger)
    expect(actions.init).toHaveBeenCalledTimes(1)

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(actions.destroy).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(document.activeElement).toBe(trigger)
  })

  it('closes on the close button and on a mask click', () => {
    const actions = panelActions()
    openDialog(stubRemote(runningState()).useRemote, actions)
    expect(screen.getByRole('dialog')).toBeDefined()
    fireEvent.click(screen.getByRole('button', { name: t('close') }))
    expect(screen.queryByRole('dialog')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: t('title') }))
    expect(screen.getByRole('dialog')).toBeDefined()
    const mask = document.querySelector('[data-remote-ctrl-mask]')
    expect(mask).not.toBeNull()
    fireEvent.click(mask as Element)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('stops and starts the gateway from the dialog', () => {
    const actions = panelActions()
    const { rerender } = render(<Launcher wide useRemote={stubRemote(runningState()).useRemote} actions={actions} t={t} />)
    fireEvent.click(screen.getByRole('button', { name: t('title') }))
    expect(screen.getByText(t('clients', { count: 2 }))).toBeDefined()

    fireEvent.click(screen.getByRole('button', { name: t('stop') }))
    expect(actions.stop).toHaveBeenCalledTimes(1)

    rerender(<Launcher wide useRemote={stubRemote(runningState({}, { pending: true })).useRemote} actions={actions} t={t} />)
    expect((screen.getByRole('button', { name: t('stop') }) as HTMLButtonElement).disabled).toBe(true)

    rerender(<Launcher wide useRemote={stubRemote(stoppedState()).useRemote} actions={actions} t={t} />)
    const start = screen.getByRole('button', { name: t('start') })
    expect((start as HTMLButtonElement).disabled).toBe(false)
    fireEvent.click(start)
    expect(actions.start).toHaveBeenCalledTimes(1)
  })
})

describe('Panel', () => {
  it('shows running status, addresses, token and connected devices', () => {
    render(<Panel useRemote={stubRemote(runningState()).useRemote} actions={panelActions()} t={t} />)
    expect(screen.getByText(t('running'))).toBeDefined()
    expect(screen.getByText(t('enabledTag'))).toBeDefined()
    expect(screen.getByText('192.168.1.5')).toBeDefined()
    expect(screen.getByText('10.0.0.2')).toBeDefined()
    expect(screen.getByText('tkn-value')).toBeDefined()
    expect(screen.getByText('已连接设备 2 台')).toBeDefined()
    expect(screen.getByTestId('qr')).toBeDefined()
    expect(screen.getByText(t('qrTitle'))).toBeDefined()
    expect(screen.queryByText(t('stoppedHint'))).toBeNull()
  })

  it('explains the stopped state and hides the QR', () => {
    render(<Panel useRemote={stubRemote(stoppedState()).useRemote} actions={panelActions()} t={t} />)
    expect(screen.getByText(t('stopped'))).toBeDefined()
    expect(screen.getByText(t('disabledTag'))).toBeDefined()
    expect(screen.getByText(t('stoppedHint'))).toBeDefined()
    expect(screen.queryByTestId('qr')).toBeNull()
  })

  it('places the pairing token above the QR code', () => {
    render(<Panel useRemote={stubRemote(runningState()).useRemote} actions={panelActions()} t={t} />)
    const token = screen.getByText('tkn-value')
    const qr = screen.getByTestId('qr')
    expect((token.compareDocumentPosition(qr) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0).toBe(true)
    expect(screen.getByTestId('qr').parentElement?.getAttribute('class')).toContain('qrArea')
  })

  it('switches the QR code and copied link with the selected address', () => {
    const actions = panelActions()
    render(<Panel useRemote={stubRemote(runningState()).useRemote} actions={actions} t={t} />)
    const qrBefore = screen.getByTestId('qr').innerHTML

    fireEvent.click(screen.getByRole('button', { name: t('copyLink') }))
    expect(actions.copy).toHaveBeenLastCalledWith('http://192.168.1.5:47291/?token=tkn-value', 'link')

    const second = screen.getByRole('radio', { name: /10\.0\.0\.2/u })
    fireEvent.click(second)
    expect(second.getAttribute('aria-checked')).toBe('true')
    expect(screen.getByTestId('qr').innerHTML).not.toBe(qrBefore)

    fireEvent.click(screen.getByRole('button', { name: t('copyLink') }))
    expect(actions.copy).toHaveBeenLastCalledWith('http://10.0.0.2:47291/?token=tkn-value', 'link')
  })

  it('marks the recommended address and defaults the QR to it', () => {
    render(<Panel useRemote={stubRemote(runningState()).useRemote} actions={panelActions()} t={t} />)
    expect(screen.getByText(t('recommended'))).toBeDefined()
    const recommended = screen.getByRole('radio', { name: /192\.168\.1\.5/u })
    expect(recommended.getAttribute('aria-checked')).toBe('true')
  })

  it('rotates the token only after the explicit confirmation', () => {
    const actions = panelActions()
    render(<Panel useRemote={stubRemote(runningState()).useRemote} actions={actions} t={t} />)

    fireEvent.click(screen.getByRole('button', { name: t('refreshToken') }))
    expect(actions.refreshToken).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: t('refreshConfirm') }))
    expect(actions.refreshToken).toHaveBeenCalledTimes(1)
  })

  it('explains a config-pinned token and disables the refresh', () => {
    render(<Panel
      useRemote={stubRemote(runningState({ tokenPinned: true })).useRemote}
      actions={panelActions()}
      t={t}
    />)
    expect(screen.getByText(t('tokenPinned'))).toBeDefined()
    expect((screen.getByRole('button', { name: t('refreshToken') }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('offers no copy button for the pairing token and shows only the device count', () => {
    const actions = panelActions()
    render(<Panel useRemote={stubRemote(runningState()).useRemote} actions={actions} t={t} />)
    // 配对码不提供复制：唯一的复制入口是「复制链接」。
    expect(screen.queryByRole('button', { name: t('copy') })).toBeNull()
    expect(screen.getByText(t('clients', { count: 2 }))).toBeDefined()
    expect(document.body.textContent).not.toContain('0.0.0.0:47291')
    expect(screen.getByRole('button', { name: t('refreshToken') })).toBeDefined()
  })

  it('renders the stopped state without a QR and shows server errors', () => {
    render(<Panel
      useRemote={stubRemote(runningState({ listening: false, error: '端口被占用', clientCount: 0 })).useRemote}
      actions={panelActions()}
      t={t}
    />)
    expect(screen.getByText(t('stopped'))).toBeDefined()
    expect(screen.queryByTestId('qr')).toBeNull()
    expect(screen.getByText('服务启动失败：端口被占用')).toBeDefined()
  })

  it('hints that the host web service is still pending', () => {
    render(<Panel
      useRemote={stubRemote(runningState({ upstream: { origin: '', ready: false } })).useRemote}
      actions={panelActions()}
      t={t}
    />)
    expect(screen.getByText('宿主 web 服务尚未就绪：网关已启动，等宿主就绪后刷新手机页面即可。')).toBeDefined()
  })

  it('renders the api-unavailable state with a retry that reloads', () => {
    const actions = panelActions()
    render(<Panel
      useRemote={stubRemote({ status: 'error', error: 'HTTP 403', data: null, copied: null, pending: false }).useRemote}
      actions={actions}
      t={t}
    />)
    expect(screen.getByText('面板数据面不可用：HTTP 403')).toBeDefined()
    fireEvent.click(screen.getByRole('button', { name: t('retry') }))
    expect(actions.load).toHaveBeenCalled()
  })
})

describe('controller store', () => {
  it('polls, updates the snapshot and stops on destroy', async () => {
    vi.useFakeTimers()
    try {
      const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true, data: runningState().data }), { status: 200 }))
      vi.stubGlobal('fetch', fetchMock)
      const controller = createRemoteController()
      const seen: PanelState[] = []
      controller.store.subscribe(() => seen.push(controller.store.getSnapshot()))
      controller.actions.init()
      expect(fetchMock).toHaveBeenCalledTimes(1)
      await vi.advanceTimersByTimeAsync(9000)
      expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(2)
      expect(controller.store.getSnapshot().status).toBe('ready')
      expect(controller.store.getSnapshot().data?.port).toBe(47291)
      controller.actions.destroy()
      await vi.advanceTimersByTimeAsync(20000)
      expect(fetchMock.mock.calls.length).toBeLessThan(6)
    } finally {
      vi.useRealTimers()
      vi.unstubAllGlobals()
    }
  })

  it('posts start, stop and token refresh, adopting the returned status', async () => {
    const stopped = runningState({ enabled: false, active: false, listening: false, clientCount: 0 }).data
    const rotated = runningState({ token: 'rotated-token' }).data
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, data: runningState().data }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, data: stopped }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, data: rotated }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    try {
      const controller = createRemoteController()

      await controller.actions.start()
      expect(fetchMock.mock.calls[0]?.[0]).toBe('/remote-ctrl/api/start')
      expect((fetchMock.mock.calls[0]?.[1] as RequestInit | undefined)?.method).toBe('POST')
      expect(controller.store.getSnapshot().data?.listening).toBe(true)
      expect(controller.store.getSnapshot().pending).toBe(false)

      await controller.actions.stop()
      expect(fetchMock.mock.calls[1]?.[0]).toBe('/remote-ctrl/api/stop')
      expect(controller.store.getSnapshot().data?.enabled).toBe(false)

      await controller.actions.refreshToken()
      expect(fetchMock.mock.calls[2]?.[0]).toBe('/remote-ctrl/api/token/refresh')
      expect(controller.store.getSnapshot().data?.token).toBe('rotated-token')
      expect(controller.store.getSnapshot().pending).toBe(false)
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('keeps the pending flag off when a mutation fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: false, error: 'HTTP 403', code: 'forbidden' }), { status: 403 })))
    try {
      const controller = createRemoteController()
      await controller.actions.stop()
      expect(controller.store.getSnapshot().pending).toBe(false)
      expect(controller.store.getSnapshot().error).toBe('HTTP 403')
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('keeps the identity selector honest', () => {
    const state = runningState()
    expect(identity(state)).toBe(state)
  })
})

describe('qrSvg', () => {
  it('renders an svg for a url payload and tolerates garbage', () => {
    const svg = qrSvg('http://192.168.1.5:47291/?token=tkn')
    expect(svg).toContain('<svg')
    expect(svg.toLowerCase()).toContain('<path')
    expect(qrSvg('')).toBe('')
  })
})