/**
 * Market source management: local directories, git repositories, and
 * marketplace.json direct links.
 *
 * - local: read the marketplace.json in the directory (without one, the
 *   directory itself counts as a single-plugin market);
 * - git: shallow-clone with system git into the hub's own cache; refresh runs
 *   fetch + reset;
 * - url: fetch marketplace.json over HTTP(S); failures only record
 *   refreshError and never block the rest.
 *
 * Schema v2:
 * - Market records persist `title/display/owner/featured` and entry `meta`
 *   (display metadata);
 * - Refresh keeps the user's market alias (`market.name` is not overwritten by
 *   the upstream name, which is stored in `title`);
 * - A git market's clone root always derives from `marketRoot(market)` (no
 *   reliance on unpersisted in-memory fields).
 *
 * @module dsh-agent-plugin-hub/market
 */

import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { chmodSync, existsSync, lstatSync, mkdirSync, readdirSync, realpathSync, rmSync, statSync, writeFileSync } from 'node:fs'
import type { Stats } from 'node:fs'
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
} from './manifest.ts'
import { FORMAT_PRIORITY, findFormat } from './formats.ts'
import { hubError } from './hub.ts'
import { marketLocationKey } from './location-key.ts'
import type { Marketplace, SourceRef } from './manifest.ts'
import type { HubStore, MarketRecord, MarketsFile, StoredEntry } from './store.ts'
import type { LogFn } from './log.ts'

/** Safe environment for git subprocesses: no interactive prompts. */
function gitEnv(): NodeJS.ProcessEnv {
  return {
    ...process.env,
    GIT_TERMINAL_PROMPT: '0',
    GCM_INTERACTIVE: 'Never',
    GIT_OPTIONAL_LOCKS: '0',
  }
}

/** Run one git command; failures throw an actionable Chinese error (with a stderr tail). */
function runGit(args: readonly string[], options: { timeoutMs?: number, cwd?: string } = {}): string {
  const result = spawnSync('git', args, {
    encoding: 'utf8',
    timeout: options.timeoutMs ?? 120_000,
    cwd: options.cwd,
    env: gitEnv(),
    windowsHide: true,
  })
  if (result.error) {
    throw hubError(`执行 git 失败：${result.error.message}`, 'git_error')
  }
  if (result.status !== 0) {
    const stderr = String(result.stderr ?? '').trim().split('\n').slice(-4).join(' | ')
    throw hubError(`git ${args[0]} 失败（退出码 ${String(result.status)}）：${stderr || '无输出'}`, 'git_error')
  }
  return result.stdout ?? ''
}

/** Derive a stable market id from type and location. */
export function marketIdFor(type: string, location: string): string {
  const hash = createHash('sha1').update(`${type}\u0000${location}`).digest('hex').slice(0, 8)
  const base = String(location).replace(/\\/gu, '/').split('/').filter(Boolean).pop() ?? 'market'
  const slug = base.replace(/\.git$/u, '').replace(/[^A-Za-z0-9._-]+/gu, '-').replace(/^-+|-+$/gu, '').toLowerCase()
  return `${type}-${(slug || 'market').slice(0, 32)}-${hash}`
}

/** Expand `~` / `~/` (everything else verbatim). */
function expandTildeValue(value: unknown): string {
  const raw = String(value ?? '').trim()
  if (raw === '~' || raw.startsWith('~/') || raw.startsWith('~\\')) {
    const home = process.env.USERPROFILE || process.env.HOME || ''
    return raw === '~' ? home : path.join(home, raw.slice(2))
  }
  return raw
}

