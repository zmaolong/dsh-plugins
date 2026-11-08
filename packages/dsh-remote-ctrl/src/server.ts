/**
 * The plugin's own HTTP server (node:http) — the LAN data plane the phone
 * browser talks to. It deliberately does not ride the host webServer: the
 * host rejects wildcard binds, while remote control wants every interface
 * address reachable, so the plugin owns one listener on `config.host`
 * (default 0.0.0.0) + `config.port`.
 *
 * Surface:
 * - `GET /` — the mobile page (self-contained HTML + `/static/mobile.js`);
 * - `GET /api/status` — bootstrap snapshot (sessions + pending cards);
 * - `GET /api/sessions`, `GET /api/sessions/:id/events` — lists and history;
 * - `POST /api/sessions/:id/prompt` — send a user message (queue);
 * - `POST /api/pending/approvals/:id` — resolve a claimed tool approval;
 * - `POST /api/pending/questions/:id` — answer an ask-user question;
 * - `GET /api/stream?sid=` — SSE: hello, sessions, item, stream, pending.
 *
 * Every /api request passes `checkApiAccess` (token + machine-local Host +
 * same-origin mutations). Approval answers ride the `approval/request`
 * waterfall: claimed only while at least one phone is connected, raced
 * against the rest of the answerer chain so the desktop UI stays a
 * first-responder.
 *
 * @module dsh-remote-ctrl/server
 */

import http from 'node:http'
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { checkApiAccess, type GateRequest } from './auth.ts'
import type { HostBridge } from './bridge.ts'
import { renderPage } from './html.ts'
import {
  historyEventsOf,
  normalizeEventItem,
  normalizeSessionSummary,
  type Item,
  type PendingCard,
  type SessionSummary,
} from './view.ts'

type LogLevel = 'debug' | 'info' | 'warn' | 'error'

export interface RcServerOptions {
  host: string
  port: number
  token: string
  bridge: HostBridge
  log: (level: LogLevel, message: string) => void
  /** Override for tests; defaults to the built `lib/mobile.js` beside index.js. */
  mobileScriptFile?: string
}

interface SseClient {
  id: string
  res: ServerResponse
  watched: string | null
}

interface ApprovalEntry {
  key: string
  sessionId: string
  toolName: string
  reason: string
  done: boolean
  resolve: (outcome: string) => void
}

const APPROVAL_OUTCOMES = new Set(['allowed-once', 'rejected', 'cancelled'])
const MAX_BODY_BYTES = 256 * 1024
const HEARTBEAT_MS = 15_000

function sendJson(response: ServerResponse, status: number, payload: unknown): void {
  const body = JSON.stringify(payload)
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'content-length': Buffer.byteLength(body),
  })
  response.end(body)
}

function readJsonBody(request: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let size = 0
    request.on('data', (chunk: Buffer) => {
      size += chunk.length
      if (size > MAX_BODY_BYTES) {
        reject(new Error('请求体过大'))
        request.destroy()
        return
      }
      chunks.push(chunk)
    })
    request.on('end', () => {
      if (chunks.length === 0) {
        resolve({})
        return
      }
      try {
        const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown
        if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
          reject(new Error('请求体必须是 JSON 对象'))
          return
        }
        resolve(parsed as Record<string, unknown>)
      } catch {
        reject(new Error('请求体不是合法 JSON'))
      }
    })
    request.on('error', error => reject(error))
  })
}

function isThenable(value: unknown): value is Promise<unknown> {
  return typeof value === 'object' && value !== null && typeof (value as Promise<unknown>).then === 'function'
}

/** The abort-signal face the approval request carries. */
interface AbortSignalFace {
  aborted?: boolean
  addEventListener?: (type: string, listener: () => void, options?: { once?: boolean }) => void
}

