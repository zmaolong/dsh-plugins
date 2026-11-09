/** Presentation helpers of the client: display resolution, matching, grouping. */
import { describe, expect, it } from 'vitest'

import {
  displayOf,
  formatTime,
  groupItemsByMarket,
  iconSrc,
  matchQuery,
  orderMarkets,
  pickI18n,
  updateAvailable,
} from '../src/client/presentation.ts'

describe('presentation helpers', () => {
  it('resolves display fields with the title fallback', () => {
    const display = displayOf({ name: 'my-plugin', display: { title: 'My Plugin', description: 'desc' } }, '')
    expect(display.title).toBe('My Plugin')
    expect(display.description).toBe('desc')
    expect(displayOf({ name: 'cool_tool' }, '').title).toBe('Cool Tool')
    expect(displayOf({}, '').title).toBe('')
  })

  it('picks localized text by exact locale, prefix, then base', () => {
    const map = { 'zh-cn': '简体', zh: '中文', en: 'English' }
    expect(pickI18n('base', map, 'zh-cn')).toBe('简体')
    expect(pickI18n('base', map, 'zh')).toBe('中文')
    // The prefix loop keeps map insertion order: zh-cn wins for any zh-* variant.
    expect(pickI18n('base', map, 'zh-tw')).toBe('简体')
    expect(pickI18n('base', map, 'fr')).toBe('base')
    expect(pickI18n('base', null, 'en')).toBe('base')
  })

  it('matches search across name, display, and market fields', () => {
    const item = {
      name: 'demo',
      market: { name: 'my-market', title: 'My Market' },
      display: { title: 'Demo Plugin', description: 'does things', keywords: ['alpha'] },
    }
    expect(matchQuery(item, 'DEMO', '')).toBe(true)
    expect(matchQuery(item, 'market', '')).toBe(true)
    expect(matchQuery(item, 'alpha', '')).toBe(true)
    expect(matchQuery(item, 'missing', '')).toBe(false)
    expect(matchQuery(item, '', '')).toBe(true)
  })

  it('orders markets by lastRefreshed descending with missing values sinking', () => {
    const markets = [
      { name: 'b', lastRefreshed: '2026-01-01T00:00:00Z' },
      { name: 'a' },
      { name: 'c', lastRefreshed: '2026-02-01T00:00:00Z' },
    ]
    expect(orderMarkets(markets).map(market => (market as { name: string }).name)).toEqual(['c', 'b', 'a'])
  })

  it('groups items by market and sorts items by title', () => {
    const groups = groupItemsByMarket(
      [
        { key: 'm1/b', market: { id: 'm1' }, display: { title: 'B' } },
        { key: 'm1/a', market: { id: 'm1' }, display: { title: 'A' } },
        { key: 'm2/c', market: { id: 'm2' }, display: { title: 'C' } },
      ],
      [{ id: 'm2', name: 'two' }, { id: 'm1', name: 'one' }],
    )
    expect(groups.map(group => group.market.id)).toEqual(['m1', 'm2'])
    expect(groups[0]?.items.map(item => item.key)).toEqual(['m1/a', 'm1/b'])
  })

  it('counts updates only for the available state', () => {
    expect(updateAvailable({ update: { state: 'available' } })).toBe(true)
    expect(updateAvailable({ update: { state: 'unknown' } })).toBe(false)
    expect(updateAvailable({})).toBe(false)
  })

  it('formats local times and keeps invalid values empty', () => {
    expect(formatTime('not-a-date')).toBe('')
    expect(formatTime('')).toBe('')
    expect(formatTime('2026-01-05T06:07:00Z')).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/u)
  })

  it('builds icon sources only from the same-origin route, https, or data rasters', () => {
    expect(iconSrc({ kind: 'route', url: '/agent-plugin/api/icon?key=k&v=1' })).toBe('/agent-plugin/api/icon?key=k&v=1')
    expect(iconSrc({ kind: 'route', url: 'https://evil.example/icon' })).toBe('')
    expect(iconSrc({ kind: 'http', url: 'https://example.com/a.png' })).toBe('https://example.com/a.png')
    expect(iconSrc({ kind: 'http', url: 'http://example.com/a.png' })).toBe('')
    expect(iconSrc({ kind: 'data', url: 'data:image/png;base64,AAAA' })).toBe('data:image/png;base64,AAAA')
    expect(iconSrc({ kind: 'data', url: 'data:image/svg+xml;base64,AAAA' })).toBe('')
  })
})
