/**
 * Sidebar panel icon (lucide Puzzle, the generic extension glyph). The host
 * hands down `size` and `active`; the glyph renders at the given size without
 * upscaling, matching the neighboring panel icons.
 *
 * @module dsh-agent-extension/client/PanelIcon
 */

import type { ReactNode } from 'react'
import { Icon } from './icons.tsx'

/** Render the sidebar entry glyph. */
export function PanelIcon({ size, active }: { size?: number, active?: boolean }): ReactNode {
  const edge = typeof size === 'number' ? size : 20
  return <Icon name="puzzle" size={Math.round(edge)} strokeWidth={active === true ? 2 : 1.7} />
}
