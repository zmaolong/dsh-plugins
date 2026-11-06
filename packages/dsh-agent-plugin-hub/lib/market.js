/**
 * 市场源管理：local 目录、git 仓库、marketplace.json 直链三种 source。
 *
 * - local：直接读目录里的 marketplace.json（没有时把目录本身当单插件市场）；
 * - git：用系统 git 浅克隆到 hub 自己的 cache，刷新时 fetch + reset；
 * - url：HTTP(S) 拉取 marketplace.json，失败只记录 refreshError，不阻塞其余功能。
 *
 * @module dsh-agent-plugin-hub/market
 */

import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'

import {
  detectMarketplaceFile,
  detectPluginManifest,
  isDirectory,
  isFile,
  looksLikePluginDir,
  parseMarketplace,
  readJsonFile,
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

/** 解析用户输入的 location（local 支持相对当前工作目录与 `~`）。 */
export function normalizeLocation(type, location) {
  const raw = String(location ?? '').trim()
  if (raw === '') throw new Error('市场地址不能为空')
  if (type === 'local') {
    let expanded = raw
    if (expanded === '~' || expanded.startsWith('~/') || expanded.startsWith('~\\')) {
      const home = process.env.USERPROFILE || process.env.HOME || ''
      expanded = expanded === '~' ? home : path.join(home, expanded.slice(2))
    }
    const resolved = path.resolve(expanded)
    if (!isDirectory(resolved)) throw new Error(`本地市场目录不存在：${resolved}`)
    return resolved
  }
  if (type === 'url') {
    if (!/^https?:\/\//u.test(raw)) throw new Error(`URL 市场地址必须以 http:// 或 https:// 开头：${raw}`)
    return raw
  }
  if (type === 'git') {
    if (!/^(?:https?:\/\/|git@|ssh:\/\/|file:\/\/)/u.test(raw) && !raw.endsWith('.git') && !isDirectory(path.resolve(raw))) {
      throw new Error(`Git 市场地址无法识别：${raw}（支持 https/git@/ssh 或本地仓库目录）`)
    }
    if (isDirectory(path.resolve(raw))) return path.resolve(raw)
    return raw
  }
  throw new Error(`未知市场类型：${type}`)
}

/** 把 marketplace 条目转成可持久化、可展示的记录。 */
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
    }
  })
}

/** 把目录当单插件市场：直接读它自己的 plugin.json。 */
function singlePluginMarket(location, name) {
  const detected = detectPluginManifest(location)
  const meta = validatePluginManifest(detected.manifest, detected)
  return {
    name: name || meta.name,
    format: detected.format,
    parsed: {
      name: name || meta.name,
      owner: '',
      plugins: [{
        name: meta.name,
        version: meta.version,
        description: meta.description,
        source: { kind: 'local', raw: '.' },
        raw: {},
        warnings: [],
      }],
      warnings: detected.warnings,
    },
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

  /** 市场在 cache 里的根目录。 */
  cacheRoot(market) {
    if (market.type === 'local') return market.root
    return path.join(this.store.paths.markets, market.id)
  }

  /**
   * 添加市场并立即刷新一次。
   *
   * @param {{type: string, location: string, name?: string, format?: string}} input
   * @returns {Promise<object>} 市场记录
   */
  async add(input) {
    const type = String(input.type ?? '').trim()
    const location = normalizeLocation(type, input.location)
    const id = marketIdFor(type, location)
    if (this.get(id)) throw new Error(`市场已存在：${id}`)
    const market = {
      id,
      name: String(input.name ?? '').trim() || path.basename(location),
      format: String(input.format ?? '').trim() || 'claude',
      type,
      location,
      root: type === 'local' ? location : path.join(this.store.paths.markets, id, 'repo'),
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
        const parsed = parseMarketplace({ name: single.parsed.name, owner: '', plugins: single.parsed.plugins.map((plugin) => ({
          name: plugin.name,
          version: plugin.version,
          description: plugin.description,
          source: './',
        })) }, { format: single.format, root })
        return { format: single.format, marketplaceName: single.name, parsed, warnings: single.parsed.warnings }
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
    const repo = market.root
    rmSync(repo, { force: true, recursive: true })
    mkdirSync(path.dirname(repo), { recursive: true })
    runGit(['clone', '--depth', '1', '--', market.location, repo])
  }

  /** 刷新 git 市场仓库：已存在则 fetch + reset，失败回退到重新克隆。 */
  syncGitMarket(market) {
    const repo = market.root
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

  /** 解析 git 条目里的 GitHub/git source。 */
  resolveGitSource(market, source) {
    const url = source.kind === 'github'
      ? (/^(?:https?:\/\/|git@)/u.test(source.repo) ? source.repo : `https://github.com/${source.repo}.git`)
      : source.url
    if (!url) throw new Error('Git source 缺少 url/repo')
    const hash = createHash('sha1').update(`${url}\u0000${source.commit ?? ''}`).digest('hex').slice(0, 10)
    const dir = path.join(this.store.paths.markets, market.id, 'sources', hash)
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
   * 解析某插件条目的可安装目录。
   *
   * @param {object} market
   * @param {string} pluginName
   * @returns {string} 插件源目录绝对路径
   */
  resolveInstallSource(market, pluginName) {
    const entry = (market.plugins ?? []).find((plugin) => plugin.name === pluginName)
    if (!entry) throw new Error(`市场 ${market.id} 里没有插件 ${pluginName}，请先 /agent-plugin market refresh`)
    const source = entry.source ?? { kind: 'unknown' }
    switch (source.kind) {
      case 'local': {
        if (market.type === 'url') {
          throw new Error('URL 市场里的相对路径插件无法安装：请改用 Git 市场，或让该插件提供 github/git source')
        }
        const root = market.type === 'local' ? market.location : market.root
        const dir = resolveRelativeSource(root, source.raw)
        if (!isDirectory(dir)) throw new Error(`插件目录不存在：${dir}`)
        return dir
      }
      case 'github':
      case 'git':
        return this.resolveGitSource(market, source)
      case 'npm':
        throw new Error('MVP 暂不支持 npm 源（已记录扩展点）')
      default:
        throw new Error(`插件 ${pluginName} 的 source 无法安装（类型：${String(source.kind)}）`)
    }
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
        const read = this.readFromDirectory(market.root, market.name, market.format)
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
      market.name = parsed.name || market.name
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