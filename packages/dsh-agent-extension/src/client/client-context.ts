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

/** Layout service face (`ctx.layout`). */
export interface ClientLayout {
  selectPanel(id: string | null): void
}

/** Observable snapshot face of a host service (`createSnapshotStore`). */
export interface ClientSnapshot<T> {
  getSnapshot(): T
  subscribe(listener: () => void): () => void
}

/** One committed tab record of the right Sidebar. */
export interface ClientSidebarTabRecord {
  /** The tab's stable id inside the Session layout. */
  id: string
  /** The registered tab kind; pages record it at open time. */
  kind?: string
}

/** Placement of a new page or resource tab. */
export interface ClientSidebarPlacement {
  /** Land the tab in this pane instead of the active docked one. */
  paneId?: string
  /** Prefer a new pane; the host falls back to the landing pane when splitting is unavailable. */
  preferNewPane?: boolean
}

/** Right-Sidebar navigation face (`ctx.sidebarRight`). */
export interface ClientSidebarRight {
  /** The Session the column is mounted for; `undefined` while no Session is on screen. */
  mounted: ClientSnapshot<string | undefined>
  /** Open one registered page kind, delivering `params` through `navigation.params`. */
  openTab(kind: string, options?: ClientSidebarPlacement & { params?: Record<string, unknown> }): void
  /** Open one `dsh-resource://` address; an unclaimed address or a missing Session surface throws. */
  openResource(address: string, options?: ClientSidebarPlacement): void
  /** Committed tabs of one Session, used to find the pane holding an already-open page. */
  tabsIn(sessionId: string): readonly ClientSidebarTabRecord[]
  /** Focus a tab and the pane holding it; a missing tab is left alone. */
  focus(tabId: string): void
}

/** Tab-type registry face (`ctx.sidebarRightTabs`). */
export interface ClientSidebarRightTabs {
  /** Register one page type; returns its disposer. */
  register(definition: Record<string, unknown>): () => void
}

/** The browser plugin context face used by apply. */
export interface ClientContext {
  effect(fn: () => (() => void) | void, label?: string): unknown
  locale: ClientLocale
  slots: ClientSlots
  layout: ClientLayout
  sidebarRight: ClientSidebarRight
  sidebarRightTabs: ClientSidebarRightTabs
}
