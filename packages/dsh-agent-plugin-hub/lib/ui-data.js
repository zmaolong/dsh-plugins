/**
 * 商店面板的只读数据整形：把 hub 状态整理成浏览器可直接渲染的 JSON。
 *
 * 文本与结构化数据分离：这里只产出数据，渲染与本地化在 Client 端完成。
 * 布局约定：
 * - `GET /store` 用 buildStoreSnapshot 一次性拿到 markets/items/installed/stats；
 * - `GET|POST /describe` 用 buildDescribe 拿到单个插件的详情（能力分区 + 信息区）；
 * - 图标文件用 resolveStoreIconFile 交给 `/icon` 路由以二进制输出。
 *
 * @module dsh-agent-plugin-hub/ui-data
 */

import { existsSync, lstatSync, realpathSync, statSync } from 'node:fs'
import path from 'node:path'

import { normalizeDisabledCapabilities } from './capabilities.js'
import { HUB_VERSION, buildUpdateInfo, normalizeAuthor } from './hub.js'
import { detectPluginManifest, resolveRelativeSource } from './manifest.js'
import { mcpAvailability } from './mcp.js'
import { isInstallableVersion } from './version.js'

/** 图标文件大小上限（与 /icon 路由一致）。 */
export const MAX_ICON_BYTES = 256 * 1024
/** data URL 图标的解码后上限。 */
const MAX_DATA_ICON_BYTES = 32 * 1024
/** 允许作为图标输出的 raster MIME（禁止 SVG）。 */
export const RASTER_MIME = Object.freeze({
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
})

const DATA_ICON = /^data:(image\/(?:png|jpeg|webp|gif));base64,([A-Za-z0-9+/=]+)$/iu

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function nonEmptyString(value) {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : ''
}

function messageOf(error) {
  return error instanceof Error ? error.message : String(error)
}

/** 解析多语言对象：default/en/zh-cn/zh 优先，否则取第一条非空字符串。 */
function resolveI18n(value) {
  if (typeof value === 'string') return nonEmptyString(value) || null
  if (!isObject(value)) return null
  for (const key of ['default', 'en', 'zh-cn', 'zh']) {
    const text = nonEmptyString(value[key])
    if (text !== '') return text
  }
  const first = Object.values(value).find((item) => typeof item === 'string' && item.trim() !== '')
  return first ? first.trim() : null
}

/** 市场在缓存/源目录里的根路径；url 市场没有本地根。 */
function marketRootOf(hub, market) {
  if (!market) return null
  if (typeof hub.markets?.marketRoot === 'function') {
    try {
      const root = hub.markets.marketRoot(market)
      if (typeof root === 'string' && root !== '') return root
      return null
    } catch {
      /* 落到下面的直接推导 */
    }
  }
  if (market.type === 'local') return market.location || null
  if (market.type === 'git') return path.join(hub.store.paths.markets, market.id, 'repo')
  return null
}

