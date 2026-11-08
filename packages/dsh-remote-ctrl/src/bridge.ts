/**
 * Host-side service bridge. Host services may reach the plugin late (cordis
 * drives availability), so the bridge is attached per service by `apply` via
 * `ctx.inject` and every call re-checks what actually arrived. Session
 * interaction runs in-process against the same services the web front end
 * uses: `sessionController` for prompts, `sessionQuery` for cold reads.
 * Ask-user answers ride the `user-questions/request` waterfall directly
 * (same as approvals), so no userQuestions service is needed here.
 *
 * @module dsh-remote-ctrl/bridge
 */

import type {
  HostContext,
  SessionControllerService,
  SessionQueryService,
} from './host.ts'
import type { SessionPromptRequest } from './host.ts'

/** Names of the services this bridge consumes. */
export type BridgeServiceName = 'sessionController' | 'sessionQuery'

/** Which host services are currently attached. */
export interface BridgeReadiness {
  controller: boolean
  query: boolean
}

export class HostBridge {
  private controller: SessionControllerService | null = null
  private query: SessionQueryService | null = null

  /** Attach one service if the scope actually carries it with the expected face. */
  attach(scope: unknown, name: BridgeServiceName): boolean {
    const source = scope as { get?: (name: string) => unknown } | null
    const service = (source?.get?.(name) ?? (source as Record<string, unknown> | null)?.[name]) as object | undefined
    if (!service) return false
    if (name === 'sessionController' && typeof (service as SessionControllerService).prompt === 'function') {
      this.controller = service as SessionControllerService
      return true
    }
    if (name === 'sessionQuery' && typeof (service as SessionQueryService).readSession === 'function') {
      this.query = service as SessionQueryService
      return true
    }
    return false
  }

  /** Readiness snapshot for status surfaces. */
  readiness(): BridgeReadiness {
    return { controller: this.controller !== null, query: this.query !== null }
  }

  /**
   * List sessions: `sessionController.list()` when available (rich summaries
   * with projection values — title, running flag —; never activates cold
   * sessions), falling back to `sessionQuery`. The controller answers
   * `{items:[...]}`, the query a bare array; both unwrap here.
   */
  async listSessions(): Promise<unknown[]> {
    if (this.controller !== null && typeof this.controller.list === 'function') {
      try {
        const result = await this.controller.list({}, neverSignal())
        const rows = rowsOf(result)
        if (rows !== null) return rows
      } catch {
        /* fall through to the cold query */
      }
    }
    if (this.query !== null && typeof this.query.listSessions === 'function') {
      const rows = await this.query.listSessions()
      if (Array.isArray(rows)) return rows
    }
    throw new Error('宿主未提供会话查询服务（sessionController / sessionQuery）')
  }

  /** Cold-read one session's event log (does not activate the session). */
  async readEvents(sessionId: string): Promise<unknown> {
    if (this.query === null) throw new Error('宿主未提供 sessionQuery 服务，无法读取会话历史')
    return await this.query.readSession(sessionId)
  }

  /** Send a user message: a queued followup turn on the session's agent. */
  async prompt(sessionId: string, text: string, mode: 'queue' | 'steer'): Promise<void> {
    if (this.controller === null) throw new Error('宿主未提供 sessionController 服务，无法发送消息')
    const request: SessionPromptRequest = {
      requestId: crypto.randomUUID(),
      sessionId,
      mode,
      content: [{ type: 'text', text }],
      clientTimeZone: clientTimeZone(),
    }
    // 官方 prompt(list, signal) 签名内部使用 signal.throwIfAborted()，必须给一个永不中止的 signal。
    await this.controller.prompt(request, neverSignal())
  }
}

function clientTimeZone(): string | undefined {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || undefined
  } catch {
    return undefined
  }
}

/** Bare array or `{items:[...]}` wrapper → array; anything else → null. */
function rowsOf(value: unknown): unknown[] | null {
  if (Array.isArray(value)) return value
  if (value !== null && typeof value === 'object' && Array.isArray((value as { items?: unknown }).items)) {
    return (value as { items: unknown[] }).items
  }
  return null
}

/** A never-aborting signal for host calls that require one. */
function neverSignal(): AbortSignal {
  return new AbortController().signal
}

/** Register one late service through ctx.inject with a try/catch wrapper. */
export function deferService(
  ctx: HostContext,
  deps: readonly string[],
  callback: (scope: HostContext) => void,
  onError: (message: string) => void,
): void {
  try {
    if (typeof ctx.inject !== 'function') {
      onError(`宿主 ctx 不支持 inject，无法等待服务 ${deps.join('+')}`)
      return
    }
    ctx.inject(deps, (scope: unknown) => {
      try {
        callback(scope as HostContext)
      } catch (error) {
        onError(`服务 ${deps.join('+')} 就绪后执行失败：${error instanceof Error ? error.message : String(error)}`)
      }
    })
  } catch (error) {
    onError(`等待服务 ${deps.join('+')} 失败：${error instanceof Error ? error.message : String(error)}`)
  }
}
