/**
 * Gateway specs: the pairing gate plus the reverse-proxy behavior against a
 * fake upstream that mimics the host's browser-auth (launch token → signed
 * cookie → 303) and echoes requests. Loopback only; nothing leaves the
 * process.
 */
import http from 'node:http'
import type { Server } from 'node:http'
import { AddressInfo } from 'node:net'
import { afterEach, describe, expect, it } from 'vitest'
import { RcServer, type UpstreamHandle } from '../src/server.ts'

const LAUNCH_TOKEN = 'launch-token-1'
const HOST_COOKIE_NAME = 'dsh-auth-fake'

const cleanups: Array<() => void> = []

afterEach(() => {
  while (cleanups.length > 0) cleanups.pop()?.()
})

interface FakeUpstream {
  server: Server
  origin: string
  authority: string
  /** Last forwarded request as seen upstream. */
  last: { url?: string | undefined, method?: string | undefined, host?: string | undefined, cookie?: string | undefined, body?: string | undefined }
  /** Whether the cookie-exchange endpoint has been hit. */
  exchanges: number
}

/** Fake host webServer: token→cookie exchange, cookie-gated routes, echo, SSE. */
async function startFakeUpstream(): Promise<FakeUpstream> {
  const state: FakeUpstream = {
    server: http.createServer(() => {}),
    origin: '',
    authority: '',
    last: {},
    exchanges: 0,
  }
  const server = http.createServer((request, response) => {
    const url = new URL(request.url ?? '/', 'http://upstream.invalid')
    const rawCookie = String(request.headers.cookie ?? '')
    const authenticated = rawCookie.includes(`${HOST_COOKIE_NAME}=v1.valid`)
    state.last = {
      url: request.url,
      method: request.method,
      host: request.headers.host,
      cookie: rawCookie === '' ? undefined : rawCookie,
    }
    if (url.pathname === '/' && url.searchParams.get('token') === LAUNCH_TOKEN && request.method === 'GET') {
      state.exchanges += 1
      response.writeHead(303, {
        'set-cookie': `${HOST_COOKIE_NAME}=v1.valid; Max-Age=2592000; Path=/; HttpOnly; SameSite=Strict`,
        location: './',
      })
      response.end()
      return
    }
    if (url.pathname === '/' && request.method === 'GET') {
      if (authenticated) {
        response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
        response.end('<html><title>DSH</title><body>web-ui</body></html>')
      } else {
        response.writeHead(401, { 'content-type': 'text/plain; charset=utf-8' })
        response.end('unauthorized')
      }
      return
    }
    if (url.pathname === '/api/echo' && request.method === 'POST') {
      if (!authenticated) {
        response.writeHead(401)
        response.end('unauthorized')
        return
      }
      const chunks: Buffer[] = []
      request.on('data', chunk => chunks.push(chunk as Buffer))
      request.on('end', () => {
        const body = Buffer.concat(chunks).toString('utf8')
        state.last.body = body
        response.writeHead(200, { 'content-type': 'application/json' })
        response.end(JSON.stringify({ path: request.url, host: request.headers.host, body }))
      })
      return
    }
    if (url.pathname === '/sse' && request.method === 'GET') {
      if (!authenticated) {
        response.writeHead(401)
        response.end()
        return
      }
      response.writeHead(200, { 'content-type': 'text/event-stream' })
      response.write('data: one\n\n')
      setTimeout(() => {
        response.write('data: two\n\n')
        response.end()
      }, 60)
      return
    }
    response.writeHead(404)
    response.end('not found')
  })
  server.on('upgrade', (request, socket) => {
    const url = new URL(request.url ?? '/', 'http://upstream.invalid')
    if (url.pathname === '/ws' && String(request.headers.cookie ?? '').includes(`${HOST_COOKIE_NAME}=v1.valid`)) {
      socket.write('HTTP/1.1 101 Switching Protocols\r\nupgrade: websocket\r\nconnection: Upgrade\r\n\r\n')
      socket.write('upstream-hello')
      socket.on('data', data => socket.write(`echo:${String(data)}`))
      return
    }
    socket.end('HTTP/1.1 404 Not Found\r\nconnection: close\r\n\r\n')
  })
  await new Promise<void>(resolve => {
    server.listen(0, '127.0.0.1', () => resolve())
  })
  cleanups.push(() => server.close())
  const address = server.address() as AddressInfo
  state.server = server
  state.origin = `http://127.0.0.1:${address.port}`
  state.authority = `127.0.0.1:${address.port}`
  return state
}

