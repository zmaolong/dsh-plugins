/**
 * The RemoteCtrl controller: owns config resolution (home/host/port/token),
 * the LAN server lifecycle, and the host-event handlers `apply` subscribes.
 * The desktop panel reads {@link panelStatus} through the host webServer
 * route (loopback only); the phone talks to the RcServer directly.
 *
 * @module dsh-remote-ctrl/remote-ctrl
 */

import { randomUUID } from 'node:crypto'
import { mkdirSync } from 'node:fs'
import os from 'node:os'
import { join } from 'node:path'
import { loadOrCreateToken } from './auth.ts'
import { HostBridge } from './bridge.ts'
import { lanAddresses } from './ip.ts'
import { RcServer } from './server.ts'
import { normalizeEventItem, normalizeStreamFrame } from './view.ts'
import type { HostContext, RemoteCtrlConfig } from './host.ts'
import type { Item } from './view.ts'

/** Package version surfaced in logs. */
export const REMOTE_CTRL_VERSION = '0.0.1-preview.0'

const LOG_PREFIX = 'dsh-remote-ctrl: '

/** One LAN address the server answers on. */
export interface PanelAddress {
  address: string
  scope: string
  url: string
}

/** Status payload the desktop panel renders. */
export interface PanelStatus {
  active: boolean
  listening: boolean
  error: string
  host: string
  port: number
  addresses: PanelAddress[]
  recommendedUrl: string
  qrUrl: string
  token: string
  clientCount: number
  bridge: { controller: boolean, query: boolean }
}

/** Resolve the persistence home: config → env → ~/.dsh/remote-ctrl. */
export function resolveHome(configured: string | undefined): string {
  const explicit = configured?.trim() ?? ''
  if (explicit !== '') return explicit
  const fromEnv = process.env.DSH_REMOTE_CTRL_HOME?.trim() ?? ''
  if (fromEnv !== '') return fromEnv
  return join(os.homedir(), '.dsh', 'remote-ctrl')
}

export class RemoteCtrl {
  readonly home: string
  readonly bridge = new HostBridge()
  readonly warnings: string[] = []
  private readonly configHost: string
  private readonly configPort: number
  private readonly configToken: string
  private server: RcServer | null = null
  private token = ''
  private sessionsRefresh: NodeJS.Timeout | null = null

  constructor(
    private readonly ctx: HostContext,
    config: RemoteCtrlConfig = {},
  ) {
    this.home = resolveHome(config.home)
    const host = config.host?.trim() ?? ''
    this.configHost = host !== '' ? host : '0.0.0.0'
    const port = Number(config.port)
    this.configPort = Number.isFinite(port) && port >= 0 && port <= 65535 ? Math.trunc(port) : 31080
    this.configToken = typeof config.token === 'string' ? config.token : ''
  }

  /** Create the token and start listening; failures degrade to status, never throw. */
  start(): void {
    try {
      mkdirSync(this.home, { recursive: true })
    } catch {
      /* token persistence reports its own error below */
    }
    try {
      this.token = loadOrCreateToken(this.home, this.configToken)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      this.token = randomUUID().replace(/-/gu, '')
      this.warnings.push(`配对码无法持久化（${message}），本次运行使用临时配对码`)
      this.log('warn', `配对码无法持久化到 ${this.home}：${message}；本次运行使用临时配对码`)
    }
    const server = new RcServer({
      host: this.configHost,
      port: this.configPort,
      token: this.token,
      bridge: this.bridge,
      log: (level, message) => this.log(level, message),
    })
    this.server = server
    server.listen().catch(error => {
      const message = error instanceof Error ? error.message : String(error)
      server.listenError = message
      this.log('error', `启动远程控制服务失败（host=${this.configHost} port=${this.configPort}，端口被占用？）：${message}`)
    })
  }

  log(level: 'debug' | 'info' | 'warn' | 'error', message: string): void {
    const line = `${LOG_PREFIX}${message}`
    try {
      this.ctx.logger?.[level]?.(line)
    } catch {
      /* logging must never break the plugin */
    }
  }

