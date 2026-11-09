/**
 * Topbar "Add" dropdown with the add-marketplace entry.
 *
 * @module dsh-agent-extension/client/AddMenu
 */

import { useRef, useState, type ReactNode } from 'react'
import { Button } from './controls.tsx'
import { Icon } from './icons.tsx'
import { useEscapeClose, useFocusRestore } from './overlay-hooks.ts'
import type { Translate } from './presentation.ts'
import css from './Menu.module.css'

/** Render the add dropdown. */
export function AddMenu({ t, onAdd }: { t: Translate, onAdd: () => void }): ReactNode {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement | null>(null)
  useEscapeClose(open, () => { setOpen(false) })
  useFocusRestore(wrapRef, open)
  return (
    <div ref={wrapRef} className={css.wrap} tabIndex={-1}>
      <Button
        variant="secondary"
        onClick={(event) => {
          event.stopPropagation()
          setOpen(value => !value)
        }}
      >
        <Icon name="plus" size={14} />{t('add')}<Icon name="chevronDown" size={14} />
      </Button>
      {open
        ? (
          <div>
            <div className={css.backdrop} onClick={() => { setOpen(false) }} />
            <div className={css.menu} role="menu" style={{ minWidth: 200 }}>
              <button
                type="button"
                role="menuitem"
                className={css.item}
                onClick={() => {
                  setOpen(false)
                  onAdd()
                }}
              >
                <Icon name="plus" size={15} />
                {t('addMarketplace')}
              </button>
            </div>
          </div>
        )
        : null}
    </div>
  )
}
