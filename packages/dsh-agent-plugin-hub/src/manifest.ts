/**
 * Agent plugin manifest handling: probing, validation, metadata
 * normalization, and source resolution for plugin.json / marketplace.json.
 *
 * Schema v2 conventions:
 * - marketplace.json listing metadata (displayName/category/author/homepage/
 *   icon/keywords…) normalizes into the entry `meta`, market-level data into
 *   `display`; unknown fields are ignored, only non-empty legal values kept;
 * - Optional text fields accept either a plain string or an
 *   `{en, zh-cn, zh, ...}` localized object;
 * - `plugin.json` display fields are returned by `validatePluginManifest`
 *   for UI fallback.
 *
 * Required fields are strict (name, version); optional fields are tolerant;
 * whether to keep the raw manifest is the caller's decision.
 *
 * @module dsh-agent-plugin-hub/manifest
 */

import { existsSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'

import { FORMATS, FORMAT_PRIORITY, findFormat, isSafePluginName } from './formats.ts'

/** Localized text: resolved default text plus the raw language map when given as an object. */
export interface LocalizedText {
  text: string
  i18n: Record<string, string> | null
}

/** Author record: name plus optional contact fields. */
export interface Author {
  name: string
  email?: string
  url?: string
}

/** Entry-level display metadata (schema v2 field set). */
export interface EntryMeta {
  displayName?: string
  displayNameI18n?: Record<string, string>
  description?: string
  descriptionI18n?: Record<string, string>
  icon?: string
  category?: string
  author?: Author
  homepage?: string
  repository?: string
  license?: string
  keywords?: string[]
  [key: string]: unknown
}

/** Market-level display: fixed three-field shape. */
export interface MarketDisplay {
  title: string
  description: string
  owner: Author
}

/** One parsed marketplace.json plugin entry. */
export interface MarketplaceEntry {
  name: string
  version: string
  description: string
  source: SourceRef
  meta: EntryMeta
  warnings: string[]
}

/** Parsed marketplace.json top level. */
export interface Marketplace {
  name: string
  owner: string
  display: MarketDisplay
  featured: string[]
  plugins: MarketplaceEntry[]
  warnings: string[]
}

/** Validated plugin.json display fields. */
export interface PluginManifestInfo {
  name: string
  version: string
  description: string
  author: Author | null
  homepage: string | null
  repository: string | null
  license: string | null
  keywords: string[]
  icon: string | null
  category: string | null
  warnings: string[]
}

/** Resolved entry source reference (marketplace.json `source` field). */
export type SourceRef =
  | { kind: 'local', raw: string }
  | { kind: 'git', raw?: string | undefined, url?: string | undefined, commit?: string | undefined, path?: string | undefined }
  | { kind: 'github', repo: string, commit?: string | undefined, path?: string | undefined }
  | { kind: 'npm', package?: string | undefined }
  | { kind: 'other', raw: string }
  | { kind: 'unknown', raw?: unknown }

/** Read and parse a JSON file; errors carry actionable Chinese text. */
export function readJsonFile(filePath: string): unknown {
  let text: string
  try {
    text = readFileSync(filePath, 'utf8')
  } catch (error) {
    throw new Error(`无法读取 ${filePath}：${error instanceof Error ? error.message : String(error)}`)
  }
  try {
    return JSON.parse(text.replace(/^\uFEFF/u, ''))
  } catch (error) {
    throw new Error(`${filePath} 不是合法 JSON：${error instanceof Error ? error.message : String(error)}`)
  }
}

/** The path names an existing regular file. */
export function isFile(filePath: string): boolean {
  try {
    return statSync(filePath).isFile()
  } catch {
    return false
  }
}

/** The path names an existing directory. */
export function isDirectory(dirPath: string): boolean {
  try {
    return statSync(dirPath).isDirectory()
  } catch {
    return false
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

/** Trimmed non-empty string, or the empty string. */
function textOf(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

/**
 * Normalize a text field: accepts a string or an `{en, zh-cn, zh}` object.
 *
 * @param value - raw field value.
 */
export function normalizeLocalizedText(value: unknown): LocalizedText {
  if (typeof value === 'string') {
    return { text: value.trim(), i18n: null }
  }
  if (!isObject(value)) return { text: '', i18n: null }
  const i18n: Record<string, string> = {}
  for (const [rawKey, rawValue] of Object.entries(value)) {
    const key = typeof rawKey === 'string' ? rawKey.trim().toLowerCase() : ''
    const text = textOf(rawValue)
    if (key !== '' && text !== '') i18n[key] = text
  }
  const keys = Object.keys(i18n)
  if (keys.length === 0) return { text: '', i18n: null }
  const first = keys[0]
  const text = i18n.default ?? i18n.en ?? i18n['zh-cn'] ?? i18n.zh ?? (first !== undefined ? i18n[first] ?? '' : '')
  return { text, i18n }
}

/**
 * Normalize an author: accepts a string or `{name, email?, url?}`.
 *
 * @param value - raw author value.
 */
export function normalizeAuthor(value: unknown): Author | null {
  if (typeof value === 'string') {
    const name = value.trim()
    return name === '' ? null : { name }
  }
  if (!isObject(value)) return null
  const name = textOf(value.name)
  if (name === '') return null
  const author: Author = { name }
  const email = textOf(value.email)
  const url = textOf(value.url) || textOf(value.homepage)
  if (email !== '') author.email = email
  if (url !== '') author.url = url
  return author
}

/**
 * Normalize a string array: drop empties and duplicates; one non-empty string counts as one item.
 *
 * @param value - raw list value.
 */
export function normalizeStringArray(value: unknown): string[] {
  const items: string[] = []
  const push = (item: unknown): void => {
    const text = textOf(item)
    if (text !== '') items.push(text)
  }
  if (Array.isArray(value)) {
    for (const item of value) push(item)
  } else if (typeof value === 'string') {
    push(value)
  }
  return [...new Set(items)]
}

/** Normalize an icon field: only string (or `{url}`-shaped) addresses/paths count. */
export function normalizeIconValue(value: unknown): string {
  if (typeof value === 'string') return value.trim()
  if (isObject(value)) return textOf(value.url) || textOf(value.src) || textOf(value.path)
  return ''
}

/**
 * Normalize a marketplace.json entry (or persisted meta) into `meta`.
 *
 * Only non-empty legal values survive; unknown fields are ignored. Field set
 * (schema v2): `displayName, displayNameI18n, descriptionI18n, icon, category,
 * author, homepage, repository, license, keywords`; `description` is also
 * kept (migrated data derives it from the old field as the UI fallback).
 *
 * @param value - raw entry value.
 */
export function normalizeEntryMeta(value: unknown): EntryMeta {
  const source = isObject(value) ? value : {}
  const meta: EntryMeta = {}
  const displayName = normalizeLocalizedText(source.displayName ?? source.title)
  if (displayName.text !== '') meta.displayName = displayName.text
  if (displayName.i18n !== null) meta.displayNameI18n = displayName.i18n
  const description = normalizeLocalizedText(source.description)
  if (description.text !== '') meta.description = description.text
  if (description.i18n !== null) meta.descriptionI18n = description.i18n
  const icon = normalizeIconValue(source.icon ?? source.logo)
  if (icon !== '') meta.icon = icon
  const category = textOf(source.category)
    || textOf(isObject(source.metadata) ? source.metadata.category : undefined)
  if (category !== '') meta.category = category
  const author = normalizeAuthor(source.author)
  if (author !== null) meta.author = author
  const homepage = textOf(source.homepage)
  if (homepage !== '') meta.homepage = homepage
  const repository = textOf(source.repository)
  if (repository !== '') meta.repository = repository
  const license = textOf(source.license)
  if (license !== '') meta.license = license
  const keywords = normalizeStringArray(source.keywords ?? source.tags)
  if (keywords.length > 0) meta.keywords = keywords
  return meta
}

/**
 * Normalize the market-level display (fixed three fields: title / description / owner).
 *
 * @param value - persisted display object (or any object carrying title/description/owner).
 * @param fallbackTitle - title used when the value carries none.
 */
export function normalizeMarketDisplay(value: unknown, fallbackTitle: string): MarketDisplay {
  const source = isObject(value) ? value : {}
  const title = normalizeLocalizedText(source.title ?? source.displayName ?? source.name)
  const description = normalizeLocalizedText(source.description)
  const owner = normalizeAuthor(source.owner) ?? { name: '' }
  return {
    title: title.text || textOf(fallbackTitle),
    description: description.text,
    owner,
  }
}

/**
 * Build the market-level display from a marketplace.json top-level manifest.
 *
 * @param manifest - raw marketplace.json object.
 */
export function buildMarketDisplay(manifest: Record<string, unknown>): MarketDisplay {
  return normalizeMarketDisplay(manifest, textOf(manifest.name))
}

/** Result of probing one plugin directory. */
export interface DetectedManifest {
  format: string
  manifestPath: string
  manifest: Record<string, unknown>
  warnings: string[]
}

/**
 * Probe a plugin directory for its format and manifest.
 *
 * Format-specific manifests are probed in the order claude > codebuddy >
 * zcode; when none hits, the root `plugin.json` is used with `hintFormat`
 * (claude by default) and a warning is recorded.
 *
 * @param root - plugin root directory (absolute path).
 * @param options - optional format hint.
 * @throws {Error} when the directory does not exist or no plugin.json is found.
 */
export function detectPluginManifest(root: string, options: { hintFormat?: string } = {}): DetectedManifest {
  if (!isDirectory(root)) throw new Error(`插件目录不存在：${root}`)
  const warnings: string[] = []
  for (const formatId of FORMAT_PRIORITY) {
    const format = findFormat(formatId)
    if (!format) continue
    for (const relative of format.pluginManifests) {
      const candidate = path.join(root, relative)
      if (isFile(candidate)) {
        const manifest = readJsonFile(candidate)
        if (manifest === null || typeof manifest !== 'object' || Array.isArray(manifest)) {
          throw new Error(`${candidate} 顶层必须是 JSON 对象`)
        }
        return { format: format.id, manifestPath: candidate, manifest: manifest as Record<string, unknown>, warnings }
      }
    }
  }
  const hint = textOf(options.hintFormat)
  const fallbackFormat = hint !== '' && findFormat(hint) ? hint : 'claude'
  const fallback = findFormat(fallbackFormat)
  for (const relative of fallback?.rootManifests ?? []) {
    const candidate = path.join(root, relative)
    if (isFile(candidate)) {
      const manifest = readJsonFile(candidate)
      if (manifest === null || typeof manifest !== 'object' || Array.isArray(manifest)) {
        throw new Error(`${candidate} 顶层必须是 JSON 对象`)
      }
      warnings.push(`只有根级 plugin.json，未找到格式专属清单；按 ${fallbackFormat} 处理`)
      return { format: fallbackFormat, manifestPath: candidate, manifest: manifest as Record<string, unknown>, warnings }
    }
  }
  throw new Error(
    `未找到 plugin.json：${root} 下应存在 .claude-plugin/plugin.json（或 .codebuddy-plugin、.zcode-plugin 之一）`,
  )
}

/**
 * Validate plugin.json required fields and normalize its display metadata.
 *
 * @param manifest - raw plugin.json object.
 * @param context - format and manifest path for diagnostics.
 */
export function validatePluginManifest(
  manifest: Record<string, unknown>,
  context: { format: string, manifestPath: string },
): PluginManifestInfo {
  const warnings: string[] = []
  const name = textOf(manifest.name)
  const version = textOf(manifest.version)
  if (name === '') throw new Error(`${context.manifestPath} 缺少必填字段 name`)
  if (version === '') throw new Error(`${context.manifestPath} 缺少必填字段 version`)
  if (!isSafePluginName(name)) {
    throw new Error(`${context.manifestPath} 的 name 不合法：${name}（只允许字母数字与 ._-，最长 64，且不得含 ..）`)
  }
  if (String(manifest.version).trim() !== version) warnings.push('version 含首尾空白，已规整')
  const description = textOf(manifest.description)
  const author = normalizeAuthor(manifest.author)
  const homepage = textOf(manifest.homepage) || null
  const repository = textOf(manifest.repository) || null
  const license = textOf(manifest.license) || null
  const keywords = normalizeStringArray(manifest.keywords)
  const icon = normalizeIconValue(manifest.icon) || null
  const category = textOf(manifest.category)
    || textOf(isObject(manifest.metadata) ? manifest.metadata.category : undefined)
    || null
  return { name, version, description, author, homepage, repository, license, keywords, icon, category, warnings }
}

/** Result of probing one marketplace directory. */
export interface DetectedMarketplace {
  format: string
  file: string
  manifest: Record<string, unknown>
}

/** Probe a directory for marketplace.json. */
export function detectMarketplaceFile(
  root: string,
  options: { hintFormat?: string | undefined } = {},
): DetectedMarketplace {
  if (!isDirectory(root)) throw new Error(`市场目录不存在：${root}`)
  for (const formatId of FORMAT_PRIORITY) {
    const format = findFormat(formatId)
    if (!format) continue
    for (const relative of format.marketplaceFiles) {
      const candidate = path.join(root, relative)
      if (isFile(candidate)) {
        return { format: format.id, file: candidate, manifest: readJsonFile(candidate) as Record<string, unknown> }
      }
    }
  }
  const hint = textOf(options.hintFormat)
  const hinted = hint !== '' ? findFormat(hint) : undefined
  if (hinted) {
    for (const relative of hinted.marketplaceFiles) {
      const candidate = path.join(root, relative)
      if (isFile(candidate)) {
        return { format: hinted.id, file: candidate, manifest: readJsonFile(candidate) as Record<string, unknown> }
      }
    }
  }
  throw new Error(
    `未找到 marketplace.json：${root} 下应存在 .claude-plugin/marketplace.json 或 marketplace.json`,
  )
}

/** Trimmed non-empty string, or the empty string (local helper). */
function nonEmptyString(value: unknown): string {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : ''
}

/**
 * Normalize a marketplace entry `source` (string or object) into a typed reference.
 *
 * @param source - raw source value.
 * @param warnings - tolerance warnings collector.
 */
export function normalizeSource(source: unknown, warnings: string[] = []): SourceRef {
  if (typeof source === 'string') {
    const trimmed = source.trim()
    if (trimmed === '') {
      warnings.push('插件条目缺少 source')
      return { kind: 'unknown' }
    }
    if (trimmed.startsWith('./') || trimmed.startsWith('../') || trimmed.startsWith('/')
      || trimmed.startsWith('\\') || /^[A-Za-z]:[\\/]/u.test(trimmed)) {
      return { kind: 'local', raw: trimmed }
    }
    if (/^https?:\/\//u.test(trimmed) || trimmed.startsWith('git@') || trimmed.endsWith('.git')) {
      return { kind: 'git', raw: trimmed, url: trimmed }
    }
    return { kind: 'other', raw: trimmed }
  }
  if (source === null || typeof source !== 'object' || Array.isArray(source)) {
    warnings.push('插件条目 source 类型无法识别')
    return { kind: 'unknown' }
  }
  const record = source as Record<string, unknown>
  const type = nonEmptyString(record.source) || nonEmptyString(record.type)
  switch (type) {
    case 'github': {
      const repo = nonEmptyString(record.repo) || nonEmptyString(record.url)
      if (repo === '') {
        warnings.push('github 源缺少 repo')
        return { kind: 'unknown' }
      }
      return {
        kind: 'github',
        repo,
        commit: nonEmptyString(record.commit) || nonEmptyString(record.sha) || nonEmptyString(record.ref) || undefined,
        path: nonEmptyString(record.path) || nonEmptyString(record.directory) || undefined,
      }
    }
    case 'npm':
      return { kind: 'npm', package: nonEmptyString(record.package) || nonEmptyString(record.name) || undefined }
    case 'git':
    case 'url':
      return {
        kind: 'git',
        url: nonEmptyString(record.url) || nonEmptyString(record.repo) || undefined,
        commit: nonEmptyString(record.commit) || nonEmptyString(record.sha) || undefined,
        path: nonEmptyString(record.path) || nonEmptyString(record.directory) || undefined,
      }
    default:
      warnings.push(`未知 source 类型：${type || String(record.source)}`)
      return { kind: 'unknown', raw: source }
  }
}

/**
 * Parse a marketplace.json top-level structure into normalized plugin entries
 * (each carrying `meta` display metadata).
 *
 * @param manifest - raw marketplace.json object.
 * @param context - format, root, and optional origin for diagnostics.
 */
export function parseMarketplace(
  manifest: unknown,
  _context: { format: string, root: string, origin?: string },
): Marketplace {
  const warnings: string[] = []
  if (manifest === null || typeof manifest !== 'object' || Array.isArray(manifest)) {
    throw new Error('marketplace.json 顶层必须是 JSON 对象')
  }
  const record = manifest as Record<string, unknown>
  const name = nonEmptyString(record.name)
  if (name === '') throw new Error('marketplace.json 缺少必填字段 name')
  const pluginsRaw = record.plugins
  if (!Array.isArray(pluginsRaw) || pluginsRaw.length === 0) {
    throw new Error('marketplace.json 的 plugins 必须是非空数组')
  }
  const display = buildMarketDisplay(record)
  const featured: string[] = []
  const markFeatured = (pluginName: string): void => {
    if (!isSafePluginName(pluginName)) return
    if (!featured.includes(pluginName)) featured.push(pluginName)
  }
  const explicitFeatured = typeof record.featured === 'string'
    ? [record.featured]
    : Array.isArray(record.featured) ? record.featured : []
  for (const item of explicitFeatured) markFeatured(textOf(item))
  const plugins: MarketplaceEntry[] = []
  const seen = new Set<string>()
  for (const [index, entry] of pluginsRaw.entries()) {
    if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) {
      warnings.push(`plugins[${index}] 不是对象，已跳过`)
      continue
    }
    const entryRecord = entry as Record<string, unknown>
    const pluginName = nonEmptyString(entryRecord.name)
    if (pluginName === '') {
      warnings.push(`plugins[${index}] 缺少 name，已跳过`)
      continue
    }
    if (!isSafePluginName(pluginName)) {
      warnings.push(`plugins[${index}] 名称不合法（${pluginName}），已跳过`)
      continue
    }
    if (seen.has(pluginName)) {
      warnings.push(`插件 ${pluginName} 重复出现，保留第一条`)
      continue
    }
    seen.add(pluginName)
    if (entryRecord.featured === true
      || (isObject(entryRecord.metadata) && entryRecord.metadata.featured === true)) markFeatured(pluginName)
    const entryWarnings: string[] = []
    const source = normalizeSource(entryRecord.source, entryWarnings)
    const description = normalizeLocalizedText(entryRecord.description)
    plugins.push({
      name: pluginName,
      version: nonEmptyString(entryRecord.version),
      description: description.text,
      source,
      meta: normalizeEntryMeta(entry),
      warnings: entryWarnings,
    })
    warnings.push(...entryWarnings.map(item => `${pluginName}: ${item}`))
  }
  if (plugins.length === 0) throw new Error('marketplace.json 没有可用插件条目')
  return {
    name,
    owner: display.owner.name,
    display,
    featured,
    plugins,
    warnings,
  }
}

/**
 * Resolve a relative marketplace entry source into an absolute path;
 * out-of-bounds and absolute paths are always rejected.
 *
 * @param root - market root directory (absolute path).
 * @param relative - relative source, e.g. `./plugins/demo`.
 */
export function resolveRelativeSource(root: string, relative: unknown): string {
  const value = String(relative ?? '')
  if (value === '' || path.isAbsolute(value) || /^[A-Za-z]:[\\/]/u.test(value) || value.startsWith('\\')) {
    throw new Error(`插件 source 不能是空值或绝对路径：${value}`)
  }
  const resolved = path.resolve(root, value)
  const rootResolved = path.resolve(root)
  const prefix = rootResolved.endsWith(path.sep) ? rootResolved : `${rootResolved}${path.sep}`
  if (resolved !== rootResolved && !resolved.startsWith(prefix)) {
    throw new Error(`插件 source 越出市场根目录：${value}`)
  }
  const segments = path.relative(rootResolved, resolved).split(path.sep)
  if (segments.includes('..')) {
    throw new Error(`插件 source 不得包含 ..：${value}`)
  }
  return resolved
}

/** Format table snapshot for the `/agent-plugin formats` display. */
export function formatTable(): Array<{
  id: string
  label: string
  pluginManifests: string[]
  marketplaceFiles: string[]
  rootManifests: string[]
}> {
  return FORMATS.map(format => ({
    id: format.id,
    label: format.label,
    pluginManifests: [...format.pluginManifests],
    marketplaceFiles: [...format.marketplaceFiles],
    rootManifests: [...format.rootManifests],
  }))
}

/** Whether a directory looks like a plugin (any format-specific manifest or a root plugin.json). */
export function looksLikePluginDir(dir: string): boolean {
  if (!isDirectory(dir)) return false
  try {
    detectPluginManifest(dir)
    return true
  } catch {
    return false
  }
}

/** Whether a path exists (stat-tolerant). */
export function pathExists(target: string): boolean {
  return existsSync(target)
}
