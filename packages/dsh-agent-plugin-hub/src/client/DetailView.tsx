/**
 * Detail view: header (avatar, title, market badge, actions), capability
 * sections (skills / commands / hooks / MCP with per-item switches), the
 * information block, and the advanced details disclosure.
 *
 * @module dsh-agent-plugin-hub/client/DetailView
 */

import type { ReactNode } from 'react'
import { Avatar, Badge, Button, EmptyBlock, LoadingBlock, Spinner, columnGap } from './controls.tsx'
import { Icon } from './icons.tsx'
import { Menu, type MenuItem } from './Menu.tsx'
import { Switch } from './Switch.tsx'
import { identity, type HubState } from './store.ts'
import {
  canonicalTitle,
  displayOf,
  formatTime,
  httpsUrl,
  pickI18n,
  updateAvailable,
  type JsonRecord,
} from './presentation.ts'
import css from './panel.module.css'
import detailCss from './DetailView.module.css'
import type { ViewProps } from './StoreView.tsx'

/** One external https link row value. */
function ExternalValue({ url, label }: { url: string, label: string }): ReactNode {
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" title={url} aria-label={`${label}: ${url}`}>
      <span>{url}</span>
      <Icon name="external" size={14} />
    </a>
  )
}

/** One capability section (skipped when empty). */
function ComponentSection({ title, items, rows }: {
  title: string
  items: unknown[]
  rows: ReactNode[]
}): ReactNode {
  if (items.length === 0) return null
  return (
    <section className={css.section} style={{ gap: 0 }}>
      <div className={detailCss.compHead}>
        <h2 className={detailCss.compTitle}>{title}</h2>
        <span className={detailCss.compCount}>{String(items.length)}</span>
      </div>
      <div className={detailCss.compList}>{rows}</div>
    </section>
  )
}

/** One information block row. */
interface InfoRow {
  key: string
  label: string
  value?: string
  url?: string
}

