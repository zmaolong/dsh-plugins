/**
 * Browser half of dsh-remote-ctrl: the Remote Control launcher. This module is
 * the bundle's `apply` (the `window.__ModuleLoader__` handoff is stamped by
 * the build); it registers the dictionaries through the locale service and
 * contributes one slot — the sidebar-foot action that opens the popup.
 *
 * Data comes from the host's loopback `/remote-ctrl/api` prefix; components
 * are pure props components (`useRemote` selector hook + actions) and never
 * touch ctx.
 *
 * @module dsh-remote-ctrl/client
 */

import type { ClientContext } from './client-context.ts'
import { dictionaries, NS } from './locales.ts'
import { createRemoteController } from './store.ts'
import { Launcher } from './Launcher.tsx'

/** Required browser services for slots and localized copy. */
export const inject = ['slots', 'locale']

/**
 * Contribute the Remote Control launcher to the sidebar foot.
 * @param ctx - the browser plugin context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => {
    ctx.locale.register(NS, dictionaries as Record<string, Record<string, string>>)
  }, 'dsh-remote-ctrl: dictionaries')
  const controller = createRemoteController()
  ctx.effect(() => () => controller.actions.destroy(), 'dsh-remote-ctrl: controller')

  // The sidebar-foot action: the launcher icon and the popup it opens. The
  // slot renders beside Settings at the sidebar foot, so the entry claims no
  // global panel icon and no main-panel key.
  ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register({
    name: 'sidebar.footer.action',
    id: 'remote-ctrl',
    order: 0,
    locale: NS,
    inject: () => ({
      hooks: { remote: controller.store },
      actions: controller.actions,
    }),
  }, Launcher))
}