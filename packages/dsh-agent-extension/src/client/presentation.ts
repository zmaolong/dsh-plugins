/**
 * Pure presentation helpers of the store panel: display resolution, i18n
 * picking, search matching, grouping, and error text mapping. No React, no
 * network — the views and the controller both consume these.
 *
 * @module dsh-agent-extension/client/presentation
 */

/** Loose JSON object shape the host API returns. */
export type JsonRecord = Record<string, unknown>

/** Display descriptor produced by the host (`display` block). */
export interface DisplayBlock {
  title?: unknown
  titleI18n?: unknown
  description?: unknown
  descriptionI18n?: unknown
  category?: unknown
  author?: unknown
  homepage?: unknown
  repository?: unknown
  license?: unknown
  keywords?: unknown
  icon?: unknown
  [key: string]: unknown
}

/** Resolved display fields a view renders. */
export interface ResolvedDisplay {
  title: string
  description: string
  category: string
  author: { name?: unknown, [key: string]: unknown } | null
  homepage: string
  repository: string
  license: string
  keywords: unknown[]
  icon: { kind?: unknown, url?: unknown, [key: string]: unknown }
}

/** Icon descriptor guard. */
export interface IconDescriptorView {
  kind?: unknown
  url?: unknown
}

function isObject(value: unknown): value is JsonRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

export function errorMessage(error: unknown): string {
  if (error && typeof (error as { message?: unknown }).message === 'string' && (error as { message: string }).message !== '') {
    return (error as { message: string }).message
  }
  return String(error)
}

/** Host stable error code → locale key (bad_request keeps the server text). */
const ERROR_MESSAGE_KEYS: Record<string, string> = {
  forbidden: 'errorForbidden',
  not_found: 'errorNotFound',
  conflict: 'errorConflict',
  operation_in_progress: 'operationBusy',
  market_unavailable: 'errorSourceUnavailable',
  source_unavailable: 'errorSourceUnavailable',
  version_invalid: 'errorVersionInvalid',
  network_error: 'errorNetwork',
  git_error: 'errorGit',
  internal: 'errorInternal',
}

/** Translator face the presentation helpers accept. */
export type Translate = (key: string, vars?: Record<string, unknown>) => string

/** Localize an error by its code; unknown codes fall back to the server text. */
export function errorMessageFor(error: unknown, t: Translate): string {
  const code = error && typeof (error as { code?: unknown }).code === 'string' ? (error as { code: string }).code : ''
  const key = ERROR_MESSAGE_KEYS[code]
  if (key !== undefined) {
    const text = t(key)
    if (typeof text === 'string' && text !== '' && text !== key) return text
  }
  return errorMessage(error)
}

function pad2(value: number): string {
  return String(value).padStart(2, '0')
}

