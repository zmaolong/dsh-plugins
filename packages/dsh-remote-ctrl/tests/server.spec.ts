/**
 * Server specs: the plugin's own HTTP server behind a fake host bridge —
 * token gate, machine-local Host check, same-origin mutations, session
 * routes, prompt passthrough, approval claim/resolve, SSE frames. Loopback
 * port 0 only; nothing reaches the internet.
 */
import http from 'node:http'
import { afterEach, describe, expect, it } from 'vitest'
import { HostBridge } from '../src/bridge.ts'
import { RcServer } from '../src/server.ts'
import type { SessionControllerService, SessionQueryService } from '../src/host.ts'
import type { SessionPromptRequest } from '../src/host.ts'

interface Captured {
  prompts: SessionPromptRequest[]
  logs: Array<{ level: string, message: string }>
}

const cleanups: Array<() => void> = []

afterEach(() => {
  while (cleanups.length > 0) cleanups.pop()?.()
})

function makeBridge(options: {
  sessions?: unknown[]
  events?: unknown
  prompts?: SessionPromptRequest[]
}): HostBridge {
  const controller: SessionControllerService = {
    list: async () => options.sessions ?? [],
    prompt: async request => {
      options.prompts?.push(request)
      return undefined
    },
  }
  const query: SessionQueryService = {
    listSessions: async () => options.sessions ?? [],
    readSession: async () => options.events ?? [],
  }
  const bridge = new HostBridge()
  bridge.attach({ get: (name: string) => (name === 'sessionController' ? controller : undefined) }, 'sessionController')
  bridge.attach({ get: (name: string) => (name === 'sessionQuery' ? query : undefined) }, 'sessionQuery')
  return bridge
}

function makeServer(token: string, bridge: HostBridge): { server: RcServer, base: string, captured: Captured } {
  const captured: Captured = { prompts: [], logs: [] }
  const server = new RcServer({
    host: '127.0.0.1',
    port: 0,
    token,
    bridge,
    log: (level, message) => captured.logs.push({ level, message }),
    mobileScriptFile: 'tests/fixtures/no-such-mobile.js',
  })
  cleanups.push(() => server.dispose())
  return { server, base: '', captured }
}

async function listen(server: RcServer): Promise<string> {
  await server.listen()
  return `http://127.0.0.1:${server.port}`
}

function get(base: string, path: string, headers: Record<string, string> = {}): Promise<{ status: number, body: string }> {
  return raw(base, 'GET', path, headers)
}

function raw(base: string, method: string, path: string, headers: Record<string, string> = {}, body?: string): Promise<{ status: number, body: string }> {
  return new Promise((resolve, reject) => {
    const request = http.request(new URL(path, base), { method, headers }, response => {
      const chunks: Buffer[] = []
      response.on('data', chunk => chunks.push(chunk as Buffer))
      response.on('end', () => resolve({ status: response.statusCode ?? 0, body: Buffer.concat(chunks).toString('utf8') }))
    })
    request.on('error', reject)
    if (body !== undefined) request.write(body)
    request.end()
  })
}

/** Open one SSE connection and keep it open (caller aborts via cleanup). */
async function openStream(base: string, path: string): Promise<Response> {
  const controller = new AbortController()
  cleanups.push(() => controller.abort())
  const response = await fetch(new URL(path, base), { signal: controller.signal })
  expect(response.status).toBe(200)
  return response
}

