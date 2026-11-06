/**
 * Agent 插件清单解析：plugin.json / marketplace.json 的探测、校验与 source 解析。
 *
 * 设计原则：必填字段严格（name、version），可选字段宽容（字符串/数组/对象都接受，
 * 原始 manifest 由调用方保存快照），未知字段原样保留，warnings 交给状态与日志。
 *
 * @module dsh-agent-plugin-hub/manifest
 */

import { existsSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'

import { FORMATS, FORMAT_PRIORITY, findFormat, isSafePluginName } from './formats.js'

/** 读取并解析 JSON 文件；错误信息中文可操作。 */
export function readJsonFile(filePath) {
  let text
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

/** 文件为普通文件且存在。 */
export function isFile(filePath) {
  try {
    return statSync(filePath).isFile()
  } catch {
    return false
  }
}

/** 目录存在。 */
export function isDirectory(dirPath) {
  try {
    return statSync(dirPath).isDirectory()
  } catch {
    return false
  }
}

function nonEmptyString(value) {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : ''
}

/**
 * 探测插件目录的格式与清单。
 *
 * 先按格式专属清单 claude > codebuddy > zcode 探测；都没命中时退回根级
 * `plugin.json`，格式取 `hintFormat`（默认 claude）并记录 warning。
 *
 * @param {string} root - 插件根目录（绝对路径）。
 * @param {{ hintFormat?: string }} [options]
 * @returns {{format: string, manifestPath: string, manifest: object, warnings: string[]}}
 * @throws {Error} 目录不存在或找不到 plugin.json。
 */
export function detectPluginManifest(root, options = {}) {
  if (!isDirectory(root)) throw new Error(`插件目录不存在：${root}`)
  const warnings = []
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
        return { format: format.id, manifestPath: candidate, manifest, warnings }
      }
    }
  }
  const hint = nonEmptyString(options.hintFormat)
  const fallbackFormat = hint && findFormat(hint) ? hint : 'claude'
  const fallback = findFormat(fallbackFormat)
  for (const relative of fallback.rootManifests) {
    const candidate = path.join(root, relative)
    if (isFile(candidate)) {
      const manifest = readJsonFile(candidate)
      if (manifest === null || typeof manifest !== 'object' || Array.isArray(manifest)) {
        throw new Error(`${candidate} 顶层必须是 JSON 对象`)
      }
      warnings.push(`只有根级 plugin.json，未找到格式专属清单；按 ${fallbackFormat} 处理`)
      return { format: fallbackFormat, manifestPath: candidate, manifest, warnings }
    }
  }
  throw new Error(
    `未找到 plugin.json：${root} 下应存在 .claude-plugin/plugin.json（或 .codebuddy-plugin、.zcode-plugin 之一）`,
  )
}

/**
 * 校验 plugin.json 必填字段并规整元数据。
 *
 * @param {object} manifest
 * @param {{format: string, manifestPath: string}} context
 * @returns {{name: string, version: string, description: string, warnings: string[]}}
 */
export function validatePluginManifest(manifest, context) {
  const warnings = []
  const name = nonEmptyString(manifest.name)
  const version = nonEmptyString(manifest.version)
  if (name === '') throw new Error(`${context.manifestPath} 缺少必填字段 name`)
  if (version === '') throw new Error(`${context.manifestPath} 缺少必填字段 version`)
  if (!isSafePluginName(name)) {
    throw new Error(`${context.manifestPath} 的 name 不合法：${name}（只允许字母数字与 ._-，最长 64，且不得含 ..）`)
  }
  if (manifest.version.trim() !== version) warnings.push('version 含首尾空白，已规整')
  const description = nonEmptyString(manifest.description)
  return { name, version, description, warnings }
}

/** 在目录中探测 marketplace.json。 */
export function detectMarketplaceFile(root, options = {}) {
  if (!isDirectory(root)) throw new Error(`市场目录不存在：${root}`)
  for (const formatId of FORMAT_PRIORITY) {
    const format = findFormat(formatId)
    if (!format) continue
    for (const relative of format.marketplaceFiles) {
      const candidate = path.join(root, relative)
      if (isFile(candidate)) {
        return { format: format.id, file: candidate, manifest: readJsonFile(candidate) }
      }
    }
  }
  const hint = nonEmptyString(options.hintFormat)
  if (hint && findFormat(hint)) {
    const format = findFormat(hint)
    for (const relative of format.marketplaceFiles) {
      const candidate = path.join(root, relative)
      if (isFile(candidate)) {
        return { format: format.id, file: candidate, manifest: readJsonFile(candidate) }
      }
    }
  }
  throw new Error(
    `未找到 marketplace.json：${root} 下应存在 .claude-plugin/marketplace.json 或 marketplace.json`,
  )
}

