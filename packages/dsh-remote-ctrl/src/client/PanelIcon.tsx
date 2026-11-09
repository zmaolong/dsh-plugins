/**
 * Remote Control glyph (lucide Smartphone) shared by the sidebar-foot trigger
 * and the popup. The caller chooses the edge; the glyph never upscales.
 *
 * @module dsh-remote-ctrl/client/PanelIcon
 */

import type { ReactNode } from 'react'

/** Render the Remote Control glyph. */
export function PanelIcon({ size, active }: { size?: number, active?: boolean }): ReactNode {
  const edge = typeof size === 'number' ? size : 20
  const stroke = active === true ? 2 : 1.7
  return (
    <svg
      width={Math.round(edge)}
      height={Math.round(edge)}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      style={{ display: 'block', flex: 'none' }}
    >
      <rect x="5" y="2" width="14" height="20" rx="2" ry="2" />
      <path d="M12 18h.01" />
    </svg>
  )
}