/**
 * The plugin's LAN gateway: a token-gated reverse proxy in front of the host
 * web UI. The host webServer binds loopback only and refuses wildcard
 * addresses, so the plugin owns one listener on `config.host` (default
 * 0.0.0.0) + `config.port` and forwards everything to it — the phone opens
 * the complete, responsive DSH web UI (sessions, streaming, approvals,
 * questions — all native), the plugin only adds LAN reachability plus the
 * pairing token.
 *
 * Upstream authentication mirrors the host's browser-auth exactly
 * (`browser-auth.ts`): the launch token is exchanged once server-side
 * (`ctx.connection.authenticatedUrl`) for the signed `dsh-auth-*` cookie,
 * which is cached for upstream requests and handed to the phone on first
 * responses. The upstream `Host` header is rewritten to the loopback origin
 * so both the cookie authority and the `/api` trust fence stay valid; the
 * browser's own cookies simply round-trip through the proxy.
 *
 * SSE and streaming responses pipe through unbuffered; WebSocket upgrades
 * are gated and relayed socket-to-socket.
 *
 * @module dsh-remote-ctrl/server
 */

import http from 'node:http'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { checkApiAccess, pairingCookieHeader, type GateRequest } from './auth.ts'

type LogLevel = 'debug' | 'info' | 'warn' | 'error'

/** Upstream face the controller provides (host webServer + connection). */
export interface UpstreamHandle {
  /** Host web origin (`http://127.0.0.1:3081`) or null while services are pending. */
  origin(): string | null
  /** Cached signed cookie (`name=value`), or null before the first exchange / when unavailable. */
  authCookieSync(): string | null
  /**
   * Exchange the launch token for the signed `dsh-auth-*` cookie now
   * (cache-aside; `force` refreshes a possibly stale cache). Resolves null
   * when the connection service is unavailable or the exchange failed.
   */
  authCookie(force?: boolean): Promise<string | null>
}

export interface RcServerOptions {
  host: string
  port: number
  token: string
  upstream: UpstreamHandle
  log: (level: LogLevel, message: string) => void
}

/** Hop-by-hop headers that must not travel across the proxy. */
const HOP_BY_HOP = new Set(['connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization', 'te', 'trailer', 'transfer-encoding', 'upgrade'])

function withoutHopByHop(headers: Record<string, string | string[] | undefined>): Record<string, string | string[] | undefined> {
  const result: Record<string, string | string[] | undefined> = {}
  for (const [name, value] of Object.entries(headers)) {
    if (HOP_BY_HOP.has(name.toLowerCase())) continue
    result[name] = value
  }
  return result
}

/** Merge one `name=value` pair into a raw Cookie header (replacing an existing same-name entry). */
function mergeCookie(rawCookie: string | undefined, cookie: string): string | undefined {
  const name = cookie.slice(0, Math.max(cookie.indexOf('='), 0))
  const parts: string[] = []
  for (const segment of (rawCookie ?? '').split(';')) {
    const trimmed = segment.trim()
    if (trimmed === '') continue
    if (trimmed.startsWith(`${name}=`)) continue
    parts.push(trimmed)
  }
  parts.push(cookie)
  return parts.join('; ')
}

/**
 * Rewrite browser-surface headers to the upstream authority: Origin and
 * Referer must agree with the rewritten Host for the host's `/api` trust
 * fence (same-authority Origin check) to admit proxied requests.
 */
function rewriteBrowserHeaders(headers: Record<string, string | string[] | undefined>, authority: string): void {
  const origin = headers.origin
  if (typeof origin === 'string' && origin !== '') headers.origin = `http://${authority}`
  const referer = headers.referer
  if (typeof referer === 'string' && referer !== '') {
    try {
      const refererUrl = new URL(referer)
      headers.referer = `http://${authority}${refererUrl.pathname}${refererUrl.search}`
    } catch {
      /* unparsable referer: drop it rather than leak a mismatched authority */
      delete headers.referer
    }
  }
}

function toArray(value: string | string[] | undefined): string[] {
  if (value === undefined) return []
  return Array.isArray(value) ? value : [value]
}

/** Bodies at or below this size are buffered so a stale-cookie 401 can replay them. */
const MAX_BUFFERED_BODY_BYTES = 8 * 1024 * 1024

/**
 * Buffer small request bodies for replay; `null` means stream the original
 * request through (large or chunked bodies). Body-less methods buffer an
 * empty buffer so retries always work for them.
 */