/** Extract the fields the approval answerer needs from an ApprovalRequest. */
function extractApprovalRequest(request: unknown): {
  key: string
  sessionId: string
  toolName: string
  reason: string
  signal: AbortSignalFace | undefined
} | null {
  if (request === null || typeof request !== 'object') return null
  const record = request as Record<string, unknown>
  const agent = record.agent as Record<string, unknown> | null | undefined
  const session = agent?.session as Record<string, unknown> | null | undefined
  const sessionId = typeof session?.id === 'string'
    ? session.id
    : typeof agent?.sessionId === 'string' ? agent.sessionId : ''
  const callId = typeof record.callId === 'string' && record.callId !== '' ? record.callId : ''
  return {
    key: callId !== '' ? callId : `ap-${randomUUID()}`,
    sessionId,
    toolName: typeof record.toolName === 'string' ? record.toolName : '',
    reason: typeof record.reason === 'string' ? record.reason : '',
    signal: record.signal as AbortSignalFace | undefined,
  }
}

/** The per-question item face of `AskUserQuestionRequestEvent.questions[]`. */
interface QuestionItemFace {
  id: string
  question: string
  detail: string
  options: string[]
  multiSelect: boolean
  answered: boolean
}

/** One claimed user-questions request awaiting phone answers. */
interface QuestionEntry {
  key: string
  agent: unknown
  sessionId: string
  items: QuestionItemFace[]
  answers: Array<{ id: string, selected: string[], custom?: string }>
  done: boolean
  resolve: (answer: unknown) => void
}

/**
 * Extract the fields the phone question cards need from an
 * `AskUserQuestionRequestEvent` (`{questions:[{id,question,options…}], agent,
 * wait?:{callId}}`); one card per question item.
 */
function extractQuestionRequest(request: unknown): { key: string, agent: unknown, sessionId: string, items: QuestionItemFace[] } | null {
  if (request === null || typeof request !== 'object') return null
  const record = request as Record<string, unknown>
  const agent = record.agent
  if (agent === undefined || agent === null) return null
  const agentRecord = agent as Record<string, unknown>
  const session = agentRecord.session as Record<string, unknown> | null | undefined
  const sessionId = typeof session?.id === 'string'
    ? session.id
    : typeof agentRecord.sessionId === 'string' ? agentRecord.sessionId : ''
  const wait = asWait(record.wait)
  const rawQuestions = Array.isArray(record.questions) ? record.questions : []
  const items: QuestionItemFace[] = []
  for (const raw of rawQuestions.slice(0, 6)) {
    if (raw === null || typeof raw !== 'object') continue
    const item = raw as Record<string, unknown>
    const id = typeof item.id === 'string' && item.id !== '' ? item.id : ''
    const question = typeof item.question === 'string' ? item.question : ''
    if (id === '' || question === '') continue
    const options: string[] = []
    if (Array.isArray(item.options)) {
      for (const option of item.options.slice(0, 8)) {
        if (typeof option === 'string' && option.trim() !== '') options.push(option.trim())
        else if (option !== null && typeof option === 'object') {
          const entry = option as Record<string, unknown>
          const label = [entry.label, entry.title, entry.value, entry.text].find(value => typeof value === 'string' && value !== '')
          if (typeof label === 'string') options.push(label)
        }
      }
    }
    items.push({
      id,
      question,
      detail: typeof item.detail === 'string' ? item.detail : '',
      options,
      multiSelect: item.multiSelect === true,
      answered: false,
    })
  }
  if (items.length === 0) return null
  const key = `q-${wait?.callId !== undefined && wait.callId !== '' ? wait.callId : items[0]?.id ?? randomUUID()}`
  return { key, agent, sessionId, items }
}

function asWait(value: unknown): { callId: string } | null {
  if (value === null || typeof value !== 'object') return null
  const record = value as Record<string, unknown>
  return typeof record.callId === 'string' ? { callId: record.callId } : null
}

/** One SSE frame as `data: <json>\n\n`. */
function frameLine(frame: Record<string, unknown>): string {
  return `data: ${JSON.stringify(frame)}\n\n`
}

export class RcServer {
  private http: http.Server | null = null
  private readonly clients = new Map<string, SseClient>()
  private readonly approvals = new Map<string, ApprovalEntry>()
  private readonly questions = new Map<string, QuestionEntry>()
  private heartbeat: NodeJS.Timeout | null = null
  private mobileScript: Buffer | null = null
  private readonly address: { host: string, port: number }
  listening = false
  listenError = ''