async function readSse(base: string, path: string, count: number, onOpen?: () => void): Promise<Record<string, unknown>[]> {
  const controller = new AbortController()
  cleanups.push(() => controller.abort())
  const response = await fetch(new URL(path, base), { signal: controller.signal })
  expect(response.status).toBe(200)
  onOpen?.()
  const reader = response.body?.getReader()
  expect(reader).toBeDefined()
  const decoder = new TextDecoder()
  let buffer = ''
  const frames: Record<string, unknown>[] = []
  const deadline = Date.now() + 3000
  while (frames.length < count && Date.now() < deadline) {
    const arrived = await Promise.race([
      reader?.read() ?? Promise.resolve({ done: true, value: undefined }),
      new Promise<'timeout'>(resolve => setTimeout(() => resolve('timeout'), 300)),
    ])
    if (arrived === 'timeout') continue
    const chunk = arrived as { done?: boolean, value?: Uint8Array }
    if (chunk.done) break
    buffer += decoder.decode(chunk.value, { stream: true })
    for (;;) {
      const end = buffer.indexOf('\n\n')
      if (end === -1) break
      const line = buffer.slice(0, end)
      buffer = buffer.slice(end + 2)
      if (line.startsWith('data: ')) frames.push(JSON.parse(line.slice(6)) as Record<string, unknown>)
    }
  }
  void reader?.cancel().catch(() => {})
  return frames
}

describe('page & static', () => {
  it('serves the mobile page shell and the script route', async () => {
    const { server, captured } = makeServer('t0k', makeBridge({}))
    const base = await listen(server)
    const page = await get(base, '/')
    expect(page.status).toBe(200)
    expect(page.body).toContain('DSH 远程控制')
    expect(page.body).toContain('/static/mobile.js')
    const script = await get(base, '/static/mobile.js')
    expect(script.status).toBe(200)
    expect(script.body).toContain('mobile bundle missing')
    expect(captured.logs.some(entry => entry.level === 'warn' && entry.message.includes('mobile.js'))).toBe(true)
  })

  it('answers 404 json for unknown paths', async () => {
    const { server } = makeServer('t0k', makeBridge({}))
    const base = await listen(server)
    const miss = await get(base, '/nowhere')
    expect(miss.status).toBe(404)
    expect(JSON.parse(miss.body)).toMatchObject({ ok: false, code: 'not_found' })
  })
})

describe('auth gate', () => {
  it('requires the pairing token on /api', async () => {
    const { server } = makeServer('secret-token', makeBridge({}))
    const base = await listen(server)
    expect((await get(base, '/api/status')).status).toBe(401)
    expect((await get(base, '/api/status', { authorization: 'Bearer wrong' })).status).toBe(401)
    expect((await get(base, '/api/status', { authorization: 'Bearer secret-token' })).status).toBe(200)
    expect((await get(base, '/api/status?token=secret-token')).status).toBe(200)
  })

  it('rejects a Host header that is not this machine', async () => {
    const { server } = makeServer('secret-token', makeBridge({}))
    const base = await listen(server)
    const rebinding = await raw(base, 'GET', '/api/status', { host: 'attacker.example.com', authorization: 'Bearer secret-token' })
    expect(rebinding.status).toBe(403)
    expect(JSON.parse(rebinding.body)).toMatchObject({ code: 'forbidden_host' })
  })

  it('rejects cross-site and non-JSON mutations', async () => {
    const { server } = makeServer('secret-token', makeBridge({}))
    const base = await listen(server)
    const crossSite = await raw(base, 'POST', '/api/sessions/s1/prompt', {
      host: '127.0.0.1',
      authorization: 'Bearer secret-token',
      'sec-fetch-site': 'cross-site',
      origin: 'https://evil.example',
      'content-type': 'application/json',
    }, JSON.stringify({ text: 'hi' }))
    expect(crossSite.status).toBe(403)
    const crossOrigin = await raw(base, 'POST', '/api/sessions/s1/prompt', {
      host: '127.0.0.1',
      authorization: 'Bearer secret-token',
      origin: 'https://evil.example',
      'content-type': 'application/json',
    }, JSON.stringify({ text: 'hi' }))
    expect(crossOrigin.status).toBe(403)
    const wrongType = await raw(base, 'POST', '/api/sessions/s1/prompt', {
      host: '127.0.0.1',
      authorization: 'Bearer secret-token',
      origin: 'http://127.0.0.1',
      'content-type': 'text/plain',
    }, 'hi')
    expect(wrongType.status).toBe(415)
    const sameOrigin = await raw(base, 'POST', '/api/sessions/s1/prompt', {
      host: '127.0.0.1',
      authorization: 'Bearer secret-token',
      origin: 'http://127.0.0.1',
      'content-type': 'application/json',
    }, JSON.stringify({ text: 'hi' }))
    expect(sameOrigin.status).toBe(200) // 同源 JSON 写请求放行（fixture 的 fake controller 会受理）
  })
})

