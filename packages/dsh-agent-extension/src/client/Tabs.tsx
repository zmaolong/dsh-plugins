/**
 * Segmented tablist shared by the panel sections (plugins / memory / skills)
 * and the store view tabs: roving tabindex plus Arrow/Home/End navigation and
 * ARIA tab/tabpanel wiring, styled as host segmented pills.
 *
 * @module dsh-agent-extension/client/Tabs
 */

import type { ReactNode } from 'react'
import css from './panel.module.css'

/** One tab entry. */
export interface TabItem<T extends string> {
  value: T
  label: string
}

/**
 * Render a segmented tablist; the caller owns the matching tabpanel.
 * @param props.idPrefix - prefix of the tab element ids (`<prefix>-<value>`).
 * @param props.panelId - id of the tabpanel the tabs control.
 */
export function Tabs<T extends string>({ items, value, onChange, label, idPrefix, panelId }: {
  items: ReadonlyArray<TabItem<T>>
  value: T
  onChange: (value: T) => void
  label: string
  idPrefix: string
  panelId: string
}): ReactNode {
  return (
    <div className={css.segmented} role="tablist" aria-label={label}>
      {items.map(entry => (
        <button
          key={entry.value}
          type="button"
          role="tab"
          id={`${idPrefix}-${entry.value}`}
          className={css.segment}
          aria-selected={value === entry.value}
          aria-controls={panelId}
          tabIndex={value === entry.value ? 0 : -1}
          onClick={() => onChange(entry.value)}
          onKeyDown={(event) => {
            if (!['ArrowLeft', 'ArrowUp', 'ArrowRight', 'ArrowDown', 'Home', 'End'].includes(event.key)) return
            event.preventDefault()
            const current = items.findIndex(item => item.value === value)
            const next = event.key === 'Home' ? 0
              : event.key === 'End' ? items.length - 1
              : event.key === 'ArrowLeft' || event.key === 'ArrowUp'
                ? (current + items.length - 1) % items.length
                : (current + 1) % items.length
            const target = items[next]
            if (!target) return
            onChange(target.value)
            event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus()
          }}
        >
          {entry.label}
        </button>
      ))}
    </div>
  )
}
