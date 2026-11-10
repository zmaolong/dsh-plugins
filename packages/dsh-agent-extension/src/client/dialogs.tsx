/**
 * Dialogs hosted in `shell.overlay`: add-source, marketplace sources, and the
 * generic confirm. The shell renders only the top dialog of the stack; the
 * mask material and dialog geometry follow the official Modal (prominent
 * elevation, panel radius, theme-owned mask).
 *
 * @module dsh-agent-extension/client/dialogs
 */

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react'
import clsx from 'clsx'
import { Button, IconButton, Spinner } from './controls.tsx'
import { Icon } from './icons.tsx'
import { useEscapeClose } from './overlay-hooks.ts'
import { identity, type DialogState, type HubActions, type HubState, type UseHub } from './store.ts'
import { formatTime, errorMessageFor, orderMarkets, type JsonRecord, type Translate } from './presentation.ts'
import css from './dialogs.module.css'

/** Scrollable ancestor that is the host's main-panel viewport, if any. */
function panelViewportOf(node: HTMLElement): HTMLElement | null {
  for (let parent = node.parentElement; parent !== null; parent = parent.parentElement) {
    const overflowY = getComputedStyle(parent).overflowY
    if (overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'overlay') return parent
  }
  return null
}

/**
 * In-panel dialog layer: anchors the mask to the host main-panel viewport
 * instead of the whole window, so dialogs stay centered in the content area
 * while sidebars, split panes, or the window change size. Falls back to the
 * viewport when the panel has no scrollable ancestor (tests, plain DOM).
 */
export function PanelDialogLayer({ children }: { children: ReactNode }): ReactNode {
  const layerRef = useRef<HTMLDivElement | null>(null)
  const [style, setStyle] = useState<CSSProperties | undefined>(undefined)
  useLayoutEffect(() => {
    const layer = layerRef.current
    if (layer === null) return undefined
    const viewport = panelViewportOf(layer)
    if (viewport === null) return undefined
    const measure = (): void => {
      const box = viewport.getBoundingClientRect()
      // clientWidth/Height drop the scrollbar gutters: a click on the gutter must
      // scroll the list, not land on the mask and close the dialog.
      const width = viewport.clientWidth
      const height = viewport.clientHeight
      if (width <= 0 || height <= 0) return
      setStyle({ left: box.left, top: box.top, width, height })
    }
    measure()
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(measure) : undefined
    observer?.observe(viewport)
    window.addEventListener('resize', measure)
    return () => {
      observer?.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [])
  return <div ref={layerRef} className={css.regionLayer} style={style}>{children}</div>
}

/** Focusable descendants of the dialog, in document order. */
function focusablesIn(dialog: HTMLElement): HTMLElement[] {
  return Array.from(dialog.querySelectorAll<HTMLElement>('a[href], button, input, select, textarea, [tabindex]'))
    .filter((element) => {
      if (element.hasAttribute('disabled')) return false
      if (element.getAttribute('tabindex') === '-1') return false
      if (element.getAttribute('aria-hidden') === 'true') return false
      return true
    })
}

/** Shell of every dialog: mask, card, header, body, footer. */
export function DialogShell({ t, title, titleMeta, children, footer, narrow = false, wide = false, onClose }: {
  t: Translate
  title: string
  /** Optional metadata next to the title (e.g. a row id with its copy action). */
  titleMeta?: ReactNode
  children: ReactNode
  footer?: ReactNode
  narrow?: boolean
  wide?: boolean
  onClose?: () => void
}): ReactNode {
  const dialogRef = useRef<HTMLDivElement | null>(null)
  // Keep Tab / Shift+Tab inside the dialog: the page behind the mask must not
  // receive focus while a modal is open. Initial focus and Escape stay as is.
  const trapFocus = (event: ReactKeyboardEvent<HTMLDivElement>): void => {
    if (event.key !== 'Tab') return
    const dialog = dialogRef.current
    if (dialog === null) return
    const focusables = focusablesIn(dialog)
    if (focusables.length === 0) {
      event.preventDefault()
      dialog.focus()
      return
    }
    const first = focusables[0]!
    const last = focusables[focusables.length - 1]!
    const active = document.activeElement
    const outside = active === null || active === dialog || !dialog.contains(active)
    if (event.shiftKey ? (active === first || outside) : (active === last || outside)) {
      event.preventDefault()
      if (event.shiftKey) last.focus()
      else first.focus()
    }
  }
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
        className={clsx(css.dialog, narrow && css.dialogNarrow, wide && css.dialogWide)}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        onKeyDown={trapFocus}
      >
        <div className={css.head}>
          <h2 className={css.title} title={title}>{title}</h2>
          {titleMeta ?? null}
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