describe('session routes', () => {
  it('lists normalized sessions and reads history', async () => {
    const bridge = makeBridge({
      sessions: [
        { id: 's1', title: '会话一', status: 'running', updatedAt: 1700000000000, cwd: 'F:/w' },
        { sessionId: 's2', title: '冷会话' },
      ],
      events: [
        { type: 'user/message', message: { content: [{ type: 'text', text: '你好' }] }, timestamp: 1 },
        { type: 'tool/call', name: 'shell', callId: 'c1', arguments: { cmd: 'dir' } },
        { type: 'turn/start' },
      ],
    })
    const { server } = makeServer('tok', bridge)
    const base = await listen(server)
    const list = JSON.parse((await get(base, '/api/sessions', { authorization: 'Bearer tok' })).body)
    expect(list.ok).toBe(true)
    expect(list.data.sessions).toHaveLength(2)
    expect(list.data.sessions[0]).toMatchObject({ id: 's1', title: '会话一', status: 'running' })
    expect(list.data.sessions[1]).toMatchObject({ id: 's2', title: '冷会话' })

    const history = JSON.parse((await get(base, '/api/sessions/s1/events', { authorization: 'Bearer tok' })).body)
    expect(history.ok).toBe(true)
    expect(history.data.items).toHaveLength(2)
    expect(history.data.items[0]).toMatchObject({ kind: 'user', text: '你好' })
    expect(history.data.items[1]).toMatchObject({ kind: 'tool-call', toolName: 'shell', callId: 'c1' })
  })

  it('passes prompts through to sessionController.prompt with a minted requestId', async () => {
    const prompts: SessionPromptRequest[] = []
    const bridge = makeBridge({ sessions: [], prompts })
    const { server } = makeServer('tok', bridge)
    const base = await listen(server)
    const sent = await raw(base, 'POST', '/api/sessions/s1/prompt', {
      host: '127.0.0.1',
      authorization: 'Bearer tok',
      origin: 'http://127.0.0.1',
      'content-type': 'application/json',
    }, JSON.stringify({ text: '帮我跑测试' }))
    expect(sent.status).toBe(200)
    expect(JSON.parse(sent.body)).toMatchObject({ ok: true, data: { queued: true, mode: 'queue' } })
    expect(prompts).toHaveLength(1)
    expect(prompts[0]).toMatchObject({ sessionId: 's1', mode: 'queue', content: [{ type: 'text', text: '帮我跑测试' }] })
    expect(typeof prompts[0]?.requestId).toBe('string')
    expect(prompts[0]?.requestId).not.toBe('')

    const empty = await raw(base, 'POST', '/api/sessions/s1/prompt', {
      host: '127.0.0.1',
      authorization: 'Bearer tok',
      origin: 'http://127.0.0.1',
      'content-type': 'application/json',
    }, JSON.stringify({ text: '  ' }))
    expect(empty.status).toBe(400)
  })

  it('reports bridge readiness and session errors in /api/status', async () => {
    const { server } = makeServer('tok', makeBridge({}))
    const base = await listen(server)
    const payload = JSON.parse((await get(base, '/api/status', { authorization: 'Bearer tok' })).body)
    expect(payload.ok).toBe(true)
    expect(payload.data.bridge).toEqual({ controller: true, query: true })
    expect(payload.data.sessions).toEqual([])
    expect(payload.data.pending).toEqual([])
    expect(payload.data.server).toMatchObject({ host: '127.0.0.1' })
  })
})

