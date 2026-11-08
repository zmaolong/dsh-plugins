/**
 * Structural face of the browser host context the panel touches (slots +
 * locale). A third-party plugin cannot import `@deepseek-ai/*`, so the
 * contract is declared here from the observable behavior of the host.
 *
 * @module dsh-remote-ctrl/client/client-context
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

/** The browser plugin context face used by apply. */
export interface ClientContext {
  effect(fn: () => (() => void) | void, label?: string): unknown
  locale: ClientLocale
  slots: ClientSlots
}