  /** Panel data plane status. */
  panelStatus(): PanelStatus {
    const server = this.server
    const port = server?.port ?? this.configPort
    const addresses: PanelAddress[] = lanAddresses().map(entry => ({
      address: entry.address,
      scope: entry.scope,
      url: `http://${entry.family === 6 ? `[${entry.address}]` : entry.address}:${port}/`,
    }))
    // 二维码挑第一个私网 IPv4（手机最可能可达的地址）；没有私网时退回第一个地址。
    const recommended = addresses.find(entry => entry.scope === 'private') ?? addresses[0] ?? null
    const origin = (recommended?.url ?? `http://127.0.0.1:${port}/`).replace(/\/+$/u, '')
    return {
      active: server !== null,
      listening: server?.listening ?? false,
      error: server?.listenError ?? '',
      host: this.configHost,
      port,
      addresses,
      recommendedUrl: `${origin}/`,
      qrUrl: `${origin}/?token=${encodeURIComponent(this.token)}`,
      token: this.token,
      clientCount: server?.clientCount ?? 0,
      bridge: this.bridge.readiness(),
    }
  }

  // ------------------------------------------------------------ host events

  /** `session/event`: append renderable items to watchers, track decisions. */
  onSessionEvent(session: unknown, event: unknown): void {
    const server = this.server
    if (server === null || event === null || typeof event !== 'object') return
    const record = event as Record<string, unknown>
    const sessionId = sessionIdOf(session)
    const type = typeof record.type === 'string' ? record.type : typeof record.kind === 'string' ? record.kind : ''
    if (type === 'approval/decided') {
      server.dropApproval(firstStringLike(record.callId) ?? firstStringLike(record.id) ?? '')
      return
    }
    if (type === 'user/message') {
      // userQuestions.answer steers a user message tagged with the question it closes.
      const source = record.source as Record<string, unknown> | undefined
        ?? (record.message as Record<string, unknown> | undefined)?.source as Record<string, unknown> | undefined
      if (source !== undefined && source.kind === 'user-question-reply') {
        server.dropQuestion(firstStringLike(source.callId) ?? '')
      }
    }
    const item = normalizeEventItem(record)
    if (item !== null) server.broadcastItem(sessionId, item)
  }

  /** `agent/assistant-stream`: token-level frames for the watched session. */
  onAssistantStream(payload: unknown): void {
    const server = this.server
    if (server === null || payload === null || typeof payload !== 'object') return
    const record = payload as Record<string, unknown>
    const agent = record.agent as Record<string, unknown> | undefined
    if (agent === undefined) return
    const sessionId = sessionIdOf(agent)
    const frame = normalizeStreamFrame(record.frame ?? record)
    if (frame === null) return
    server.broadcastStream(sessionId, frame.phase, frame.text)
  }

  /** `approval/request` waterfall answerer (delegates to the server). */
  onApprovalRequest(request: unknown, next: () => unknown): unknown {
    return this.server?.claimApproval(request, next) ?? next()
  }

  /** `user-questions/request` waterfall answerer (delegates to the server). */
  onQuestionRequest(request: unknown, next: () => unknown): unknown {
    return this.server?.claimQuestion(request, next) ?? next()
  }

  /** Debounced session-list refresh broadcast (api-session/* churn). */
  scheduleSessionsRefresh(): void {
    if (this.server === null) return
    if (this.sessionsRefresh !== null) return
    this.sessionsRefresh = setTimeout(() => {
      this.sessionsRefresh = null
      this.server?.broadcastSessions().catch(error => {
        this.log('debug', `会话列表刷新失败：${error instanceof Error ? error.message : String(error)}`)
      })
    }, 300)
    this.sessionsRefresh.unref?.()
  }

  /** Tear down server, timers. */
  dispose(): void {
    if (this.sessionsRefresh !== null) {
      clearTimeout(this.sessionsRefresh)
      this.sessionsRefresh = null
    }
    this.server?.dispose()
  }
}

function sessionIdOf(scope: unknown): string {
  if (scope === null || typeof scope !== 'object') return ''
  const record = scope as Record<string, unknown>
  if (typeof record.id === 'string' && record.id !== '') return record.id
  if (typeof record.sessionId === 'string') return record.sessionId
  const session = record.session as Record<string, unknown> | undefined
  return typeof session?.id === 'string' ? session.id : ''
}

function firstStringLike(value: unknown): string | null {
  return typeof value === 'string' && value !== '' ? value : null
}

/** Item kind re-exported for tests. */
export type { Item }