/** marketplace 的 source 可以是字符串或对象；统一取出关键字段。 */
export function normalizeSource(source, warnings = []) {
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
  const type = nonEmptyString(source.source) || nonEmptyString(source.type)
  switch (type) {
    case 'github': {
      const repo = nonEmptyString(source.repo) || nonEmptyString(source.url)
      if (repo === '') {
        warnings.push('github 源缺少 repo')
        return { kind: 'unknown' }
      }
      return {
        kind: 'github',
        repo,
        commit: nonEmptyString(source.commit) || nonEmptyString(source.sha) || nonEmptyString(source.ref),
        path: nonEmptyString(source.path) || nonEmptyString(source.directory),
      }
    }
    case 'npm':
      return { kind: 'npm', package: nonEmptyString(source.package) || nonEmptyString(source.name) }
    case 'git':
    case 'url':
      return {
        kind: 'git',
        url: nonEmptyString(source.url) || nonEmptyString(source.repo),
        commit: nonEmptyString(source.commit) || nonEmptyString(source.sha),
        path: nonEmptyString(source.path) || nonEmptyString(source.directory),
      }
    default:
      warnings.push(`未知 source 类型：${type || String(source.source)}`)
      return { kind: 'unknown', raw: source }
  }
}

/**
 * 解析 marketplace.json 顶层结构，返回规整后的插件条目。
 *
 * @param {object} manifest
 * @param {{format: string, root: string, origin?: string}} context
 * @returns {{name: string, owner: string, plugins: object[], warnings: string[]}}
 */
export function parseMarketplace(manifest, context) {
  const warnings = []
  if (manifest === null || typeof manifest !== 'object' || Array.isArray(manifest)) {
    throw new Error('marketplace.json 顶层必须是 JSON 对象')
  }
  const name = nonEmptyString(manifest.name)
  if (name === '') throw new Error('marketplace.json 缺少必填字段 name')
  const pluginsRaw = manifest.plugins
  if (!Array.isArray(pluginsRaw) || pluginsRaw.length === 0) {
    throw new Error('marketplace.json 的 plugins 必须是非空数组')
  }
  const plugins = []
  const seen = new Set()
  for (const [index, entry] of pluginsRaw.entries()) {
    if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) {
      warnings.push(`plugins[${index}] 不是对象，已跳过`)
      continue
    }
    const pluginName = nonEmptyString(entry.name)
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
    const entryWarnings = []
    const source = normalizeSource(entry.source, entryWarnings)
    plugins.push({
      name: pluginName,
      version: nonEmptyString(entry.version),
      description: nonEmptyString(entry.description),
      source,
      raw: entry,
      warnings: entryWarnings,
    })
    warnings.push(...entryWarnings.map((item) => `${pluginName}: ${item}`))
  }
  if (plugins.length === 0) throw new Error('marketplace.json 没有可用插件条目')
  return {
    name,
    owner: typeof manifest.owner === 'string' ? manifest.owner : manifest.owner?.name ?? '',
    plugins,
    warnings,
  }
}

/**
 * 把 marketplace 条目里的相对 source 解析成绝对路径；越界/绝对路径一律拒绝。
 *
 * @param {string} root - 市场根目录（绝对路径）。
 * @param {string} relative - 相对 source，例如 `./plugins/demo`。
 * @returns {string}
 */
export function resolveRelativeSource(root, relative) {
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

/** 格式表快照，供 /agent-plugin formats 展示。 */
export function formatTable() {
  return FORMATS.map((format) => ({
    id: format.id,
    label: format.label,
    pluginManifests: [...format.pluginManifests],
    marketplaceFiles: [...format.marketplaceFiles],
    rootManifests: [...format.rootManifests],
  }))
}

/** 目录是否像一个插件（任一格式专属清单或根级 plugin.json）。 */
export function looksLikePluginDir(dir) {
  if (!isDirectory(dir)) return false
  try {
    detectPluginManifest(dir)
    return true
  } catch {
    return false
  }
}

/** 路径是否存在于（用于 stat 容错）。 */
export function pathExists(target) {
  return existsSync(target)
}