/** Fake controller-side upstream handle: origin + cached launch-token exchange. */
function makeUpstreamHandle(fake: FakeUpstream, options: { staleFirst?: boolean, origin?: string | null } = {}): UpstreamHandle & { exchangesViaGateway: () => number } {
  let cached: string | null = options.staleFirst === true ? `${HOST_COOKIE_NAME}=v1.stale` : null
  return {
    origin: () => options.origin === undefined ? fake.origin : options.origin,
    authCookieSync: () => cached,
    authCookie: async (force?: boolean) => {
      if (cached !== null && force !== true) return cached
      const response = await fetch(`${fake.origin}/?token=${LAUNCH_TOKEN}`, { redirect: 'manual' })
      const setCookie = response.headers.get('set-cookie') ?? ''
      const value = setCookie.split(';')[0] ?? ''
      cached = value !== '' ? value : null
      return cached
    },
    exchangesViaGateway: () => fake.exchanges,
  }
}

function makeServer(token: string, upstream: UpstreamHandle): RcServer {
  const server = new RcServer({ host: '127.0.0.1', port: 0, token, upstream, log: () => {} })
  cleanups.push(() => server.dispose())
  return server
}

async function listen(server: RcServer): Promise<string> {
  await server.listen()
  return `http://127.0.0.1:${server.port}`
}

function raw(gateway: string, method: string, path: string, headers: Record<string, string> = {}, body?: string): Promise<{ status: number, headers: http.IncomingHttpHeaders, body: string }> {
  return new Promise((resolve, reject) => {
    const request = http.request(new URL(path, gateway), { method, headers }, response => {
      const chunks: Buffer[] = []
      response.on('data', chunk => chunks.push(chunk as Buffer))
      response.on('end', () => resolve({ status: response.statusCode ?? 0, headers: response.headers, body: Buffer.concat(chunks).toString('utf8') }))
    })
    request.on('error', reject)
    if (body !== undefined) request.write(body)
    request.end()
  })
}

const PAIRING = 'pair-token'
const AUTH = { authorization: `Bearer ${PAIRING}` }

describe('pairing gate', () => {
  it('requires the pairing token in every spelling', async () => {
    const fake = await startFakeUpstream()
    const gateway = await listen(makeServer(PAIRING, makeUpstreamHandle(fake)))
    expect((await raw(gateway, 'GET', '/')).status).toBe(401)
    expect((await raw(gateway, 'GET', '/', { authorization: 'Bearer wrong' })).status).toBe(401)
    expect((await raw(gateway, 'GET', '/', AUTH)).status).toBe(200)
    expect((await raw(gateway, 'GET', `/?token=${PAIRING}`)).status).toBe(200)
    // cookie 通道：第一次响应种下配对 cookie，后续请求免 token
    const first = await raw(gateway, 'GET', `/?token=${PAIRING}`)
    const pairingCookie = (first.headers['set-cookie'] ?? []).find(value => value.startsWith('dsh-remote-ctrl='))
    expect(pairingCookie).toBeDefined()
    const value = pairingCookie?.split(';')[0] ?? ''
    expect((await raw(gateway, 'GET', '/', { cookie: value })).status).toBe(200)
  })

  it('rejects a Host header that is not this machine and cross-site mutations', async () => {
    const fake = await startFakeUpstream()
    const gateway = await listen(makeServer(PAIRING, makeUpstreamHandle(fake)))
    const rebinding = await raw(gateway, 'GET', '/', { host: 'attacker.example.com', ...AUTH })
    expect(rebinding.status).toBe(403)
    const crossSite = await raw(gateway, 'POST', '/api/echo', {
      host: '127.0.0.1',
      ...AUTH,
      'sec-fetch-site': 'cross-site',
      origin: 'https://evil.example',
      'content-type': 'application/json',
    }, '{}')
    expect(crossSite.status).toBe(403)
  })

  it('answers 503 while the host webServer is pending', async () => {
    const fake = await startFakeUpstream()
    const gateway = await listen(makeServer(PAIRING, makeUpstreamHandle(fake, { origin: null })))
    const payload = await raw(gateway, 'GET', '/', AUTH)
    expect(payload.status).toBe(503)
    expect(JSON.parse(payload.body)).toMatchObject({ code: 'upstream_unavailable' })
  })
})

