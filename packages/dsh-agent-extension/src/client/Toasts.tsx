/**
 * Toast stack of the overlay host: success/warn/error/info feedback with
 * auto-dismiss owned by the controller.
 *
 * @module dsh-agent-extension/client/Toasts
 */

import type { ReactNode } from 'react'
import { Icon } from './icons.tsx'
import { identity, type HubActions, type HubState, type UseHub } from './store.ts'
import type { Translate } from './presentation.ts'
import css from './Toasts.module.css'

/** Render the toast stack (null when empty). */
export function Toasts({ useHub, actions, t }: {
  useHub: UseHub
  actions: HubActions
  t: Translate
}): ReactNode {
  const state: HubState = useHub(identity)
  if (state.toasts.length === 0) return null
  return (
    <div className={css.toasts} role="status" aria-live="polite">
      {state.toasts.map(toastItem => (
        <div key={toastItem.id} className={`${css.toast} ${toastItem.kind === 'success' ? css.toastSuccess : toastItem.kind === 'warn' ? css.toastWarn : toastItem.kind === 'error' ? css.toastError : ''}`}>
          <Icon name={toastItem.kind === 'success' ? 'check' : toastItem.kind === 'error' || toastItem.kind === 'warn' ? 'alert' : 'info'} size={16} />
          <div className={css.body}>{toastItem.message}</div>
          <button
            type="button"
            className={css.close}
            title={t('close')}
            aria-label={t('close')}
            onClick={() => actions.dismissToast(toastItem.id)}
          >
            <Icon name="x" size={14} />
          </button>
        </div>
      ))}
    </div>
  )
}
