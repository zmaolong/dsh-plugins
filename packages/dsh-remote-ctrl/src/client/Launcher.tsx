/**
 * Sidebar-foot launcher and the frame-wide Remote Control dialog it opens.
 *
 * The dialog is a real modal: it portals beside `#root`, paints the shared
 * mask token over every column, keeps its own focus (`Tab` cycles inside,
 * `Escape` and a mask click close it), and returns focus to the trigger.
 * Polling runs only while the dialog is open. The trigger gains the host
 * row-hover fill on hover; its enabled state still paints the glyph amber but
 * never the fill.
 *
 * While the sidebar is expanded the trigger itself does not stay in the
 * footer actions row: it portals beside the account launcher in the settings
 * trigger row (`sidebar-row.ts`), so one row carries both the avatar and this
 * action. The collapsed rail keeps the footer row, which is the only place
 * with room in 56px of column.
 *
 * @module dsh-remote-ctrl/client/Launcher
 */

import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { PanelIcon } from './PanelIcon.tsx'
import { Panel } from './Panel.tsx'
import type { PanelProps } from './Panel.tsx'
import { useSidebarRowAnchor } from './sidebar-row.ts'
import css from './panel.module.css'

/** Props of Launcher (bound from the slot registration). */
export interface LauncherProps extends PanelProps {
  /** Whether the sidebar renders wide content (false = 56px rail). */
  wide: boolean
}

/** Elements that take focus inside the modal. */
const FOCUSABLE = [
  'button:not([disabled])',
  '[href]',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ')

/** Render the sidebar-foot launcher and its dialog. */
export function Launcher({ wide, useRemote, actions, t }: LauncherProps): ReactNode {
  const [open, setOpen] = useState(false)
  const listening = useRemote(state => state.data?.listening === true)
  const pending = useRemote(state => state.pending)
  const trigger = useRef<HTMLButtonElement>(null)
  const dialog = useRef<HTMLDivElement>(null)
  const wasOpen = useRef(false)
  const titleId = useId()
  const { mountRef, anchor } = useSidebarRowAnchor(wide)

  // Hand focus back to the trigger once the portal is gone (a focused node
  // inside the removed dialog would otherwise leave focus on <body>).
  useEffect(() => {
    if (wasOpen.current && !open) trigger.current?.focus()
    wasOpen.current = open
  }, [open])

  // The trigger paints the enabled state before the dialog is ever opened, so
  // read the status once on mount; opening the dialog switches to polling.
  useEffect(() => {
    actions.load()
  }, [actions])

  // Poll only while the dialog is open; the store keeps the last snapshot.
  useEffect(() => {
    if (!open) return
    actions.init()
    return () => { actions.destroy() }
  }, [actions, open])

  // Modal focus: own the keyboard, cycle Tab inside, and hand focus back to
  // the trigger when the dialog closes.
  useEffect(() => {
    if (!open) return
    const panel = dialog.current
    panel?.focus()
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault()
        setOpen(false)
        return
      }
      if (event.key !== 'Tab' || panel === null) return
      const nodes = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE))
      const first = nodes[0]
      const last = nodes[nodes.length - 1]
      if (first === undefined || last === undefined) return
      if (event.shiftKey) {
        if (document.activeElement === first || document.activeElement === panel) {
          event.preventDefault()
          last.focus()
        }
        return
      }
      if (document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown, true)
    return () => {
      document.removeEventListener('keydown', onKeyDown, true)
    }
  }, [open])

  const close = (): void => { setOpen(false) }

  // The mount span only locates the sidebar foot; the row anchor portal host
  // is the row itself when the shipped structure was found.
  const mount = <span ref={mountRef} data-remote-ctrl-mount="" style={{ display: 'none' }} />

  const popup = open && createPortal((
    <div className={css.overlay}>
      <div className={css.mask} aria-hidden="true" data-remote-ctrl-mask onClick={close} />
      <div
        ref={dialog}
        className={css.dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        data-remote-ctrl-dialog
      >
        <header className={css.dialogHeader}>
          <span className={css.dialogIcon} aria-hidden="true"><PanelIcon size={20} /></span>
          <span className={css.dialogHeading}>
            <span className={css.dialogTitle} id={titleId}>{t('title')}</span>
            <span className={css.dialogSubtitle}>{t('subtitle')}</span>
          </span>
        </header>
        <button type="button" className={css.closeButton} aria-label={t('close')} data-remote-ctrl-close onClick={close}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>
        <div className={css.dialogBody} data-remote-ctrl-dialog-body>
          <Panel useRemote={useRemote} actions={actions} t={t} />
        </div>
      </div>
    </div>
  ), document.body)

  const launcher = (
    <button
      ref={trigger}
      type="button"
      className={css.trigger}
      aria-label={t('title')}
      aria-haspopup="dialog"
      aria-expanded={open}
      title={listening ? `${t('title')} · ${t('running')}` : t('title')}
      data-remote-ctrl-trigger
      data-active={listening}
      onClick={() => {
        if (open) {
          setOpen(false)
          return
        }
        setOpen(true)
        // ZCode parity: opening the dialog brings the gateway up.
        if (!listening && !pending) void actions.start()
      }}
    >
      <PanelIcon active={listening} size={wide ? 16 : 18} />
    </button>
  )

  // Anchor resolution is one post-mount pass; render nothing meanwhile so the
  // entry never flashes in the footer row before moving beside the avatar.
  if (anchor === undefined) return mount
  if (anchor !== null) {
    return (
      <>
        {mount}
        {popup}
        {createPortal(launcher, anchor)}
      </>
    )
  }
  return (
    <div className={wide ? css.layer : `${css.layer} ${css.rail}`}>
      {mount}
      {popup}
      {launcher}
    </div>
  )
}