/**
 * Curated recommended market sources of the store's "Recommended" tab: a
 * package-level constant list the user can add with one click. Entries are
 * shaped like server-side display records so `displayOf` resolves their
 * localized title/description without new plumbing.
 *
 * @module dsh-agent-plugin-hub/client/recommended
 */

import { marketLocationKey } from '../location-key.ts'
import type { JsonRecord } from './presentation.ts'

/** One curated market source of the Recommended tab. */
export interface RecommendedSource {
  id: string
  location: string
  format: string
  display: {
    title: string
    titleI18n: Record<string, string>
    description: string
    descriptionI18n: Record<string, string>
  }
}

/** The curated list (first entry: Anthropic's official Claude plugin marketplace). */
export const RECOMMENDED_SOURCES: readonly RecommendedSource[] = Object.freeze([
  {
    id: 'claude-plugins-official',
    location: 'https://github.com/anthropics/claude-plugins-official',
    format: 'claude',
    display: {
      // Base text is English so non-zh/en locales fall back to English; zh/en resolve from the maps.
      title: 'Anthropic Official Plugins',
      titleI18n: { zh: 'Anthropic 官方插件市场', en: 'Anthropic Official Plugins' },
      description: 'Anthropic’s officially maintained catalog of high-quality Claude plugins.',
      descriptionI18n: {
        zh: 'Anthropic 官方维护的高质量 Claude 插件目录，持续更新。',
        en: 'Anthropic’s officially maintained catalog of high-quality Claude plugins.',
      },
    },
  },
])

/**
 * The added market equivalent to a recommended location, if any. Prefers the
 * server-provided `locationKey` on market summaries; falls back to computing
 * the canonical key client-side.
 */
export function addedMarketFor(markets: readonly unknown[], location: string): JsonRecord | null {
  const wanted = marketLocationKey(location)
  if (wanted === '') return null
  for (const market of Array.isArray(markets) ? markets : []) {
    const record = (market && typeof market === 'object' ? market : {}) as JsonRecord
    const key = typeof record.locationKey === 'string' && record.locationKey !== ''
      ? record.locationKey
      : marketLocationKey(record.location)
    if (key === wanted) return record
  }
  return null
}

/** Whether a market equivalent to the given location exists among the added markets. */
export function isSourceAdded(markets: readonly unknown[], location: string): boolean {
  return addedMarketFor(markets, location) !== null
}
