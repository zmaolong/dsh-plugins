/**
 * Read-only data shaping of the store panel: turn hub state into JSON the
 * browser renders directly.
 *
 * Text and structured data are separated: this module only produces data;
 * rendering and localization live on the Client. Layout conventions:
 * - `GET /store` returns markets/items/installed/stats in one buildStoreSnapshot;
 * - `GET|POST /describe` returns one plugin's details (capability sections +
 *   info section) through buildDescribe;
 * - icon files go through resolveStoreIconFile to the `/icon` route for
 *   binary output.
 *
 * @module dsh-agent-plugin-hub/ui-data
 */

import { existsSync, lstatSync, realpathSync, statSync } from 'node:fs'
import path from 'node:path'

import { normalizeDisabledCapabilities } from './capabilities.ts'
import { HUB_VERSION, buildUpdateInfo, normalizeAuthor, type HubOperation, type UpdateInfo } from './hub.ts'
import { detectPluginManifest, resolveRelativeSource } from './manifest.ts'
import { mcpAvailability } from './mcp.ts'
import { isInstallableVersion } from './version.ts'
import type { AgentPluginHub } from './hub.ts'
import type { MarketRecord, PluginRecord, StoredEntry } from './store.ts'

/** Icon file size cap (matches the /icon route). */
export const MAX_ICON_BYTES = 256 * 1024
/** Decoded size cap of a data-URL icon. */
const MAX_DATA_ICON_BYTES = 32 * 1024
/** Raster MIME allowed as icon output (SVG forbidden). */
export const RASTER_MIME: Readonly<Record<string, string>> = Object.freeze({
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
})

