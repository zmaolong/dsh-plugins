/**
 * 市场源管理：local 目录、git 仓库、marketplace.json 直链三种 source。
 *
 * - local：直接读目录里的 marketplace.json（没有时把目录本身当单插件市场）；
 * - git：用系统 git 浅克隆到 hub 自己的 cache，刷新时 fetch + reset；
 * - url：HTTP(S) 拉取 marketplace.json，失败只记录 refreshError，不阻塞其余功能。
 *
 * schema v2：
 * - 市场记录持久化 `title/display/owner/featured` 与条目 `meta`（展示元数据）；
 * - 刷新保留用户市场别名（`market.name` 不被上游 name 覆盖，上游 name 存 `title`）；
 * - git 市场克隆根一律由 `marketRoot(market)` 推导（不依赖未持久化的内存字段）。
 *
 * @module dsh-agent-plugin-hub/market
 */

import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, lstatSync, mkdirSync, readdirSync, realpathSync, rmSync, statSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import {
  detectMarketplaceFile,
  detectPluginManifest,
  isDirectory,
  isFile,
  looksLikePluginDir,
  normalizeEntryMeta,
  parseMarketplace,
  resolveRelativeSource,
  validatePluginManifest,
} from './manifest.js'

/** git 子进程的安全环境：禁止交互式提示。 */
function gitEnv() {
  return {
    ...process.env,
    GIT_TERMINAL_PROMPT: '0',
    GCM_INTERACTIVE: 'Never',
    GIT_OPTIONAL_LOCKS: '0',
  }
}

/** 跑一条 git 命令，失败抛中文错误（含 stderr 摘要）。 */
function runGit(args, options = {}) {
  const result = spawnSync('git', args, {
    encoding: 'utf8',
    timeout: options.timeoutMs ?? 120_000,
    cwd: options.cwd,
    env: gitEnv(),
    windowsHide: true,
  })
  if (result.error) {
    throw new Error(`执行 git 失败：${result.error.message}`)
  }
  if (result.status !== 0) {
    const stderr = String(result.stderr ?? '').trim().split('\n').slice(-4).join(' | ')
    throw new Error(`git ${args[0]} 失败（退出码 ${String(result.status)}）：${stderr || '无输出'}`)
  }
  return result.stdout ?? ''
}

/** 由类型与位置生成稳定市场 id。 */
export function marketIdFor(type, location) {
  const hash = createHash('sha1').update(`${type}\u0000${location}`).digest('hex').slice(0, 8)
  const base = String(location).replace(/\\/gu, '/').split('/').filter(Boolean).pop() ?? 'market'
  const slug = base.replace(/\.git$/u, '').replace(/[^A-Za-z0-9._-]+/gu, '-').replace(/^-+|-+$/gu, '').toLowerCase()
  return `${type}-${(slug || 'market').slice(0, 32)}-${hash}`
}

/** 展开 `~` / `~/`（其余原样）。 */
function expandTildeValue(value) {
  const raw = String(value ?? '').trim()
  if (raw === '~' || raw.startsWith('~/') || raw.startsWith('~\\')) {
    const home = process.env.USERPROFILE || process.env.HOME || ''
    return raw === '~' ? home : path.join(home, raw.slice(2))
  }
  return raw
}

