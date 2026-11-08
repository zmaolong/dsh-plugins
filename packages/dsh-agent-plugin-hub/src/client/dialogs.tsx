/**
 * Dialogs hosted in `shell.overlay`: add-source, marketplace sources, and the
 * generic confirm. The shell renders only the top dialog of the stack; the
 * mask material and dialog geometry follow the official Modal (prominent
 * elevation, panel radius, theme-owned mask).
 *
 * @module dsh-agent-plugin-hub/client/dialogs
 */

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Badge, Button, IconButton, LoadingBlock, Spinner } from './controls.tsx'
import { Icon } from './icons.tsx'
import { useEscapeClose } from './overlay-hooks.ts'
import { addedMarketFor } from './recommended.ts'
import { identity, type DialogState, type HubActions, type HubState, type UseHub } from './store.ts'
import { formatTime, errorMessageFor, orderMarkets, displayOf, type JsonRecord, type Translate } from './presentation.ts'
import css from './dialogs.module.css'

/** Shell of every dialog: mask, card, header, body, footer. */
export function DialogShell({ t, title, children, footer, narrow = false, onClose }: {
  t: Translate
  title: string
  children: ReactNode
  footer?: ReactNode
  narrow?: boolean
  onClose?: () => void
}): ReactNode {
  const dialogRef = useRef<HTMLDivElement | null>(null)
  // Move focus into the dialog on mount; restore it to the previously focused element on unmount.
  useEffect(() => {
    if (typeof document === 'undefined') return undefined
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    if (dialogRef.current && typeof dialogRef.current.focus === 'function') dialogRef.current.focus()
    return () => {
      if (previous && typeof previous.focus === 'function') previous.focus()
    }
  }, [])
  useEscapeClose(true, () => { onClose?.() })
  return (
    <div className={css.mask} onClick={(event) => {
      if (event.target === event.currentTarget && onClose) onClose()
    }}>
      <div
        ref={dialogRef}
        className={narrow ? `${css.dialog} ${css.dialogNarrow}` : css.dialog}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
      >
        <div className={css.head}>
          <h2 className={css.title} title={title}>{title}</h2>
          {onClose
            ? <IconButton icon="x" title={t('close')} onClick={onClose} />
            : null}
        </div>
        <div className={css.body}>{children}</div>
        {footer ? <div className={css.foot}>{footer}</div> : null}
      </div>
    </div>
  )
}

/** Add-marketplace dialog: source input, optional alias, risk acknowledgment. */
export function AddSourceDialog({ store, t, dialog }: {
  store: { actions: HubActions }
  t: Translate
  dialog: DialogState
}): ReactNode {
  const [location, setLocation] = useState('')
  const [name, setName] = useState('')
  const [risk, setRisk] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const inputRef = useRef<HTMLInputElement | null>(null)
  const close = (): void => { store.actions.closeDialog(dialog.id) }
  useEffect(() => {
    if (inputRef.current && typeof inputRef.current.focus === 'function') inputRef.current.focus()
  }, [])
  const submit = async (): Promise<void> => {
    if (busy || location.trim() === '' || !risk) return
    setBusy(true)
    setError('')
    try {
      const data = await store.actions.addMarketSource(location.trim(), name.trim())
      const detected = data.detectedType === 'git'
        ? t('detectedGit')
        : data.detectedType === 'url' ? t('detectedUrl') : t('detectedLocal')
      const market = (data.market ?? {}) as JsonRecord
      store.actions.toast('success', t('addedToast', {
        name: String(market.title || market.name || location.trim()),
        type: detected,
        count: typeof data.pluginCount === 'number' ? data.pluginCount : 0,
      }))
      close()
    } catch (submitError) {
      setError(errorMessageFor(submitError, t))
    } finally {
      setBusy(false)
    }
  }
  return (
    <DialogShell
      t={t}
      title={t('addMarketTitle')}
      narrow
      onClose={() => { if (!busy) close() }}
      footer={[
        <Button key="cancel" variant="secondary" disabled={busy} onClick={close}>{t('cancel')}</Button>,
        <Button key="add" variant="primary" icon="plus" disabled={busy || location.trim() === '' || !risk} onClick={() => { void submit() }}>
          {busy ? <Spinner /> : null}{busy ? t('adding') : t('add')}
        </Button>,
      ]}
    >
      <div className={css.risk}>
        <Icon name="alert" size={14} />
        <span>{t('addMarketRisk')}</span>
      </div>
      <div className={css.field}>
        <label className={css.fieldLabel} htmlFor="aph-add-source-input">{t('addMarketSourceLabel')}</label>
        <input
          id="aph-add-source-input"
          ref={inputRef}
          className={css.input}
          value={location}
          placeholder={t('addMarketSourceLabel')}
          aria-label={t('addMarketSourceLabel')}
          onChange={event => setLocation(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.nativeEvent.isComposing) void submit()
          }}
        />
        <div className={css.fieldHint}>{t('addMarketHint')}</div>
      </div>
      <div className={css.field}>
        <label className={css.fieldLabel} htmlFor="aph-add-source-name">{t('marketName')}</label>
        <input
          id="aph-add-source-name"
          className={css.input}
          value={name}
          placeholder={t('marketName')}
          onChange={event => setName(event.target.value)}
        />
      </div>
      <label className={css.check}>
        <input type="checkbox" checked={risk} onChange={event => setRisk(event.target.checked)} />
        <span>{t('addMarketRiskAck')}</span>
      </label>
      {error !== '' ? <div className={css.error} role="alert">{error}</div> : null}
    </DialogShell>
  )
}

