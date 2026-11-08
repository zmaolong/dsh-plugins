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

/** The curated list: Anthropic's official marketplace plus popular community collections. */
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
  {
    id: 'superpowers',
    location: 'https://github.com/obra/superpowers',
    format: 'claude',
    display: {
      title: 'Superpowers Skills',
      titleI18n: { zh: 'Superpowers 技能合集', en: 'Superpowers Skills' },
      description: 'The popular community skills collection for Claude Code by obra.',
      descriptionI18n: {
        zh: '社区热门的 Claude 技能合集（obra/superpowers），为 Claude Code 注入超能力。',
        en: 'The popular community skills collection for Claude Code by obra.',
      },
    },
  },
  {
    id: 'mattpocock-skills',
    location: 'https://github.com/mattpocock/skills',
    format: 'claude',
    display: {
      title: 'Matt Pocock’s Skills',
      titleI18n: { zh: 'Matt Pocock 技能市场', en: 'Matt Pocock’s Skills' },
      description: 'A Claude skills marketplace maintained by TypeScript educator Matt Pocock.',
      descriptionI18n: {
        zh: '由 TypeScript 教育者 Matt Pocock 维护的 Claude 技能市场。',
        en: 'A Claude skills marketplace maintained by TypeScript educator Matt Pocock.',
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