const DATA_ICON = /^data:(image\/(?:png|jpeg|webp|gif));base64,([A-Za-z0-9+/=]+)$/iu

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function nonEmptyString(value: unknown): string {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : ''
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/** Resolve a localized object: default/en/zh-cn/zh first, else the first non-empty string. */
function resolveI18n(value: unknown): string | null {
  if (typeof value === 'string') return nonEmptyString(value) || null
  if (!isObject(value)) return null
  for (const key of ['default', 'en', 'zh-cn', 'zh']) {
    const text = nonEmptyString(value[key])
    if (text !== '') return text
  }
  const first = Object.values(value).find(item => typeof item === 'string' && item.trim() !== '')
  return typeof first === 'string' ? first.trim() : null
}

/** The market's root path in cache/source; a url market has none. */
function marketRootOf(hub: AgentPluginHub, market: MarketRecord | null): string | null {
  if (!market) return null
  if (typeof hub.markets?.marketRoot === 'function') {
    try {
      const root = hub.markets.marketRoot(market)
      if (typeof root === 'string' && root !== '') return root
      return null
    } catch {
      /* fall through to direct derivation */
    }
  }
  if (market.type === 'local') return market.location || null
  if (market.type === 'git') return path.join(hub.store.paths.markets, market.id, 'repo')
  return null
}

/** A raster icon descriptor ({file, mime}) or null. */
export interface RasterFile {
  file: string
  mime: string
}

/** Whether one file can serve as an icon (raster + size cap + in-root realpath check). */
function rasterOf(file: unknown, root: string | null = null): RasterFile | null {
  if (typeof file !== 'string' || file === '') return null
  let stat
  try {
    stat = statSync(file)
  } catch {
    return null
  }
  if (!stat.isFile() || stat.size > MAX_ICON_BYTES) return null
  const mime = RASTER_MIME[path.extname(file).toLowerCase()]
  if (!mime) return null
  if (root !== null && root !== '') {
    try {
      if (lstatSync(file).isSymbolicLink()) return null
      const realRoot = realpathSync(path.resolve(root))
      const realFile = realpathSync(file)
      const prefix = realRoot.endsWith(path.sep) ? realRoot : `${realRoot}${path.sep}`
      if (realFile !== realRoot && !realFile.startsWith(prefix)) return null
    } catch {
      return null
    }
  }
  return { file, mime }
}

/** Resolve a relative icon path inside the root; out-of-bounds/absolute/missing return null. */
function resolveRasterFile(root: string | null, raw: unknown): RasterFile | null {
  const text = typeof raw === 'string' ? raw.trim() : ''
  if (text === '' || root === null) return null
  if (/^data:/iu.test(text) || /^https?:\/\//iu.test(text) || /^[A-Za-z][A-Za-z0-9+.-]*:/u.test(text)) return null
  let file: string
  try {
    file = resolveRelativeSource(root, text)
  } catch {
    return null
  }
  return rasterOf(file, root)
}

/** Normalize an entry meta / manifest / market-level icon value into a string. */
function iconValueOf(value: unknown): string {
  if (typeof value === 'string') return value.trim()
  if (!isObject(value)) return ''
  for (const key of ['url', 'path', 'src', 'raw']) {
    const text = nonEmptyString(value[key])
    if (text !== '') return text
  }
  return ''
}

/** Validate a data-URL icon (allowlisted MIME + base64 + ≤32 KiB decoded). */
function validateDataIcon(value: string): { kind: 'data', url: string, mime: string } | null {
  const match = DATA_ICON.exec(value)
  if (!match) return null
  const base64 = match[2] as string
  const bytes = Math.floor((base64.length * 3) / 4)
  if (bytes > MAX_DATA_ICON_BYTES) return null
  return { kind: 'data', url: value, mime: (match[1] as string).toLowerCase() }
}

/** Icon descriptor shape returned to the browser. */
export interface IconDescriptor {
  kind: 'none' | 'route' | 'http' | 'data'
  url: string | null
  mime: string | null
}

/** Display block of one plugin entry or install record. */
export interface DisplayInfo {
  title: string
  titleI18n: Record<string, string> | null
  description: string | null
  descriptionI18n: Record<string, string> | null
  category: string | null
  categories: string[]
  author: ReturnType<typeof normalizeAuthor>
  homepage: string | null
  repository: string | null
  license: string | null
  keywords: string[]
  icon: IconDescriptor
  featured: boolean
}

/** One row of `/store.markets[]`. */
export interface MarketSummary {
  id: string
  name: string
  title: string
  type: string
  format: string
  location: string
  lastRefreshed: string | null
  refreshError: string | null
  pluginCount: number
  display: ReturnType<typeof marketDisplay>
  health: ReturnType<typeof marketHealth>
  refreshing: boolean
}

/** Compact market reference (avoids repeating the large markets[] fields). */
export function marketRef(market: MarketRecord | null): { id: string, name: string, title: string, type: string, format: string } | null {
  if (!market) return null
  return {
    id: market.id,
    name: market.name,
    title: nonEmptyString(market.title) || market.name,
    type: market.type,
    format: market.format,
  }
}

/** Market-level display info. */
export function marketDisplay(market: MarketRecord | null): {
  title: string
  description: string | null
  owner: ReturnType<typeof normalizeAuthor>
} {
  const display = isObject(market?.display) ? market.display : {} as Record<string, unknown>
  return {
    title: nonEmptyString(display.title) || nonEmptyString(market?.title) || market?.name || '',
    description: nonEmptyString(display.description) || null,
    owner: normalizeAuthor(display.owner ?? market?.owner ?? null),
  }
}

/** Market health: ok | stale | missing | error. */
export function marketHealth(hub: AgentPluginHub, market: MarketRecord): { status: 'ok' | 'stale' | 'missing' | 'error', message: string } {
  const refreshError = nonEmptyString(market.refreshError)
  if (refreshError !== '') return { status: 'error', message: refreshError }
  if (market.type === 'local') {
    if (!existsSync(market.location)) return { status: 'missing', message: `本地市场目录不存在：${market.location}` }
  } else if (market.type === 'git') {
    const repo = marketRootOf(hub, market)
    if (!repo || !existsSync(path.join(repo, '.git'))) {
      return { status: 'missing', message: '市场尚未克隆到本地缓存' }
    }
  } else if (market.type === 'url') {
    const snapshot = path.join(hub.store.paths.markets, market.id, 'marketplace.json')
    if (!existsSync(snapshot)) return { status: 'missing', message: 'URL 市场尚无本地快照' }
  }
  const refreshedAt = Date.parse(market.lastRefreshed ?? '')
  if (!Number.isFinite(refreshedAt)) return { status: 'stale', message: '尚未刷新' }
  if (Date.now() - refreshedAt > 24 * 60 * 60 * 1000) return { status: 'stale', message: '超过 24 小时未刷新' }
  return { status: 'ok', message: '' }
}

/** Market summary (the `/store.markets[]` rows and market-action returns). */
export function buildMarketSummary(
  hub: AgentPluginHub,
  market: MarketRecord,
  operations: HubOperation[] = hub.operationsList(),
): MarketSummary {
  const refreshing = operations.some(
    operation => operation.kind === 'market-refresh'
      && (operation.marketId === null || operation.marketId === market.id),
  )
  return {
    id: market.id,
    name: market.name,
    title: nonEmptyString(market.title) || market.name,
    type: market.type,
    format: market.format,
    location: market.location,
    lastRefreshed: nonEmptyString(market.lastRefreshed) || null,
    refreshError: nonEmptyString(market.refreshError) || null,
    pluginCount: (market.plugins ?? []).length,
    display: marketDisplay(market),
    health: marketHealth(hub, market),
    refreshing,
  }
}

/** Readable label of an entry source. */
function sourceLabel(source: unknown): string {
  if (!isObject(source)) return ''
  switch (source.kind) {
    case 'local':
      return String(source.raw ?? '')
    case 'github':
      return [String(source.repo ?? ''), typeof source.path === 'string' && source.path !== '' ? `#${source.path}` : ''].filter(Boolean).join('')
    case 'git':
      return [String(source.url ?? ''), typeof source.path === 'string' && source.path !== '' ? `#${source.path}` : ''].filter(Boolean).join('')
    case 'npm':
      return typeof source.package === 'string' ? source.package : 'npm'
    default:
      return typeof source.raw === 'string' ? source.raw : String(source.kind ?? '')
  }
}

/** An entry's icon file in a directory market (in-root raster, ≤256 KiB). */
function entryIconFile(hub: AgentPluginHub, market: MarketRecord | null, entry: StoredEntry | null): RasterFile | null {
  if (!market || !entry) return null
  const raw = iconValueOf(entry.meta?.icon) || iconValueOf((entry as { raw?: { icon?: unknown } }).raw?.icon)
  const marketRaw = iconValueOf((market?.display as unknown as Record<string, unknown> | null | undefined)?.icon)
  const value = raw || marketRaw
  if (value === '') return null
  const root = marketRootOf(hub, market)
  if (typeof hub.markets.entryIconFile === 'function') {
    try {
      const resolved: unknown = hub.markets.entryIconFile(market, entry)
      const file = typeof resolved === 'string'
        ? resolved
        : ((resolved as { file?: unknown } | null)?.file ?? (resolved as { path?: unknown } | null)?.path ?? null)
      const found = rasterOf(file, root)
      if (found) return found
    } catch {
      /* fall through to the local relative-path resolution */
    }
  }
  return resolveRasterFile(root, value)
}

/** An install copy's icon file (the manifest icon, relative to the install directory). */
function installedIconFile(installedPath: string | null, manifest: unknown): RasterFile | null {
  if (installedPath === null || installedPath === '') return null
  const raw = iconValueOf((manifest as Record<string, unknown> | null)?.icon)
  if (raw === '') return null
  return resolveRasterFile(installedPath, raw)
}

/**
 * Normalize the icon descriptor: none | route | http | data.
 *
 * A route URL points at the local `/agent-plugin/api/icon?key=<key>&v=<version>`.
 */
export function resolveIconDescriptor(
  hub: AgentPluginHub,
  context: {
    market?: MarketRecord | null
    entry?: StoredEntry | null
    manifest?: unknown
    key?: string
    version?: string
    installedPath?: string | null
  } = {},
): IconDescriptor {
  const { market = null, entry = null, manifest = null, key = '', version = '', installedPath = null } = context
  const metaValue = iconValueOf(entry?.meta?.icon) || iconValueOf((entry as { raw?: { icon?: unknown } } | null)?.raw?.icon)
  const manifestValue = iconValueOf((manifest as Record<string, unknown> | null)?.icon)
  const marketValue = iconValueOf((market?.display as unknown as Record<string, unknown> | null | undefined)?.icon)
  const raw = metaValue || manifestValue || marketValue
  if (raw === '') return { kind: 'none', url: null, mime: null }
  if (/^data:/iu.test(raw)) return validateDataIcon(raw) ?? { kind: 'none', url: null, mime: null }
  if (/^https:\/\//iu.test(raw)) return { kind: 'http', url: raw, mime: null }
  if (/^[A-Za-z][A-Za-z0-9+.-]*:/u.test(raw)) return { kind: 'none', url: null, mime: null }
  let found = entry !== null ? entryIconFile(hub, market, entry) : null
  if (!found && manifestValue !== '') found = installedIconFile(installedPath, manifest)
  if (!found) return { kind: 'none', url: null, mime: null }
  const bust = nonEmptyString(version) || '0'
  return {
    kind: 'route',
    url: `/agent-plugin/api/icon?key=${encodeURIComponent(key)}&v=${encodeURIComponent(bust)}`,
    mime: found.mime,
  }
}

/** Entry meta face buildDisplay reads (a whitelisted subset). */
interface DisplayContext {
  market: MarketRecord | null
  entry: StoredEntry | null
  manifest: unknown
  key: string
  version: string
  name: string
  installedPath: string | null
}

/**
 * Assemble display info: entry meta first → manifest fallback → market-level
 * bottom values.
 */
export function buildDisplay(hub: AgentPluginHub, context: Partial<DisplayContext> = {}): DisplayInfo {
  const { market = null, entry = null, manifest = null, key = '', version = '', name = '', installedPath = null } = context
  const meta = isObject(entry?.meta) ? entry.meta : {}
  const marketDisplayValue = isObject(market?.display) ? market.display : {} as Record<string, unknown>
  const titleI18n = isObject(meta.displayNameI18n) ? meta.displayNameI18n as Record<string, string> : null
  const descriptionI18n = isObject(meta.descriptionI18n) ? meta.descriptionI18n as Record<string, string> : null
  const title = nonEmptyString(meta.displayName)
    || resolveI18n(titleI18n)
    || nonEmptyString(meta.title)
    || nonEmptyString((manifest as Record<string, unknown> | null)?.name)
    || nonEmptyString(name)
    || nonEmptyString(entry?.name)
    || ''
  const description = nonEmptyString(meta.description)
    || resolveI18n(descriptionI18n)
    || nonEmptyString(entry?.description)
    || nonEmptyString((manifest as Record<string, unknown> | null)?.description)
    || resolveI18n(marketDisplayValue.description)
    || null
  const category = nonEmptyString(meta.category) || nonEmptyString((manifest as Record<string, unknown> | null)?.category) || null
  let author = normalizeAuthor(meta.author ?? (manifest as Record<string, unknown> | null)?.author ?? null)
  const authorUrl = nonEmptyString(meta.authorUrl)
  if (author !== null && author.url === null && authorUrl !== '') author = { ...author, url: authorUrl }
  const keywords = Array.isArray(meta.keywords)
    ? meta.keywords.filter((item): item is string => typeof item === 'string')
    : Array.isArray((manifest as Record<string, unknown> | null)?.keywords)
      ? ((manifest as Record<string, unknown>).keywords as unknown[]).filter((item): item is string => typeof item === 'string')
      : []
  const featured = Array.isArray(market?.featured) && typeof entry?.name === 'string'
    ? market.featured.includes(entry.name)
    : false
  return {
    title,
    titleI18n,
    description,
    descriptionI18n,
    category,
    categories: category === null ? [] : [category],
    author,
    homepage: nonEmptyString(meta.homepage) || nonEmptyString((manifest as Record<string, unknown> | null)?.homepage) || null,
    repository: nonEmptyString(meta.repository) || nonEmptyString((manifest as Record<string, unknown> | null)?.repository) || null,
    license: nonEmptyString(meta.license) || nonEmptyString((manifest as Record<string, unknown> | null)?.license) || null,
    keywords,
    icon: resolveIconDescriptor(hub, { market, entry, manifest, key, version, installedPath }),
    featured,
  }
}

/** Whether a manifest value counts as present (array length / non-empty scalar). */
function manifestValuePresent(value: unknown): boolean {
  return Array.isArray(value) ? value.length > 0 : value !== undefined && value !== null && value !== ''
}

/** Main source of a display: market | manifest | record. */
function displaySourceOf(entry: StoredEntry | null, manifest: unknown): 'market' | 'manifest' | 'record' {
  if (isObject(entry?.meta) && Object.keys(entry.meta).length > 0) return 'market'
  if (isObject(manifest)) {
    for (const key of ['author', 'homepage', 'repository', 'license', 'description', 'keywords', 'displayName', 'title']) {
      if (manifestValuePresent((manifest as Record<string, unknown>)[key])) return 'manifest'
    }
  }
  return 'record'
}

/** Declared-level update info (a not-installed entry is fixed at none). */
function updateForEntry(record: PluginRecord | null, entry: StoredEntry | null): UpdateInfo {
  if (!record) {
    return {
      state: 'none',
      currentVersion: null,
      latestVersion: nonEmptyString(entry?.version) || null,
      checkedBy: 'declared',
      reason: null,
    }
  }
  return buildUpdateInfo({
    currentVersion: record.version,
    latestVersion: entry?.version,
    orphan: false,
  })
}

/** Entry-level source info: zero-network by default (allowClone:false). */
function catalogSource(
  hub: AgentPluginHub,
  market: MarketRecord,
  entry: StoredEntry,
): { kind: string, label: string, resolved: boolean, cloneRequired: boolean, reason: string | null } {
  const source = isObject(entry?.source) ? entry.source : { kind: 'unknown' }
  const info = {
    kind: String(source.kind ?? 'unknown'),
    label: sourceLabel(source),
    resolved: false,
    cloneRequired: false,
    reason: null as string | null,
  }
  try {
    const resolution: unknown = hub.markets.resolvePluginSourceRoot(market, entry.name, { allowClone: false })
    if (resolution !== null && typeof resolution === 'object' && typeof (resolution as { then?: unknown }).then === 'function') {
      info.reason = '来源解析是异步接口，/store 不做联网解析'
      return info
    }
    const record = resolution as { resolved?: unknown, cloneRequired?: unknown, reason?: unknown } | null
    info.resolved = record?.resolved === true
    info.cloneRequired = record?.cloneRequired === true
    info.reason = nonEmptyString(record?.reason) || null
  } catch (error) {
    info.reason = messageOf(error)
  }
  return info
}

/** Capability summary of an installed record (missing fields become empty arrays). */
function capabilitiesSummary(record: PluginRecord | null): {
  skills: string[]
  commands: string[]
  hooks: string[]
  mcpServers: string[]
} {
  const source = isObject(record?.capabilities) ? record.capabilities : {}
  const list = (value: unknown): string[] => (Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [])
  return {
    skills: list(source.skills),
    commands: list(source.commands),
    hooks: list(source.hooks),
    mcpServers: list(source.mcpServers),
  }
}

/** Catalog item ("product") of one market entry. */
export interface CatalogItem {
  key: string
  name: string
  version: string | null
  versionValid: boolean
  format: string
  market: ReturnType<typeof marketRef>
  display: DisplayInfo
  source: { kind: string, label: string, resolved: boolean, cloneRequired: boolean, reason: string | null }
  installable: boolean
  blockedReason: string | null
  installed: boolean
  installedVersion: string | null
  installedEnabled: boolean | null
  update: UpdateInfo
  warnings: string[]
}

/** Build one market entry ("product"). */
export async function buildCatalogItem(
  hub: AgentPluginHub,
  market: MarketRecord,
  entry: StoredEntry,
  record: PluginRecord | null = null,
): Promise<CatalogItem> {
  const key = `${market.id}/${entry.name}`
  const version = nonEmptyString(entry.version)
  const versionValid = version === '' || isInstallableVersion(version)
  const source = catalogSource(hub, market, entry)
  const display = buildDisplay(hub, { market, entry, manifest: null, key, version, name: entry.name })
  const warnings: string[] = []
  const entryWarning = nonEmptyString(entry.warning)
  if (entryWarning !== '') warnings.push(entryWarning)
  if (!source.resolved && source.reason) warnings.push(source.reason)
  const installable = entry.installable !== false
    && versionValid
    && (source.resolved === true || source.cloneRequired === true)
  let blockedReason: string | null = null
  if (!versionValid) blockedReason = `市场声明的版本号不合法（需 x.y.z 三段）：${version}`
  else if (entry.installable === false) blockedReason = nonEmptyString(entry.warning) || '来源类型无法安装'
  else if (source.resolved !== true && source.cloneRequired !== true) {
    blockedReason = source.reason || '来源无法解析，暂时不能安装'
  }
  return {
    key,
    name: entry.name,
    version: version || null,
    versionValid,
    format: market.format ?? '',
    market: marketRef(market),
    display,
    source,
    installable,
    blockedReason,
    installed: record !== null,
    installedVersion: record?.version ?? null,
    installedEnabled: record === null ? null : record.enabled !== false,
    update: updateForEntry(record, entry),
    warnings: [...new Set(warnings)],
  }
}

/** Installed item of one record. */
export interface InstalledItem {
  key: string
  name: string
  version: string
  format: string
  market: ReturnType<typeof marketRef>
  marketId: string
  enabled: boolean
  installedAt: string
  installedPath: string
  capabilities: ReturnType<typeof capabilitiesSummary>
  disabledCapabilities: ReturnType<typeof normalizeDisabledCapabilities>
  previousVersions: Array<{ version: string, installedAt: string, available: boolean }>
  display: DisplayInfo
  displaySource: 'market' | 'manifest' | 'record'
  update: UpdateInfo
  orphan: boolean
  health: { installedDirExists: boolean }
}

/** Build one installed item (including orphan/health/rollback availability). */
export async function buildInstalledItem(
  hub: AgentPluginHub,
  record: PluginRecord,
  market: MarketRecord | null = null,
  entry: StoredEntry | null = null,
): Promise<InstalledItem> {
  let manifest: unknown = null
  let format = record.format
  try {
    const detected = detectPluginManifest(record.installedPath, { hintFormat: record.format })
    manifest = detected.manifest
    format = detected.format
  } catch {
    /* fall back to the record when the manifest is unreadable */
  }
  const orphan = market === null
  const display = buildDisplay(hub, {
    market,
    entry,
    manifest,
    key: record.key,
    version: record.version,
    name: record.name,
    installedPath: record.installedPath,
  })
  const previousVersions = (record.previousVersions ?? []).map(item => ({
    version: item.version,
    installedAt: typeof item.installedAt === 'string' ? item.installedAt : '',
    available: existsSync(item.installedPath),
  }))
  return {
    key: record.key,
    name: record.name,
    version: record.version,
    format,
    market: market === null ? null : marketRef(market),
    marketId: record.market,
    enabled: record.enabled !== false,
    installedAt: record.installedAt ?? '',
    installedPath: record.installedPath,
    capabilities: capabilitiesSummary(record),
    disabledCapabilities: normalizeDisabledCapabilities(record.disabledCapabilities),
    previousVersions,
    display,
    displaySource: displaySourceOf(entry, manifest),
    update: buildUpdateInfo({
      currentVersion: record.version,
      latestVersion: entry?.version,
      orphan,
    }),
    orphan,
    health: { installedDirExists: existsSync(record.installedPath) },
  }
}

/** Whole-store snapshot (the only data source of `GET /store`; no cache). */
export interface StoreSnapshot {
  version: string
  home: string
  started: boolean
  ui: { active: boolean, reason: string, path?: string }
  formats: ReturnType<AgentPluginHub['listFormats']>
  runtime: {
    skills: Record<string, unknown> | ReturnType<NonNullable<AgentPluginHub['skills']>['stats']>
    commands: Record<string, unknown> | ReturnType<NonNullable<AgentPluginHub['pluginCommands']>['stats']>
    hooks: Record<string, unknown> | ReturnType<NonNullable<AgentPluginHub['hooks']>['stats']>
    mcp: ReturnType<typeof mcpAvailability>
  }
  migrationError: string | null
  operations: ReturnType<AgentPluginHub['operationsList']>
  markets: ReturnType<typeof buildMarketSummary>[]
  items: CatalogItem[]
  installed: InstalledItem[]
  stats: {
    markets: number
    items: number
    installable: number
    installed: number
    updatesAvailable: number
    orphans: number
    marketsWithError: number
  }
  warnings: string[]
}

/** Build the store panel's whole snapshot (`GET /store`). */
export async function buildStoreSnapshot(hub: AgentPluginHub): Promise<StoreSnapshot> {
  const plugins = hub.state.plugins ?? []
  const markets = hub.markets.list()
  const operations = hub.operationsList()
  const installedByKey = new Map(plugins.map(record => [record.key, record]))
  const entryByKey = new Map<string, { market: MarketRecord, entry: StoredEntry }>()
  for (const market of markets) {
    for (const entry of market.plugins ?? []) {
      entryByKey.set(`${market.id}/${entry.name}`, { market, entry })
    }
  }
  const items: CatalogItem[] = []
  for (const market of markets) {
    for (const entry of market.plugins ?? []) {
      const key = `${market.id}/${entry.name}`
      items.push(await buildCatalogItem(hub, market, entry, installedByKey.get(key) ?? null))
    }
  }
  const installed: InstalledItem[] = []
  for (const record of plugins) {
    const pair = entryByKey.get(record.key) ?? null
    installed.push(await buildInstalledItem(hub, record, pair?.market ?? null, pair?.entry ?? null))
  }
  return {
    version: HUB_VERSION,
    home: hub.home,
    started: hub.started,
    ui: { ...hub.uiRoutes },
    formats: hub.listFormats(),
    runtime: {
      skills: hub.skills?.stats() ?? { registered: false, skills: 0, reason: '技能运行时未装配' },
      commands: hub.pluginCommands?.stats() ?? { available: false, registered: [], reason: '命令运行时未装配' },
      hooks: hub.hooks?.stats() ?? { attached: false, events: [], reason: 'hooks 运行时未装配' },
      mcp: mcpAvailability(hub.ctx),
    },
    migrationError: hub.migrationError ?? null,
    operations,
    markets: markets.map(market => buildMarketSummary(hub, market, operations)),
    items,
    installed,
    stats: {
      markets: markets.length,
      items: items.length,
      installable: items.filter(item => item.installable).length,
      installed: installed.length,
      updatesAvailable: installed.filter(item => item.update.state === 'available').length,
      orphans: installed.filter(item => item.orphan).length,
      marketsWithError: markets.filter(market => nonEmptyString(market.refreshError)).length,
    },
    warnings: hub.warnings.slice(-20),
  }
}

/** Unified detail of one plugin (`GET|POST /describe`). */
export async function buildDescribe(
  hub: AgentPluginHub,
  options: { key?: string, market?: string, name?: string, fetch?: boolean } = {},
): Promise<Record<string, unknown>> {
  const core = await hub.describePlugin(options)
  const display = buildDisplay(hub, {
    market: core.market,
    entry: core.entry,
    manifest: core.manifest,
    key: core.key,
    version: core.version,
    name: core.name,
    installedPath: core.record?.installedPath ?? null,
  })
  return {
    key: core.key,
    name: core.name,
    version: core.version || null,
    versionValid: core.versionValid,
    format: core.format ?? '',
    market: marketRef(core.market),
    orphan: core.orphan === true,
    display,
    source: core.source,
    installable: core.installable,
    blockedReason: core.blockedReason,
    installed: core.installed,
    update: core.update,
    manifest: core.manifest,
    capabilities: core.capabilities,
    hooksSource: core.hooksSource ?? '',
    mcpSource: core.mcpSource ?? '',
    counts: core.counts,
    warnings: core.warnings,
  }
}

/** Resolve the actual file behind `/icon`: the market entry icon first, the install copy's manifest icon as fallback. */
export function resolveStoreIconFile(hub: AgentPluginHub, key: string): RasterFile | null {
  const keyText = nonEmptyString(key)
  if (keyText === '') return null
  let target
  try {
    target = hub.resolvePluginTarget({ key: keyText })
  } catch {
    return null
  }
  if (target.market !== null && target.entry !== null) {
    const found = entryIconFile(hub, target.market, target.entry)
    if (found) return found
  }
  if (target.record !== null) {
    let manifest: unknown = null
    try {
      manifest = detectPluginManifest(target.record.installedPath, { hintFormat: target.record.format }).manifest
    } catch {
      manifest = null
    }
    const found = installedIconFile(target.record.installedPath, manifest)
    if (found) return found
  }
  return null
}
