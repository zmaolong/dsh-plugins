/**
 * Curated recommended market sources of the store's "Recommended" tab: a
 * package-level constant list the user can add with one click. Entries are
 * shaped like server-side display records so `displayOf` resolves their
 * localized title/description without new plumbing.
 *
 * @module dsh-agent-plugin-hub/client/recommended
 */

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

/** Normalize a source location for the "already added" comparison. */
function normalizedLocation(location: unknown): string {
  return String(location ?? '')
    .trim()
    .replace(/\/+$/, '')
    .replace(/\.git$/i, '')
    .toLowerCase()
}

/** Whether a market with the same normalized location exists among the added markets. */
export function isSourceAdded(markets: readonly unknown[], location: string): boolean {
  const wanted = normalizedLocation(location)
  if (wanted === '') return false
  return (Array.isArray(markets) ? markets : []).some((market) => {
    const record = (market && typeof market === 'object' ? market : {}) as JsonRecord
    return normalizedLocation(record.location) === wanted
  })
}
