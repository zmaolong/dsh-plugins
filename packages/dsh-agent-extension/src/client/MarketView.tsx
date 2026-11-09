/**
 * Market detail view: a recommended source opened as a first-level page.
 * Added markets render the same plugin-card grid as the store (install +
 * plugin detail work); un-added ones render preview cards from
 * `/market/preview` whose activation opens a local description pane.
 *
 * @module dsh-agent-extension/client/MarketView
 */

import type { ReactNode } from 'react'
import { Badge, Button, IconButton, LoadingBlock } from './controls.tsx'
import { Icon } from './icons.tsx'
import { StoreCard } from './StoreCard.tsx'
import { CollapseRow } from './StoreView.tsx'
import { addedMarketFor, RECOMMENDED_SOURCES } from './recommended.ts'
import { identity, type HubActions, type HubState, type UseHub } from './store.ts'
import { displayOf, type JsonRecord, type Translate } from './presentation.ts'
import css from './panel.module.css'

/** Shared view props (bound from the slot inject face). */
export interface ViewProps {
  useHub: UseHub
  actions: HubActions
  t: Translate
}

/** Pseudo card key prefix of preview entries (un-added sources). */
const PREVIEW_KEY_PREFIX = 'preview:'

function previewKey(name: unknown): string {
  return `${PREVIEW_KEY_PREFIX}${String(name ?? '')}`
}

/** The recommended entry behind the open detail view. */
function knownEntry(entryId: string): JsonRecord | null {
  const known = RECOMMENDED_SOURCES.find(source => source.id === entryId)
  return known === undefined ? null : (known as unknown as JsonRecord)
}

/** Full-description pane of one preview plugin (un-added sources). */
function PluginPreviewPane({ plugin, marketTitle, useHub, actions, t }: {
  plugin: JsonRecord
  marketTitle: string
  useHub: UseHub
  actions: HubActions
  t: Translate
}): ReactNode {
  const state: HubState = useHub(identity)
  const display = displayOf(plugin, state.localeId)
  const rows: Array<{ label: string, value: string }> = []
  if (typeof plugin.version === 'string' && plugin.version !== '') rows.push({ label: t('version'), value: plugin.version })
  if (display.author !== null && typeof display.author.name === 'string' && display.author.name !== '') rows.push({ label: t('infoDeveloper'), value: display.author.name })
  if (display.category !== '') rows.push({ label: t('infoCategory'), value: display.category })
  if (display.homepage !== '') rows.push({ label: t('infoWebsite'), value: display.homepage })
  if (display.repository !== '') rows.push({ label: t('infoRepository'), value: display.repository })
  if (display.license !== '') rows.push({ label: t('infoLicense'), value: display.license })
  return (
    <div className={css.page}>
      <button type="button" className={css.back} onClick={actions.closeMarketPlugin}>
        <Icon name="arrowLeft" size={16} />
        {t('back')}
      </button>
      <section className={css.section}>
        <div className={css.sectionHead}>
          <div className={css.recHead}>
            <h2 className={css.sectionTitle}>{display.title}</h2>
            <Badge tone="plain">{marketTitle}</Badge>
          </div>
        </div>
        <div className={css.divider} />
        {display.description !== ''
          ? <p className={css.pluginDesc}>{display.description}</p>
          : <p className={css.pluginDesc}>{t('noDescription')}</p>}
        {rows.length > 0
          ? (
            <div className={css.listBlock}>
              {rows.map(row => (
                <div key={row.label} className={css.listRow}>
                  <span className={css.listTitle}>{row.label}</span>
                  <span className={css.listRowMain}>{row.value}</span>
                </div>
              ))}
            </div>
          )
          : null}
        <div className={css.recHint}>{t('previewInstallBlocked')}</div>
      </section>
    </div>
  )
}

