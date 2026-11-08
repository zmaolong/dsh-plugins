/**
 * Framework-level overlay host: renders only the top dialog of the stack
 * (stacked dialogs would ghost through the mask) plus the toast stack.
 *
 * @module dsh-agent-plugin-hub/client/OverlayHost
 */

import type { ReactNode } from 'react'
import { Toasts } from './Toasts.tsx'
import { AddSourceDialog, ConfirmDialog, SourcesDialog } from './dialogs.tsx'
import type { HubActions, HubState, UseHub } from './store.ts'
import type { Translate } from './presentation.ts'
import css from './overlay.module.css'

/** Props of OverlayHost (bound from the slot inject face). */
export interface OverlayHostProps {
  useHub: UseHub
  actions: HubActions
  t: Translate
}

/** Render the overlay host (null while no dialog and no toast is active). */
export function OverlayHost({ useHub, actions, t }: OverlayHostProps): ReactNode {
  const state: HubState = useHub()
  if (state.dialogs.length === 0 && state.toasts.length === 0) return null
  const toasts = <Toasts useHub={useHub} actions={actions} t={t} />
  const top = state.dialogs.length > 0 ? state.dialogs[state.dialogs.length - 1] : null
  const store = { actions }
  let dialog: ReactNode = null
  if (top) {
    if (top.kind === 'add-source') dialog = <AddSourceDialog key={top.id} store={store} t={t} dialog={top} />
    else if (top.kind === 'sources') dialog = <SourcesDialog key={top.id} useHub={useHub} store={store} t={t} />
    else if (top.kind === 'confirm') dialog = <ConfirmDialog key={top.id} store={store} t={t} dialog={top} />
  }
  return <div className={css.overlayRoot}>{dialog}{toasts}</div>
}