describe('reverse proxy', () => {
  it('bootstraps the host cookie server-side and rewrites the upstream Host', async () => {
    const fake = await startFakeUpstream()
    const gateway = await listen(makeServer(PAIRING, makeUpstreamHandle(fake)))
    const page = await raw(gateway, 'GET', `/?token=${PAIRING}`)
    expect(page.status).toBe(200)
    expect(page.body).toContain('web-ui')
    // 上游看到的 Host 是回环 authority；dsh-auth cookie 由网关代换后注入
    expect(fake.last.host).toBe(fake.authority)
    expect(fake.last.cookie).toContain(`${HOST_COOKIE_NAME}=v1.valid`)
    // 首个响应就把宿主 cookie 转发给手机浏览器（连同配对 cookie）
    const cookies = (page.headers['set-cookie'] ?? []).map(value => value.split(';')[0] ?? '')
    expect(cookies.some(value => value.startsWith(`${HOST_COOKIE_NAME}=v1.valid`))).toBe(true)
    expect(cookies.some(value => value.startsWith('dsh-remote-ctrl='))).toBe(true)
  })

  it('keeps the cached cookie: a second visit does not re-exchange', async () => {
    const fake = await startFakeUpstream()
    const handle = makeUpstreamHandle(fake)
    const gateway = await listen(makeServer(PAIRING, handle))
    await raw(gateway, 'GET', '/', AUTH)
    await raw(gateway, 'GET', '/', AUTH)
    expect(handle.exchangesViaGateway()).toBe(1)
  })

  it('streams bodies and responses both ways', async () => {
    const fake = await startFakeUpstream()
    const gateway = await listen(makeServer(PAIRING, makeUpstreamHandle(fake)))
    const echo = await raw(gateway, 'POST', '/api/echo', {
      ...AUTH,
      'content-type': 'application/json',
    }, JSON.stringify({ text: '你好' }))
    expect(echo.status).toBe(200)
    const payload = JSON.parse(echo.body) as { path: string, host: string, body: string }
    expect(payload.body).toBe(JSON.stringify({ text: '你好' }))
    expect(payload.host).toBe(fake.authority)
  })

  it('pipes SSE without buffering the whole stream', async () => {
    const fake = await startFakeUpstream()
    const gateway = await listen(makeServer(PAIRING, makeUpstreamHandle(fake)))
    const response = await fetch(new URL('/sse', gateway), { headers: AUTH })
    expect(response.status).toBe(200)
    const reader = response.body?.getReader()
    const decoder = new TextDecoder()
    const first = decoder.decode((await reader?.read())?.value ?? new Uint8Array())
    const startedAt = Date.now()
    const second = decoder.decode((await reader?.read())?.value ?? new Uint8Array())
    expect(first).toContain('data: one')
    expect(second).toContain('data: two')
    expect(Date.now() - startedAt).toBeGreaterThanOrEqual(40)
    void reader?.cancel().catch(() => {})
  })

  it('re-exchanges a stale cached cookie and replays once', async () => {
    const fake = await startFakeUpstream()
    const handle = makeUpstreamHandle(fake, { staleFirst: true })
    const gateway = await listen(makeServer(PAIRING, handle))
    const page = await raw(gateway, 'GET', '/', AUTH)
    expect(page.status).toBe(200)
    expect(page.body).toContain('web-ui')
    expect(handle.exchangesViaGateway()).toBe(1)
  })

  it('relays websocket upgrades with cookies attached', async () => {
    const fake = await startFakeUpstream()
    const gateway = await listen(makeServer(PAIRING, makeUpstreamHandle(fake)))
    // 先让网关代换 cookie 并回给客户端
    const page = await raw(gateway, 'GET', '/', AUTH)
    const hostCookie = (page.headers['set-cookie'] ?? []).map(value => value.split(';')[0] ?? '')
      .find(value => value.startsWith(`${HOST_COOKIE_NAME}=`)) ?? ''
    const upgradeResult = await new Promise<{ status: number, body: string }>((resolve, reject) => {
      const request = http.request(new URL('/ws', gateway), {
        method: 'GET',
        headers: { ...AUTH, cookie: hostCookie, connection: 'Upgrade', upgrade: 'websocket' },
      })
      request.end()
      request.on('upgrade', (response, socket, head) => {
        const chunks: Buffer[] = [head]
        const seen = (): string => Buffer.concat(chunks).toString('utf8')
        if (seen().includes('upstream-hello')) socket.write('client-ping')
        socket.on('data', (data: Buffer) => {
          chunks.push(data)
          const text = seen()
          if (text.includes('upstream-hello') && !text.includes('client-ping')) socket.write('client-ping')
          if (text.includes('echo:client-ping')) {
            socket.destroy()
            resolve({ status: response.statusCode ?? 0, body: text })
          }
        })
        socket.on('error', reject)
      })
      request.on('error', reject)
    })
    expect(upgradeResult.status).toBe(101)
    expect(upgradeResult.body).toContain('upstream-hello')
    expect(upgradeResult.body).toContain('echo:client-ping')
  })
})