/** 解析用户输入的 location（local 支持相对当前工作目录与 `~`）。 */
export function normalizeLocation(type, location) {
  const raw = String(location ?? '').trim()
  if (raw === '') throw new Error('市场地址不能为空')
  if (type === 'local') {
    const resolved = path.resolve(expandTildeValue(raw))
    if (!isDirectory(resolved)) throw new Error(`本地市场目录不存在：${resolved}`)
    return resolved
  }
  if (type === 'url') {
    if (!/^https?:\/\//u.test(raw)) throw new Error(`URL 市场地址必须以 http:// 或 https:// 开头：${raw}`)
    return raw
  }
  if (type === 'git') {
    if (!/^(?:https?:\/\/|git@|ssh:\/\/|git:\/\/|file:\/\/)/u.test(raw) && !raw.endsWith('.git') && !isDirectory(path.resolve(raw))) {
      throw new Error(`Git 市场地址无法识别：${raw}（支持 https/git@/ssh 或本地仓库目录）`)
    }
    if (isDirectory(path.resolve(raw))) return path.resolve(raw)
    return raw
  }
  throw new Error(`未知市场类型：${type}`)
}

/** git 源的克隆地址（github 短名拼成 https）。 */
function gitSourceUrl(source) {
  return source.kind === 'github'
    ? (/^(?:https?:\/\/|git@)/u.test(source.repo) ? source.repo : `https://github.com/${source.repo}.git`)
    : source.url
}

/** git 源缓存目录名（url + commit 的 hash）。 */
function gitSourceHash(source) {
  const url = gitSourceUrl(source) ?? ''
  return createHash('sha1').update(`${url}\u0000${source.commit ?? ''}`).digest('hex').slice(0, 10)
}

function gitSourceDir(store, marketId, source) {
  return path.join(store.paths.markets, marketId, 'sources', gitSourceHash(source))
}

/**
 * 市场在 cache 里的根目录。
 *
 * - local → market.location
 * - git   → `<home>/cache/markets/<id>/repo`
 * - url   → null（url 市场没有本地插件源目录）
 *
 * @param {object} market
 * @param {import('./store.js').HubStore} store
 * @returns {string | null}
 */
export function marketRoot(market, store) {
  if (market === null || typeof market !== 'object') return null
  if (market.type === 'local') return typeof market.location === 'string' && market.location !== '' ? market.location : null
  if (market.type === 'git') {
    if (store?.paths?.markets && typeof market.id === 'string' && market.id !== '') {
      return path.join(store.paths.markets, market.id, 'repo')
    }
    // 兼容调用方没传 store 但记录了内存 root 的情况（持久化数据不会带 root）。
    return typeof market.root === 'string' && market.root !== '' ? market.root : null
  }
  return null
}

/** 目录里是否有 marketplace/plugin 清单；返回探测结果或 null。 */
function detectLocalMarketDir(dir) {
  try {
    const detected = detectMarketplaceFile(dir)
    return { kind: 'marketplace', format: detected.format, manifest: detected.manifest }
  } catch {
    if (looksLikePluginDir(dir)) {
      try {
        const detected = detectPluginManifest(dir)
        return { kind: 'plugin', format: detected.format, manifest: detected.manifest }
      } catch {
        return null
      }
    }
    return null
  }
}

function looksLikeGitDir(dir) {
  return isDirectory(path.join(dir, '.git'))
}

function isHttpLocation(raw) {
  return /^https?:\/\//u.test(raw)
}

function isGitLocation(raw) {
  return /^(?:git@|ssh:\/\/|git:\/\/|file:\/\/)/u.test(raw) || raw.endsWith('.git')
}

function isPathLike(raw) {
  return /[\\/]/u.test(raw) || /^[A-Za-z]:/u.test(raw) || raw === '~' || raw.startsWith('~') || raw === '.' || raw.startsWith('./') || raw.startsWith('../')
}

/**
 * 从文本拉取 JSON（15s 超时）。
 *
 * @param {string} url
 * @param {Function} fetchImpl
 * @param {number} timeoutMs
 * @returns {Promise<object>}
 */
async function fetchJsonProbe(url, fetchImpl, timeoutMs) {
  if (typeof fetchImpl !== 'function') throw new Error('当前运行环境没有 fetch，无法探测 URL 市场')
  const response = await fetchImpl(url, {
    signal: AbortSignal.timeout?.(timeoutMs),
    headers: { accept: 'application/json' },
  })
  if (!response.ok) throw new Error(`HTTP ${String(response.status)}`)
  const text = await response.text()
  const parsed = JSON.parse(text)
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('返回的不是 JSON 对象')
  }
  if (!Array.isArray(parsed.plugins) && typeof parsed.name !== 'string') {
    throw new Error('返回的 JSON 不像 marketplace.json（缺少 name/plugins）')
  }
  return parsed
}

