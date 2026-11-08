/**
 * Switch: two-state toggle copied from the official ui-primitives Switch
 * (36×20 track, 2px padding, 16px thumb) since a plugin cannot import the
 * primitives package. The on/off appearance keys off `aria-checked` so the
 * visual state cannot disagree with the state assistive technology reads, and
 * every full-round shape pairs `corner-shape: round` to escape the host's
 * global superellipse.
 *
 * @module dsh-agent-plugin-hub/client/Switch
 */

import type { ReactNode } from 'react'
import css from './Switch.module.css'

/**
 * Render a toggle switch.
 * @param props.checked - the current state; the control is fully controlled.
 * @param props.onChange - called with the state the click asks for.
 * @param props.label - localized accessible name, owned by the render site.
 * @param props.disabled - whether the control refuses input; owners also set it while a write is in flight.
 * @param props.onToggleClick - extra click interception for row activation (stops propagation).
 */
export function Switch({ checked, onChange, label, disabled = false, onToggleClick }: {
  checked: boolean
  onChange: (next: boolean) => void
  label: string
  disabled?: boolean
  onToggleClick?: (event: React.MouseEvent<HTMLButtonElement>) => void
}): ReactNode {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      title={label}
      disabled={disabled}
      className={css.switch}
      onClick={(event) => {
        onToggleClick?.(event)
        event.stopPropagation()
        if (!disabled) onChange(!checked)
      }}
    >
      <span className={css.thumb} />
    </button>
  )
}
