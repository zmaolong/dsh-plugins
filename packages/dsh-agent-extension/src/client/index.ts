/**
 * Browser half of dsh-agent-extension: the Agent Extension store panel. This
 * module is the bundle's `apply` (the `window.__ModuleLoader__` handoff is
 * stamped by the build); it registers the dictionaries through the locale
 * service and contributes three slots — the sidebar entry, the main panel,
 * and the framework-level overlay (dialogs + toasts).
 *
 * Data comes from the host's `/agent-plugin/api` prefix; components are pure
 * props components (`useHub` selector hook + actions) and never touch ctx.
 *
 * @module dsh-agent-extension/client
 */

import type { ClientContext } from './client-context.ts'
import { en, ja, es, fr, de, ru, pt, zh, NS, type HubDictionary, type HubLocaleKey } from './locales.ts'
import { createHubController } from './store.ts'
import { Panel } from './Panel.tsx'
import { PanelIcon } from './PanelIcon.tsx'
import { OverlayHost } from './OverlayHost.tsx'

/** Required browser services: slots, copy, and the Session Remote for native file opening. */
export const inject = ['slots', 'locale', 'remote', 'remote.session']

/** The panel id shared by the sidebar entry and the main panel. */
export const PANEL_ID = 'agent-extension'

/**
 * Contribute the Agent Extension entry, panel, and overlay.
 * @param ctx - the browser plugin context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => { ctx.locale.register(NS, { zh, en, ja, es, fr, de, ru, pt } as Record<string, HubDictionary>) }, 'dsh-agent-extension: dictionaries')
  const locale = ctx.locale
  const bound = typeof locale?.bind === 'function' ? locale.bind(NS) : null
  const getLocaleId = (): string => {
    try {
      return String(locale?.getLocale?.().active ?? '').toLowerCase() || 'zh'
    } catch {
      return 'zh'
    }
  }
  const staticDict = (): HubDictionary => {
    const id = getLocaleId()
    return id.startsWith('zh') || id === '' ? zh : en
  }
  const t = (key: string, vars?: Record<string, unknown>): string => {
    let text = typeof bound === 'function' ? bound(key) : ''
    if (typeof text !== 'string' || text === '') text = staticDict()[key as HubLocaleKey] ?? key
    if (vars !== undefined) {
      for (const name of Object.keys(vars)) {
        text = text.split(`{${name}}`).join(String(vars[name]))
      }
    }
    return text
  }
  const controller = createHubController({
    translate: t,
    getLocaleId,
    // Native "open in system app": the Host opens a derived body-only markdown
    // file with the user's associated editor; unavailable on web-only Hosts.
    openNativePath: async (path) => {
      try {
        const can = await ctx.remote.session.canOpenWorkspacePath()
        if (!can.ok || can.value !== true) return { ok: false, unavailable: true }
        const result = await ctx.remote.session.openWorkspacePath({ path })
        if (result.ok) return { ok: true }
        return { ok: false, error: { message: result.error?.message ?? '' } }
      } catch (error) {
        return { ok: false, error: { message: error instanceof Error ? error.message : String(error) } }
      }
    },
  })
  ctx.effect(() => () => controller.actions.destroy(), 'dsh-agent-extension: controller')
  // Track the active locale id in the snapshot so views re-resolve i18n display picks.
  ctx.effect(() => ctx.locale.subscribe?.(() => controller.actions.setLocaleId(getLocaleId())), 'dsh-agent-extension: locale tracking')

  // Sidebar entry; panel order keeps 插件(0) → 智能体扩展(5) → 自动化任务(10) → 上下文洞察(20).
  ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
    name: 'sidebar.panellist',
    id: PANEL_ID,
    order: 5,
    label: () => t('tab'),
    locale: NS,
  }, PanelIcon))

  // Central main panel; the key matches the sidebar entry id.
  ctx.slots.inject('main', () => ctx.slots.register({
    name: 'main',
    key: PANEL_ID,
    locale: NS,
    inject: () => ({
      hooks: { hub: controller.store },
      actions: controller.actions,
    }),
  }, Panel))

  // Framework-level overlay: dialogs and toasts (panel-local fixed layers
  // would be clipped or lost across panel switches).
  ctx.slots.inject('shell.overlay', () => ctx.slots.register({
    name: 'shell.overlay',
    id: 'agent-extension-overlay',
    order: 60,
    label: () => t('tab'),
    locale: NS,
    inject: () => ({
      hooks: { hub: controller.store },
      actions: controller.actions,
    }),
  }, OverlayHost))
}
