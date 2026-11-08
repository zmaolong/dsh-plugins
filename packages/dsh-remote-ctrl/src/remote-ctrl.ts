/**
 * The RemoteCtrl controller: owns config resolution (home/host/port/token),
 * the LAN gateway lifecycle, and the upstream handle (host webServer origin
 * + launch-token cookie exchange) the proxy needs. The desktop panel reads
 * {@link panelStatus} through the host webServer route (loopback only).
 *
 * @module dsh-remote-ctrl/remote-ctrl
 */

import http from 'node:http'
import { randomUUID } from 'node:crypto'
import { mkdirSync } from 'node:fs'
import os from 'node:os'
import { join } from 'node:path'
import { loadOrCreateToken } from './auth.ts'
import { lanAddresses } from './ip.ts'
import { RcServer, type UpstreamHandle } from './server.ts'
import type { ConnectionService, HostContext, RemoteCtrlConfig, WebServerService } from './host.ts'

/** Package version surfaced in logs. */
export const REMOTE_CTRL_VERSION = '0.0.1-preview.1'

const LOG_PREFIX = 'dsh-remote-ctrl: '

/** One LAN address the gateway answers on. */
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
  upstream: { origin: string, ready: boolean }
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
  readonly warnings: string[] = []
  private readonly configHost: string
  private readonly configPort: number
  private readonly configToken: string
  private server: RcServer | null = null
  private token = ''
  private webServer: WebServerService | null = null
  private connection: ConnectionService | null = null
  private cachedAuthCookie: string | null = null
  private exchange: Promise<string | null> | null = null

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
      upstream: this.upstreamHandle(),
      log: (level, message) => this.log(level, message),
    })
    this.server = server
    server.listen().catch(error => {
      const message = error instanceof Error ? error.message : String(error)
      server.listenError = message
      this.log('error', `启动局域网网关失败（host=${this.configHost} port=${this.configPort}，端口被占用？）：${message}`)
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

  /** Attach the upstream services once they appear (cordis availability). */
  attachUpstream(scope: unknown, name: 'webServer' | 'connection'): boolean {
    const source = scope as { get?: (name: string) => unknown } | null
    const service = (source?.get?.(name) ?? (source as Record<string, unknown> | null)?.[name]) as object | undefined
    if (!service) return false
    if (name === 'webServer' && typeof (service as WebServerService).getOrigin === 'function') {
      this.webServer = service as WebServerService
      return true
    }
    if (name === 'connection' && typeof (service as ConnectionService).authenticatedUrl === 'function') {
      this.connection = service as ConnectionService
      return true
    }
    return false
  }

  /** The proxy's upstream face: origin lookup + launch-token cookie exchange. */
  private upstreamHandle(): UpstreamHandle {
    return {
      origin: () => this.hostOrigin(),
      authCookieSync: () => this.cachedAuthCookie,
      authCookie: (force?: boolean) => this.exchangeAuthCookie(force === true),
    }
  }

  /** Host web origin, or null while the webServer service is pending. */
  private hostOrigin(): string | null {
    if (this.webServer === null) return null
    try {
      const origin = this.webServer.getOrigin()
      return typeof origin === 'string' && origin !== '' ? origin : null
    } catch {
      return null
    }
  }

  /**
   * Exchange the process launch token for the signed upstream cookie and
   * cache it. The request itself must carry the upstream authority as its
   * Host header so the minted cookie's authority matches the rewritten
   * proxied requests.
   */
  private exchangeAuthCookie(force: boolean): Promise<string | null> {
    if (!force && this.cachedAuthCookie !== null) return Promise.resolve(this.cachedAuthCookie)
    if (this.exchange !== null) return this.exchange
    const origin = this.hostOrigin()
    if (origin === null || this.connection === null) return Promise.resolve(null)
    let authedUrl: string
    try {
      authedUrl = this.connection.authenticatedUrl(`${origin}/`)
    } catch (error) {
      this.log('warn', `换取宿主会话失败：${error instanceof Error ? error.message : String(error)}`)
      return Promise.resolve(null)
    }
    this.exchange = new Promise<string | null>(resolve => {
      const request = http.request(authedUrl, { method: 'GET' }, response => {
        const setCookie = response.headers['set-cookie']?.[0]
        response.resume()
        response.on('end', () => {
          this.exchange = null
          const value = typeof setCookie === 'string' ? setCookie.split(';')[0] ?? null : null
          if (value !== null) {
            this.cachedAuthCookie = value
            this.log('debug', '已通过 launch token 代换宿主会话 cookie')
          }
          resolve(value)
        })
        response.on('error', () => {
          this.exchange = null
          resolve(null)
        })
      })
      request.on('error', () => {
        this.exchange = null
        this.log('debug', '换取宿主会话 cookie 失败（宿主未就绪？）')
        resolve(null)
      })
      request.end()
    })
    return this.exchange
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
    // 二维码挑第一个私网地址（手机最可能可达的地址）；没有私网时退回第一个地址。
    const recommended = addresses.find(entry => entry.scope === 'private') ?? addresses[0] ?? null
    const origin = (recommended?.url ?? `http://127.0.0.1:${port}/`).replace(/\/+$/u, '')
    const upstreamOrigin = this.hostOrigin() ?? ''
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
      clientCount: server?.connectionCount ?? 0,
      upstream: { origin: upstreamOrigin, ready: upstreamOrigin !== '' && this.connection !== null },
    }
  }

  /** Tear down server. */
  dispose(): void {
    this.server?.dispose()
  }
}