function readBufferedBody(request: IncomingMessage): Promise<Buffer | null> {
  const method = (request.method ?? 'GET').toUpperCase()
  if (method === 'GET' || method === 'HEAD') return Promise.resolve(Buffer.alloc(0))
  const declared = Number(request.headers['content-length'] ?? '0')
  if (Number.isFinite(declared) && declared > MAX_BUFFERED_BODY_BYTES) return Promise.resolve(null)
  return new Promise((resolve) => {
    const chunks: Buffer[] = []
    let size = 0
    let overflow = false
    request.on('data', (chunk: Buffer) => {
      if (overflow) return
      size += chunk.length
      if (size > MAX_BUFFERED_BODY_BYTES) {
        // 超限：放弃缓冲改走流式；已收下的部分无意义，但流不能倒带 ——
        // 直接销毁连接让客户端重发（上传大附件遇过期 cookie 属罕见路径）。
        overflow = true
        chunks.length = 0
        request.destroy(new Error('请求体超过网关缓冲上限，无法代理重试'))
        resolve(null)
        return
      }
      chunks.push(chunk)
    })
    request.on('end', () => {
      if (!overflow) resolve(Buffer.concat(chunks))
    })
    request.on('error', () => {
      if (!overflow) resolve(null)
    })
    request.on('close', () => {
      if (!overflow && !request.readableEnded) resolve(null)
    })
  })
}

export class RcServer {
  private http: http.Server | null = null
  private readonly address: { host: string, port: number }
  private connections = 0
  listening = false
  listenError = ''

  constructor(private readonly options: RcServerOptions) {
    this.address = { host: options.host, port: options.port }
  }

  /** Listener port after listen (port 0 resolves to the OS-assigned value). */
  get port(): number {
    return this.address.port
  }

  /** Currently proxied upstream exchanges (requests + relays). */
  get connectionCount(): number {
    return this.connections
  }