/** Marketplace sources dialog: list with per-market refresh/remove. */
export function SourcesDialog({ useHub, store, t }: {
  useHub: UseHub
  store: { actions: HubActions }
  t: Translate
}): ReactNode {
  const state: HubState = useHub(identity)
  const snapshot = state.snapshot ?? {}
  const markets = orderMarkets<JsonRecord>((snapshot.markets as JsonRecord[] | undefined) ?? [])
  const dialog = state.dialogs.find(entry => entry.kind === 'sources') ?? { id: '' }
  const list = markets.length === 0
    ? <div className={css.emptyRow}>{t('sourcesEmpty')}</div>
    : (
      <div className={css.sourceList}>
        {markets.map((market) => {
          const busyLabel = state.marketBusy[String(market.id ?? '')] ?? ''
          const nameText = String(market.title || market.name || market.id)
          const subText = t('sourcePluginCount', { count: typeof market.pluginCount === 'number' ? market.pluginCount : 0 })
            + (typeof market.lastRefreshed === 'string' && market.lastRefreshed !== '' ? ` · ${t('sourceUpdated', { time: formatTime(market.lastRefreshed) })}` : '')
          return (
            <div key={String(market.id ?? '')} className={css.sourceRow}>
              <div className={css.sourceMain}>
                <div className={css.sourceName} title={nameText}>{nameText}</div>
                <div className={css.sourceSub} title={subText}>{subText}</div>
                {market.refreshError
                  ? (
                    <div className={css.sourceError}>
                      <Icon name="alert" size={12} />
                      <span>{t('sourceRefreshFailed', { time: formatTime(market.lastRefreshed), message: String(market.refreshError) })}</span>
                    </div>
                  )
                  : null}
              </div>
              <IconButton
                icon="refresh"
                title={t('sourceRefresh')}
                busy={busyLabel === 'refresh'}
                disabled={busyLabel !== ''}
                onClick={() => { void store.actions.refreshMarket(String(market.id ?? '')) }}
              />
              <IconButton
                icon="trash"
                title={t('sourceRemove')}
                danger
                busy={busyLabel === 'remove'}
                disabled={busyLabel !== ''}
                onClick={() => store.actions.removeMarket(market)}
              />
            </div>
          )
        })}
      </div>
    )
  return (
    <DialogShell
      t={t}
      title={t('sources')}
      onClose={() => store.actions.closeDialog(dialog.id)}
      footer={(
        <div className={css.footInline}>
          <Button variant="secondary" onClick={() => store.actions.closeDialog(dialog.id)}>{t('close')}</Button>
        </div>
      )}
    >
      {list}
    </DialogShell>
  )
}