/** Render the detail view. */
export function DetailView({ useHub, actions, t }: ViewProps): ReactNode {
  const state: HubState = useHub(identity)
  const localeId = state.localeId
  const snapshot = (state.snapshot ?? {}) as JsonRecord
  const key = state.detailKey ?? ''
  const installedList = (snapshot.installed as JsonRecord[] | undefined) ?? []
  const itemsList = (snapshot.items as JsonRecord[] | undefined) ?? []
  const installed = installedList.find(item => item.key === key) ?? null
  const catalogItem = itemsList.find(item => item.key === key) ?? null
  const detail = state.detail
  const detailRecord = detail ?? {}
  const display = (detailRecord.display ?? {}) as JsonRecord
  const installedFlag = detail ? Boolean((detailRecord.installed as JsonRecord | undefined)?.installed) : Boolean(installed)
  const currentVersion = detailRecord.version
    ? String(detailRecord.version)
    : installed ? String(installed.version ?? '') : catalogItem ? String(catalogItem.version ?? '') : ''
  const market = (detailRecord.market ?? (installed ? installed.market : catalogItem ? catalogItem.market : null)) as JsonRecord | null
  const nameForTitle = detail
    ? detailRecord.name
    : installed ? installed.name : catalogItem ? catalogItem.name : ''
  const title = pickI18n(display.title, display.titleI18n, localeId) || canonicalTitle(nameForTitle)
  const description = pickI18n(display.description, display.descriptionI18n, localeId)
    || (catalogItem ? displayOf(catalogItem, localeId).description : '')
  const orphan = detail
    ? detailRecord.orphan === true || installed?.orphan === true
    : Boolean(installed?.orphan)
  const updatable = !orphan && detail
    ? updateAvailable(detail)
    : Boolean(installed && updateAvailable(installed))
  const busy = key !== '' && Boolean(state.busy[key])
  const installedState = (detailRecord.installed ?? null) as JsonRecord | null
  const enabled = detail && installedState && installedState.enabled !== undefined
    ? installedState.enabled === true
    : Boolean(installed?.enabled)
  const capabilities = (detail?.capabilities ?? null) as JsonRecord | null
  const runtime = (snapshot.runtime ?? {}) as JsonRecord
  const displayBlock = displayOf({ display, name: title }, localeId)
  const entityForActions = (installed ?? catalogItem) as JsonRecord | null

  const actionMenu: ReactNode = installedFlag
    ? (
      <Menu
        t={t}
        busy={busy}
        items={[
          { key: 'toggle', icon: 'power', label: enabled ? t('menuDisable') : t('menuEnable'), disabled: busy, onSelect: () => { if (entityForActions) actions.toggleEnabled(entityForActions, !enabled) } },
          { sep: true, onSelect: () => {} },
          { key: 'uninstall', icon: 'trash', label: t('menuUninstall'), danger: true, disabled: busy, onSelect: () => { if (entityForActions) actions.askUninstall(entityForActions) } },
        ] satisfies MenuItem[]}
      />
    )
    : null

  const header = (
    <header className={detailCss.head}>
      <Avatar display={displayBlock} large />
      <div className={detailCss.headMain}>
        <div className={detailCss.titleLine}>
          <h1 className={detailCss.title}>{title}</h1>
          {market ? <Badge tone="plain">{String(market.title || market.name || market.id)}</Badge> : null}
        </div>
        {description !== '' ? <p className={detailCss.desc}>{description}</p> : null}
        {orphan ? <div className={detailCss.warningLine}><Icon name="alert" size={14} />{t('sourceMissing')}</div> : null}
      </div>
      <div className={detailCss.actions}>
        {updatable
          ? (
            <Button variant="secondary" pill icon="download" disabled={busy} onClick={() => { if (entityForActions) actions.update(entityForActions) }}>
              {t('update')}
            </Button>
          )
          : null}
        {actionMenu}
        {!installedFlag
          ? (
            <Button
              variant="primary"
              pill
              // Installing needs a market entry (name + market); disabled with a hint otherwise.
              disabled={busy || !catalogItem || catalogItem.installable === false || Boolean(catalogItem.blockedReason)}
              title={catalogItem ? (catalogItem.blockedReason === undefined || catalogItem.blockedReason === null ? undefined : String(catalogItem.blockedReason)) : t('sourceMissing')}
              onClick={() => { if (catalogItem) actions.install(catalogItem) }}
            >
              {busy ? <Spinner /> : null}{t('install')}
            </Button>
          )
          : null}
      </div>
    </header>
  )

  let components: ReactNode
  // Error state first: a first-load failure still offers retry / fetch online.
  if (state.detailStatus === 'error') {
    const canFetch = !installedFlag && Boolean(catalogItem)
    components = (
      <div className={css.warningBanner}>
        <Icon name="alert" size={14} />
        <span style={{ flex: 1 }}>{canFetch ? t('fetchDetailHint') : t('componentsError')}</span>
        <button type="button" className={css.inlineButton} onClick={() => { void actions.loadDetail(true) }}>
          <Icon name="refresh" size={14} />
          {canFetch ? t('fetchDetail') : t('componentsRetry')}
        </button>
      </div>
    )
  } else if (!detail || state.detailStatus === 'loading') {
    components = <LoadingBlock text={t('componentsLoading')} />
  } else if (!capabilities) {
    // A degraded-but-successful describe (uncached external source) must still
    // offer the fetch-online action; otherwise the plugin looks component-less.
    const source = (detailRecord.source ?? {}) as JsonRecord
    const canFetch = !installedFlag && Boolean(catalogItem) && source.resolved === false
    components = canFetch
      ? (
        <div className={css.warningBanner}>
          <Icon name="alert" size={14} />
          <span style={{ flex: 1 }}>{t('fetchDetailHint')}</span>
          <button type="button" className={css.inlineButton} onClick={() => { void actions.loadDetail(true) }}>
            <Icon name="refresh" size={14} />
            {t('fetchDetail')}
          </button>
        </div>
      )
      : <EmptyBlock description={detailRecord.blockedReason ? String(detailRecord.blockedReason) : t('componentsEmpty')} />
  } else {
    const capBusyFor = (kind: string, name: string): boolean => actions.isCapBusy(key, kind, name)
    const switchOf = (kind: string, name: string, item: JsonRecord): ReactNode => (installedFlag && item.enabled !== undefined
      ? (
        <Switch
          checked={item.enabled === true}
          disabled={capBusyFor(kind, name)}
          label={`${item.enabled ? t('disable') : t('enable')} ${name}`}
          onChange={next => actions.toggleCapability(key, kind, name, next)}
        />
      )
      : null)
    const rowOf = (rowKey: string, iconName: string, name: string, descriptionText: string, side: ReactNode): ReactNode => (
      <div key={rowKey} className={detailCss.compRow}>
        <div className={detailCss.compIcon}><Icon name={iconName} size={16} /></div>
        <div className={detailCss.compBody}>
          <span className={detailCss.compName} title={name}>{name}</span>
          {descriptionText !== '' ? <span className={detailCss.compDesc} title={descriptionText}>{descriptionText}</span> : null}
        </div>
        <div className={detailCss.compSide}>{side}</div>
      </div>
    )
    const skills = (capabilities.skills as JsonRecord[] | undefined) ?? []
    const commands = (capabilities.commands as JsonRecord[] | undefined) ?? []
    const hooks = (capabilities.hooks as JsonRecord[] | undefined) ?? []
    const mcpServers = (capabilities.mcpServers as JsonRecord[] | undefined) ?? []
    components = (
      <div style={columnGap(32)}>
        <ComponentSection
          title={t('sectionMcp')}
          items={mcpServers}
          rows={mcpServers.map(item => rowOf(
            `mcpServers:${String(item.name)}`,
            'server',
            String(item.name ?? ''),
            [item.transport, item.command, ...(Array.isArray(item.args) ? item.args : [])].filter(Boolean).join(' ') || String(item.url ?? '') || t('componentsNotEffective'),
            <span className={detailCss.compSideStack}>
              <Badge tone="warn">{t('componentsNotEffective')}</Badge>
              {switchOf('mcpServers', String(item.name ?? ''), item)}
            </span>,
          ))}
        />
        <ComponentSection
          title={t('sectionSkills')}
          items={skills}
          rows={skills.map(item => rowOf(
            `skills:${String(item.name)}`,
            'wand',
            String(item.name ?? ''),
            String(item.description ?? ''),
            switchOf('skills', String(item.name ?? ''), item),
          ))}
        />
        <ComponentSection
          title={t('sectionCommands')}
          items={commands}
          rows={commands.map(item => rowOf(
            `commands:${String(item.name)}`,
            'terminal',
            `/${String(item.hostName || item.name)}`,
            String(item.description ?? ''),
            switchOf('commands', String(item.name ?? ''), item),
          ))}
        />
        <ComponentSection
          title={t('sectionHooks')}
          items={hooks}
          rows={hooks.map(item => rowOf(
            `hooks:${String(item.event)}`,
            'anchor',
            String(item.event ?? ''),
            item.host
              ? `${t('hostEvent')}: ${String(item.host)}${item.canBlock === true ? `（${t('canBlock')}）` : ''}`
              : t('hooksInactive', { reason: item.reason ? String(item.reason) : t('componentsNotEffective') }),
            <span className={detailCss.compSideStack}>
              {item.effective === true
                ? <Badge tone="success">{t('componentsEffective')}</Badge>
                : <Badge tone="warn">{t('componentsNotEffective')}</Badge>}
              {switchOf('hooks', String(item.event ?? ''), item)}
            </span>,
          ))}
        />
      </div>
    )
  }

  const author = (display.author as JsonRecord | null | undefined)?.name
  const homepage = httpsUrl(display.homepage)
  const repository = httpsUrl(display.repository)
  const infoRows: InfoRow[] = ([
    { key: 'developer', label: t('infoDeveloper'), value: typeof author === 'string' ? author : '' },
    { key: 'category', label: t('infoCategory'), value: typeof display.category === 'string' ? display.category : '' },
    { key: 'version', label: t('infoVersion'), value: currentVersion },
    { key: 'market', label: t('infoMarket'), value: market ? String(market.title || market.name) : '' },
    { key: 'website', label: t('infoWebsite'), url: homepage },
    { key: 'repository', label: t('infoRepository'), url: repository },
    { key: 'license', label: t('infoLicense'), value: typeof display.license === 'string' ? display.license : '' },
    { key: 'installedAt', label: t('infoInstalledAt'), value: installedFlag && installed ? formatTime(installed.installedAt) : '' },
  ]).filter(row => row.url !== undefined ? row.url !== '' : (row.value ?? '') !== '')

  const advanced: ReactNode[] = []
  const format = detailRecord.format
    ? String(detailRecord.format)
    : installed
      ? String(installed.format ?? '')
      : catalogItem ? String(catalogItem.format || (catalogItem.market as JsonRecord | undefined)?.format || '') : ''
  if (format !== '') {
    advanced.push(
      <div key="format" className={detailCss.infoRow}>
        <span className={detailCss.infoLabel}>{t('format')}</span>
        <span className={detailCss.infoValue} title={format}>{format}</span>
      </div>,
    )
  }
  if (installedFlag && installed && typeof installed.installedPath === 'string' && installed.installedPath !== '') {
    advanced.push(
      <div key="path" className={css.listBlock}>
        <div className={css.listTitle}>{t('rootPath')}</div>
        <div className={css.mono}>{installed.installedPath}</div>
      </div>,
    )
  }
  const previousVersions = (installed?.previousVersions as JsonRecord[] | undefined) ?? []
  if (installedFlag && installed && previousVersions.length > 0) {
    advanced.push(
      <div key="rollback" className={css.listBlock}>
        <div className={css.listTitle}>{t('rollbackVersions')}</div>
        {previousVersions.map(version => (
          <div key={String(version.version)} className={css.listRow}>
            <span
              className={css.listRowMain}
              title={`v${String(version.version)}${version.available ? '' : ` · ${t('sourceMissingShort')}`}`}
            >
              {`v${String(version.version)}${version.available ? '' : ` · ${t('sourceMissingShort')}`}`}
            </span>
            <Button
              variant="secondary"
              icon="rotateCcw"
              disabled={busy || version.available === false}
              onClick={() => actions.askRollback(installed, String(version.version))}
            >
              {t('rollback')}
            </Button>
          </div>
        ))}
      </div>,
    )
  }
  if (detail && typeof detailRecord.hooksSource === 'string' && detailRecord.hooksSource !== '') {
    advanced.push(
      <div key="hooks-source" className={detailCss.infoRow}>
        <span className={detailCss.infoLabel}>{t('hooksSource')}</span>
        <span className={detailCss.infoValue} title={detailRecord.hooksSource}>{detailRecord.hooksSource}</span>
      </div>,
    )
  }
  if (detail && typeof detailRecord.mcpSource === 'string' && detailRecord.mcpSource !== '') {
    advanced.push(
      <div key="mcp-source" className={detailCss.infoRow}>
        <span className={detailCss.infoLabel}>{t('mcpSource')}</span>
        <span className={detailCss.infoValue} title={detailRecord.mcpSource}>{detailRecord.mcpSource}</span>
      </div>,
    )
  }
  const warnings = (detailRecord.warnings as string[] | undefined) ?? []
  if (warnings.length > 0) {
    advanced.push(
      <div key="warnings" className={css.listBlock}>
        <div className={css.listTitle}>{t('warnings')}</div>
        {warnings.map((warning, index) => (
          <div key={index} className={css.warningBanner}>
            <Icon name="alert" size={13} />
            <span>{warning}</span>
          </div>
        ))}
      </div>,
    )
  }
  if (installedFlag && installed) {
    const caps = (installed.capabilities ?? {}) as JsonRecord
    const list = (name: string): number => (Array.isArray(caps[name]) ? (caps[name] as unknown[]).length : 0)
    advanced.push(
      <div key="runtime" className={css.listBlock}>
        <div className={css.listTitle}>{t('runtimeStatus')}</div>
        <div className={css.runtimeRow}>
          <Badge tone={installed.enabled === true ? 'success' : 'warn'}>{installed.enabled === true ? t('enabled') : t('disabled')}</Badge>
          <Badge>{`${t('runtimeSkills')} ${list('skills')}`}</Badge>
          <Badge>{`${t('runtimeCommands')} ${list('commands')}`}</Badge>
          <Badge>{`${t('runtimeHooks')} ${list('hooks')}`}</Badge>
          <Badge>{`${t('runtimeMcp')} ${runtime.mcp && (runtime.mcp as JsonRecord).available ? t('runtimeEffective') : t('runtimeNotEffective')}`}</Badge>
        </div>
      </div>,
    )
  }

  return (
    <div className={`${css.page} ${detailCss.detail}`}>
      <button type="button" className={css.back} onClick={actions.backFromDetail}>
        <Icon name="arrowLeft" size={16} />
        {t('back')}
      </button>
      {header}
      {state.error !== '' ? <div className={css.errorBanner}>{state.error}</div> : null}
      {components}
      {infoRows.length > 0
        ? (
          <section className={css.section} style={{ gap: 0 }}>
            <div className={detailCss.compHead}>
              <h2 className={detailCss.compTitle}>{t('infoTitle')}</h2>
            </div>
            <div className={detailCss.info} style={{ marginTop: 12 }}>
              {infoRows.map(row => (
                <div key={row.key} className={detailCss.infoRow}>
                  <span className={detailCss.infoLabel}>{row.label}</span>
                  <span className={detailCss.infoValue}>
                    {row.url !== undefined && row.url !== ''
                      ? <ExternalValue url={row.url} label={row.label} />
                      : row.value ?? ''}
                  </span>
                </div>
              ))}
            </div>
          </section>
        )
        : null}
      {advanced.length > 0
        ? (
          <details className={detailCss.advanced}>
            <summary>
              <span className={detailCss.chev}><Icon name="chevronRight" size={14} /></span>
              {t('moreDetails')}
            </summary>
            <div className={detailCss.advancedBody}>{advanced}</div>
          </details>
        )
        : null}
    </div>
  )
}