describe('approval claim', () => {
  it('claims only while a phone is connected', async () => {
    const { server } = makeServer('tok', makeBridge({}))
    await listen(server)
    const next = (): string => 'rejected'
    expect(server.claimApproval({ agent: { session: { id: 's1' } }, toolName: 'shell' }, next)).toBe('rejected')
    expect(server.claimQuestion(
      { agent: { session: { id: 's1' } }, wait: { callId: 'q1' }, questions: [{ id: 'a', question: '？' }] },
      next,
    )).toBe('rejected')
  })

  it('resolves the claimed approval from the phone decision', async () => {
    const { server } = makeServer('tok', makeBridge({}))
    const base = await listen(server)
    const frames = await readSse(base, '/api/stream?token=tok', 2)
    expect(frames[0]).toMatchObject({ type: 'hello' })
    expect(frames[1]).toMatchObject({ type: 'pending', cards: [] })

    const claim = server.claimApproval(
      { agent: { session: { id: 's1' } }, toolName: 'shell', callId: 'c1', reason: '执行 dir' },
      () => new Promise<string>(() => { /* desktop pending */ }),
    ) as Promise<string>
    await new Promise(resolve => setTimeout(resolve, 30))
    const cards = JSON.parse((await get(base, '/api/status', { authorization: 'Bearer tok' })).body).data.pending
    expect(cards).toHaveLength(1)
    expect(cards[0]).toMatchObject({ id: 'c1', kind: 'approval', sessionId: 's1', toolName: 'shell', reason: '执行 dir' })

    const resolved = await raw(base, 'POST', '/api/pending/approvals/c1', {
      host: '127.0.0.1',
      authorization: 'Bearer tok',
      origin: 'http://127.0.0.1',
      'content-type': 'application/json',
    }, JSON.stringify({ outcome: 'allowed-once' }))
    expect(resolved.status).toBe(200)
    await expect(claim).resolves.toBe('allowed-once')

    const replay = await raw(base, 'POST', '/api/pending/approvals/c1', {
      host: '127.0.0.1',
      authorization: 'Bearer tok',
      origin: 'http://127.0.0.1',
      'content-type': 'application/json',
    }, JSON.stringify({ outcome: 'rejected' }))
    expect(replay.status).toBe(404)
  })

  it('prefers a downstream answer that already settled', async () => {
    const { server } = makeServer('tok', makeBridge({}))
    const base = await listen(server)
    await readSse(base, '/api/stream?token=tok', 1)
    const claim = server.claimApproval(
      { agent: { session: { id: 's1' } }, toolName: 'shell', callId: 'c2' },
      () => Promise.resolve('rejected'),
    ) as Promise<string>
    await expect(claim).resolves.toBe('rejected')
  })

  it('maps an aborted approval request to cancelled', async () => {
    const { server } = makeServer('tok', makeBridge({}))
    const base = await listen(server)
    await readSse(base, '/api/stream?token=tok', 1)
    const controller = new AbortController()
    const claim = server.claimApproval(
      { agent: { session: { id: 's1' } }, toolName: 'shell', callId: 'c3', signal: controller.signal },
      () => new Promise<string>(() => { /* desktop pending */ }),
    ) as Promise<string>
    controller.abort()
    await expect(claim).resolves.toBe('cancelled')
  })

  it('claims a user-question and aggregates per-item answers into the official shape', async () => {
    const { server } = makeServer('tok', makeBridge({}))
    const base = await listen(server)
    await openStream(base, '/api/stream?token=tok') // 保持手机在线以便认领
    const claim = server.claimQuestion(
      {
        agent: { session: { id: 's1' } },
        wait: { callId: 'q1' },
        questions: [
          { id: 'port', question: '远程控制端口用哪个？', options: [{ label: '31080' }, { label: '32000' }] },
          { id: 'mode', question: '队还是插队？' },
        ],
      },
      () => new Promise(() => { /* desktop pending */ }),
    ) as Promise<unknown>
    await new Promise(resolve => setTimeout(resolve, 30))
    const cards = JSON.parse((await get(base, '/api/status', { authorization: 'Bearer tok' })).body).data.pending
    expect(cards).toHaveLength(2)
    expect(cards[0]).toMatchObject({ id: 'q-q1::port', kind: 'question', question: '远程控制端口用哪个？', options: ['31080', '32000'] })
    expect(cards[1]).toMatchObject({ id: 'q-q1::mode', kind: 'question', question: '队还是插队？' })

    const answerHeaders = {
      host: '127.0.0.1',
      authorization: 'Bearer tok',
      origin: 'http://127.0.0.1',
      'content-type': 'application/json',
    }
    const first = await raw(base, 'POST', `/api/pending/questions/${encodeURIComponent('q-q1::port')}`, answerHeaders, JSON.stringify({ selected: ['31080'] }))
    expect(first.status).toBe(200)
    // 一题未答：claim 仍挂起，剩一张卡
    const still = JSON.parse((await get(base, '/api/status', { authorization: 'Bearer tok' })).body).data.pending
    expect(still).toHaveLength(1)
    const second = await raw(base, 'POST', `/api/pending/questions/${encodeURIComponent('q-q1::mode')}`, answerHeaders, JSON.stringify({ custom: '插队' }))
    expect(second.status).toBe(200)
    await expect(claim).resolves.toEqual({
      answers: [
        { id: 'port', selected: ['31080'] },
        { id: 'mode', selected: [], custom: '插队' },
      ],
    })
    // 全部答完：pending 清空
    const done = JSON.parse((await get(base, '/api/status', { authorization: 'Bearer tok' })).body).data.pending
    expect(done).toHaveLength(0)
  })

  it('broadcasts pending snapshots on SSE when a question arrives', async () => {
    const { server } = makeServer('tok', makeBridge({}))
    const base = await listen(server)
    const framesPromise = readSse(base, '/api/stream?token=tok', 3)
    await new Promise(resolve => setTimeout(resolve, 30))
    void server.claimQuestion(
      { agent: { session: { id: 's1' } }, wait: { callId: 'q1' }, questions: [{ id: 'go', question: '继续吗？', options: ['是', '否'] }] },
      () => new Promise(() => { /* desktop pending */ }),
    )
    const frames = await framesPromise
    // 帧序列：hello → pending(空快照) → pending(带问题卡)；取最后一份快照。
    const pending = [...frames].reverse().find(frame => frame.type === 'pending') as { cards: Array<Record<string, unknown>> } | undefined
    expect(pending?.cards).toHaveLength(1)
    expect(pending?.cards[0]).toMatchObject({ id: 'q-q1::go', kind: 'question', question: '继续吗？', options: ['是', '否'] })
  })
})

describe('SSE', () => {
  it('pushes items only to the watcher of the session', async () => {
    const { server } = makeServer('tok', makeBridge({}))
    const base = await listen(server)
    const framesPromise = readSse(base, `/api/stream?sid=${encodeURIComponent('s1')}&token=tok`, 3)
    await new Promise(resolve => setTimeout(resolve, 30))
    server.broadcastItem('s1', { id: 'k1', kind: 'user', text: '在吗' })
    server.broadcastItem('s2', { id: 'k2', kind: 'user', text: '不是这个会话' })
    server.broadcastStream('s1', 'chunk', '你好')
    const frames = await framesPromise
    const types = frames.map(frame => frame.type)
    expect(types).toContain('hello')
    expect(types).toContain('item')
    expect(types).toContain('stream')
    const item = frames.find(frame => frame.type === 'item') as { sessionId?: string }
    expect(item.sessionId).toBe('s1')
  })
})
