/**
 * Structural types of the host contract remote-ctrl touches.
 *
 * The plugin must not import `@deepseek-ai/*` (host capabilities cross
 * through ctx), so the host services it reads — logger, webServer (the web
 * origin to proxy), connection (the launch-token exchange) — are declared
 * here structurally, limited to the members actually used. A host upgrade
 * that reshapes a service breaks `npm run check` here first.
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

/** Host webServer service (`ctx.webServer`) — read-only for the gateway. */
export interface WebServerService {
  getOrigin(): string
}

/** Host connection service (`ctx.connection`) — launch-token exchange only. */
export interface ConnectionService {
  authenticatedUrl(baseUrl: string): string
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
  /** Wait for services and run the callback when they appear. */
  inject(deps: readonly string[], callback: (scope: unknown) => void): unknown
  logger?: HostLogger
}
