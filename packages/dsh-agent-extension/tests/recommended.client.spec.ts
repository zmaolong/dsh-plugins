/** Recommended-tab data: curated list shape and added-source matching. */
import { describe, expect, it } from 'vitest'

import { RECOMMENDED_SOURCES, isSourceAdded } from '../src/client/recommended.ts'

describe('RECOMMENDED_SOURCES', () => {
  it('carries unique https locations and localized display blocks', () => {
    const ids = new Set(RECOMMENDED_SOURCES.map(entry => entry.id))
    expect(ids.size).toBe(RECOMMENDED_SOURCES.length)
    for (const entry of RECOMMENDED_SOURCES) {
      expect(entry.location).toMatch(/^https:\/\//)
      expect(entry.format.trim()).not.toBe('')
      expect(entry.display.titleI18n.en?.trim() ?? '').not.toBe('')
      expect(entry.display.descriptionI18n.zh?.trim() ?? '').not.toBe('')
    }
  })
})

describe('isSourceAdded', () => {
  const markets = [
    { id: 'a', location: 'https://github.com/anthropics/claude-plugins-official' },
    { id: 'b', location: 'https://example.com/market.json' },
  ]

  it('matches normalized locations regardless of case, .git suffix, and trailing slash', () => {
    expect(isSourceAdded(markets, 'https://github.com/anthropics/claude-plugins-official.git/')).toBe(true)
    expect(isSourceAdded(markets, 'https://github.com/Anthropics/Claude-Plugins-Official')).toBe(true)
    expect(isSourceAdded(markets, 'https://example.com/market.json/')).toBe(true)
    expect(isSourceAdded(markets, 'https://github.com/anthropics/other')).toBe(false)
  })

  it('rejects empty locations and missing market lists', () => {
    expect(isSourceAdded(markets, '   ')).toBe(false)
    expect(isSourceAdded([], 'https://github.com/anthropics/claude-plugins-official')).toBe(false)
    expect(isSourceAdded(undefined as unknown as readonly unknown[], 'x')).toBe(false)
  })
})