/** Render the market detail view. */
export function MarketView({ useHub, actions, t }: ViewProps): ReactNode {
  const state: HubState = useHub(identity)
  const detail = state.marketDetail
  if (detail === null) return null
  const snapshot = (state.snapshot ?? {}) as JsonRecord
  const markets = (snapshot.markets as JsonRecord[] | undefined) ?? []
  const matched = addedMarketFor(markets, detail.location)
  const known = knownEntry(detail.entryId)
  const format = known !== null && typeof known.format === 'string' ? known.format : String((detail.data ?? {}).format ?? '')
  const display = displayOf(known ?? { display: { title: detail.title } }, state.localeId)
  const plugins = ((detail.data ?? {}).plugins as JsonRecord[] | undefined) ?? []
  const refreshing = detail.status === 'loading' && detail.data !== null
  const groupKey = `market:${matched?.id ?? detail.entryId}`
  const collapsed = state.collapsed[groupKey] === true

  // Second level: the description pane of one preview plugin.
  const pluginKey = state.marketPluginKey
  if (pluginKey !== null && matched === null) {
    const plugin = plugins.find(entry => previewKey(entry.name) === pluginKey)
    if (plugin !== undefined) {
      return <PluginPreviewPane plugin={plugin} marketTitle={display.title} useHub={useHub} actions={actions} t={t} />
    }
  }

  let grid: ReactNode
  if (detail.status === 'loading' && detail.data === null) {
    grid = <LoadingBlock text={t('catalogLoading')} />
  } else if (detail.status === 'error' && detail.data === null) {
    grid = <div className={css.errorBanner}>{detail.error}</div>
  } else if (plugins.length === 0) {
    grid = <div className={css.emptyRow}>{t('marketEmpty')}</div>
  } else if (matched !== null) {
    // Added: the same cards as the store grid — install and plugin detail work.
    const visible = collapsed ? plugins.slice(0, 6) : plugins
    const hidden = collapsed ? plugins.slice(6) : []
    grid = (
      <>
        <div className={css.grid}>
          {visible.map(item => (
            <StoreCard key={String(item.key)} item={item} useHub={useHub} actions={actions} t={t} localeId={state.localeId} onOpenDetail={key => actions.openDetail(key, 'market')} />
          ))}
        </div>
        {hidden.length > 0
          ? <CollapseRow hidden={hidden} localeId={state.localeId} onExpand={() => actions.toggleCollapse(groupKey)} t={t} />
          : null}
        {!collapsed && plugins.length > 6
          ? (
            <button type="button" className={css.collapseRow} onClick={() => actions.toggleCollapse(groupKey)}>
              <span className={css.collapseLabel}>{t('showLess')}</span>
            </button>
          )
          : null}
      </>
    )
  } else {
    // Un-added: preview cards; activation opens the local description pane.
    const previewItems = plugins.map(plugin => ({
      ...plugin,
      key: previewKey(plugin.name),
      installable: false,
      blockedReason: t('previewInstallBlocked'),
    }))
    grid = (
      <div className={css.grid}>
        {previewItems.map(item => (
          <StoreCard key={String(item.key)} item={item} useHub={useHub} actions={actions} t={t} localeId={state.localeId} onOpenDetail={actions.openMarketPlugin} />
        ))}
      </div>
    )
  }

  return (
    <div className={css.page}>
      <header className={css.topbar}>
        <button type="button" className={css.back} onClick={actions.closeMarketDetail}>
          <Icon name="arrowLeft" size={16} />
          {t('back')}
        </button>
      </header>
      <section className={css.section}>
        <div className={css.sectionHead}>
          <div className={css.recHead}>
            <h1 className={css.title}>{display.title}</h1>
            {format !== '' ? <Badge tone="plain">{format}</Badge> : null}
            {matched !== null ? <Badge tone="success">{t('addedBadge')}</Badge> : null}
          </div>
          <div className={css.actions}>
            <IconButton
              icon="refresh"
              title={refreshing ? t('refreshing') : t('refresh')}
              busy={refreshing || (matched !== null && (state.marketBusy[String(matched.id ?? '')] ?? '') === 'refresh')}
              disabled={refreshing}
              onClick={() => {
                if (matched !== null) void actions.refreshMarket(String(matched.id ?? ''))
                else actions.openMarketDetail({ id: detail.entryId, location: detail.location }, true)
              }}
            />
            {matched === null
              ? (
                <Button variant="primary" icon="plus" onClick={() => actions.addRecommendedSource({ id: detail.entryId, location: detail.location })}>
                  {t('add')}
                </Button>
              )
              : null}
          </div>
        </div>
        <div className={css.divider} />
        {display.description !== '' ? <p className={css.recDesc}>{display.description}</p> : null}
        <div className={css.recLocation}>{detail.location}</div>
        {matched === null ? <div className={css.recHint}>{t('previewAddHint')}</div> : null}
      </section>
      {grid}
      {detail.status === 'error' && detail.data !== null ? <div className={css.errorBanner}>{detail.error}</div> : null}
    </div>
  )
}
