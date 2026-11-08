/**
 * Browser half of dsh-remote-ctrl: the Remote Control panel. This module is
 * the bundle's `apply` (the `window.__ModuleLoader__` handoff is stamped by
 * the build); it registers the dictionaries through the locale service and
 * contributes two slots — the sidebar entry and the main panel.
 *
 * Data comes from the host's loopback `/remote-ctrl/api` prefix; components
 * are pure props components (`useRemote` selector hook + actions) and never
 * touch ctx.
 *
 * @module dsh-remote-ctrl/client
 */

import type { ClientContext } from './client-context.ts'
import { dictionaries, NS, type RemoteCtrlDictionary, type RemoteCtrlLocaleKey } from './locales.ts'
import { createRemoteController } from './store.ts'
import { Panel } from './Panel.tsx'
import { PanelIcon } from './PanelIcon.tsx'

/** Required browser services for slots and localized copy. */
export const inject = ['slots', 'locale']

/** The panel id shared by the sidebar entry and the main panel. */
export const PANEL_ID = 'remote-ctrl'

/**
 * Contribute the Remote Control entry and panel.
 * @param ctx - the browser plugin context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => {
    ctx.locale.register(NS, dictionaries as Record<string, Record<string, string>>)
  }, 'dsh-remote-ctrl: dictionaries')
  const locale = ctx.locale
  const bound = typeof locale?.bind === 'function' ? locale.bind(NS) : null
  const getLocaleId = (): string => {
    try {
      return String(locale?.getLocale?.().active ?? '').toLowerCase() || 'zh'
    } catch {
      return 'zh'
    }
  }
  const staticDict = (): RemoteCtrlDictionary => {
    const id = getLocaleId()
    const exact = dictionaries[id]
    if (exact !== undefined) return exact
    const prefix = Object.keys(dictionaries).find(key => id.startsWith(key))
    return prefix !== undefined ? dictionaries[prefix] as RemoteCtrlDictionary : dictionaries.zh as RemoteCtrlDictionary
  }
  const t = (key: string, vars?: Record<string, unknown>): string => {
    let text = typeof bound === 'function' ? bound(key) : ''
    if (typeof text !== 'string' || text === '') text = staticDict()[key as RemoteCtrlLocaleKey] ?? key
    if (vars !== undefined) {
      for (const name of Object.keys(vars)) {
        text = text.split(`{${name}}`).join(String(vars[name]))
      }
    }
    return text
  }
  const controller = createRemoteController()
  ctx.effect(() => () => controller.actions.destroy(), 'dsh-remote-ctrl: controller')

  // Sidebar entry; the id matches the main panel key.
  ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
    name: 'sidebar.panellist',
    id: PANEL_ID,
    order: 6,
    label: () => t('tab'),
    locale: NS,
  }, PanelIcon))

  // Central main panel; the key matches the sidebar entry id.
  ctx.slots.inject('main', () => ctx.slots.register({
    name: 'main',
    key: PANEL_ID,
    locale: NS,
    inject: () => ({
      hooks: { remote: controller.store },
      actions: controller.actions,
    }),
  }, Panel))
}