  constructor(private readonly options: RcServerOptions) {
    this.address = { host: options.host, port: options.port }
  }

  /** Connected phone clients. */
  get clientCount(): number {
    return this.clients.size
  }

  /** Actual port after listen (port 0 resolves to the OS-assigned value). */
  get port(): number {
    return this.address.port
  }

  /** Bind and start serving. Resolves once the listener is up. */
  async listen(): Promise<void> {
    const server = http.createServer((request, response) => {
      void this.handle(request, response)
    })
    server.requestTimeout = 0
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject)
      server.listen(this.options.port, this.options.host, () => resolve())
    })
    this.http = server
    this.listening = true
    this.listenError = ''
    const addr = server.address()
    if (addr !== null && typeof addr === 'object') this.address.port = addr.port
    this.heartbeat = setInterval(() => this.ping(), HEARTBEAT_MS)
    this.heartbeat.unref?.()
    this.options.log('info', `远程控制服务已监听 http://${this.options.host}:${this.address.port}/`)
  }

  /** Stop serving, drop every client, and fail-closed the claimed approvals. */
  dispose(): void {
    if (this.heartbeat !== null) {
      clearInterval(this.heartbeat)
      this.heartbeat = null
    }
    for (const client of this.clients.values()) {
      try {
        client.res.end()
      } catch {
        /* the socket may already be gone */
      }
    }
    this.clients.clear()
    for (const entry of this.approvals.values()) {
      if (!entry.done) {
        entry.done = true
        try {
          entry.resolve('cancelled')
        } catch {
          /* the awaiting waterfall is being torn down anyway */
        }
      }
    }
    this.approvals.clear()
    this.questions.clear()
    if (this.http !== null) {
      const server = this.http
      this.http = null
      try {
        server.close()
      } catch {
        /* already closed */
      }
    }
    this.listening = false
  }

  // ---------------------------------------------------------------- listeners

  /**
   * The `approval/request` waterfall answerer. Claims the request only while
   * a phone is connected; the rest of the answerer chain is engaged too, so
   * desktop and phone race and the first decision wins at the service.
   */
  claimApproval(request: unknown, next: () => unknown): unknown {
    if (this.clientCount === 0) return next()
    const info = extractApprovalRequest(request)
    if (info === null) return next()
    const downstream = next()
    return new Promise<string>(resolve => {
      const entry: ApprovalEntry = {
        key: info.key,
        sessionId: info.sessionId,
        toolName: info.toolName,
        reason: info.reason,
        done: false,
        resolve: outcome => {
          if (entry.done) return
          entry.done = true
          this.approvals.delete(entry.key)
          this.broadcastPending()
          resolve(outcome)
        },
      }
      this.approvals.set(entry.key, entry)
      this.broadcastPending()
      if (isThenable(downstream)) {
        Promise.resolve(downstream).then(value => {
          if (typeof value === 'string' && APPROVAL_OUTCOMES.has(value)) entry.resolve(value)
        }, () => { /* downstream failed; the phone decision (or abort) decides */ })
      }
      const signal = info.signal
      if (signal !== undefined && signal !== null && typeof signal.addEventListener === 'function') {
        if (signal.aborted === true) entry.resolve('cancelled')
        else signal.addEventListener('abort', () => entry.resolve('cancelled'), { once: true })
      }
    })
  }

  /** `approval/decided` observed on the session log: drop a matching card if any. */
  dropApproval(callId: string): void {
    if (callId === '') return
    if (this.approvals.delete(callId)) this.broadcastPending()
  }

  /**
   * The `user-questions/request` waterfall answerer. Same policy as
   * approvals: claim only while a phone is connected, race the rest of the
   * chain (desktop UI stays a first-responder), resolve with the official
   * `AskUserQuestionAnswer` shape once every question item has an answer.
   */
  claimQuestion(request: unknown, next: () => unknown): unknown {
    if (this.clientCount === 0) return next()
    const info = extractQuestionRequest(request)
    if (info === null) return next()
    const downstream = next()
    return new Promise<unknown>(resolve => {
      const entry: QuestionEntry = {
        key: info.key,
        agent: info.agent,
        sessionId: info.sessionId,
        items: info.items,
        answers: [],
        done: false,
        resolve: answer => {
          if (entry.done) return
          entry.done = true
          this.questions.delete(entry.key)
          this.broadcastPending()
          resolve(answer)
        },
      }
      this.questions.set(entry.key, entry)
      this.broadcastPending()
      if (isThenable(downstream)) {
        Promise.resolve(downstream).then(value => {
          if (value !== null && typeof value === 'object' && Array.isArray((value as { answers?: unknown }).answers)) {
            entry.resolve(value)
          }
        }, () => { /* downstream declined; the phone decision decides */ })
      }
      const signal = (request as Record<string, unknown>).signal as AbortSignalFace | undefined
      if (signal !== undefined && signal !== null && typeof signal.addEventListener === 'function') {
        if (signal.aborted === true) entry.resolve(undefined)
        else signal.addEventListener('abort', () => entry.resolve(undefined), { once: true })
      }
    })
  }

  /** Record one answered question item; resolve the claim when all items are in. */
  answerQuestionItem(cardId: string, payload: Record<string, unknown>): { id: string } {
    const separator = cardId.indexOf('::')
    const key = separator === -1 ? cardId : cardId.slice(0, separator)
    const itemId = separator === -1 ? '' : cardId.slice(separator + 2)
    const entry = this.questions.get(key)
    if (entry === undefined) throw new Error('该提问不存在或已被回答')
    const item = entry.items.find(candidate => candidate.id === itemId && !candidate.answered)
    if (item === undefined) throw new Error('该问题不存在或已被回答')
    const selected = Array.isArray(payload.selected) ? payload.selected.map(value => String(value)) : []
    const custom = typeof payload.custom === 'string' && payload.custom.trim() !== '' ? payload.custom.trim() : undefined
    if (selected.length === 0 && custom === undefined) {
      throw new Error('回答需要 selected 选项或 custom 文本')
    }
    item.answered = true
    entry.answers.push(custom !== undefined
      ? { id: item.id, selected, ...(custom !== undefined ? { custom } : {}) }
      : { id: item.id, selected })
    if (entry.answers.length >= entry.items.length) {
      entry.resolve({ answers: entry.answers })
      return { id: cardId }
    }
    this.broadcastPending()
    return { id: cardId }
  }

  /** Drop a question card when the host reports it answered elsewhere. */
  dropQuestion(callId: string): void {
    if (callId === '') return
    if (this.questions.delete(`q-${callId}`)) this.broadcastPending()
  }

  // ------------------------------------------------------------------ publish

  /** New history item for one session; pushed to clients watching it. */
  broadcastItem(sessionId: string, item: Item): void {
    for (const client of this.clients.values()) {
      if (client.watched === sessionId) this.send(client, { type: 'item', sessionId, item })
    }
  }

  /** Assistant stream frame; pushed to clients watching the session. */
  broadcastStream(sessionId: string, phase: 'start' | 'chunk' | 'end', text: string): void {
    for (const client of this.clients.values()) {
      if (client.watched === sessionId) this.send(client, { type: 'stream', sessionId, phase, text })
    }
  }

  /** Fresh session list to every client (used on api-session/* churn). */
  async broadcastSessions(): Promise<void> {
    const sessions = await this.listSessions()
    for (const client of this.clients.values()) this.send(client, { type: 'sessions', sessions })
  }

  /** Pending-card snapshot to every client. */
  broadcastPending(): void {
    const cards = this.pendingCards()
    for (const client of this.clients.values()) this.send(client, { type: 'pending', cards })
  }

  /** Pending cards snapshot (approvals claimed by this server + questions). */
  pendingCards(): PendingCard[] {
    const cards: PendingCard[] = []
    for (const entry of this.approvals.values()) {
      cards.push({
        id: entry.key,
        kind: 'approval',
        sessionId: entry.sessionId,
        ...(entry.toolName !== '' ? { toolName: entry.toolName } : {}),
        ...(entry.reason !== '' ? { reason: entry.reason } : {}),
      })
    }
    for (const entry of this.questions.values()) {
      for (const item of entry.items) {
        if (item.answered) continue
        cards.push({
          id: `${entry.key}::${item.id}`,
          kind: 'question',
          sessionId: entry.sessionId,
          question: item.question,
          ...(item.detail !== '' ? { detail: item.detail } : {}),
          ...(item.options.length > 0 ? { options: item.options } : {}),
          ...(item.multiSelect ? { multiSelect: true } : {}),
        })
      }
    }
    return cards
  }

  /** Bootstrap payload of GET /api/status. */
  async statusData(): Promise<Record<string, unknown>> {
    let sessions: SessionSummary[] = []
    let sessionsError: string | null = null
    try {
      sessions = await this.listSessions()
    } catch (error) {
      sessionsError = error instanceof Error ? error.message : String(error)
    }
    return {
      server: { host: this.address.host, port: this.address.port },
      clientCount: this.clientCount,
      bridge: this.options.bridge.readiness(),
      sessions,
      pending: this.pendingCards(),
      ...(sessionsError !== null ? { sessionsError } : {}),
    }
  }

  /** Normalized session list from the bridge. */
  async listSessions(): Promise<SessionSummary[]> {
    const rows = await this.options.bridge.listSessions()
    const sessions: SessionSummary[] = []
    for (const row of rows) {
      const summary = normalizeSessionSummary(row)
      if (summary !== null) sessions.push(summary)
    }
    return sessions
  }

  // ------------------------------------------------------------------- routes

  private async handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const url = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`)
    const pathname = url.pathname
    try {
      if (pathname === '/' || pathname === '/index.html') {
        this.sendPage(response)
        return
      }
      if (pathname === '/static/mobile.js') {
        this.sendMobileScript(response)
        return
      }
      if (pathname === '/favicon.ico') {
        // 内联 SVG 图标：避免浏览器默认请求在控制台留下 404 噪音。
        const icon = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#2563eb"/><rect x="21" y="10" width="22" height="40" rx="5" fill="none" stroke="#fff" stroke-width="4"/><line x1="30" y1="45" x2="34" y2="45" stroke="#fff" stroke-width="4" stroke-linecap="round"/></svg>'
        response.writeHead(200, {
          'content-type': 'image/svg+xml',
          'cache-control': 'public, max-age=86400',
          'content-length': Buffer.byteLength(icon),
        })
        response.end(icon)
        return
      }
      if (!pathname.startsWith('/api/')) {
        sendJson(response, 404, { ok: false, error: '未知路径', code: 'not_found' })
        return
      }
      const gate = checkApiAccess(request as unknown as GateRequest, this.options.token)
      if (!gate.ok) {
        sendJson(response, gate.status, { ok: false, error: gate.message, code: gate.code })
        return
      }
      await this.handleApi(pathname, url, request, response)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      this.options.log('warn', `请求 ${pathname} 失败：${message}`)
      if (!response.headersSent) {
        sendJson(response, 500, { ok: false, error: message, code: 'internal' })
      } else {
        response.end()
      }
    }
  }

  private async handleApi(pathname: string, url: URL, request: IncomingMessage, response: ServerResponse): Promise<void> {
    const method = (request.method ?? 'GET').toUpperCase()
    if (pathname === '/api/stream' && method === 'GET') {
      this.openStream(url, request, response)
      return
    }
    if (pathname === '/api/status' && method === 'GET') {
      sendJson(response, 200, { ok: true, data: await this.statusData() })
      return
    }
    if (pathname === '/api/sessions' && method === 'GET') {
      sendJson(response, 200, { ok: true, data: { sessions: await this.listSessions() } })
      return
    }
    const events = /^\/api\/sessions\/([^/]+)\/events$/.exec(pathname)
    if (events !== null && method === 'GET') {
      const sessionId = decodeURIComponent(events[1] ?? '')
      const payload = await this.options.bridge.readEvents(sessionId)
      const items: Item[] = []
      for (const raw of historyEventsOf(payload)) {
        const item = normalizeEventItem(raw)
        if (item !== null) items.push(item)
      }
      sendJson(response, 200, { ok: true, data: { sessionId, items } })
      return
    }
    const prompt = /^\/api\/sessions\/([^/]+)\/prompt$/.exec(pathname)
    if (prompt !== null && method === 'POST') {
      const body = await readJsonBody(request)
      const text = typeof body.text === 'string' ? body.text.trim() : ''
      if (text === '') {
        sendJson(response, 400, { ok: false, error: '消息不能为空', code: 'bad_request' })
        return
      }
      const mode = body.mode === 'steer' ? 'steer' : 'queue'
      await this.options.bridge.prompt(decodeURIComponent(prompt[1] ?? ''), text, mode)
      sendJson(response, 200, { ok: true, data: { queued: true, mode } })
      return
    }
    const approval = /^\/api\/pending\/approvals\/([^/]+)$/.exec(pathname)
    if (approval !== null && method === 'POST') {
      const body = await readJsonBody(request)
      const outcome = typeof body.outcome === 'string' && APPROVAL_OUTCOMES.has(body.outcome) ? body.outcome : ''
      if (outcome === '') {
        sendJson(response, 400, { ok: false, error: 'outcome 必须是 allowed-once / rejected / cancelled', code: 'bad_request' })
        return
      }
      const key = decodeURIComponent(approval[1] ?? '')
      const entry = this.approvals.get(key)
      if (entry === undefined) {
        sendJson(response, 404, { ok: false, error: '该审批不存在或已被处理', code: 'not_found' })
        return
      }
      entry.resolve(outcome)
      sendJson(response, 200, { ok: true, data: { id: key, outcome } })
      return
    }
    const question = /^\/api\/pending\/questions\/([^/]+)$/.exec(pathname)
    if (question !== null && method === 'POST') {
      const body = await readJsonBody(request)
      const cardId = decodeURIComponent(question[1] ?? '')
      const result = this.answerQuestionItem(cardId, body)
      sendJson(response, 200, { ok: true, data: result })
      return
    }
    sendJson(response, 404, { ok: false, error: `未知接口：${pathname}`, code: 'not_found' })
  }

  private openStream(url: URL, request: IncomingMessage, response: ServerResponse): void {
    response.writeHead(200, {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-store',
      connection: 'keep-alive',
      'x-accel-buffering': 'no',
    })
    const client: SseClient = {
      id: randomUUID(),
      res: response,
      watched: url.searchParams.get('sid') || null,
    }
    this.clients.set(client.id, client)
    this.send(client, { type: 'hello', watched: client.watched })
    this.send(client, { type: 'pending', cards: this.pendingCards() })
    request.on('close', () => {
      this.clients.delete(client.id)
    })
  }

  private ping(): void {
    for (const client of this.clients.values()) {
      try {
        client.res.write(': ping\n\n')
      } catch {
        this.clients.delete(client.id)
      }
    }
  }

  private send(client: SseClient, frame: Record<string, unknown>): void {
    try {
      client.res.write(frameLine(frame))
    } catch {
      this.clients.delete(client.id)
    }
  }

  private sendPage(response: ServerResponse): void {
    const body = renderPage()
    response.writeHead(200, {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
      'content-length': Buffer.byteLength(body),
      'x-content-type-options': 'nosniff',
    })
    response.end(body)
  }

  private sendMobileScript(response: ServerResponse): void {
    if (this.mobileScript === null) {
      const file = this.options.mobileScriptFile ?? new URL('./mobile.js', import.meta.url)
      try {
        this.mobileScript = readFileSync(file)
      } catch {
        this.mobileScript = Buffer.from('/* mobile bundle missing: run `npm run build` */', 'utf8')
        this.options.log('warn', `lib/mobile.js 缺失（${String(file)}），请先构建`)
      }
    }
    const body = this.mobileScript
    response.writeHead(200, {
      'content-type': 'text/javascript; charset=utf-8',
      'cache-control': 'no-store',
      'content-length': body.length,
      'x-content-type-options': 'nosniff',
    })
    response.end(body)
  }
}
