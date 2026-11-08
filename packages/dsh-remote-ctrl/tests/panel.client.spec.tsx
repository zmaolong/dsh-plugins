// @vitest-environment jsdom

/**
 * Panel behavior specs: user-visible behavior only (roles, labels,
 * callbacks), never hashed class names. Components receive stub hooks and a
 * real controller store.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'

import { Panel, qrSvg } from '../src/client/Panel.tsx'
import { createRemoteController, identity, type PanelState, type UseRemote } from '../src/client/store.ts'
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

function runningState(overrides: Partial<PanelStatus> = {}): PanelState {
  const data: PanelStatus = {
    active: true,
    listening: true,
    error: '',
    host: '0.0.0.0',
    port: 31080,
    addresses: [
      { address: '192.168.1.5', scope: 'private', url: 'http://192.168.1.5:31080/' },
      { address: '10.0.0.2', scope: 'private', url: 'http://10.0.0.2:31080/' },
    ],
    recommendedUrl: 'http://192.168.1.5:31080/',
    qrUrl: 'http://192.168.1.5:31080/?token=tkn',
    token: 'tkn-value',
    clientCount: 2,
    upstream: { origin: 'http://127.0.0.1:3081', ready: true },
    ...overrides,
  }
  return { status: 'ready', error: '', data, copied: null }
}

describe('Panel', () => {
  it('shows running status, addresses, token and connected devices', () => {
    const copy = vi.fn()
    render(<Panel useRemote={stubRemote(runningState()).useRemote} actions={{ init: () => {}, load: () => {}, copy, destroy: () => {} }} t={t} />)
    expect(screen.getByText(t('running'))).toBeDefined()
    expect(screen.getByText('http://192.168.1.5:31080/')).toBeDefined()
    expect(screen.getByText('http://10.0.0.2:31080/')).toBeDefined()
    expect(screen.getByText('tkn-value')).toBeDefined()
    expect(screen.getByText('已连接设备 2 台')).toBeDefined()
    expect(screen.getByTestId('qr')).toBeDefined()
    expect(screen.getByText(t('qrTitle'))).toBeDefined()
  })

  it('hands the address and token to copy actions', () => {
    const copy = vi.fn()
    render(<Panel useRemote={stubRemote(runningState()).useRemote} actions={{ init: () => {}, load: () => {}, copy, destroy: () => {} }} t={t} />)
    // 多个复制按钮（两行地址 + token）：点第一行（推荐地址）
    const buttons = screen.getAllByRole('button', { name: t('copy') })
    expect(buttons.length).toBe(3)
    fireEvent.click(buttons[0] ?? document.body)
    expect(copy).toHaveBeenCalledWith('http://192.168.1.5:31080/', 'addr:http://192.168.1.5:31080/')
    fireEvent.click(buttons[2] ?? document.body)
    expect(copy).toHaveBeenCalledWith('tkn-value', 'token')
  })

  it('renders the stopped state without a QR and shows server errors', () => {
    render(<Panel
      useRemote={stubRemote(runningState({ listening: false, error: '端口被占用', clientCount: 0 })).useRemote}
      actions={{ init: () => {}, load: () => {}, copy: vi.fn(), destroy: () => {} }}
      t={t}
    />)
    expect(screen.getByText(t('stopped'))).toBeDefined()
    expect(screen.queryByTestId('qr')).toBeNull()
    expect(screen.getByText('服务启动失败：端口被占用')).toBeDefined()
  })

  it('hints that the host web service is still pending', () => {
    render(<Panel
      useRemote={stubRemote(runningState({ upstream: { origin: '', ready: false } })).useRemote}
      actions={{ init: () => {}, load: () => {}, copy: vi.fn(), destroy: () => {} }}
      t={t}
    />)
    expect(screen.getByText('宿主 web 服务尚未就绪：网关已启动，等宿主就绪后刷新手机页面即可。')).toBeDefined()
  })

  it('renders the api-unavailable state with a retry that reloads', () => {
    const load = vi.fn()
    render(<Panel
      useRemote={stubRemote({ status: 'error', error: 'HTTP 403', data: null, copied: null }).useRemote}
      actions={{ init: () => {}, load, copy: vi.fn(), destroy: () => {} }}
      t={t}
    />)
    expect(screen.getByText('面板数据面不可用：HTTP 403')).toBeDefined()
    fireEvent.click(screen.getByRole('button', { name: t('retry') }))
    expect(load).toHaveBeenCalled()
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
      expect(controller.store.getSnapshot().data?.port).toBe(31080)
      controller.actions.destroy()
      await vi.advanceTimersByTimeAsync(20000)
      expect(fetchMock.mock.calls.length).toBeLessThan(6)
    } finally {
      vi.useRealTimers()
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
    const svg = qrSvg('http://192.168.1.5:31080/?token=tkn')
    expect(svg).toContain('<svg')
    expect(svg.toLowerCase()).toContain('<path')
    expect(qrSvg('')).toBe('')
  })
})