/**
 * 自动识别市场来源。
 *
 * 规则：
 * 1. 展开 `~`；已存在目录含 marketplace.json / plugin.json → local；
 * 2. 已存在目录没有清单但含 `.git` → git（本地仓库）；
 * 3. `git@` / `ssh://` / `git://` / `file://` / `*.git` → git；
 * 4. `http(s)://`：先 15s 拉取 JSON 尝试 url；失败再 120s 浅克隆尝试 git；
 * 5. 其余抛中文错误。
 *
 * @param {string} location
 * @param {{store?: import('./store.js').HubStore, fetchImpl?: Function,
 *          cloneImpl?: (location: string, target: string) => void,
 *          jsonTimeoutMs?: number, cloneTimeoutMs?: number}} [options]
 * @returns {Promise<{type: 'local' | 'git' | 'url', location: string}>}
 */
export async function detectSource(location, options = {}) {
  const raw = String(location ?? '').trim()
  if (raw === '') throw new Error('市场地址不能为空')
  const jsonTimeoutMs = options.jsonTimeoutMs ?? 15_000
  const cloneTimeoutMs = options.cloneTimeoutMs ?? 120_000

  // 1/2：已存在目录
  const resolvedDir = path.resolve(expandTildeValue(raw))
  if (isDirectory(resolvedDir)) {
    const detected = detectLocalMarketDir(resolvedDir)
    if (detected !== null) return { type: 'local', location: resolvedDir }
    if (looksLikeGitDir(resolvedDir)) return { type: 'git', location: resolvedDir }
    throw new Error(`目录不是市场：${resolvedDir}（缺少 marketplace.json/plugin.json，也不是 git 仓库）`)
  }

  // 3：明显是 git 地址
  if (isGitLocation(raw)) return { type: 'git', location: raw }

  // 4：http(s) 先 JSON 后 git
  if (isHttpLocation(raw)) {
    let jsonError = null
    try {
      await fetchJsonProbe(raw, options.fetchImpl ?? globalThis.fetch, jsonTimeoutMs)
      return { type: 'url', location: raw }
    } catch (error) {
      jsonError = error instanceof Error ? error.message : String(error)
    }
    const cloneTarget = path.join(
      options.store?.paths?.tmp ?? os.tmpdir(),
      `detect-${String(process.pid)}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    )
    try {
      mkdirSync(path.dirname(cloneTarget), { recursive: true })
      if (typeof options.cloneImpl === 'function') {
        options.cloneImpl(raw, cloneTarget)
      } else {
        runGit(['clone', '--depth', '1', '--', raw, cloneTarget], { timeoutMs: cloneTimeoutMs })
      }
      return { type: 'git', location: raw }
    } catch (error) {
      const cloneError = error instanceof Error ? error.message : String(error)
      throw new Error(`无法识别的市场地址：${raw}（JSON 拉取失败：${jsonError}；git 克隆失败：${cloneError}）`)
    } finally {
      rmSync(cloneTarget, { force: true, recursive: true })
    }
  }

  // 5：像本地路径但目录不存在（给出更具体文案）
  if (isPathLike(raw)) {
    throw new Error(`本地市场目录不存在：${resolvedDir}`)
  }
  throw new Error(`无法识别的市场地址：${raw}（支持本地目录、git 仓库地址或 marketplace.json 直链）`)
}

/**
 * 解析市场条目对应的本地源目录（schema v2 的 describe/update 共用入口）。
 *
 * - local：local 市场用 location，git 市场用 cache 克隆目录；url 市场不支持相对路径源；
 * - github/git：默认只查缓存（`allowClone:false` 绝不联网）；缓存缺失时返回 cloneRequired；
 * - npm/unknown/other：返回不可解析原因。
 *
 * @param {object} market
 * @param {string} pluginName
 * @param {{ store?: import('./store.js').HubStore,
 *           markets?: MarketManager,
 *           allowClone?: boolean }} [options]
 * @returns {{resolved: boolean, path: string | null, reason: string, cloneRequired: boolean}}
 */
export function resolvePluginSourceRoot(market, pluginName, options = {}) {
  const entry = (market?.plugins ?? []).find((plugin) => plugin.name === pluginName)
  if (entry === undefined) {
    return {
      resolved: false,
      path: null,
      cloneRequired: false,
      reason: `市场 ${String(market?.id)} 里没有插件 ${pluginName}，请先 /agent-plugin market refresh`,
    }
  }
  const source = entry.source ?? { kind: 'unknown' }
  switch (source.kind) {
    case 'local': {
      if (market.type === 'url') {
        return {
          resolved: false,
          path: null,
          cloneRequired: false,
          reason: 'URL 市场里的相对路径插件无法安装：请改用 Git 市场，或让该插件提供 github/git source',
        }
      }
      const root = marketRoot(market, options.store)
      if (root === null) {
        return { resolved: false, path: null, cloneRequired: false, reason: `无法定位市场目录：${String(market?.id)}` }
      }
      let dir
      try {
        dir = resolveRelativeSource(root, source.raw)
      } catch (error) {
        return { resolved: false, path: null, cloneRequired: false, reason: error instanceof Error ? error.message : String(error) }
      }
      if (!isDirectory(dir)) {
        return { resolved: false, path: null, cloneRequired: false, reason: `插件目录不存在：${dir}` }
      }
      return { resolved: true, path: dir, cloneRequired: false, reason: '' }
    }
    case 'github':
    case 'git': {
      const store = options.store
      if (store?.paths?.markets === undefined) {
        return {
          resolved: false,
          path: null,
          cloneRequired: true,
          reason: '缺少 hub 存储路径，无法解析 git 源；请在 MarketManager 上用 resolvePluginSourceRoot',
        }
      }
      const dir = gitSourceDir(store, market.id, source)
      if (isDirectory(dir)) return { resolved: true, path: dir, cloneRequired: false, reason: '' }
      if (options.allowClone !== true) {
        return {
          resolved: false,
          path: null,
          cloneRequired: true,
          reason: `插件源尚未克隆（${gitSourceUrl(source) ?? 'git source'}）；允许联网后再试`,
        }
      }
      if (options.markets === undefined || typeof options.markets.resolveGitSource !== 'function') {
        return { resolved: false, path: null, cloneRequired: true, reason: '当前上下文不支持 git 克隆（缺少 markets 实例）' }
      }
      try {
        const cloned = options.markets.resolveGitSource(market, source)
        if (!isDirectory(cloned)) {
          return { resolved: false, path: null, cloneRequired: false, reason: `插件目录不存在：${cloned}` }
        }
        return { resolved: true, path: cloned, cloneRequired: false, reason: '' }
      } catch (error) {
        return { resolved: false, path: null, cloneRequired: false, reason: error instanceof Error ? error.message : String(error) }
      }
    }
    case 'npm':
      return { resolved: false, path: null, cloneRequired: false, reason: 'MVP 暂不支持 npm 源（已记录扩展点）' }
    default:
      return {
        resolved: false,
        path: null,
        cloneRequired: false,
        reason: `插件 ${pluginName} 的 source 无法安装（类型：${String(source.kind)}）`,
      }
  }
}

/** 允许的图标扩展名（只收 raster；与 ui-data 的 /icon MIME 白名单一致，不含 SVG）。 */
const ICON_MIME = Object.freeze({
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
})

/** 图标大小上限：256 KiB。 */
const ICON_MAX_BYTES = 256 * 1024

/**
 * 解析条目图标对应的市场根内 raster 文件（绝对路径）。
 *
 * 只返回市场根内、非符号链接、≤256 KiB、扩展名在白名单里的普通文件；
 * `data:` / `https:` / 越界路径 / 不存在的文件一律返回 null（远端图标由上层另行处理）。
 *
 * @param {object} market
 * @param {object} entry - 持久化市场条目（读 `entry.meta.icon`）
 * @param {import('./store.js').HubStore} [store]
 * @returns {string | null}
 */
export function entryIconFile(market, entry, store) {
  const icon = typeof entry?.meta?.icon === 'string' ? entry.meta.icon.trim() : ''
  if (icon === '') return null
  if (/^(?:data:|https?:)/iu.test(icon)) return null
  const root = marketRoot(market, store)
  if (root === null) return null
  let resolved
  try {
    resolved = resolveRelativeSource(root, icon)
  } catch {
    return null
  }
  let stats
  try {
    if (!isFile(resolved)) return null
    if (lstatSync(resolved).isSymbolicLink()) return null
    stats = statSync(resolved)
  } catch {
    return null
  }
  if (!stats.isFile() || stats.size > ICON_MAX_BYTES) return null
  if (Object.prototype.hasOwnProperty.call(ICON_MIME, path.extname(resolved).toLowerCase()) === false) return null
  try {
    const realRoot = realpathSync(path.resolve(root))
    const realFile = realpathSync(resolved)
    const prefix = realRoot.endsWith(path.sep) ? realRoot : `${realRoot}${path.sep}`
    if (realFile !== realRoot && !realFile.startsWith(prefix)) return null
    return resolved
  } catch {
    return null
  }
}

/** 把 marketplace 条目转成可持久化、可展示的记录（schema v2：带 meta，不存完整 raw）。 */
function toStoredPlugins(parsed, context) {
  return parsed.plugins.map((entry) => {
    const installable = entry.source.kind === 'local' || entry.source.kind === 'github' || entry.source.kind === 'git'
    const warning = entry.source.kind === 'npm'
      ? 'MVP 暂不支持 npm 源'
      : entry.source.kind === 'unknown' || entry.source.kind === 'other' ? '插件 source 无法识别，不能安装' : ''
    return {
      name: entry.name,
      version: entry.version,
      description: entry.description,
      source: entry.source,
      installable,
      ...(warning !== '' ? { warning } : {}),
      ...(context.origin !== undefined ? { origin: context.origin } : {}),
      meta: normalizeEntryMeta(entry.meta),
    }
  })
}

/** 把目录当单插件市场：直接读它自己的 plugin.json，复用 parseMarketplace 生成 display/meta。 */
function singlePluginMarket(location, name) {
  const detected = detectPluginManifest(location)
  const meta = validatePluginManifest(detected.manifest, detected)
  const marketplaceName = name || meta.name
  const parsed = parseMarketplace({
    name: marketplaceName,
    owner: meta.author ?? { name: '' },
    description: meta.description,
    plugins: [{
      name: meta.name,
      version: meta.version,
      description: meta.description,
      author: meta.author,
      homepage: meta.homepage,
      repository: meta.repository,
      license: meta.license,
      keywords: meta.keywords,
      icon: meta.icon,
      category: meta.category,
      source: './',
    }],
  }, { format: detected.format, root: location })
  return {
    name: marketplaceName,
    format: detected.format,
    parsed,
    warnings: [...detected.warnings, ...meta.warnings],
  }
}

export class MarketManager {
  /**
   * @param {{store: import('./store.js').HubStore, fetchImpl?: Function}} options
   */
  constructor(options) {
    this.store = options.store
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch
    /** @type {object | null} */
    this.data = null
    this.warnings = []
  }

  load() {
    const { markets, warnings } = this.store.readMarkets()
    this.data = markets
    this.warnings = warnings
    return this
  }

  list() {
    if (this.data === null) this.load()
    return this.data.markets
  }

  get(id) {
    return this.list().find((market) => market.id === id) ?? null
  }

  save() {
    this.store.saveMarkets(this.data)
  }

  /** 市场源根目录（local→location；git→cache 克隆；url→null）。 */
  marketRoot(market) {
    return marketRoot(market, this.store)
  }

  /** 自动识别市场来源（local/git/url），返回 `{type, location}`。 */
  async detectSource(location) {
    return await detectSource(location, { store: this.store, fetchImpl: this.fetchImpl })
  }

  /** 解析条目源目录；`allowClone:false` 时不联网。 */
  resolvePluginSourceRoot(market, pluginName, options = {}) {
    return resolvePluginSourceRoot(market, pluginName, {
      store: this.store,
      markets: this,
      ...options,
    })
  }

  /** 条目图标的本地文件路径（仅市场根内 raster，≤256 KiB）。 */
  entryIconFile(market, entry) {
    return entryIconFile(market, entry, this.store)
  }

  /**
   * 添加市场并立即刷新一次。
   *
   * @param {{type?: string, location: string, name?: string, format?: string}} input
   * @returns {Promise<object>} 市场记录
   */
  async add(input) {
    const rawLocation = String(input.location ?? '').trim()
    let type = String(input.type ?? '').trim()
    let location = rawLocation
    if (type === '' || type === 'auto') {
      const detected = await this.detectSource(rawLocation)
      type = detected.type
      location = detected.location
    }
    const normalizedLocation = normalizeLocation(type, location)
    const id = marketIdFor(type, normalizedLocation)
    if (this.get(id)) throw new Error(`市场已存在：${id}`)
    const market = {
      id,
      name: String(input.name ?? '').trim() || path.basename(normalizedLocation),
      title: '',
      format: String(input.format ?? '').trim() || 'claude',
      type,
      location: normalizedLocation,
      display: { title: '', description: '', owner: { name: '' } },
      owner: { name: '' },
      featured: [],
      addedAt: new Date().toISOString(),
      lastRefreshed: '',
      plugins: [],
      warnings: [],
    }
    this.data.markets.push(market)
    this.save()
    try {
      await this.refresh(id)
    } catch (error) {
      // 非 url 源首次失败：回滚记录，避免留下不可用市场。
      if (type !== 'url') {
        this.data.markets = this.data.markets.filter((item) => item.id !== id)
        this.save()
        throw error
      }
      market.refreshError = error instanceof Error ? error.message : String(error)
      this.save()
    }
    return this.get(id)
  }

  /** 从目录/git 仓库读取 marketplace.json；单插件目录走兼容分支。 */
  readFromDirectory(root, name, formatHint) {
    if (!isDirectory(root)) throw new Error(`市场目录不存在：${root}`)
    let detected
    try {
      detected = detectMarketplaceFile(root, { hintFormat: formatHint })
    } catch (error) {
      if (looksLikePluginDir(root)) {
        const single = singlePluginMarket(root, name)
        return {
          format: single.format,
          marketplaceName: single.name,
          parsed: single.parsed,
          warnings: single.warnings,
        }
      }
      throw error
    }
    const parsed = parseMarketplace(detected.manifest, { format: detected.format, root })
    return {
      format: detected.format,
      marketplaceName: typeof detected.manifest.name === 'string' ? detected.manifest.name.trim() : name,
      parsed,
      warnings: parsed.warnings,
    }
  }

  /** 克隆 git 市场仓库（浅克隆）。 */
  cloneGitMarket(market) {
    const repo = this.marketRoot(market)
    if (repo === null) throw new Error(`无法定位 git 市场缓存目录：${market.id}`)
    rmSync(repo, { force: true, recursive: true })
    mkdirSync(path.dirname(repo), { recursive: true })
    runGit(['clone', '--depth', '1', '--', market.location, repo])
  }

  /** 刷新 git 市场仓库：已存在则 fetch + reset，失败回退到重新克隆。 */
  syncGitMarket(market) {
    const repo = this.marketRoot(market)
    if (repo === null) throw new Error(`无法定位 git 市场缓存目录：${market.id}`)
    if (!existsSync(path.join(repo, '.git'))) {
      this.cloneGitMarket(market)
      return
    }
    try {
      runGit(['fetch', '--depth', '1', 'origin', 'HEAD'], { cwd: repo })
      runGit(['reset', '--hard', 'FETCH_HEAD'], { cwd: repo })
    } catch (error) {
      this.store.log('warn', `git 市场 ${market.id} 增量更新失败，改为重新克隆：${error instanceof Error ? error.message : String(error)}`)
      this.cloneGitMarket(market)
    }
  }

  /** 拉取 URL 市场清单并写入快照。 */
  async fetchUrlMarket(market) {
    if (typeof this.fetchImpl !== 'function') throw new Error('当前运行环境没有 fetch，无法使用 URL 市场')
    const response = await this.fetchImpl(market.location, {
      signal: AbortSignal.timeout?.(15_000),
      headers: { accept: 'application/json' },
    })
    if (!response.ok) throw new Error(`拉取 ${market.location} 失败：HTTP ${String(response.status)}`)
    const text = await response.text()
    let manifest
    try {
      manifest = JSON.parse(text)
    } catch (error) {
      throw new Error(`URL 市场返回的不是合法 JSON：${error instanceof Error ? error.message : String(error)}`)
    }
    const snapshot = path.join(this.store.paths.markets, market.id, 'marketplace.json')
    mkdirSync(path.dirname(snapshot), { recursive: true })
    writeFileSync(snapshot, text, 'utf8')
    return manifest
  }

  /** 解析 git 条目里的 GitHub/git source（缓存存在则复用，不存在则浅克隆）。 */
  resolveGitSource(market, source) {
    const url = gitSourceUrl(source)
    if (!url) throw new Error('Git source 缺少 url/repo')
    const dir = gitSourceDir(this.store, market.id, source)
    if (!existsSync(dir)) {
      mkdirSync(path.dirname(dir), { recursive: true })
      runGit(['clone', '--depth', '1', '--', url, dir])
      if (source.commit) {
        runGit(['fetch', '--depth', '1', 'origin', source.commit], { cwd: dir })
        runGit(['checkout', 'FETCH_HEAD'], { cwd: dir })
      }
    }
    return source.path ? resolveRelativeSource(dir, source.path) : dir
  }

  /**
   * 解析某插件条目的可安装目录（安装器入口；允许联网克隆）。
   *
   * @param {object} market
   * @param {string} pluginName
   * @returns {string} 插件源目录绝对路径
   */
  resolveInstallSource(market, pluginName) {
    const result = this.resolvePluginSourceRoot(market, pluginName, { allowClone: true })
    if (!result.resolved || result.path === null) {
      throw new Error(result.reason || `无法解析插件 ${pluginName} 的源目录`)
    }
    return result.path
  }

  /**
   * 刷新市场。url 源失败只记录 refreshError，不抛出。
   *
   * @param {string} id
   * @returns {Promise<object>} 市场记录
   */
  async refresh(id) {
    const market = this.get(id)
    if (!market) throw new Error(`市场不存在：${id}`)
    const warnings = []
    let parsed = null
    try {
      if (market.type === 'local') {
        const read = this.readFromDirectory(market.location, market.name, market.format)
        market.format = read.format
        parsed = read.parsed
        warnings.push(...read.warnings)
      } else if (market.type === 'git') {
        this.syncGitMarket(market)
        const root = this.marketRoot(market)
        const read = this.readFromDirectory(root, market.name, market.format)
        market.format = read.format
        parsed = read.parsed
        warnings.push(...read.warnings)
      } else if (market.type === 'url') {
        const manifest = await this.fetchUrlMarket(market)
        parsed = parseMarketplace(manifest, { format: market.format, root: market.location, origin: market.location })
        warnings.push(...parsed.warnings)
      } else {
        throw new Error(`未知市场类型：${market.type}`)
      }
      market.plugins = toStoredPlugins(parsed, { origin: market.type === 'url' ? market.location : undefined })
      // 上游 name 存 title；用户别名 market.name 保持不变。
      market.title = parsed.display?.title || parsed.name || market.title || market.name
      market.display = parsed.display ?? { title: market.title, description: '', owner: { name: '' } }
      market.owner = market.display.owner ?? { name: '' }
      market.featured = Array.isArray(parsed.featured) ? parsed.featured.slice(0, 200) : []
      market.lastRefreshed = new Date().toISOString()
      delete market.refreshError
      market.warnings = warnings.slice(0, 50)
      this.save()
      this.store.log('info', `市场 ${market.id} 刷新成功：${market.plugins.length} 个插件`)
      return market
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      market.refreshError = message
      market.warnings = warnings.slice(0, 50)
      this.save()
      this.store.log('warn', `市场 ${market.id} 刷新失败：${message}`)
      if (market.type === 'url') return market
      throw error
    }
  }

  /** 刷新全部市场；逐个记录错误。 */
  async refreshAll() {
    const results = []
    for (const market of this.list()) {
      try {
        await this.refresh(market.id)
        results.push({ id: market.id, ok: true })
      } catch (error) {
        results.push({ id: market.id, ok: false, error: error instanceof Error ? error.message : String(error) })
      }
    }
    return results
  }

  /** 移除市场记录（连同 cache 克隆目录）。 */
  remove(id) {
    const market = this.get(id)
    if (!market) throw new Error(`市场不存在：${id}`)
    this.data.markets = this.data.markets.filter((item) => item.id !== id)
    this.save()
    if (market.type !== 'local') {
      rmSync(path.join(this.store.paths.markets, market.id), { force: true, recursive: true })
    }
    this.store.log('info', `市场 ${id} 已移除`)
    return market
  }

  /** 列出 cache 里不再被任何市场引用的目录（自检提示用）。 */
  orphanCacheDirs() {
    const root = this.store.paths.markets
    if (!isDirectory(root)) return []
    const known = new Set(this.list().map((market) => market.id))
    try {
      return readdirSync(root, { withFileTypes: true })
        .filter((entry) => entry.isDirectory() && !known.has(entry.name))
        .map((entry) => entry.name)
    } catch {
      return []
    }
  }
}