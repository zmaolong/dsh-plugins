/**
 * Store view: personal sources grouped by market, with search across all
 * groups. The toolbar carries the store tabs, the search box, and the
 * page-level actions (refresh, sources, add, manage).
 *
 * @module dsh-agent-extension/client/StoreView
 */

import type { ReactNode } from 'react'
import { Avatar, Badge, Button, EmptyBlock, IconButton, SearchBox, Spinner, columnGap } from './controls.tsx'
import { Icon } from './icons.tsx'
import { Tabs, type TabItem } from './Tabs.tsx'
import { AddMenu } from './AddMenu.tsx'
import { StoreCard } from './StoreCard.tsx'
import { RECOMMENDED_SOURCES, isSourceAdded } from './recommended.ts'
import { identity, type HubActions, type HubState, type UseHub } from './store.ts'
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
}

/** Collapsed-rows expander under one market group. */
export function CollapseRow({ hidden, localeId, onExpand, t }: {
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

/** Curated recommended sources: one-click add and click-to-preview plugin lists. */
function RecommendedList({ useHub, actions, t }: ViewProps): ReactNode {
  const state: HubState = useHub(identity)
  const markets = ((state.snapshot ?? {}).markets as JsonRecord[] | undefined) ?? []
  return (
    <section className={css.section}>
      <p className={css.recHint}>{t('recommendedHint')}</p>
      <div className={css.divider} />
      <div className={css.recList}>
        {RECOMMENDED_SOURCES.map((entry) => {
          const added = isSourceAdded(markets, entry.location)
          const busy = state.marketBusy[`rec:${entry.id}`] === 'add'
          const display = displayOf(entry, state.localeId)
          return (
            <button
              key={entry.id}
              type="button"
              className={css.recRow}
              title={display.title}
              onClick={() => actions.openMarketDetail({ id: entry.id, location: entry.location })}
            >
              <div className={css.recMain}>
                <div className={css.recHead}>
                  <span className={css.recName}>{display.title}</span>
                  <Badge tone="plain">{entry.format}</Badge>
                </div>
                {display.description !== '' ? <div className={css.recDesc}>{display.description}</div> : null}
                <div className={css.recLocation}>{entry.location}</div>
              </div>
              <div className={css.recAction}>
                {added
                  ? <Badge tone="success">{t('addedBadge')}</Badge>
                  : (
                    <Button
                      variant="secondary"
                      icon="plus"
                      disabled={busy}
                      onClick={(event) => {
                        event.stopPropagation()
                        actions.addRecommendedSource({ id: entry.id, location: entry.location })
                      }}
                    >
                      {busy ? <Spinner /> : null}{busy ? t('adding') : t('add')}
                    </Button>
                  )}
                <span className={css.recChevron} aria-hidden>
                  <Icon name="chevronRight" size={16} />
                </span>
              </div>
            </button>
          )
        })}
      </div>
    </section>
  )
}

/** Render the store view. */
export function StoreView({ useHub, actions, t }: ViewProps): ReactNode {
  const state: HubState = useHub(identity)
  const localeId = state.localeId
  const snapshot = state.snapshot ?? {}
  const markets = (snapshot.markets as JsonRecord[] | undefined) ?? []
  const items = (snapshot.items as JsonRecord[] | undefined) ?? []
  const query = state.query
  const storeTabs: ReadonlyArray<TabItem<HubState['storeTab']>> = [
    { value: 'sources', label: t('tabSources') },
    { value: 'recommended', label: t('tabRecommended') },
  ]
  const searching = query.trim() !== ''
  const sourceFilter = state.storeSourceFilter
  // The source filter scopes both the grouped grid and the search results.
  const filteredItems = sourceFilter === ''
    ? items
    : items.filter(item => ((item.market as JsonRecord | undefined) ?? {}).id === sourceFilter)
  const groups = searching ? [] : groupItemsByMarket(filteredItems, markets)
  const searchResults = searching ? filteredItems.filter(item => matchQuery(item, query, localeId)) : []

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
  } else if (filteredItems.length === 0) {
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
      <div className={css.toolbar}>
        <Tabs
          items={storeTabs}
          value={state.storeTab}
          onChange={actions.setStoreTab}
          label={t('storeTabsLabel')}
          idPrefix="aph-store-tab"
          panelId="aph-store-panel"
        />
        <div className={css.toolbarTrail}>
          {state.storeTab === 'sources'
            ? (
              <SearchBox
                value={query}
                onChange={actions.setQuery}
                placeholder={t('searchPlaceholder')}
                clearable
                clearLabel={t('clearSearch')}
              />
            )
            : null}
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
        </div>
      </div>
      {state.storeTab === 'sources' && markets.length > 1
        ? (
          <div className={css.toolbar}>
            <div className={css.segmented} role="group" aria-label={t('allSources')}>
              <button
                type="button"
                className={css.segment}
                aria-pressed={sourceFilter === ''}
                onClick={() => actions.setStoreSourceFilter('')}
              >
                {t('allSources')}
              </button>
              {markets.map(market => {
                const id = String(market.id ?? '')
                const title = String(market.title || market.name || market.id)
                return (
                  <button
                    key={id}
                    type="button"
                    className={css.segment}
                    aria-pressed={sourceFilter === id}
                    title={title}
                    onClick={() => actions.setStoreSourceFilter(id)}
                  >
                    {title}
                  </button>
                )
              })}
            </div>
          </div>
        )
        : null}
      {state.error !== '' ? <div className={css.errorBanner}>{state.error}</div> : null}
      <div id="aph-store-panel" role="tabpanel" aria-labelledby={`aph-store-tab-${state.storeTab}`}>
        {state.storeTab === 'recommended' ? <RecommendedList useHub={useHub} actions={actions} t={t} /> : content}
      </div>
    </div>
  )
}
