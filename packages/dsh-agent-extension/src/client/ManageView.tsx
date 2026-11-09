/**
 * Management view of the installed plugins: filter pills, search, update-all,
 * and the runtime status footer.
 *
 * @module dsh-agent-extension/client/ManageView
 */

import type { ReactNode } from 'react'
import { Badge, Button, EmptyBlock, IconButton, SearchBox, Spinner, columnGap } from './controls.tsx'
import { Icon } from './icons.tsx'
import { AddMenu } from './AddMenu.tsx'
import { StoreCard } from './StoreCard.tsx'
import { identity, type HubState } from './store.ts'
import { displayOf, updateAvailable, type JsonRecord } from './presentation.ts'
import css from './panel.module.css'
import type { ViewProps } from './StoreView.tsx'

/** Render the management view. */
export function ManageView({ useHub, actions, t }: ViewProps): ReactNode {
  const state: HubState = useHub(identity)
  const localeId = state.localeId
  const snapshot = state.snapshot ?? {}
  const installed = (snapshot.installed as JsonRecord[] | undefined) ?? []
  const query = state.manageQuery
  const filter = state.manageFilter
  const filtered = installed.filter((item) => {
    if (filter === 'enabled' && item.enabled !== true) return false
    if (filter === 'disabled' && item.enabled === true) return false
    if (query.trim() === '') return true
    const display = displayOf(item, localeId)
    return `${display.title} ${display.description} ${String(item.name ?? '')}`.toLowerCase().includes(query.trim().toLowerCase())
  })
  const updates = installed.filter(item => !item.orphan && updateAvailable(item)).length
  const runtime = (snapshot.runtime ?? {}) as JsonRecord
  const skills = runtime.skills as JsonRecord | undefined
  const commands = runtime.commands as JsonRecord | undefined
  const hooks = runtime.hooks as JsonRecord | undefined
  const mcp = runtime.mcp as JsonRecord | undefined

  return (
    <div className={css.page}>
      <header className={css.topbar}>
        <div className={css.titleRow}>
          <button type="button" className={css.back} onClick={actions.openStore} aria-label={t('back')}>
            <Icon name="arrowLeft" size={16} />
          </button>
          <h1 className={css.title}>{t('manage')}</h1>
        </div>
        <div className={css.actions}>
          {updates > 0
            ? (
              <Button
                variant="secondary"
                icon="download"
                disabled={state.updatingAll}
                onClick={actions.updateAll}
              >
                {state.updatingAll ? <Spinner /> : null}{t('updateAll', { count: updates })}
              </Button>
            )
            : null}
          <IconButton
            icon="refresh"
            title={state.loading ? t('refreshing') : t('refresh')}
            busy={state.loading}
            disabled={state.loading}
            onClick={() => { void actions.load() }}
          />
          <Button variant="secondary" onClick={actions.openStore}>{t('browseMarketplace')}</Button>
          <AddMenu t={t} onAdd={actions.openAddSource} />
        </div>
      </header>
      <div className={css.filters}>
        <SearchBox
          value={query}
          onChange={actions.setManageQuery}
          placeholder={t('searchPlaceholder')}
          clearable
          clearLabel={t('clearSearch')}
        />
        <div className={css.segmented}>
          {([['all', t('filterAll')], ['enabled', t('filterEnabled')], ['disabled', t('filterDisabled')]] as const).map(([value, label]) => (
            <button
              key={value}
              type="button"
              className={css.segment}
              aria-pressed={filter === value}
              onClick={() => actions.setManageFilter(value)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      {state.error !== '' ? <div className={css.errorBanner}>{state.error}</div> : null}
      <div style={columnGap(32)}>
        <section className={css.section}>
          <div className={css.sectionHead}>
            <h2 className={css.sectionTitle}>
              {t('installedGroup')} <span className={css.sectionCount}>{String(filtered.length)}</span>
            </h2>
          </div>
          <div className={css.divider} />
          {filtered.length === 0
            ? (
              <div style={{ marginTop: 8 }}>
                <EmptyBlock
                  title={installed.length === 0 ? t('noInstalledTitle') : t('noInstalled')}
                  description={installed.length === 0 ? t('noInstalledDescription') : ''}
                  action={installed.length === 0
                    ? <Button variant="primary" onClick={actions.openStore}>{t('browseMarketplace')}</Button>
                    : null}
                />
              </div>
            )
            : (
              <div className={css.gridSingle}>
                {filtered.map(item => (
                  <StoreCard
                    key={String(item.key)}
                    item={{ ...item, installed: true, installable: true }}
                    useHub={useHub}
                    actions={actions}
                    t={t}
                    localeId={localeId}
                    management
                    onOpenDetail={actions.openDetail}
                  />
                ))}
              </div>
            )}
        </section>
      </div>
      <div className={css.footer}>
        <span>
          {t('enabledCount', {
            total: installed.length,
            enabled: installed.filter(item => item.enabled === true).length,
          })}
        </span>
        <span className={css.runtimeRow}>
          <Badge tone={skills?.registered === true ? 'success' : 'warn'}>
            {`${t('runtimeSkills')} ${typeof skills?.skills === 'number' ? skills.skills : 0}`}
          </Badge>
          <Badge tone={commands?.available === true ? 'success' : 'warn'}>
            {`${t('runtimeCommands')} ${Array.isArray(commands?.registered) ? (commands?.registered as unknown[]).length : 0}`}
          </Badge>
          <Badge tone={hooks?.attached === true ? 'success' : 'warn'}>{t('runtimeHooks')}</Badge>
          <Badge tone={mcp?.available === true ? 'success' : 'warn'}>
            {`${t('runtimeMcp')} ${mcp?.available === true ? t('runtimeEffective') : t('runtimeNotEffective')}`}
          </Badge>
        </span>
      </div>
    </div>
  )
}
