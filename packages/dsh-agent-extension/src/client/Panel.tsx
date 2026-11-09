/**
 * Main panel of the store: hosts the section header (plugins / memory /
 * skills), the three plugin views (store / manage / detail), keeps the store
 * list's scroll position across view switches, and renders the migration /
 * API banners. The memory tab renders its own self-contained view; skills is
 * still a placeholder.
 *
 * @module dsh-agent-extension/client/Panel
 */

import { useEffect, useRef, type ReactNode } from 'react'
import { Button, EmptyBlock, LoadingBlock } from './controls.tsx'
import { Icon } from './icons.tsx'
import { Tabs, type TabItem } from './Tabs.tsx'
import { StoreView } from './StoreView.tsx'
import { ManageView } from './ManageView.tsx'
import { DetailView } from './DetailView.tsx'
import { MarketView } from './MarketView.tsx'
import { MemoryView } from './MemoryView.tsx'
import { identity, type HubActions, type HubState, type SectionTab, type UseHub } from './store.ts'
import type { JsonRecord, Translate } from './presentation.ts'
import css from './panel.module.css'

/** Props of Panel (bound from the slot inject face). */
export interface PanelProps {
  useHub: UseHub
  actions: HubActions
  t: Translate
}

/** Section tabs: plugin features now, memory and skills as placeholders. */
function sectionTabs(t: Translate): ReadonlyArray<TabItem<SectionTab>> {
  return [
    { value: 'plugins', label: t('tabPlugins') },
    { value: 'memory', label: t('tabMemory') },
    { value: 'skills', label: t('tabSkills') },
  ]
}

/** Render the main panel. */
export function Panel({ useHub, actions, t }: PanelProps): ReactNode {
  const state: HubState = useHub(identity)
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
  const pluginsSection = state.sectionTab === 'plugins'

  let body: ReactNode
  // Drill-down plugin views (manage / market / detail) carry their own back
  // header, so the section header stays on the section roots only.
  let withHeader = true
  if (!pluginsSection) {
    // The memory tab owns its own data flow; skills is still a placeholder.
    body = state.sectionTab === 'memory'
      ? <MemoryView actions={actions} t={t} />
      : (
        <div className={css.page}>
          <EmptyBlock title={t('comingSoon')} description={t('skillsPlaceholder')} />
        </div>
      )
  } else if (state.status === 'loading' && !snapshot) {
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
      ? <DetailView key="detail" useHub={useHub} actions={actions} t={t} />
      : state.view === 'manage'
        ? <ManageView key="manage" useHub={useHub} actions={actions} t={t} />
        : state.view === 'market'
          ? <MarketView key="market" useHub={useHub} actions={actions} t={t} />
          : <StoreView key="store" useHub={useHub} actions={actions} t={t} />
    body = <div style={{ display: 'flex', flexDirection: 'column' }}>{banners}{view}</div>
    withHeader = state.view === 'store'
  }

  return (
    <div className={css.root} ref={scrollRef}>
      {withHeader
        ? (
          <header className={css.header}>
            <h1 className={css.title}>{t('title')}</h1>
            <Tabs
              items={sectionTabs(t)}
              value={state.sectionTab}
              onChange={actions.setSectionTab}
              label={t('sectionTabsLabel')}
              idPrefix="aph-section-tab"
              panelId="aph-section-panel"
            />
          </header>
        )
        : null}
      {withHeader
        ? (
          <div id="aph-section-panel" role="tabpanel" aria-labelledby={`aph-section-tab-${state.sectionTab}`}>
            {body}
          </div>
        )
        : body}
    </div>
  )
}