/** Recommended-source preview dialog: read-only plugin list with refresh and one-click add. */
export function PreviewSourceDialog({ useHub, store, t }: {
  useHub: UseHub
  store: { actions: HubActions }
  t: Translate
}): ReactNode {
  const state: HubState = useHub(identity)
  const preview = state.recPreview
  if (preview === null) return null
  const snapshot = state.snapshot ?? {}
  const matched = addedMarketFor((snapshot.markets as JsonRecord[] | undefined) ?? [], preview.location)
  const adding = state.marketBusy[`rec:${preview.id}`] === 'add'
  const refreshing = preview.status === 'loading' && preview.data !== null
  const close = (): void => { store.actions.closePreview() }

  let body: ReactNode
  if (preview.status === 'loading' && preview.data === null) {
    body = <LoadingBlock text={t('catalogLoading')} />
  } else {
    const data = (preview.data ?? {}) as JsonRecord
    const plugins = (data.plugins as JsonRecord[] | undefined) ?? []
    const detected = typeof data.type === 'string' && data.type !== ''
      ? (data.type === 'git' ? t('detectedGit') : data.type === 'url' ? t('detectedUrl') : t('detectedLocal'))
      : ''
    body = (
      <>
        {preview.status === 'error' ? <div className={css.error} role="alert">{preview.error}</div> : null}
        <div className={css.previewHead}>
          <span>{t('pluginCount', { count: plugins.length })}{detected !== '' ? ` · ${detected}` : ''}</span>
          {matched !== null ? <Badge tone="success">{t('addedBadge')}</Badge> : null}
        </div>
        {plugins.length === 0
          ? <div className={css.emptyRow}>{t('marketEmpty')}</div>
          : (
            <div className={css.previewList}>
              {plugins.map((plugin, index) => {
                const display = displayOf(plugin, state.localeId)
                const nameText = String(display.title !== '' ? display.title : plugin.name ?? `#${index + 1}`)
                const descText = display.description
                return (
                  <div key={String(plugin.name ?? index)} className={css.previewRow}>
                    <div className={css.previewName} title={nameText}>{nameText}</div>
                    {descText !== '' ? <div className={css.previewDesc} title={descText}>{descText}</div> : null}
                  </div>
                )
              })}
            </div>
          )}
        {matched === null && preview.status === 'ready' ? <div className={css.previewHint}>{t('previewAddHint')}</div> : null}
      </>
    )
  }

  return (
    <DialogShell
      t={t}
      title={preview.title}
      onClose={close}
      footer={(
        <div className={css.footInline}>
          <IconButton
            icon="refresh"
            title={refreshing ? t('refreshing') : t('refresh')}
            busy={refreshing}
            disabled={refreshing}
            onClick={() => store.actions.previewRecommendedSource({ id: preview.id, location: preview.location }, true)}
          />
          {matched !== null
            ? <Badge tone="success">{t('addedBadge')}</Badge>
            : (
              <Button
                variant="primary"
                icon="plus"
                disabled={adding}
                onClick={() => { void store.actions.addRecommendedSource({ id: preview.id, location: preview.location }) }}
              >
                {adding ? <Spinner /> : null}{adding ? t('adding') : t('add')}
              </Button>
            )}
          <Button variant="secondary" onClick={close}>{t('close')}</Button>
        </div>
      )}
    >
      {body}
    </DialogShell>
  )
}

/** Generic confirm dialog with an async confirm action. */
export function ConfirmDialog({ store, t, dialog }: {
  store: { actions: HubActions }
  t: Translate
  dialog: DialogState
}): ReactNode {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const close = (): void => { if (!busy) store.actions.closeDialog(dialog.id) }
  const confirm = async (): Promise<void> => {
    if (busy) return
    setBusy(true)
    setError('')
    try {
      await dialog.onConfirm?.()
      store.actions.closeDialog(dialog.id)
    } catch (confirmError) {
      setError(errorMessageFor(confirmError, t))
    } finally {
      setBusy(false)
    }
  }
  return (
    <DialogShell
      t={t}
      title={dialog.title ?? ''}
      narrow
      onClose={close}
      footer={[
        <Button key="cancel" variant="secondary" disabled={busy} onClick={close}>{t('cancel')}</Button>,
        <Button
          key="confirm"
          variant={dialog.danger === true ? 'danger' : 'primary'}
          disabled={busy}
          onClick={() => { void confirm() }}
        >
          {busy ? <Spinner /> : null}{dialog.confirmLabel || t('confirm')}
        </Button>,
      ]}
    >
      <div className={css.confirmMessage}>{dialog.message ?? ''}</div>
      {error !== '' ? <div className={css.error} role="alert">{error}</div> : null}
    </DialogShell>
  )
}
