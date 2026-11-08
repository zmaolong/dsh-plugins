/**
 * Main panel of the store: hosts the three views (store / manage / detail),
 * keeps the store list's scroll position across view switches, and renders
 * the migration / API banners.
 *
 * @module dsh-agent-plugin-hub/client/Panel
 */

import { useEffect, useRef, type ReactNode } from 'react'
import { Button, EmptyBlock, LoadingBlock } from './controls.tsx'
import { Icon } from './icons.tsx'
import { StoreView } from './StoreView.tsx'
import { ManageView } from './ManageView.tsx'
import { DetailView } from './DetailView.tsx'
import type { HubActions, HubState, UseHub } from './store.ts'
import type { JsonRecord, Translate } from './presentation.ts'
import css from './panel.module.css'

/** Props of Panel (bound from the slot inject face). */
export interface PanelProps {
  useHub: UseHub
  actions: HubActions
  t: Translate
  localeId: string
}

/** Render the main panel. */
export function Panel({ useHub, actions, t, localeId }: PanelProps): ReactNode {
  const state: HubState = useHub()
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const listScroll = useRef(0)
  const lastView = useRef<HubState['view']>(state.view)
  useEffect(() => {
    actions.init()
  }, [actions])
  useEffect(() => {
    const previous = lastView.current
    if (previous === state.view) return
    if (previous === 'store' && scrollRef.current) listScroll.current = scrollRef.current.scrollTop
    if (state.view === 'store' && scrollRef.current) scrollRef.current.scrollTop = listScroll.current
    lastView.current = state.view
  }, [state.view])
  const snapshot = state.snapshot as JsonRecord | null

  let body: ReactNode
  if (state.status === 'loading' && !snapshot) {
    body = <div className={css.page}><LoadingBlock text={t('catalogLoading')} /></div>
  } else if (!snapshot) {
    body = (
      <div className={css.page}>
        <EmptyBlock
          title={t('apiUnavailable')}
          description={`${state.error || t('unknownError')}\n${t('apiHint')}`}
          action={<Button variant="primary" icon="refresh" onClick={() => { void actions.load() }}>{t('retry')}</Button>}
        />
      </div>
    )
  } else {
    const banners: ReactNode[] = []
    if (typeof snapshot.migrationError === 'string' && snapshot.migrationError !== '') {
      banners.push(
        <div key="migration" className={css.warningBanner}>
          <Icon name="alert" size={14} />
          <span>{t('migrationError', { message: snapshot.migrationError })}</span>
        </div>,
      )
    }
    const ui = snapshot.ui as JsonRecord | undefined
    if (ui && ui.active === false) {
      banners.push(
        <div key="ui" className={css.errorBanner}>
          {`${t('apiUnavailable')}：${String(ui.reason ?? '')}\n${t('apiHint')}`}
        </div>,
      )
    }
    const view = state.view === 'detail'
      ? <DetailView key="detail" useHub={useHub} actions={actions} t={t} localeId={localeId} />
      : state.view === 'manage'
        ? <ManageView key="manage" useHub={useHub} actions={actions} t={t} localeId={localeId} />
        : <StoreView key="store" useHub={useHub} actions={actions} t={t} localeId={localeId} />
    body = <div style={{ display: 'flex', flexDirection: 'column' }}>{banners}{view}</div>
  }

  return (
    <div className={css.root} ref={scrollRef}>
      {body}
    </div>
  )
}
