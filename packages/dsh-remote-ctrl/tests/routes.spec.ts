/**
 * Panel API specs: the loopback admission fence, the status read, and the
 * start/stop mutations. `mountUiRoutes` runs against a captured fake
 * webServer registration and a real loopback listener, so requests carry the
 * real Host header the fence inspects.
 */
import http from 'node:http'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { mountUiRoutes, type PanelApiTarget } from '../src/ui-routes.ts'
import type { PanelStatus } from '../src/remote-ctrl.ts'

const cleanups: Array<() => void> = []

afterEach(() => {
  while (cleanups.length > 0) cleanups.pop()?.()
})

interface FakeWebServer {
  handler: ((request: IncomingMessage, response: ServerResponse) => void) | undefined
}

function fakeCtrl(overrides: Partial<PanelApiTarget> = {}): {
  ctrl: PanelApiTarget
  status: PanelStatus
} {
  const status: PanelStatus = {
    enabled: true,
    active: true,
    listening: true,
    error: '',
    host: '0.0.0.0',
    port: 47291,
    addresses: [{ address: '192.168.1.5', scope: 'private', url: 'http://192.168.1.5:47291/' }],
    recommendedUrl: 'http://192.168.1.5:47291/',
    qrUrl: 'http://192.168.1.5:47291/?token=tkn',
    tokenPinned: false,
    token: 'tkn',
    clientCount: 1,
    upstream: { origin: 'http://127.0.0.1:3081', ready: true },
  }
  return {
    status,
    ctrl: {
      panelStatus: () => status,
      enable: vi.fn(),
      disable: vi.fn(),
      refreshToken: vi.fn(() => true),
      log: vi.fn(),
      ...overrides,
    },
  }
}

/** Mount the routes on a captured fake webServer and serve them on loopback. */
async function serve(ctrl: PanelApiTarget): Promise<{ origin: string }> {
  const fake: FakeWebServer = { handler: undefined }
  const webServer = {
    register(route: { handler: (request: IncomingMessage, response: ServerResponse) => void }): () => void {
      fake.handler = route.handler
      return () => { fake.handler = undefined }
    },
  }
  const ctx = { get: () => webServer }
  const mounted = mountUiRoutes(ctx, ctrl)
  expect(mounted.active).toBe(true)
  const server = http.createServer((request, response) => {
    const handler = fake.handler
    if (handler === undefined) {
      response.writeHead(500).end()
      return
    }
    handler(request, response)
  })
  await new Promise<void>(resolve => {
    server.listen(0, '127.0.0.1', () => resolve())
  })
  const address = server.address() as AddressInfo
  cleanups.push(() => {
    mounted.dispose()
    server.close()
  })
  return { origin: `http://127.0.0.1:${address.port}` }
}

interface Reply {
  status: number
  body: { ok?: unknown, data?: unknown, error?: unknown, code?: unknown }
}

function call(origin: string, path: string, options: { method?: string, headers?: Record<string, string> } = {}): Promise<Reply> {
  return new Promise((resolve, reject) => {
    const request = http.request(`${origin}${path}`, { method: options.method ?? 'GET', headers: options.headers }, response => {
      const chunks: Buffer[] = []
      response.on('data', (chunk: Buffer) => chunks.push(chunk))
      response.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8')
        resolve({ status: response.statusCode ?? 0, body: JSON.parse(text) as Reply['body'] })
      })
    })
    request.on('error', reject)
    request.end()
  })
}

const JSON_HEADERS = { 'content-type': 'application/json' }

describe('panel API', () => {
  it('serves the panel status to a loopback GET', async () => {
    const { ctrl, status } = fakeCtrl()
    const { origin } = await serve(ctrl)
    const reply = await call(origin, '/remote-ctrl/api/status')
    expect(reply.status).toBe(200)
    expect(reply.body.ok).toBe(true)
    expect(reply.body.data).toEqual(status)
  })

  it('stops and starts the gateway through POST mutations', async () => {
    const { ctrl, status } = fakeCtrl()
    const { origin } = await serve(ctrl)

    const stop = await call(origin, '/remote-ctrl/api/stop', { method: 'POST', headers: JSON_HEADERS })
    expect(stop.status).toBe(200)
    expect(stop.body.data).toEqual(status)
    expect(ctrl.disable).toHaveBeenCalledTimes(1)
    expect(ctrl.enable).not.toHaveBeenCalled()

    const start = await call(origin, '/remote-ctrl/api/start', { method: 'POST', headers: JSON_HEADERS })
    expect(start.status).toBe(200)
    expect(ctrl.enable).toHaveBeenCalledTimes(1)
  })

  it('rotates the token and refuses when the token is pinned in config', async () => {
    const { ctrl, status } = fakeCtrl()
    const { origin } = await serve(ctrl)
    const rotated = await call(origin, '/remote-ctrl/api/token/refresh', { method: 'POST', headers: JSON_HEADERS })
    expect(rotated.status).toBe(200)
    expect(rotated.body.data).toEqual(status)
    expect(ctrl.refreshToken).toHaveBeenCalledTimes(1)

    const pinned = fakeCtrl({ refreshToken: vi.fn(() => false) })
    const pinnedOrigin = await serve(pinned.ctrl)
    const refused = await call(pinnedOrigin.origin, '/remote-ctrl/api/token/refresh', { method: 'POST', headers: JSON_HEADERS })
    expect(refused.status).toBe(409)
    expect(refused.body.code).toBe('token_pinned')

    const wrongMethod = await call(pinnedOrigin.origin, '/remote-ctrl/api/token/refresh')
    expect(wrongMethod.status).toBe(405)
  })

  it('rejects a GET on the mutation routes', async () => {
    const { ctrl } = fakeCtrl()
    const { origin } = await serve(ctrl)
    for (const path of ['/remote-ctrl/api/start', '/remote-ctrl/api/stop']) {
      const reply = await call(origin, path)
      expect(reply.status).toBe(405)
      expect(reply.body.code).toBe('method_not_allowed')
    }
    expect(ctrl.enable).not.toHaveBeenCalled()
    expect(ctrl.disable).not.toHaveBeenCalled()
  })

  it('refuses non-loopback Host headers and cross-site mutations', async () => {
    const { ctrl } = fakeCtrl()
    const { origin } = await serve(ctrl)

    const foreign = await call(origin, '/remote-ctrl/api/status', { headers: { host: 'evil.example' } })
    expect(foreign.status).toBe(403)
    expect(foreign.body.code).toBe('forbidden')

    const crossSite = await call(origin, '/remote-ctrl/api/stop', {
      method: 'POST',
      headers: { ...JSON_HEADERS, 'sec-fetch-site': 'cross-site' },
    })
    expect(crossSite.status).toBe(403)
    expect(ctrl.disable).not.toHaveBeenCalled()

    const foreignOrigin = await call(origin, '/remote-ctrl/api/stop', {
      method: 'POST',
      headers: { ...JSON_HEADERS, origin: 'http://evil.example' },
    })
    expect(foreignOrigin.status).toBe(403)
    expect(ctrl.disable).not.toHaveBeenCalled()
  })

  it('answers unknown routes with 404', async () => {
    const { ctrl } = fakeCtrl()
    const { origin } = await serve(ctrl)
    const reply = await call(origin, '/remote-ctrl/api/nope')
    expect(reply.status).toBe(404)
    expect(reply.body.code).toBe('not_found')
  })

  it('reports a missing webServer as inactive', () => {
    const mounted = mountUiRoutes({ get: () => undefined }, fakeCtrl().ctrl)
    expect(mounted.active).toBe(false)
    expect(mounted.reason).toContain('webServer')
  })
})