/**
 * Request gate of the plugin's LAN gateway. The host's `/api` trust fence
 * does not cover plugin routes, and this server exposes the full DSH web UI
 * to the LAN on purpose — so every request carries its own admission checks:
 *
 * - Host header must resolve to this machine (anti DNS-rebinding);
 * - every request needs the pairing token: `Authorization: Bearer`, `?token=`
 *   (how the QR link opens), or the pairing cookie minted on the first
 *   authenticated response (so the web UI's own fetches/WebSockets pass
 *   without re-sending the token);
 * - state-changing requests additionally need a same-origin Origin, and a
 *   browser-attested `sec-fetch-site: cross-site` is rejected outright
 *   (mirrors the dsh-agent-plugin-hub `isAdmitted` fence).
 *
 * @module dsh-remote-ctrl/auth
 */

import { randomBytes, timingSafeEqual } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { localHostNames } from './ip.ts'

const STATE_VERSION = 1

/** Name of the pairing cookie minted on the first authenticated response. */
export const PAIRING_COOKIE = 'dsh-remote-ctrl'

/** Minimal request view the gate reads (node IncomingMessage is shape-compatible). */
export interface GateRequest {
  method?: string | undefined
  url?: string | undefined
  headers?: Record<string, string | string[] | undefined> | undefined
}

/** Gate verdict. */
export type GateResult =
  | { ok: true }
  | { ok: false, status: number, code: string, message: string }

/** Persisted pairing state (home/remote-ctrl.json). */
interface RemoteCtrlState {
  version: number
  token: string
}

function writeState(file: string, token: string): void {
  const state: RemoteCtrlState = { version: STATE_VERSION, token }
  writeFileSync(file, `${JSON.stringify(state, null, 2)}\n`, 'utf8')
}

/**
 * Resolve the pairing token: an explicitly configured one wins; otherwise
 * the persisted one is reused so QR codes stay valid across restarts; a
 * fresh random token is minted and persisted on first run. Legacy state
 * without a version marker is migrated in place (same token, adds version).
 */
export function loadOrCreateToken(home: string, configured: string): string {
  const trimmed = configured.trim()
  if (trimmed !== '') return trimmed
  const file = join(home, 'remote-ctrl.json')
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8')) as Partial<RemoteCtrlState>
    const token = typeof parsed.token === 'string' ? parsed.token : ''
    if (token !== '') {
      if (parsed.version !== STATE_VERSION) writeState(file, token)
      return token
    }
  } catch {
    /* first run or unreadable state: mint a new token below */
  }
  mkdirSync(home, { recursive: true })
  const token = randomBytes(24).toString('base64url')
  writeState(file, token)
  return token
}

/** Hostname of the Host header (port stripped; IPv6 keeps its brackets). */
export function hostnameOf(hostHeader: string): string {
  const value = hostHeader.trim().toLowerCase()
  if (value.startsWith('[')) {
    const end = value.indexOf(']')
    return end === -1 ? value : value.slice(0, end + 1)
  }
  const colon = value.lastIndexOf(':')
  return colon === -1 ? value : value.slice(0, colon)
}

function headerValue(request: GateRequest, name: string): string {
  const value = request.headers?.[name]
  if (Array.isArray(value)) return String(value[0] ?? '').toLowerCase()
  return String(value ?? '').toLowerCase()
}

function headerRaw(request: GateRequest, name: string): string {
  const value = request.headers?.[name]
  if (Array.isArray(value)) return String(value[0] ?? '')
  return String(value ?? '')
}

function safeEqual(left: string, right: string): boolean {
  const leftBytes = Buffer.from(left, 'utf8')
  const rightBytes = Buffer.from(right, 'utf8')
  return leftBytes.length === rightBytes.length && timingSafeEqual(leftBytes, rightBytes)
}

/** One cookie value out of a raw Cookie header (exact name match). */
function cookieValue(rawCookie: string, name: string): string | undefined {
  for (const segment of rawCookie.split(';')) {
    const at = segment.indexOf('=')
    if (at === -1 || segment.slice(0, at).trim() !== name) continue
    return segment.slice(at + 1).trim()
  }
  return undefined
}

/**
 * Pairing token of one request: Bearer header first, then `?token=` (how the
 * QR link opens), then the pairing cookie minted after the first visit.
 */
export function tokenOf(request: GateRequest): string | null {
  const authorization = headerRaw(request, 'authorization')
  const match = /^bearer\s+(.+)$/iu.exec(authorization)
  if (match !== null) {
    const token = (match[1] ?? '').trim()
    if (token !== '') return token
  }
  try {
    const url = new URL(String(request.url ?? '/'), 'http://localhost')
    const token = url.searchParams.get('token')
    if (token !== null && token !== '') return token
  } catch {
    /* malformed url falls through to the cookie branch */
  }
  const rawCookie = headerRaw(request, 'cookie')
  if (rawCookie !== '') {
    const token = cookieValue(rawCookie, PAIRING_COOKIE)
    if (token !== undefined && token !== '') return token
  }
  return null
}

/** The pairing session cookie minted on every authenticated response (idempotent). */
export function pairingCookieHeader(token: string): string {
  return `${PAIRING_COOKIE}=${token}; Path=/; Max-Age=15552000; HttpOnly; SameSite=Lax`
}

/** Whether this request may pass the gateway. */
export function checkApiAccess(request: GateRequest, token: string): GateResult {
  const hostHeader = String(request.headers?.host ?? '')
  if (hostHeader === '' || !localHostNames().has(hostnameOf(hostHeader))) {
    return { ok: false, status: 403, code: 'forbidden_host', message: '拒绝访问：Host 不是本机地址' }
  }
  const provided = tokenOf(request)
  if (provided === null || !safeEqual(provided, token)) {
    return { ok: false, status: 401, code: 'unauthorized', message: '未授权：缺少或错误的配对码' }
  }
  const method = String(request.method ?? 'GET').toUpperCase()
  if (method === 'GET' || method === 'HEAD') return { ok: true }
  if (headerValue(request, 'sec-fetch-site') === 'cross-site') {
    return { ok: false, status: 403, code: 'forbidden', message: '拒绝访问：跨站请求' }
  }
  const origin = request.headers?.origin
  if (origin !== undefined && String(origin) !== `http://${hostHeader}` && String(origin) !== `https://${hostHeader}`) {
    return { ok: false, status: 403, code: 'forbidden_origin', message: '拒绝访问：跨站请求来源' }
  }
  return { ok: true }
}
