/**
 * Structural types of the host contract remote-ctrl touches.
 *
 * The plugin must not import `@deepseek-ai/*` (host capabilities cross
 * through ctx), so the host services it reads — logger, sessionController,
 * sessionQuery, userQuestions — are declared here structurally, limited to
 * the members actually used. Shapes arriving from the host stay `unknown`
 * and are normalized in `view.ts`; a host upgrade that reshapes a service
 * surfaces here first at `npm run check`.
 *
 * @module dsh-remote-ctrl/host
 */

/** Logger face of `ctx.logger` (cordis). */
export interface HostLogger {
  debug(message: string): void
  info(message: string): void
  warn(message: string): void
  error(message: string): void
}

/**
 * Prompt request of `ctx.sessionController.prompt` — the same channel the
 * web front end uses (idempotent client-minted requestId, cold-session
 * auto-resume, queue = new turn / steer = into the current step).
 */
export interface SessionPromptRequest {
  requestId: string
  sessionId: string
  mode: 'queue' | 'steer'
  content: ReadonlyArray<{ type: string, text?: string }>
  clientTimeZone?: string | undefined
}

/** Host sessionController service (`ctx.sessionController`). */
export interface SessionControllerService {
  list(request?: unknown, signal?: unknown): Promise<unknown[]>
  prompt(request: SessionPromptRequest, signal?: unknown): Promise<unknown>
}

/** Host sessionQuery service (`ctx.sessionQuery`) — cold reads only. */
export interface SessionQueryService {
  listSessions(signal?: unknown): Promise<unknown[]>
  readSession(id: string, signal?: unknown): Promise<unknown>
}

/** RemoteCtrl plugin configuration (cordis.patch.yml row `config`). */
export interface RemoteCtrlConfig {
  home?: string | undefined
  host?: string | undefined
  port?: number | undefined
  token?: string | undefined
}

/** The host Context face the plugin uses; unknown members stay reachable as `unknown`. */
export interface HostContext {
  /** Service lookup; may return undefined while services are pending. */
  get<T>(name: string): T | undefined
  /** Register a resource with its disposer; the label aids diagnostics. */
  effect(fn: () => (() => void) | void, label?: string): unknown
  /** Subscribe a host event; returns a disposer when supported. */
  on(event: string, listener: (...args: unknown[]) => unknown): unknown
  /** Wait for services and run the callback when they appear. */
  inject(deps: readonly string[], callback: (scope: unknown) => void): unknown
  logger?: HostLogger
}