  /** Bind and start serving. Resolves once the listener is up. */
  async listen(): Promise<void> {
    const server = http.createServer((request, response) => {
      void this.handle(request, response)
    })
    server.requestTimeout = 0
    server.on('upgrade', (request, socket, head) => {
      this.handleUpgrade(request, socket, head)
    })
    server.on('connection', socket => {
      socket.setTimeout(0)
    })
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject)
      server.listen(this.options.port, this.options.host, () => resolve())
    })
    this.http = server
    this.listening = true
    this.listenError = ''
    const addr = server.address()
    if (addr !== null && typeof addr === 'object') this.address.port = addr.port
    this.options.log('info', `局域网网关已监听 http://${this.options.host}:${this.address.port}/（上游 ${this.options.upstream.origin() ?? '未就绪'}）`)
  }

  /** Stop serving and close the listener. */
  dispose(): void {
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

  // ------------------------------------------------------------------ proxy

  private upstreamAuthority(origin: string): string | undefined {
    try {
      return new URL(origin).host
    } catch {
      return undefined
    }
  }

  private async handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const url = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`)
    try {
      const gate = checkApiAccess(request as unknown as GateRequest, this.options.token)
      if (!gate.ok) {
        this.deny(response, gate.status, gate.code, gate.message)
        return
      }
      const origin = this.options.upstream.origin()
      if (origin === null) {
        this.deny(response, 503, 'upstream_unavailable', '宿主 web 服务尚未就绪：请稍后刷新（需 web/desktop profile 且宿主已启动）')
        return
      }
      await this.proxyOnce(request, response, origin)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      this.options.log('warn', `请求 ${url.pathname} 代理失败：${message}`)
      if (!response.headersSent) {
        this.deny(response, 502, 'bad_gateway', `上游请求失败：${message}`)
      } else {
        response.destroy()
      }
    }
  }

  /** Forward one request; on upstream 401 re-exchange the host cookie and replay once. */
  private async proxyOnce(request: IncomingMessage, response: ServerResponse, origin: string): Promise<void> {
    const authority = this.upstreamAuthority(origin)
    if (authority === undefined) throw new Error(`上游地址不合法：${origin}`)
    let cookie = this.options.upstream.authCookieSync()
    // 手机还没有宿主 cookie 时先代换一次：既给上游请求用，也要下发给手机浏览器。
    let minted: string | null = null
    if (cookie === null) {
      minted = await this.options.upstream.authCookie(true)
      cookie = minted
    }
    // 小体积请求体先缓冲（401 重放可复用）；大体积/无长度声明走流式（不可重放）。
    const buffered = await readBufferedBody(request)
    const status = await this.send(request, response, origin, authority, cookie, buffered, true, minted !== null ? [minted] : [])
    if (status !== 401) return
    const fresh = await this.options.upstream.authCookie(true)
    if (fresh === null) {
      this.deny(response, 502, 'bad_gateway', '上游会话代换失败：宿主 connection 服务不可用')
      return
    }
    const replayable = buffered !== null || request.method === 'GET' || request.method === 'HEAD'
    if (!replayable) {
      this.deny(response, 401, 'unauthorized', '宿主会话已更新，请刷新页面后重试')
      return
    }
    await this.send(request, response, origin, authority, fresh, buffered, false, [])
  }

  /**
   * Run one upstream exchange and pipe the response. Resolves with the
   * upstream status; when `swallowUnauthorized` is set the 401 body is
   * consumed but not written (the caller decides the retry), otherwise the
   * response streams straight through — SSE and chunked bodies included.
   * `extraSetCookies` rides the response for the phone's cookie jar (the
   * server-side launch-token exchange result).
   */
  private send(
    request: IncomingMessage,
    response: ServerResponse,
    origin: string,
    authority: string,
    cookie: string | null,
    buffered: Buffer | null,
    swallowUnauthorized: boolean,
    extraSetCookies: string[],
  ): Promise<number> {
    return new Promise<number>((resolve, reject) => {
      const headers: Record<string, string | string[] | undefined> = {
        ...withoutHopByHop(request.headers),
        host: authority,
      }
      rewriteBrowserHeaders(headers, authority)
      if (cookie !== null) headers.cookie = mergeCookie(request.headers.cookie, cookie)
      if (buffered !== null) headers['content-length'] = String(buffered.length)
      const upstream = http.request(`${origin}${request.url ?? '/'}`, { method: request.method, headers })
      this.connections += 1
      if (buffered !== null) {
        upstream.end(buffered)
      } else {
        request.pipe(upstream)
        request.on('error', () => upstream.destroy())
      }
      upstream.on('response', upstreamResponse => {
        const status = upstreamResponse.statusCode ?? 502
        if (status === 401 && swallowUnauthorized) {
          upstreamResponse.resume()
          upstreamResponse.on('end', () => resolve(status))
          upstreamResponse.on('error', () => resolve(status))
          return
        }
        const setCookie = [
          ...extraSetCookies,
          ...toArray(upstreamResponse.headers['set-cookie']),
          pairingCookieHeader(this.options.token),
        ]
        response.writeHead(status, {
          ...withoutHopByHop(upstreamResponse.headers),
          'set-cookie': setCookie,
        })
        upstreamResponse.pipe(response)
        upstreamResponse.on('end', () => resolve(status))
        upstreamResponse.on('error', () => {
          response.destroy()
          resolve(status)
        })
      })
      upstream.on('error', error => reject(error))
      upstream.on('close', () => {
        this.connections = Math.max(0, this.connections - 1)
      })
    })
  }

  // ---------------------------------------------------------------- upgrades

  private handleUpgrade(request: IncomingMessage, socket: import('node:stream').Duplex, head: Buffer): void {
    void (async () => {
      const gate = checkApiAccess(request as unknown as GateRequest, this.options.token)
      if (!gate.ok) {
        socket.end(`HTTP/1.1 ${gate.status} ${gate.code}\r\nconnection: close\r\n\r\n`)
        return
      }
      const origin = this.options.upstream.origin()
      const authority = origin === null ? undefined : this.upstreamAuthority(origin)
      if (origin === null || authority === undefined) {
        socket.end('HTTP/1.1 503 upstream unavailable\r\nconnection: close\r\n\r\n')
        return
      }
      const cookie = this.options.upstream.authCookieSync()
      // upgrade 转发不过滤 hop-by-hop：connection/upgrade 头本身就是升级语义。
      const headers: Record<string, string | string[] | undefined> = {
        ...request.headers,
        host: authority,
      }
      rewriteBrowserHeaders(headers, authority)
      if (cookie !== null) headers.cookie = mergeCookie(request.headers.cookie, cookie)
      const upstream = http.request(`${origin}${request.url ?? '/'}`, {
        method: request.method,
        headers,
      })
      this.connections += 1
      upstream.end(head.length > 0 ? head : undefined)
      await new Promise<void>(resolve => {
        upstream.on('upgrade', (upstreamResponse, upstreamSocket, upstreamHead) => {
          // 101 的 connection/upgrade 头是升级语义本身，必须原样转发（不过滤 hop-by-hop）。
          const headLines = [`HTTP/${upstreamResponse.httpVersion} ${upstreamResponse.statusCode ?? 101} ${upstreamResponse.statusMessage ?? ''}`]
          for (const [name, value] of Object.entries(upstreamResponse.headers)) {
            for (const item of toArray(value)) headLines.push(`${name}: ${item}`)
          }
          socket.write(`${headLines.join('\r\n')}\r\n\r\n`)
          if (upstreamHead.length > 0) socket.write(upstreamHead)
          upstreamSocket.pipe(socket)
          socket.pipe(upstreamSocket)
          const close = (): void => {
            socket.destroy()
            upstreamSocket.destroy()
            resolve()
          }
          socket.on('error', close)
          upstreamSocket.on('error', close)
          socket.on('close', close)
        })
        upstream.on('response', upstreamResponse => {
          // 上游拒绝升级：原样回写普通响应后收尾。
          const headLines = [`HTTP/${upstreamResponse.httpVersion} ${upstreamResponse.statusCode ?? 502} ${upstreamResponse.statusMessage ?? ''}`]
          for (const [name, value] of Object.entries(withoutHopByHop(upstreamResponse.headers))) {
            for (const item of toArray(value)) headLines.push(`${name}: ${item}`)
          }
          socket.end(`${headLines.join('\r\n')}\r\n\r\n`)
          resolve()
        })
        upstream.on('error', () => {
          socket.destroy()
          resolve()
        })
        socket.on('error', () => {
          upstream.destroy()
          resolve()
        })
      })
      this.connections = Math.max(0, this.connections - 1)
    })()
  }

  // ------------------------------------------------------------------ basics

  private deny(response: ServerResponse, status: number, code: string, message: string): void {
    const body = JSON.stringify({ ok: false, error: message, code })
    response.writeHead(status, {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'content-length': Buffer.byteLength(body),
    })
    response.end(body)
  }
}
