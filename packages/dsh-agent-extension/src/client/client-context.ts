/**
 * Structural face of the browser host context the hub touches. A third-party
 * plugin cannot import `@deepseek-ai/*`, so the contract is declared here from
 * the observable behavior of the host.
 *
 * @module dsh-agent-extension/client/client-context
 */

/** Locale service face (`ctx.locale`). */
export interface ClientLocale {
  register(ns: string, dictionaries: Record<string, Record<string, string>>): unknown
  bind(ns: string): (key: string) => string
  getLocale?(): { active: string }
  subscribe?(listener: () => void): () => void
}

/** Slots service face (`ctx.slots`). */
export interface ClientSlots {
  inject(owner: string, factory: () => unknown): unknown
  register(declaration: Record<string, unknown>, component: unknown): unknown
}

/** Result envelope of one Client Remote call. */
export interface RemoteCallResult<T> {
  ok: boolean
  value?: T
  error?: { code?: string, message?: string }
}

/** `ctx.remote.session`: native-path handoff and availability over the Session Remote. */
export interface ClientSessionRemote {
  /** Whether the Host desktop can hand a path to a native application. */
  canOpenWorkspacePath(): Promise<RemoteCallResult<boolean>>
  /** Open one Host path in its default application; a failed or unreachable Host reports `ok:false`/rejects. */
  openWorkspacePath(request: { path: string }): Promise<RemoteCallResult<unknown>>
}

/** Client Remote namespaces the hub calls. */
export interface ClientRemote {
  session: ClientSessionRemote
}

/** The browser plugin context face used by apply. */
export interface ClientContext {
  effect(fn: () => (() => void) | void, label?: string): unknown
  locale: ClientLocale
  slots: ClientSlots
  remote: ClientRemote
}
