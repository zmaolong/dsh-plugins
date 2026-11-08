/**
 * Store view: personal sources grouped by market, with search across all
 * groups. The topbar carries refresh, sources, add, and the manage entry.
 *
 * @module dsh-agent-plugin-hub/client/StoreView
 */

import type { ReactNode } from 'react'
import { Avatar, Button, EmptyBlock, IconButton, SearchBox, columnGap } from './controls.tsx'
import { AddMenu } from './AddMenu.tsx'
import { StoreCard } from './StoreCard.tsx'
import type { HubActions, HubState, UseHub } from './store.ts'
import {
  displayNames,
  displayOf,
  groupItemsByMarket,
  matchQuery,
  type JsonRecord,
  type Translate,
} from './presentation.ts'
import css from './panel.module.css'

/** Shared view props (bound from the slot inject face). */
export interface ViewProps {
  useHub: UseHub
  actions: HubActions
  t: Translate
  localeId: string
}

/** Collapsed-rows expander under one market group. */
function CollapseRow({ hidden, localeId, onExpand, t }: {
  hidden: JsonRecord[]
  localeId: string
  onExpand: () => void
  t: Translate
}): ReactNode {
  const names = displayNames(hidden, localeId, 2)
  const label = hidden.length > 2
    ? t('viewMore', { names: names.join('、'), count: hidden.length - names.length })
    : t('viewMoreFew', { names: names.join('、') })
  return (
    <button type="button" className={css.collapseRow} onClick={onExpand}>
      <span className={css.collapseAvatars} aria-hidden>
        {hidden.slice(0, 3).map((item, index) => (
          <Avatar key={String(item.key ?? index)} display={displayOf(item, localeId)} />
        ))}
      </span>
      <span className={css.collapseLabel}>{label}</span>
    </button>
  )
}

/** Render the store view. */
export function StoreView({ useHub, actions, t, localeId }: ViewProps): ReactNode {
  const state: HubState = useHub()
  const snapshot = state.snapshot ?? {}
  const markets = (snapshot.markets as JsonRecord[] | undefined) ?? []
  const items = (snapshot.items as JsonRecord[] | undefined) ?? []
  const query = state.query
  const searching = query.trim() !== ''
  const groups = searching ? [] : groupItemsByMarket(items, markets)
  const searchResults = searching ? items.filter(item => matchQuery(item, query, localeId)) : []

  let content: ReactNode
  if (searching) {
    content = (
      <section className={css.section}>
        <div className={css.sectionHead}>
          <h2 className={css.sectionTitle}>{t('searchResults', { count: searchResults.length })}</h2>
        </div>
        <div className={css.divider} />
        {searchResults.length === 0
          ? <div style={{ marginTop: 8 }}><EmptyBlock description={t('searchEmpty')} /></div>
          : <div className={css.grid}>{searchResults.map(item => <StoreCard key={String(item.key)} item={item} useHub={useHub} actions={actions} t={t} localeId={localeId} onOpenDetail={actions.openDetail} />)}</div>}
      </section>
    )
  } else if (markets.length === 0) {
    content = (
      <EmptyBlock
        description={t('personalEmpty')}
        action={<Button variant="primary" icon="plus" onClick={actions.openAddSource}>{t('addMarketplace')}</Button>}
      />
    )
  } else if (items.length === 0) {
    content = <EmptyBlock description={t('catalogEmpty')} />
  } else {
    content = (
      <div style={columnGap(32)}>
        {groups.map((group) => {
          const groupKey = `market:${String(group.market.id ?? '')}`
          const collapsed = state.collapsed[groupKey] === true
          const hidden = collapsed ? group.items.slice(6) : []
          const visible = collapsed ? group.items.slice(0, 6) : group.items
          return (
            <section key={groupKey} className={css.section}>
              <div className={css.sectionHead}>
                <h2 className={css.sectionTitle}>{String(group.market.title || group.market.name || group.market.id)}</h2>
              </div>
              <div className={css.divider} />
              <div className={css.grid}>
                {visible.map(item => <StoreCard key={String(item.key)} item={item} useHub={useHub} actions={actions} t={t} localeId={localeId} onOpenDetail={actions.openDetail} />)}
              </div>
              {hidden.length > 0
                ? <CollapseRow hidden={hidden} localeId={localeId} onExpand={() => actions.toggleCollapse(groupKey)} t={t} />
                : null}
              {!collapsed && group.items.length > 6
                ? (
                  <button type="button" className={css.collapseRow} onClick={() => actions.toggleCollapse(groupKey)}>
                    <span className={css.collapseLabel}>{t('showLess')}</span>
                  </button>
                )
                : null}
            </section>
          )
        })}
      </div>
    )
  }

  return (
    <div className={css.page}>
      <header className={css.topbar}>
        <h1 className={css.title}>{t('title')}</h1>
        <div className={css.actions}>
          <IconButton
            icon="refresh"
            title={state.refreshing ? t('refreshing') : t('refresh')}
            busy={state.refreshing}
            disabled={state.refreshing}
            outline
            onClick={() => { void actions.refreshAll() }}
          />
          <IconButton icon="store" title={t('sources')} outline onClick={actions.openSources} />
          <AddMenu t={t} onAdd={actions.openAddSource} />
          <Button variant="primary" onClick={actions.openManage}>{t('manage')}</Button>
        </div>
      </header>
      <div className={css.toolbar}>
        <SearchBox
          value={query}
          onChange={actions.setQuery}
          placeholder={t('searchPlaceholder')}
        />
      </div>
      {state.error !== '' ? <div className={css.errorBanner}>{state.error}</div> : null}
      {content}
    </div>
  )
}
