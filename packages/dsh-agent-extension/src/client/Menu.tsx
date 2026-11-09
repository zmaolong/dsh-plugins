/**
 * Dropdown menu: trigger button, transparent backdrop, and an elevated menu
 * surface built on the theme-owned menu material (`--dsw-menu-surface-fill` +
 * `--dsw-menu-backdrop-filter`), outer R16 with 4px padding and R12 items per
 * the radius standard. Escape closes (capture phase so the host shortcut does
 * not double-fire), and focus restores to the trigger on close.
 *
 * @module dsh-agent-extension/client/Menu
 */

import { useRef, useState, type ReactNode } from 'react'
import clsx from 'clsx'
import { Icon } from './icons.tsx'
import { Spinner } from './controls.tsx'
import { useEscapeClose, useFocusRestore } from './overlay-hooks.ts'
import type { Translate } from './presentation.ts'
import css from './Menu.module.css'

/** One menu row. */
export interface MenuItem {
  key?: string
  icon?: string
  label?: string
  danger?: boolean
  disabled?: boolean
  sep?: boolean
  onSelect: () => void
}

/** Card row menu ("more actions"). */
export function Menu({ t, items, busy = false }: { t: Translate, items: MenuItem[], busy?: boolean }): ReactNode {
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  useEscapeClose(open, () => { setOpen(false) })
  useFocusRestore(triggerRef, open)
  return (
    <div className={css.wrap}>
      <button
        type="button"
        ref={triggerRef}
        className={css.trigger}
        title={t('moreActions')}
        aria-label={t('moreActions')}
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={busy}
        onClick={(event) => {
          event.stopPropagation()
          setOpen(value => !value)
        }}
      >
        {busy ? <Spinner /> : <Icon name="more" size={16} />}
      </button>
      {open
        ? (
          <div>
            <div className={css.backdrop} onClick={() => { setOpen(false) }} />
            <div className={css.menu} role="menu">
              {items.filter(Boolean).map((entry, index) => (entry.sep
                ? <div key={`sep-${index}`} className={css.separator} />
                : (
                  <button
                    key={entry.key ?? index}
                    type="button"
                    role="menuitem"
                    className={clsx(css.item, entry.danger && css.itemDanger)}
                    disabled={entry.disabled === true}
                    onClick={(event) => {
                      event.stopPropagation()
                      setOpen(false)
                      entry.onSelect()
                    }}
                  >
                    {entry.icon !== undefined ? <Icon name={entry.icon} size={16} /> : null}
                    {entry.label}
                  </button>
                )))}
            </div>
          </div>
        )
        : null}
    </div>
  )
}