/** Resolve a user-supplied location (local supports cwd-relative and `~`). */
export function normalizeLocation(type: string, location: unknown): string {
  const raw = String(location ?? '').trim()
  if (raw === '') throw hubError('市场地址不能为空', 'bad_request')
  if (type === 'local') {
    const resolved = path.resolve(expandTildeValue(raw))
    if (!isDirectory(resolved)) throw hubError(`本地市场目录不存在：${resolved}`, 'not_found')
    return resolved
  }
  if (type === 'url') {
    if (!/^https?:\/\//u.test(raw)) throw hubError(`URL 市场地址必须以 http:// 或 https:// 开头：${raw}`, 'bad_request')
    return raw
  }
  if (type === 'git') {
    if (!/^(?:https?:\/\/|git@|ssh:\/\/|git:\/\/|file:\/\/)/u.test(raw) && !raw.endsWith('.git') && !isDirectory(path.resolve(raw))) {
      throw hubError(`Git 市场地址无法识别：${raw}（支持 https/git@/ssh 或本地仓库目录）`, 'bad_request')
    }
    if (isDirectory(path.resolve(raw))) return path.resolve(raw)
    return raw
  }
  throw hubError(`未知市场类型：${type}`, 'bad_request')
}

/** Clone URL of a git source (a github short name joins as https). */
function gitSourceUrl(source: SourceRef): string | undefined {
  if (source.kind === 'github') {
    return /^(?:https?:\/\/|git@)/u.test(source.repo) ? source.repo : `https://github.com/${source.repo}.git`
  }
  return source.kind === 'git' ? source.url : undefined
}

/** Cache directory name of a git source (hash of url + commit). */
function gitSourceHash(source: SourceRef): string {
  const url = gitSourceUrl(source) ?? ''
  const commit = source.kind === 'github' || source.kind === 'git' ? source.commit ?? '' : ''
  return createHash('sha1').update(`${url}\u0000${commit}`).digest('hex').slice(0, 10)
}

function gitSourceDir(store: HubStore, marketId: string, source: SourceRef): string {
  return path.join(store.paths.markets, marketId, 'sources', gitSourceHash(source))
}

/**
 * Root directory of one market in the cache.
 *
 * - local → market.location
 * - git   → `<home>/cache/markets/<id>/repo`
 * - url   → null (a url market has no local plugin source directory)
 */
export function marketRoot(market: unknown, store?: HubStore): string | null {
  if (market === null || typeof market !== 'object') return null
  const record = market as Partial<MarketRecord> & { root?: unknown }
  if (record.type === 'local') {
    return typeof record.location === 'string' && record.location !== '' ? record.location : null
  }
  if (record.type === 'git') {
    if (store?.paths?.markets && typeof record.id === 'string' && record.id !== '') {
      return path.join(store.paths.markets, record.id, 'repo')
    }
    // Callers without a store may carry an in-memory root (persisted data never has one).
    return typeof record.root === 'string' && record.root !== '' ? record.root : null
  }
  return null
}

/** Probe result of a local market directory. */
interface LocalMarketDetection {
  kind: 'marketplace' | 'plugin'
  format: string
  manifest: unknown
}

/** Whether a directory carries a marketplace/plugin manifest; returns the probe or `null`. */
function detectLocalMarketDir(dir: string): LocalMarketDetection | null {
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

function looksLikeGitDir(dir: string): boolean {
  return isDirectory(path.join(dir, '.git'))
}

function isHttpLocation(raw: string): boolean {
  return /^https?:\/\//u.test(raw)
}

function isGitLocation(raw: string): boolean {
  return /^(?:git@|ssh:\/\/|git:\/\/|file:\/\/)/u.test(raw) || raw.endsWith('.git')
}

function isPathLike(raw: string): boolean {
  return /[\\/]/u.test(raw) || /^[A-Za-z]:/u.test(raw) || raw === '~' || raw.startsWith('~') || raw === '.' || raw.startsWith('./') || raw.startsWith('../')
}

/** Fetch JSON from a URL (15s timeout). */
async function fetchJsonProbe(url: string, fetchImpl: unknown, timeoutMs: number): Promise<Record<string, unknown>> {
  if (typeof fetchImpl !== 'function') throw new Error('当前运行环境没有 fetch，无法探测 URL 市场')
  const response = await (fetchImpl as typeof fetch)(url, {
    signal: AbortSignal.timeout?.(timeoutMs),
    headers: { accept: 'application/json' },
  })
  if (!response.ok) throw hubError(`HTTP ${String(response.status)}`, 'network_error')
  const text = await response.text()
  const parsed = JSON.parse(text) as unknown
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('返回的不是 JSON 对象')
  }
  const record = parsed as Record<string, unknown>
  if (!Array.isArray(record.plugins) && typeof record.name !== 'string') {
    throw new Error('返回的 JSON 不像 marketplace.json（缺少 name/plugins）')
  }
  return record
}

/** Options for source detection. */
export interface DetectSourceOptions {
  store?: HubStore
  fetchImpl?: unknown
  cloneImpl?: (location: string, target: string) => void
  jsonTimeoutMs?: number
  cloneTimeoutMs?: number
}

/**
 * Auto-detect a market source.
 *
 * Rules:
 * 1. Expand `~`; an existing directory with marketplace.json / plugin.json → local;
 * 2. An existing directory without manifests but with `.git` → git (local repo);
 * 3. `git@` / `ssh://` / `git://` / `file://` / `*.git` → git;
 * 4. `http(s)://`: first a 15s JSON fetch tries url; on failure a 120s shallow clone tries git;
 * 5. Anything else throws an actionable Chinese error.
 */
/**
 * Remove a cloned tree. Fresh git clones on Windows transiently fail with
 * EPERM/EBUSY while indexers hold handles, and git marks pack files
 * read-only; retry briefly and clear read-only bits before a final attempt.
 * The removal is best-effort: a leftover cache directory is harmless residue.
 */
function rmTree(target: string): void {
  try {
    rmSync(target, { force: true, recursive: true, maxRetries: 5, retryDelay: 200 })
    return
  } catch {
    /* fall through and clear the read-only attributes first */
  }
  const clearReadOnly = (current: string): void => {
    let stats: Stats | null = null
    try {
      stats = lstatSync(current)
    } catch {
      return
    }
    if (stats.isDirectory()) {
      try {
        for (const entry of readdirSync(current)) clearReadOnly(path.join(current, entry))
      } catch {
        /* unreadable directory: leave it to the retry */
      }
      try {
        chmodSync(current, 0o777)
      } catch {
        /* best effort */
      }
    } else if (stats.isFile()) {
      try {
        chmodSync(current, 0o666)
      } catch {
        /* best effort */
      }
    }
  }
  try {
    clearReadOnly(target)
    rmSync(target, { force: true, recursive: true, maxRetries: 5, retryDelay: 200 })
  } catch {
    /* best effort: a locked tree stays behind instead of failing the caller */
  }
}

/** Result of previewing one market source. */
export interface MarketPreview {
  type: 'local' | 'git' | 'url'
  /** How the manifest was obtained: raw file fetch, a clone, or a local directory. */
  via: 'raw' | 'clone' | 'local'
  location: string
  format: string
  name: string
  title: string
  description: string
  plugins: Array<{ name: string, version: string, display: { title: string, description: string, category?: string, author?: { name?: string, url?: string }, homepage?: string, repository?: string, license?: string }, installable: boolean, warning?: string }>
}

/** Market-level head fields shared by the preview branches. */
function previewHead(format: string, parsed: Marketplace, fallbackName: string): { format: string, name: string, title: string, description: string } {
  return {
    format,
    name: parsed.name !== '' ? parsed.name : fallbackName,
    title: parsed.display.title || parsed.name || fallbackName,
    description: parsed.display.description || '',
  }
}

/** Light projection of parsed entries for the preview list (displayOf-compatible). */
function previewPlugins(parsed: Marketplace): MarketPreview['plugins'] {
  return parsed.plugins.map((entry) => {
    const installable = entry.source.kind === 'local' || entry.source.kind === 'github' || entry.source.kind === 'git'
    const metaTitle = entry.meta.displayName ?? String(entry.meta.title ?? '')
    const author = entry.meta.author
    return {
      name: entry.name,
      version: entry.version,
      display: {
        title: metaTitle !== '' ? metaTitle : entry.name,
        description: entry.meta.description ?? entry.description ?? '',
        ...(entry.meta.category !== undefined ? { category: entry.meta.category } : {}),
        ...(author !== undefined ? { author } : {}),
        ...(entry.meta.homepage !== undefined ? { homepage: entry.meta.homepage } : {}),
        ...(entry.meta.repository !== undefined ? { repository: entry.meta.repository } : {}),
        ...(entry.meta.license !== undefined ? { license: entry.meta.license } : {}),
      },
      installable,
      ...(installable ? {} : { warning: '该插件的 source 暂不支持安装' }),
    }
  })
}

/** Raw manifest base of a github repo URL (`null` for anything else). */
function githubRawInfo(raw: string): { base: string } | null {
  const match = /^https?:\/\/github\.com\/([^/]+)\/([^/#?]+?)(?:\.git)?(?:\/tree\/([^/#?]+))?(?:\/.*)?$/iu.exec(raw)
  const owner = match?.[1] ?? ''
  const repo = match?.[2] ?? ''
  if (owner === '' || repo === '') return null
  const ref = match?.[3] ?? ''
  return { base: `https://raw.githubusercontent.com/${owner}/${repo}/${ref || 'HEAD'}` }
}

/** Manifest candidate paths in probe order (FORMAT_PRIORITY × marketplaceFiles, deduped). */
function rawManifestCandidates(): Array<[formatId: string, relative: string]> {
  const seen = new Set<string>()
  const list: Array<[string, string]> = []
  for (const formatId of FORMAT_PRIORITY) {
    const format = findFormat(formatId)
    if (!format) continue
    for (const relative of format.marketplaceFiles) {
      if (seen.has(relative)) continue
      seen.add(relative)
      list.push([formatId, relative])
    }
  }
  return list
}

export async function detectSource(
  location: unknown,
  options: DetectSourceOptions = {},
): Promise<{ type: 'local' | 'git' | 'url', location: string }> {
  const raw = String(location ?? '').trim()
  if (raw === '') throw hubError('市场地址不能为空', 'bad_request')
  const jsonTimeoutMs = options.jsonTimeoutMs ?? 15_000
  const cloneTimeoutMs = options.cloneTimeoutMs ?? 120_000

  // 1/2: existing directories
  const resolvedDir = path.resolve(expandTildeValue(raw))
  if (isDirectory(resolvedDir)) {
    const detected = detectLocalMarketDir(resolvedDir)
    if (detected !== null) return { type: 'local', location: resolvedDir }
    if (looksLikeGitDir(resolvedDir)) return { type: 'git', location: resolvedDir }
    throw hubError(`目录不是市场：${resolvedDir}（缺少 marketplace.json/plugin.json，也不是 git 仓库）`, 'not_found')
  }

  // 3: clearly a git address
  if (isGitLocation(raw)) return { type: 'git', location: raw }

  // 4: http(s) tries JSON first, then git
  if (isHttpLocation(raw)) {
    let jsonError = ''
    try {
      await fetchJsonProbe(raw, options.fetchImpl ?? globalThis.fetch, jsonTimeoutMs)
      return { type: 'url', location: raw }
    } catch (error) {
      jsonError = error instanceof Error ? error.message : String(error)
    }
    const cloneTarget = path.join(
      options.store?.paths.tmp ?? os.tmpdir(),
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
      throw hubError(`无法识别的市场地址：${raw}（JSON 拉取失败：${jsonError}；git 克隆失败：${cloneError}）`, 'network_error')
    } finally {
      rmTree(cloneTarget)
    }
  }

  // 5: looks like a local path but the directory is missing (a more specific message)
  if (isPathLike(raw)) {
    throw hubError(`本地市场目录不存在：${resolvedDir}`, 'not_found')
  }
  throw hubError(`无法识别的市场地址：${raw}（支持本地目录、git 仓库地址或 marketplace.json 直链）`, 'bad_request')
}

/** Resolution of one entry's local source root. */
export interface ResolvedSourceRoot {
  resolved: boolean
  path: string | null
  reason: string
  cloneRequired: boolean
}

/**
 * Resolve the local source directory of a market entry (the shared
 * describe/update entry of schema v2).
 *
 * - local: local markets use location, git markets use the cache clone; url
 *   markets do not support relative-path sources;
 * - github/git: cache-only by default (`allowClone:false` never touches the
 *   network); a missing cache reports cloneRequired;
 * - npm/unknown/other: an unresolvable reason.
 */
export function resolvePluginSourceRoot(
  market: MarketRecord,
  pluginName: string,
  options: { store?: HubStore, markets?: { resolveGitSource(market: MarketRecord, source: SourceRef): string }, allowClone?: boolean } = {},
): ResolvedSourceRoot {
  const entry = (market?.plugins ?? []).find(plugin => plugin.name === pluginName)
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
      let dir: string
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

/** Allowed icon extensions (raster only; matches ui-data's /icon MIME allowlist, no SVG). */
const ICON_MIME: Readonly<Record<string, string>> = Object.freeze({
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
})

/** Icon size cap: 256 KiB. */
const ICON_MAX_BYTES = 256 * 1024

/**
 * Resolve an entry icon to a raster file inside the market root (absolute path).
 *
 * Only regular files inside the market root, non-symlink, ≤256 KiB, with an
 * allowlisted extension qualify; `data:` / `https:` / out-of-bounds paths /
 * missing files return `null` (remote icons are the upper layer's concern).
 */
export function entryIconFile(market: MarketRecord, entry: StoredEntry, store?: HubStore): string | null {
  const icon = typeof entry?.meta?.icon === 'string' ? entry.meta.icon.trim() : ''
  if (icon === '') return null
  if (/^(?:data:|https?:)/iu.test(icon)) return null
  const root = marketRoot(market, store)
  if (root === null) return null
  let resolved: string
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
  if (!Object.prototype.hasOwnProperty.call(ICON_MIME, path.extname(resolved).toLowerCase())) return null
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

/** Turn marketplace entries into persistable, displayable records (schema v2: with meta, no full raw). */
function toStoredPlugins(parsed: ReturnType<typeof parseMarketplace>, context: { origin?: string | undefined }): StoredEntry[] {
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

/** Treat a directory as a single-plugin market: read its own plugin.json and reuse parseMarketplace for display/meta. */
function singlePluginMarket(location: string, name?: string): {
  name: string
  format: string
  parsed: ReturnType<typeof parseMarketplace>
  warnings: string[]
} {
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

/** Directory read result of one market. */
export interface MarketDirectoryRead {
  format: string
  marketplaceName: string
  parsed: ReturnType<typeof parseMarketplace>
  warnings: string[]
}

/** Refresh outcome of one market. */
export interface RefreshOutcome {
  id: string
  ok: boolean
  error?: string
}

/** Store face MarketManager needs. */
export interface MarketStore extends HubStore {
  /* full HubStore */
}

/** Manages market sources: local, git, and marketplace.json links. */
export class MarketManager {
  private readonly store: HubStore
  private readonly log: LogFn
  private readonly fetchImpl: unknown
  private data: MarketsFile | null = null

  /** Tolerance warnings from the last load. */
  warnings: string[] = []

  constructor(options: { store: HubStore, log: LogFn, fetchImpl?: unknown }) {
    this.store = options.store
    this.log = options.log
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch
    this.cleanupPreviewCache()
  }

  /** Drop the previous process's preview clones (tmp is transient by design). */
  private cleanupPreviewCache(): void {
    try {
      for (const entry of readdirSync(this.store.paths.tmp)) {
        if (entry.startsWith('preview-')) rmTree(path.join(this.store.paths.tmp, entry))
      }
    } catch {
      /* tmp may not exist yet */
    }
  }

  load(): this {
    const { markets, warnings } = this.store.readMarkets()
    this.data = markets
    this.warnings = warnings
    return this
  }

  /** The loaded table; the first call loads it. */
  private ensureData(): MarketsFile {
    let data = this.data
    if (data === null) {
      this.load()
      data = this.data
    }
    if (data === null) throw hubError('marketplaces 数据不可用', 'internal')
    return data
  }

  list(): MarketRecord[] {
    return this.ensureData().markets
  }

  get(id: string): MarketRecord | null {
    return this.list().find(market => market.id === id) ?? null
  }

  save(): void {
    this.store.saveMarkets(this.ensureData())
  }

  /** Market source root (local→location; git→cache clone; url→null). */
  marketRoot(market: MarketRecord): string | null {
    return marketRoot(market, this.store)
  }

  /** Auto-detect the market source (local/git/url). */
  async detectSource(location: unknown): Promise<{ type: 'local' | 'git' | 'url', location: string }> {
    return await detectSource(location, { store: this.store, fetchImpl: this.fetchImpl })
  }

  /** Resolve an entry's source directory; `allowClone:false` stays offline. */
  resolvePluginSourceRoot(
    market: MarketRecord,
    pluginName: string,
    options: { allowClone?: boolean } = {},
  ): ResolvedSourceRoot {
    return resolvePluginSourceRoot(market, pluginName, {
      store: this.store,
      markets: this,
      ...options,
    })
  }

  /** Local file path of an entry icon (in-root raster only, ≤256 KiB). */
  entryIconFile(market: MarketRecord, entry: StoredEntry): string | null {
    return entryIconFile(market, entry, this.store)
  }

  /** Add a market and refresh it immediately. */
  async add(input: { type?: string | undefined, location: string, name?: string | undefined, format?: string | undefined }): Promise<MarketRecord> {
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
    if (this.get(id)) throw hubError(`市场已存在：${id}`, 'conflict')
    // Same source under a different spelling (`.git` suffix, raw manifest link,
    // another host form) must not register as a second market.
    const wantedKey = marketLocationKey(normalizedLocation)
    const duplicate = wantedKey === '' ? null : this.list().find(market => marketLocationKey(market.location) === wantedKey)
    if (duplicate) {
      throw hubError(`该市场已存在：${duplicate.title || duplicate.name}（${duplicate.location}）。如需重新添加，请先移除原市场。`, 'market_exists')
    }
    const market: MarketRecord = {
      id,
      name: String(input.name ?? '').trim() || path.basename(normalizedLocation),
      title: '',
      format: String(input.format ?? '').trim() || 'claude',
      type: type as MarketRecord['type'],
      location: normalizedLocation,
      display: { title: '', description: '', owner: { name: '' } },
      owner: { name: '' },
      featured: [],
      addedAt: new Date().toISOString(),
      lastRefreshed: '',
      plugins: [],
      warnings: [],
    }
    this.ensureData().markets.push(market)
    this.save()
    try {
      await this.refresh(id)
    } catch (error) {
      // A first-refresh failure on a non-url source rolls the record back so no unusable market lingers.
      if (type !== 'url') {
        const rollback = this.ensureData()
        rollback.markets = rollback.markets.filter(item => item.id !== id)
        this.save()
        throw error
      }
      market.refreshError = error instanceof Error ? error.message : String(error)
      this.save()
    }
    return this.get(id) as MarketRecord
  }

  /** Read-only preview of one market source (never registers or persists anything). */
  async preview(input: { location: unknown, format?: unknown, refresh?: unknown }, options: { fetchImpl?: unknown, cloneImpl?: (location: string, target: string) => void, jsonTimeoutMs?: number, cloneTimeoutMs?: number } = {}): Promise<MarketPreview> {
    const raw = String(input.location ?? '').trim()
    if (raw === '') throw hubError('市场地址不能为空', 'bad_request')
    const formatHint = String(input.format ?? '').trim() || undefined
    const refresh = input.refresh === true
    const fetchImpl = options.fetchImpl ?? this.fetchImpl
    const jsonTimeoutMs = options.jsonTimeoutMs ?? 15_000

    // 1: existing directory (marketplace or single-plugin)
    const resolvedDir = path.resolve(expandTildeValue(raw))
    if (isDirectory(resolvedDir)) {
      const read = this.readFromDirectory(resolvedDir, undefined, formatHint)
      return { type: 'local', location: resolvedDir, via: 'local', ...previewHead(read.format, read.parsed, read.marketplaceName), plugins: previewPlugins(read.parsed) }
    }

    // 2: http(s) — a github repo probes its raw manifest files first (no clone);
    //    a direct marketplace.json link parses as-is; anything else falls to a clone.
    if (isHttpLocation(raw)) {
      const github = githubRawInfo(raw)
      if (github !== null) {
        for (const [formatId, relative] of rawManifestCandidates()) {
          try {
            const manifest = await fetchJsonProbe(`${github.base}/${relative}`, fetchImpl, jsonTimeoutMs)
            const parsed = parseMarketplace(manifest, { format: formatId, root: raw, origin: raw })
            return { type: 'git', location: raw, via: 'raw', ...previewHead(formatId, parsed, ''), plugins: previewPlugins(parsed) }
          } catch {
            /* try the next candidate, then fall through to a clone */
          }
        }
      } else {
        try {
          const manifest = await fetchJsonProbe(raw, fetchImpl, jsonTimeoutMs)
          const format = formatHint ?? 'claude'
          const parsed = parseMarketplace(manifest, { format, root: raw, origin: raw })
          return { type: 'url', location: raw, via: 'raw', ...previewHead(format, parsed, ''), plugins: previewPlugins(parsed) }
        } catch {
          /* fall through to a clone */
        }
      }
    }

    // 3: git (explicit git forms, or http(s) whose probing found no manifest)
    if (isGitLocation(raw) || isHttpLocation(raw)) {
      const target = this.previewCloneTarget(raw)
      if (refresh) rmTree(target)
      if (!isDirectory(target)) {
        mkdirSync(path.dirname(target), { recursive: true })
        if (typeof options.cloneImpl === 'function') options.cloneImpl(raw, target)
        else runGit(['clone', '--depth', '1', '--', raw, target], { timeoutMs: options.cloneTimeoutMs ?? 120_000 })
      }
      const read = this.readFromDirectory(target, undefined, formatHint)
      return { type: 'git', location: raw, via: 'clone', ...previewHead(read.format, read.parsed, read.marketplaceName), plugins: previewPlugins(read.parsed) }
    }

    if (isPathLike(raw)) throw hubError(`本地市场目录不存在：${resolvedDir}`, 'not_found')
    throw hubError(`无法识别的市场地址：${raw}（支持本地目录、git 仓库地址或 marketplace.json 直链）`, 'bad_request')
  }

  /** Clone-cache path of one git location for previews. */
  private previewCloneTarget(location: string): string {
    const hash = createHash('sha1').update(location).digest('hex').slice(0, 12)
    return path.join(this.store.paths.tmp, `preview-${hash}`)
  }

  /** Read marketplace.json from a directory/git repo; a single-plugin directory takes the compatibility branch. */
  readFromDirectory(root: string, name?: string, formatHint?: string): MarketDirectoryRead {
    if (!isDirectory(root)) throw hubError(`市场目录不存在：${root}`, 'not_found')
    let detected
    try {
      detected = detectMarketplaceFile(root, { ...(formatHint !== undefined ? { hintFormat: formatHint } : {}) })
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
      marketplaceName: typeof detected.manifest.name === 'string' && detected.manifest.name.trim() !== ''
        ? detected.manifest.name.trim()
        : name ?? '',
      parsed,
      warnings: parsed.warnings,
    }
  }

  /** Clone a git market repository (shallow). */
  cloneGitMarket(market: MarketRecord): void {
    const repo = this.marketRoot(market)
    if (repo === null) throw hubError(`无法定位 git 市场缓存目录：${market.id}`, 'bad_request')
    rmTree(repo)
    mkdirSync(path.dirname(repo), { recursive: true })
    runGit(['clone', '--depth', '1', '--', market.location, repo])
  }

  /** Refresh a git market repository: fetch + reset when present, re-clone on failure. */
  syncGitMarket(market: MarketRecord): void {
    const repo = this.marketRoot(market)
    if (repo === null) throw hubError(`无法定位 git 市场缓存目录：${market.id}`, 'bad_request')
    if (!existsSync(path.join(repo, '.git'))) {
      this.cloneGitMarket(market)
      return
    }
    try {
      runGit(['fetch', '--depth', '1', 'origin', 'HEAD'], { cwd: repo })
      runGit(['reset', '--hard', 'FETCH_HEAD'], { cwd: repo })
    } catch (error) {
      this.log('warn', `git 市场 ${market.id} 增量更新失败，改为重新克隆：${error instanceof Error ? error.message : String(error)}`)
      this.cloneGitMarket(market)
    }
  }

  /** Fetch a URL market manifest and write the snapshot. */
  async fetchUrlMarket(market: MarketRecord): Promise<unknown> {
    if (typeof this.fetchImpl !== 'function') throw hubError('当前运行环境没有 fetch，无法使用 URL 市场', 'network_error')
    const response = await (this.fetchImpl as typeof fetch)(market.location, {
      signal: AbortSignal.timeout?.(15_000),
      headers: { accept: 'application/json' },
    })
    if (!response.ok) throw hubError(`拉取 ${market.location} 失败：HTTP ${String(response.status)}`, 'network_error')
    const text = await response.text()
    let manifest: unknown
    try {
      manifest = JSON.parse(text)
    } catch (error) {
      throw hubError(`URL 市场返回的不是合法 JSON：${error instanceof Error ? error.message : String(error)}`, 'network_error')
    }
    const snapshot = path.join(this.store.paths.markets, market.id, 'marketplace.json')
    mkdirSync(path.dirname(snapshot), { recursive: true })
    writeFileSync(snapshot, text, 'utf8')
    return manifest
  }

  /** Resolve a github/git entry source (reuse cache when present, shallow-clone otherwise). */
  resolveGitSource(market: MarketRecord, source: SourceRef): string {
    const url = gitSourceUrl(source)
    if (!url) throw hubError('Git source 缺少 url/repo', 'bad_request')
    const dir = gitSourceDir(this.store, market.id, source)
    if (!existsSync(dir)) {
      mkdirSync(path.dirname(dir), { recursive: true })
      runGit(['clone', '--depth', '1', '--', url, dir])
      const commit = (source.kind === 'github' || source.kind === 'git') ? source.commit : undefined
      if (commit) {
        runGit(['fetch', '--depth', '1', 'origin', commit], { cwd: dir })
        runGit(['checkout', 'FETCH_HEAD'], { cwd: dir })
      }
    }
    const sourcePath = (source.kind === 'github' || source.kind === 'git') ? source.path : undefined
    return sourcePath ? resolveRelativeSource(dir, sourcePath) : dir
  }

  /** Resolve a plugin entry's installable directory (installer entry; may clone). */
  resolveInstallSource(market: MarketRecord, pluginName: string): string {
    const result = this.resolvePluginSourceRoot(market, pluginName, { allowClone: true })
    if (!result.resolved || result.path === null) {
      throw hubError(result.reason || `无法解析插件 ${pluginName} 的源目录`, 'source_unavailable')
    }
    return result.path
  }

  /** Refresh one market. A url-source failure only records refreshError and never throws. */
  async refresh(id: string): Promise<MarketRecord> {
    const market = this.get(id)
    if (!market) throw hubError(`市场不存在：${id}`, 'not_found')
    const warnings: string[] = []
    let parsed: ReturnType<typeof parseMarketplace>
    try {
      if (market.type === 'local') {
        const read = this.readFromDirectory(market.location, market.name, market.format)
        market.format = read.format
        parsed = read.parsed
        warnings.push(...read.warnings)
      } else if (market.type === 'git') {
        this.syncGitMarket(market)
        const root = this.marketRoot(market)
        const read = this.readFromDirectory(root ?? '', market.name, market.format)
        market.format = read.format
        parsed = read.parsed
        warnings.push(...read.warnings)
      } else if (market.type === 'url') {
        const manifest = await this.fetchUrlMarket(market)
        parsed = parseMarketplace(manifest, { format: market.format, root: market.location, origin: market.location })
        warnings.push(...parsed.warnings)
      } else {
        throw hubError(`未知市场类型：${market.type}`, 'bad_request')
      }
      market.plugins = toStoredPlugins(parsed, { origin: market.type === 'url' ? market.location : undefined })
      // The upstream name lands in title; the user's alias market.name stays untouched.
      market.title = parsed.display?.title || parsed.name || market.title || market.name
      market.display = parsed.display ?? { title: market.title, description: '', owner: { name: '' } }
      market.owner = market.display.owner ?? { name: '' }
      market.featured = Array.isArray(parsed.featured) ? parsed.featured.slice(0, 200) : []
      market.lastRefreshed = new Date().toISOString()
      delete market.refreshError
      market.warnings = warnings.slice(0, 50)
      this.save()
      this.log('info', `市场 ${market.id} 刷新成功：${market.plugins.length} 个插件`)
      return market
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      market.refreshError = message
      market.warnings = warnings.slice(0, 50)
      this.save()
      this.log('warn', `市场 ${market.id} 刷新失败：${message}`)
      if (market.type === 'url') return market
      throw error
    }
  }

  /** Refresh every market; record each error. */
  async refreshAll(): Promise<RefreshOutcome[]> {
    const results: RefreshOutcome[] = []
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

  /** Remove a market record (and its cache clone directory). */
  remove(id: string): MarketRecord {
    const market = this.get(id)
    if (!market) throw hubError(`市场不存在：${id}`, 'not_found')
    const data = this.ensureData()
    data.markets = data.markets.filter(item => item.id !== id)
    this.save()
    if (market.type !== 'local') {
      rmTree(path.join(this.store.paths.markets, market.id))
    }
    this.log('info', `市场 ${id} 已移除`)
    return market
  }

  /** List cache directories no longer referenced by any market (self-check hint). */
  orphanCacheDirs(): string[] {
    const root = this.store.paths.markets
    if (!isDirectory(root)) return []
    const known = new Set(this.list().map(market => market.id))
    try {
      return readdirSync(root, { withFileTypes: true })
        .filter(entry => entry.isDirectory() && !known.has(entry.name))
        .map(entry => entry.name)
    } catch {
      return []
    }
  }
}
