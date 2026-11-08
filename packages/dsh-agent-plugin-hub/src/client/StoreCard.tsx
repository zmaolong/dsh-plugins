/**
 * One plugin card row: avatar, display fields, install/update actions, the
 * more-actions menu, and the enable switch. Shared by the store grid and the
 * management list; activation opens the detail view.
 *
 * @module dsh-agent-plugin-hub/client/StoreCard
 */

import type { KeyboardEvent, ReactNode } from 'react'
import { Avatar, Badge, Button, Spinner, UpdateBadge } from './controls.tsx'
import { Icon } from './icons.tsx'
import { Menu, type MenuItem } from './Menu.tsx'
import { Switch } from './Switch.tsx'
import { identity, type HubActions, type UseHub } from './store.ts'
import { displayOf, updateAvailable, type JsonRecord, type Translate } from './presentation.ts'
import css from './StoreCard.module.css'

/** Props of StoreCard. */
export interface StoreCardProps {
  item: JsonRecord
  useHub: UseHub
  actions: HubActions
  t: Translate
  localeId: string
  /** Management list: always show the version/source sub line and actions. */
  management?: boolean
  onOpenDetail: (key: string) => void
}

/** Render one plugin card. */
export function StoreCard({ item, useHub, actions, t, localeId, management = false, onOpenDetail }: StoreCardProps): ReactNode {
  const state = useHub(identity)
  const display = displayOf(item, localeId)
  const installed = item.installed === true
  const orphan = item.orphan === true
  const key = String(item.key ?? '')
  const busyLabel = state.busy[key] ?? ''
  const busy = busyLabel !== ''
  const canInstall = item.installable !== false && !item.blockedReason
  const updatable = !orphan && updateAvailable(item)
  const enabled = item.installedEnabled !== undefined && item.installedEnabled !== null
    ? item.installedEnabled === true
    : item.enabled === true
  const menuItems: MenuItem[] = installed
    ? [
      { key: 'toggle', icon: 'power', label: enabled ? t('menuDisable') : t('menuEnable'), disabled: busy, onSelect: () => actions.toggleEnabled(item, !enabled) },
      { sep: true, label: '', onSelect: () => {} },
      { key: 'uninstall', icon: 'trash', label: t('menuUninstall'), danger: true, disabled: busy, onSelect: () => actions.askUninstall(item) },
    ]
    : []
  const versionText = `${t('version')} ${String(item.installedVersion || item.version || '—')}`
  const market = item.market as JsonRecord | undefined
  const marketText = market ? String(market.title || market.name || '') : ''
  const subTitle = [versionText, marketText, orphan ? t('sourceMissingShort') : ''].filter(Boolean).join(' · ')
  const activate = (): void => {
    if (installed || item.name) onOpenDetail(key)
  }
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.target !== event.currentTarget) return
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      activate()
    }
  }
  return (
    <div
      className={css.card}
      role="button"
      tabIndex={0}
      aria-label={display.title}
      onClick={activate}
      onKeyDown={onKeyDown}
    >
      <Avatar display={display} />
      <div className={css.body}>
        <div className={css.titleLine}>
          <span className={css.title} title={display.title}>{display.title}</span>
          {updatable ? <UpdateBadge label={t('updateBadge')} /> : null}
          {orphan ? <Badge tone="warn">{t('sourceMissingShort')}</Badge> : null}
        </div>
        {orphan
          ? <div className={css.warning} title={t('sourceMissing')}><Icon name="alert" size={12} />{t('sourceMissing')}</div>
          : <div className={css.desc} title={display.description || t('noDescription')}>{display.description || t('noDescription')}</div>}
        {management || installed
          ? <div className={css.sub} title={subTitle}>{subTitle}</div>
          : null}
      </div>
      <div className={css.actions}>
        {!installed && canInstall
          ? (
            <Button
              variant="secondary"
              pill
              disabled={busy || state.busy[key] === 'install'}
              onClick={(event) => {
                event.stopPropagation()
                actions.install(item)
              }}
            >
              {busy ? <Spinner /> : null}{busy ? t('installing') : t('install')}
            </Button>
          )
          : null}
        {!installed && !canInstall
          ? <Button variant="secondary" pill disabled title={item.blockedReason === undefined || item.blockedReason === null ? t('notInstallable') : String(item.blockedReason)}>{t('notInstallable')}</Button>
          : null}
        {installed && updatable
          ? (
            <Button
              variant="secondary"
              pill
              disabled={busy || state.busy[key] === 'update'}
              onClick={(event) => {
                event.stopPropagation()
                actions.update(item)
              }}
            >
              {busy ? <Spinner /> : <Icon name="download" size={14} />}{busy ? t('updating') : t('update')}
            </Button>
          )
          : null}
        {installed ? <Menu t={t} items={menuItems} busy={busy} /> : null}
        {installed
          ? (
            <Switch
              checked={enabled}
              disabled={busy}
              label={`${enabled ? t('disable') : t('enable')} ${display.title}`}
              onChange={next => actions.toggleEnabled(item, next)}
            />
          )
          : null}
      </div>
    </div>
  )
}