/** `YYYY-MM-DD HH:mm` in local time; empty for absent/invalid values. */
export function formatTime(value: unknown): string {
  if (typeof value !== 'string' || value.trim() === '') return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())} ${pad2(date.getHours())}:${pad2(date.getMinutes())}`
}

/** `plugin-name` → `Plugin Name` (title fallback). */
export function canonicalTitle(name: unknown): string {
  const text = String(name ?? '')
  const words = text.split(/[-_\s]+/u).filter(Boolean)
  if (words.length === 0) return text
  return words.map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')
}

/** Localized pick: exact locale → language prefix → base text. */
export function pickI18n(base: unknown, map: unknown, localeId: unknown): string {
  const id = String(localeId ?? '').toLowerCase()
  if (isObject(map) && id !== '') {
    const exact = map[id]
    if (typeof exact === 'string' && exact.trim() !== '') return exact
    const prefix = id.split('-')[0] ?? ''
    for (const key of Object.keys(map)) {
      const keyId = key.toLowerCase()
      if (keyId === id || (prefix !== '' && keyId.split('-')[0] === prefix)) {
        const value = map[key]
        if (typeof value === 'string' && value.trim() !== '') return value
      }
    }
  }
  return typeof base === 'string' && base.trim() !== '' ? base : ''
}

/** Display fields of one catalog item / installed item. */
export function displayOf(entity: unknown, localeId: unknown): ResolvedDisplay {
  const record = isObject(entity) ? entity : {}
  const display = isObject(record.display) ? record.display as DisplayBlock : {}
  const title = pickI18n(display.title, display.titleI18n, localeId) || canonicalTitle(record.name)
  const description = pickI18n(display.description, display.descriptionI18n, localeId)
  const author = isObject(display.author)
    ? display.author
    : (typeof display.author === 'string' && display.author !== '' ? { name: display.author } : null)
  return {
    title,
    description,
    category: typeof display.category === 'string' ? display.category : '',
    author,
    homepage: typeof display.homepage === 'string' ? display.homepage : '',
    repository: typeof display.repository === 'string' ? display.repository : '',
    license: typeof display.license === 'string' ? display.license : '',
    keywords: Array.isArray(display.keywords) ? display.keywords : [],
    icon: isObject(display.icon) ? display.icon : { kind: 'none', url: null },
  }
}

/** Only https links render as external anchors. */
export function httpsUrl(value: unknown): string {
  return typeof value === 'string' && /^https:\/\//iu.test(value) ? value : ''
}

/** Icon src: only the same-origin /icon route, https links, or allowed data rasters. */
export function iconSrc(icon: unknown): string {
  if (!isObject(icon)) return ''
  if (icon.kind === 'route' && typeof icon.url === 'string' && icon.url.startsWith('/agent-plugin/api/icon')) return icon.url
  if (icon.kind === 'http' && typeof icon.url === 'string' && httpsUrl(icon.url) !== '') return icon.url
  if (icon.kind === 'data' && typeof icon.url === 'string' && /^data:image\/(png|jpeg|webp|gif);base64,/iu.test(icon.url)) return icon.url
  return ''
}

/** Search match: name/display/description/category/author/keywords/market, case-insensitive substring. */
export function matchQuery(item: unknown, query: unknown, localeId: unknown): boolean {
  const keyword = String(query ?? '').trim().toLowerCase()
  if (keyword === '') return true
  const record = isObject(item) ? item : {}
  const display = displayOf(item, localeId)
  const market = isObject(record.market) ? record.market : {}
  const fields = [
    record.name,
    display.title,
    display.description,
    display.category,
    display.author && display.author.name,
    ...display.keywords,
    market.name,
    market.title,
  ]
  return fields.some(value => typeof value === 'string' && value.toLowerCase().includes(keyword))
}

/** Market order: lastRefreshed descending, missing sinks to the bottom, ties by name. */
export function orderMarkets<T>(markets: readonly T[] | unknown): T[] {
  return [...(Array.isArray(markets) ? markets : [])].sort((left, right) => {
    const a = left as JsonRecord | null
    const b = right as JsonRecord | null
    const leftTime = a && typeof a.lastRefreshed === 'string' && a.lastRefreshed !== '' ? Date.parse(a.lastRefreshed) : 0
    const rightTime = b && typeof b.lastRefreshed === 'string' && b.lastRefreshed !== '' ? Date.parse(b.lastRefreshed) : 0
    const leftValid = Number.isFinite(leftTime) && leftTime > 0
    const rightValid = Number.isFinite(rightTime) && rightTime > 0
    if (leftValid !== rightValid) return leftValid ? -1 : 1
    if (leftValid && rightValid && leftTime !== rightTime) return rightTime - leftTime
    const leftName = String((a && (a.title || a.name)) || '')
    const rightName = String((b && (b.title || b.name)) || '')
    return leftName.localeCompare(rightName)
  })
}

/** One market group of catalog items. */
export interface MarketGroup {
  market: JsonRecord
  items: JsonRecord[]
}

/** Personal section: items grouped by market source. */
export function groupItemsByMarket(items: readonly unknown[] | unknown, markets: readonly unknown[] | unknown): MarketGroup[] {
  const sortedMarkets = orderMarkets<JsonRecord>(markets)
  const buckets = new Map<string, JsonRecord[]>()
  for (const item of Array.isArray(items) ? items : []) {
    const record = isObject(item) ? item : {}
    const market = isObject(record.market) ? record.market : null
    const marketId = market ? String(market.id ?? '') : ''
    const bucket = buckets.get(marketId)
    if (bucket) bucket.push(record)
    else buckets.set(marketId, [record])
  }
  const groups: MarketGroup[] = []
  for (const market of sortedMarkets) {
    const list = buckets.get(String(market.id ?? '')) ?? []
    if (list.length === 0) continue
    groups.push({ market, items: [...list] })
    buckets.delete(String(market.id ?? ''))
  }
  for (const [marketId, list] of buckets) {
    if (list.length === 0) continue
    const first = list[0]
    const market = (first && isObject(first.market) ? first.market : null) ?? { id: marketId, name: marketId, title: marketId }
    groups.push({ market, items: [...list] })
  }
  for (const group of groups) {
    group.items.sort((left, right) => displayOf(left, '').title.localeCompare(displayOf(right, '').title))
  }
  return groups
}

/** Updatable judgment: only `available` counts; `unknown` never misreports. */
export function updateAvailable(entity: unknown): boolean {
  const record = isObject(entity) ? entity : null
  const update = record && isObject(record.update) ? record.update : null
  return update?.state === 'available'
}

/** Display names for a collapse row. */
export function displayNames(items: readonly unknown[], localeId: unknown, limit: number): string[] {
  return items.slice(0, limit).map(item => displayOf(item, localeId).title)
}