/** 单个文件是否可当图标输出（raster + 大小上限 + 根内 realpath 校验）。 */
function rasterOf(file, root = null) {
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

/** 在根目录内解析相对图标路径；越界/绝对路径/不存在返回 null。 */
function resolveRasterFile(root, raw) {
  const text = typeof raw === 'string' ? raw.trim() : ''
  if (text === '' || root === null) return null
  if (/^data:/iu.test(text) || /^https?:\/\//iu.test(text) || /^[A-Za-z][A-Za-z0-9+.-]*:/u.test(text)) return null
  let file
  try {
    file = resolveRelativeSource(root, text)
  } catch {
    return null
  }
  return rasterOf(file, root)
}

/** 条目 meta / 清单 / 市场级 icon 原文归一为字符串。 */
function iconValueOf(value) {
  if (typeof value === 'string') return value.trim()
  if (!isObject(value)) return ''
  for (const key of ['url', 'path', 'src', 'raw']) {
    const text = nonEmptyString(value[key])
    if (text !== '') return text
  }
  return ''
}

/** 校验 data URL 图标（仅白名单 MIME + base64 + 解码后 ≤32 KiB）。 */
function validateDataIcon(value) {
  const match = DATA_ICON.exec(value)
  if (!match) return null
  const bytes = Math.floor((match[2].length * 3) / 4)
  if (bytes > MAX_DATA_ICON_BYTES) return null
  return { kind: 'data', url: value, mime: match[1].toLowerCase() }
}

/** 市场引用（精简，避免与 markets[] 重复大字段）。 */
export function marketRef(market) {
  if (!market) return null
  return {
    id: market.id,
    name: market.name,
    title: nonEmptyString(market.title) || market.name,
    type: market.type,
    format: market.format,
  }
}

/** 市场级展示信息。 */
export function marketDisplay(market) {
  const display = isObject(market?.display) ? market.display : {}
  return {
    title: nonEmptyString(display.title) || nonEmptyString(market?.title) || market?.name || '',
    description: nonEmptyString(display.description) || null,
    owner: normalizeAuthor(display.owner ?? market?.owner ?? null),
  }
}

/** 市场健康状态：ok | stale | missing | error。 */
export function marketHealth(hub, market) {
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

/**
 * 市场摘要（`/store.markets[]` 与市场动作的返回）。
 *
 * @param {import('./hub.js').AgentPluginHub} hub
 * @param {object} market
 * @param {object[]} [operations] - 在途操作列表（用于 refreshing）。
 */
export function buildMarketSummary(hub, market, operations = hub.operationsList()) {
  const refreshing = operations.some(
    (operation) => operation.kind === 'market-refresh'
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

/** 条目 source 的可读标签。 */
function sourceLabel(source) {
  if (!isObject(source)) return ''
  switch (source.kind) {
    case 'local':
      return String(source.raw ?? '')
    case 'github':
      return [source.repo, source.path ? `#${source.path}` : ''].filter(Boolean).join('')
    case 'git':
      return [source.url, source.path ? `#${source.path}` : ''].filter(Boolean).join('')
    case 'npm':
      return source.package ?? 'npm'
    default:
      return typeof source.raw === 'string' ? source.raw : String(source.kind ?? '')
  }
}

/** 目录型市场里某条目的图标文件（source 市场根内 raster，≤256 KiB）。 */
function entryIconFile(hub, market, entry) {
  if (!market || !entry) return null
  const raw = iconValueOf(entry.meta?.icon) || iconValueOf(entry.raw?.icon)
  const marketRaw = iconValueOf(market.display?.icon)
  const value = raw || marketRaw
  if (value === '') return null
  const root = marketRootOf(hub, market)
  if (typeof hub.markets.entryIconFile === 'function') {
    try {
      const resolved = hub.markets.entryIconFile(market, entry)
      const file = typeof resolved === 'string' ? resolved : (resolved?.file ?? resolved?.path ?? null)
      const found = rasterOf(file, root)
      if (found) return found
    } catch {
      /* 落到自身的相对路径解析 */
    }
  }
  return resolveRasterFile(root, value)
}

/** 安装副本里的图标文件（清单 icon 相对安装目录）。 */
function installedIconFile(installedPath, manifest) {
  if (installedPath === null || installedPath === undefined || installedPath === '') return null
  const raw = iconValueOf(manifest?.icon)
  if (raw === '') return null
  return resolveRasterFile(installedPath, raw)
}

/**
 * 归一 icon 描述：none | route | http | data。
 *
 * route 的 URL 指向本机 `/agent-plugin/api/icon?key=<key>&v=<version>`。
 *
 * @returns {{kind: string, url: string|null, mime: string|null}}
 */
export function resolveIconDescriptor(hub, context = {}) {
  const { market = null, entry = null, manifest = null, key = '', version = '', installedPath = null } = context
  const metaValue = iconValueOf(entry?.meta?.icon) || iconValueOf(entry?.raw?.icon)
  const manifestValue = iconValueOf(manifest?.icon)
  const marketValue = iconValueOf(market?.display?.icon)
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

/**
 * 组装展示信息：条目 meta 优先 → 清单回退 → 市场级兜底。
 *
 * @returns {object} Display（title/titleI18n/description/descriptionI18n/category/categories/
 *   author/homepage/repository/license/keywords/icon/featured）
 */
export function buildDisplay(hub, context = {}) {
  const { market = null, entry = null, manifest = null, key = '', version = '', name = '', installedPath = null } = context
  const meta = isObject(entry?.meta) ? entry.meta : {}
  const marketDisplayValue = isObject(market?.display) ? market.display : {}
  const titleI18n = isObject(meta.displayNameI18n) ? meta.displayNameI18n : null
  const descriptionI18n = isObject(meta.descriptionI18n) ? meta.descriptionI18n : null
  const title = nonEmptyString(meta.displayName)
    || resolveI18n(titleI18n)
    || nonEmptyString(meta.title)
    || nonEmptyString(manifest?.name)
    || nonEmptyString(name)
    || nonEmptyString(entry?.name)
    || ''
  const description = nonEmptyString(meta.description)
    || resolveI18n(descriptionI18n)
    || nonEmptyString(entry?.description)
    || nonEmptyString(manifest?.description)
    || resolveI18n(marketDisplayValue.description)
    || null
  const category = nonEmptyString(meta.category) || nonEmptyString(manifest?.category) || null
  let author = normalizeAuthor(meta.author ?? manifest?.author ?? null)
  const authorUrl = nonEmptyString(meta.authorUrl)
  if (author !== null && author.url === null && authorUrl !== '') author = { ...author, url: authorUrl }
  const keywords = Array.isArray(meta.keywords)
    ? meta.keywords.filter((item) => typeof item === 'string')
    : Array.isArray(manifest?.keywords)
      ? manifest.keywords.filter((item) => typeof item === 'string')
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
    homepage: nonEmptyString(meta.homepage) || nonEmptyString(manifest?.homepage) || null,
    repository: nonEmptyString(meta.repository) || nonEmptyString(manifest?.repository) || null,
    license: nonEmptyString(meta.license) || nonEmptyString(manifest?.license) || null,
    keywords,
    icon: resolveIconDescriptor(hub, { market, entry, manifest, key, version, installedPath }),
    featured,
  }
}

/** 判定 display 的主要来源：market | manifest | record。 */
function displaySourceOf(entry, manifest) {
  if (isObject(entry?.meta) && Object.keys(entry.meta).length > 0) return 'market'
  if (isObject(manifest)) {
    for (const key of ['author', 'homepage', 'repository', 'license', 'description', 'keywords', 'displayName', 'title']) {
      const value = manifest[key]
      if (Array.isArray(value) ? value.length > 0 : value !== undefined && value !== null && value !== '') return 'manifest'
    }
  }
  return 'record'
}

/** 声明级更新信息（未安装条目固定 none）。 */
function updateForEntry(record, entry) {
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

/** 条目级 source 信息：默认零网络（allowClone:false）。 */
function catalogSource(hub, market, entry) {
  const source = isObject(entry?.source) ? entry.source : { kind: 'unknown' }
  const info = {
    kind: source.kind ?? 'unknown',
    label: sourceLabel(source),
    resolved: false,
    cloneRequired: false,
    reason: null,
  }
  try {
    const resolution = hub.markets.resolvePluginSourceRoot(market, entry.name, { allowClone: false })
    if (resolution !== null && typeof resolution === 'object' && typeof resolution.then === 'function') {
      info.reason = '来源解析是异步接口，/store 不做联网解析'
      return info
    }
    info.resolved = resolution?.resolved === true
    info.cloneRequired = resolution?.cloneRequired === true
    info.reason = nonEmptyString(resolution?.reason) || null
  } catch (error) {
    info.reason = messageOf(error)
  }
  return info
}

/** 已安装记录的能力摘要（缺失字段补空数组）。 */
function capabilitiesSummary(record) {
  const source = isObject(record?.capabilities) ? record.capabilities : {}
  const list = (value) => (Array.isArray(value) ? value.filter((item) => typeof item === 'string') : [])
  return {
    skills: list(source.skills),
    commands: list(source.commands),
    hooks: list(source.hooks),
    mcpServers: list(source.mcpServers),
  }
}

/**
 * 构建一个市场条目（商品）。
 *
 * @returns {object} CatalogItem
 */
export async function buildCatalogItem(hub, market, entry, record = null) {
  const key = `${market.id}/${entry.name}`
  const version = nonEmptyString(entry.version)
  const versionValid = version === '' || isInstallableVersion(version)
  const source = catalogSource(hub, market, entry)
  const display = buildDisplay(hub, { market, entry, manifest: null, key, version, name: entry.name })
  const warnings = []
  if (nonEmptyString(entry.warning)) warnings.push(entry.warning)
  if (!source.resolved && source.reason) warnings.push(source.reason)
  const installable = entry.installable !== false
    && versionValid
    && (source.resolved === true || source.cloneRequired === true)
  let blockedReason = null
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

/**
 * 构建一个已安装项（含孤立/健康/回滚可用性）。
 *
 * @returns {object} InstalledItem
 */
export async function buildInstalledItem(hub, record, market = null, entry = null) {
  let manifest = null
  let format = record.format
  try {
    const detected = detectPluginManifest(record.installedPath, { hintFormat: record.format })
    manifest = detected.manifest
    format = detected.format
  } catch {
    /* 清单读不到时用 record 兜底 */
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
  const previousVersions = (record.previousVersions ?? []).map((item) => ({
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

/**
 * 构建商店面板整体快照（`GET /store` 的唯一数据源；不含 cache）。
 *
 * @param {import('./hub.js').AgentPluginHub} hub
 * @returns {Promise<object>}
 */
export async function buildStoreSnapshot(hub) {
  const plugins = hub.state.plugins ?? []
  const markets = hub.markets.list()
  const operations = hub.operationsList()
  const installedByKey = new Map(plugins.map((record) => [record.key, record]))
  const entryByKey = new Map()
  for (const market of markets) {
    for (const entry of market.plugins ?? []) {
      entryByKey.set(`${market.id}/${entry.name}`, { market, entry })
    }
  }
  const items = []
  for (const market of markets) {
    for (const entry of market.plugins ?? []) {
      const key = `${market.id}/${entry.name}`
      items.push(await buildCatalogItem(hub, market, entry, installedByKey.get(key) ?? null))
    }
  }
  const installed = []
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
    markets: markets.map((market) => buildMarketSummary(hub, market, operations)),
    items,
    installed,
    stats: {
      markets: markets.length,
      items: items.length,
      installable: items.filter((item) => item.installable).length,
      installed: installed.length,
      updatesAvailable: installed.filter((item) => item.update.state === 'available').length,
      orphans: installed.filter((item) => item.orphan).length,
      marketsWithError: markets.filter((market) => nonEmptyString(market.refreshError)).length,
    },
    warnings: hub.warnings.slice(-20),
  }
}

/**
 * 构建单个插件的统一详情（`GET|POST /describe`）。
 *
 * @param {import('./hub.js').AgentPluginHub} hub
 * @param {{key?: string, market?: string, name?: string, fetch?: boolean}} [options]
 * @returns {Promise<object>}
 */
export async function buildDescribe(hub, options = {}) {
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

/**
 * 解析 `/icon` 需要的实际文件：市场条目图标优先，安装副本清单图标兜底。
 *
 * 只返回 raster 且 ≤256 KiB 的文件；越界/不存在/非 raster 返回 null（路由回 404 JSON）。
 *
 * @param {import('./hub.js').AgentPluginHub} hub
 * @param {string} key - 插件 key（marketId/name）。
 * @returns {{file: string, mime: string}|null}
 */
export function resolveStoreIconFile(hub, key) {
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
    let manifest = null
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