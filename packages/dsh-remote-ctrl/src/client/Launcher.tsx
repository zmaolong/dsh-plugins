/**
 * Sidebar-foot launcher: a compact icon button that opens the Remote Control
 * popup above itself. The sidebar clips overflow, so the popup is
 * `position: fixed` and anchors to the trigger's measured box; polling runs
 * only while the popup is open and keeps its last snapshot between openings.
 *
 * @module dsh-remote-ctrl/client/Launcher
 */

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { PanelIcon } from './PanelIcon.tsx'
import { Panel } from './Panel.tsx'
import type { PanelProps } from './Panel.tsx'
import css from './panel.module.css'

/** Props of Launcher (bound from the slot registration). */
export interface LauncherProps extends PanelProps {
  /** Whether the sidebar renders wide content (false = 56px rail). */
  wide: boolean
}

/** Gap between the trigger and the popup. */
const POPUP_GAP = 8

/** Render the sidebar-foot launcher and its popup. */
export function Launcher({ wide, useRemote, actions, t }: LauncherProps): ReactNode {
  const [open, setOpen] = useState(false)
  const listening = useRemote(state => state.data?.listening === true)
  const root = useRef<HTMLDivElement>(null)
  const [anchor, setAnchor] = useState<{ left: number; bottom: number }>()

  // The sidebar clips overflow, so the popup hugs the trigger through a
  // measured fixed offset instead of document flow.
  useLayoutEffect(() => {
    if (!open) return
    const place = (): void => {
      const rect = root.current?.getBoundingClientRect()
      if (rect === undefined) return
      setAnchor({ left: rect.left, bottom: window.innerHeight - rect.top + POPUP_GAP })
    }
    place()
    window.addEventListener('resize', place)
    return () => { window.removeEventListener('resize', place) }
  }, [open])

  useEffect(() => {
    if (!open) return
    actions.init()
    return () => { actions.destroy() }
  }, [actions, open])

  useEffect(() => {
    if (!open) return
    const dismiss = (event: Event): void => {
      if (event.target instanceof Node && root.current?.contains(event.target) === true) return
      setOpen(false)
    }
    const escape = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', dismiss, true)
    document.addEventListener('keydown', escape)
    return () => {
      document.removeEventListener('pointerdown', dismiss, true)
      document.removeEventListener('keydown', escape)
    }
  }, [open])

  const style: CSSProperties | undefined = anchor === undefined
    ? undefined
    : { left: anchor.left, bottom: anchor.bottom }

  return (
    <div ref={root} className={wide ? css.layer : `${css.layer} ${css.rail}`}>
      {open && style !== undefined && (
        <section
          className={css.popup}
          style={style}
          role="dialog"
          aria-label={t('title')}
          data-remote-ctrl-popup
        >
          <header className={css.popupHeader}>
            <span className={css.popupTitle}>{t('title')}</span>
          </header>
          <div className={css.popupBody}>
            <Panel useRemote={useRemote} actions={actions} t={t} />
          </div>
        </section>
      )}
      <button
        type="button"
        className={css.trigger}
        aria-label={t('title')}
        aria-haspopup="dialog"
        aria-expanded={open}
        title={t('title')}
        data-remote-ctrl-trigger
        onClick={() => { setOpen(value => !value) }}
      >
        <PanelIcon size={wide ? 16 : 18} />
        {listening && <span className={css.dot} aria-hidden />}
      </button>
    </div>
  )
}