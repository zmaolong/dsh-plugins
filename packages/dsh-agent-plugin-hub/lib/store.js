/**
 * 持久化层：state.json / marketplaces.json 的原子读写、进程锁、自检修复与日志。
 *
 * 设计要点：
 * - 原子写：先写同目录临时文件，再 rename 覆盖，避免半截文件；
 * - 进程锁：`tmp/hub.lock` 独占创建，记录 pid + 时间戳，进程崩溃后的陈旧锁可抢占；
 * - 自检：state 损坏时备份到 logs/ 并重建；半装目录/丢失目录从状态中剔除并报告。
 *
 * @module dsh-agent-plugin-hub/store
 */

import {
  appendFileSync,
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  rmSync,
  unlinkSync,
  writeFileSync,
  writeSync,
} from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { normalizeDisabledCapabilities } from './capabilities.js'
import { normalizeAuthor, normalizeEntryMeta, normalizeMarketDisplay, normalizeStringArray } from './manifest.js'

/** 当前持久化 schema。主代码只按该 schema 读取/写入；旧数据由 lib/migrate.js 迁移。 */
export const STATE_SCHEMA = 2

/** 阻塞式休眠（毫秒），用于锁重试。 */
function sleepSync(ms) {
  const shared = new Int32Array(new SharedArrayBuffer(4))
  Atomics.wait(shared, 0, 0, ms)
}

function timestampForFile(date = new Date()) {
  return date.toISOString().replace(/[:.]/gu, '-')
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

/** 空状态。 */
export function emptyState() {
  return { schemaVersion: STATE_SCHEMA, updatedAt: new Date().toISOString(), plugins: [] }
}

/** 空市场表。 */
export function emptyMarkets() {
  return { schemaVersion: STATE_SCHEMA, updatedAt: new Date().toISOString(), markets: [] }
}

/**
 * 按当前 schema 规整任意 state 原始对象（供 readState 与 lib/migrate.js 复用）。
 *
 * @param {unknown} raw
 * @param {string[]} [warnings]
 * @returns {{schemaVersion: number, updatedAt: string, plugins: object[]}}
 */
export function normalizeState(raw, warnings = []) {
  if (!isObject(raw)) {
    warnings.push('state 顶层必须是 JSON 对象，已按空表处理')
    return emptyState()
  }
  if (raw.schemaVersion !== STATE_SCHEMA) {
    warnings.push(`state.json 的 schemaVersion=${String(raw.schemaVersion)}（当前 ${STATE_SCHEMA}）；请先运行迁移`)
  }
  const plugins = []
  const seen = new Set()
  for (const record of Array.isArray(raw.plugins) ? raw.plugins : []) {
    const normalized = normalizePluginRecord(record, warnings)
    if (normalized === null) continue
    if (seen.has(normalized.key)) {
      warnings.push(`插件 ${normalized.key} 在 state 中重复，保留最后一条`)
      const index = plugins.findIndex((item) => item.key === normalized.key)
      if (index >= 0) plugins.splice(index, 1)
    }
    seen.add(normalized.key)
    plugins.push(normalized)
  }
  return {
    schemaVersion: STATE_SCHEMA,
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : new Date().toISOString(),
    plugins,
  }
}

/**
 * 按当前 schema 规整任意 marketplaces 原始对象（供 readMarkets 与 lib/migrate.js 复用）。
 *
 * @param {unknown} raw
 * @param {string[]} [warnings]
 * @returns {{schemaVersion: number, updatedAt: string, markets: object[]}}
 */
export function normalizeMarkets(raw, warnings = []) {
  if (!isObject(raw)) {
    warnings.push('marketplaces 顶层必须是 JSON 对象，已按空表处理')
    return emptyMarkets()
  }
  if (raw.schemaVersion !== STATE_SCHEMA) {
    warnings.push(`marketplaces.json 的 schemaVersion=${String(raw.schemaVersion)}（当前 ${STATE_SCHEMA}）；请先运行迁移`)
  }
  const markets = []
  const ids = new Set()
  for (const record of Array.isArray(raw.markets) ? raw.markets : []) {
    const normalized = normalizeMarketRecord(record, warnings)
    if (normalized === null) continue
    if (ids.has(normalized.id)) {
      warnings.push(`市场 id ${normalized.id} 重复，保留最后一条`)
      const index = markets.findIndex((item) => item.id === normalized.id)
      if (index >= 0) markets.splice(index, 1)
    }
    ids.add(normalized.id)
    markets.push(normalized)
  }
  return {
    schemaVersion: STATE_SCHEMA,
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : new Date().toISOString(),
    markets,
  }
}

/** 规整 state 里的单条插件记录；字段不合法返回 null。 */
function normalizePluginRecord(record, warnings) {
  if (!isObject(record)) return null
  const key = typeof record.key === 'string' ? record.key.trim() : ''
  const name = typeof record.name === 'string' ? record.name.trim() : ''
  const format = typeof record.format === 'string' ? record.format.trim() : ''
  const version = typeof record.version === 'string' ? record.version.trim() : ''
  if (key === '' || name === '' || format === '' || version === '') {
    warnings.push(`丢弃字段不全的插件记录：${JSON.stringify(record).slice(0, 120)}`)
    return null
  }
  const previousVersions = Array.isArray(record.previousVersions)
    ? record.previousVersions
      .filter((item) => isObject(item) && typeof item.version === 'string' && typeof item.installedPath === 'string')
      .slice(-5)
      .map((item) => ({
        version: item.version,
        installedPath: item.installedPath,
        installedAt: typeof item.installedAt === 'string' ? item.installedAt : '',
      }))
    : []
  return {
    key,
    format,
    name,
    version,
    market: typeof record.market === 'string' ? record.market : '',
    installedPath: typeof record.installedPath === 'string' ? record.installedPath : '',
    enabled: record.enabled !== false,
    installedAt: typeof record.installedAt === 'string' ? record.installedAt : new Date().toISOString(),
    capabilities: isObject(record.capabilities) ? record.capabilities : {},
    disabledCapabilities: normalizeDisabledCapabilities(record.disabledCapabilities),
    previousVersions,
  }
}

/** 规整已持久化的插件条目（meta 是白名单后的展示元数据，未知字段丢弃）。 */
function normalizeStoredEntry(entry) {
  const name = typeof entry.name === 'string' ? entry.name.trim() : ''
  if (name === '') return null
  const normalized = {
    name,
    version: typeof entry.version === 'string' ? entry.version.trim() : '',
    description: typeof entry.description === 'string' ? entry.description.trim() : '',
    source: isObject(entry.source) ? entry.source : { kind: 'unknown' },
    installable: entry.installable !== false,
    meta: normalizeEntryMeta(entry.meta),
  }
  const warning = typeof entry.warning === 'string' ? entry.warning.trim() : ''
  if (warning !== '') normalized.warning = warning
  const origin = typeof entry.origin === 'string' ? entry.origin.trim() : ''
  if (origin !== '') normalized.origin = origin
  return normalized
}

/** 规整 marketplaces 里的单条市场记录。 */
function normalizeMarketRecord(record, warnings) {
  if (!isObject(record)) return null
  const id = typeof record.id === 'string' ? record.id.trim() : ''
  if (id === '') {
    warnings.push('丢弃缺少 id 的市场记录')
    return null
  }
  const name = typeof record.name === 'string' && record.name.trim() !== '' ? record.name.trim() : id
  const title = typeof record.title === 'string' && record.title.trim() !== '' ? record.title.trim() : name
  const display = normalizeMarketDisplay(record.display, title)
  const owner = normalizeAuthor(record.owner) ?? display.owner ?? { name: '' }
  display.owner = owner
  const plugins = []
  for (const entry of Array.isArray(record.plugins) ? record.plugins : []) {
    if (!isObject(entry)) continue
    const normalized = normalizeStoredEntry(entry)
    if (normalized !== null) plugins.push(normalized)
  }
  return {
    id,
    name,
    title,
    format: typeof record.format === 'string' ? record.format : 'claude',
    type: ['local', 'git', 'url'].includes(record.type) ? record.type : 'local',
    location: typeof record.location === 'string' ? record.location : '',
    addedAt: typeof record.addedAt === 'string' ? record.addedAt : new Date().toISOString(),
    lastRefreshed: typeof record.lastRefreshed === 'string' ? record.lastRefreshed : '',
    display,
    owner,
    featured: normalizeStringArray(record.featured),
    plugins,
    refreshError: typeof record.refreshError === 'string' && record.refreshError !== '' ? record.refreshError : undefined,
    warnings: Array.isArray(record.warnings)
      ? record.warnings.filter((item) => typeof item === 'string')
      : [],
  }
}

export class HubStore {
  /** @param {string} home - hub 存储根（绝对路径）。 */
  constructor(home) {
    this.home = home
    this._lockHeld = false
  }

  /** 全部路径。 */
  get paths() {
    return {
      home: this.home,
      state: path.join(this.home, 'state.json'),
      marketplaces: path.join(this.home, 'marketplaces.json'),
      cache: path.join(this.home, 'cache'),
      markets: path.join(this.home, 'cache', 'markets'),
      logs: path.join(this.home, 'logs'),
      tmp: path.join(this.home, 'tmp'),
      lock: path.join(this.home, 'tmp', 'hub.lock'),
      logFile: path.join(this.home, 'logs', 'hub.log'),
    }
  }

  /** 创建基础目录（幂等）。 */
  ensureDirs() {
    for (const dir of [this.home, this.paths.cache, this.paths.markets, this.paths.logs, this.paths.tmp]) {
      mkdirSync(dir, { recursive: true })
    }
  }

  /** 追加一行日志；失败不抛出。 */
  log(level, message) {
    const line = `${new Date().toISOString()} [${level}] ${message}\n`
    try {
      mkdirSync(this.paths.logs, { recursive: true })
      appendFileSync(this.paths.logFile, line, 'utf8')
    } catch {
      /* 日志失败不影响主流程 */
    }
  }

  /** 原子写 JSON：tmp 文件 + rename。 */
  atomicWriteJson(filePath, value) {
    mkdirSync(path.dirname(filePath), { recursive: true })
    const tmp = `${filePath}.tmp-${process.pid}-${Math.random().toString(36).slice(2, 8)}`
    const text = `${JSON.stringify(value, null, 2)}\n`
    const fd = openSync(tmp, 'w')
    try {
      writeSync(fd, text, 0, 'utf8')
      fsyncSync(fd)
    } finally {
      closeSync(fd)
    }
    renameSync(tmp, filePath)
  }

  /** 读 JSON；文件缺失返回 null，解析失败备份后返回 null。 */
  readJsonSafe(filePath, emptyFactory, warnings) {
    if (!existsSync(filePath)) return null
    let text
    try {
      text = readFileSync(filePath, 'utf8')
    } catch (error) {
      warnings.push(`无法读取 ${path.basename(filePath)}：${error instanceof Error ? error.message : String(error)}`)
      return null
    }
    try {
      return JSON.parse(text.replace(/^\uFEFF/u, ''))
    } catch (error) {
      const backup = path.join(this.paths.logs, `corrupt-${timestampForFile()}-${path.basename(filePath)}`)
      try {
        mkdirSync(this.paths.logs, { recursive: true })
        renameSync(filePath, backup)
        warnings.push(`${path.basename(filePath)} 已损坏，备份到 ${backup}，使用空表重建`)
      } catch {
        warnings.push(`${path.basename(filePath)} 已损坏，备份失败，使用空表重建`)
      }
      this.log('warn', `${filePath} 损坏：${error instanceof Error ? error.message : String(error)}`)
      return emptyFactory ? emptyFactory() : null
    }
  }

  /**
   * 读取 state：只按当前 schema 规整字段；旧 schema 文件由 lib/migrate.js 在启动时迁移。
   * @returns {{state: object, warnings: string[]}}
   */
  readState() {
    const warnings = []
    const raw = this.readJsonSafe(this.paths.state, emptyState, warnings)
    if (raw === null) return { state: emptyState(), warnings }
    return { state: normalizeState(raw, warnings), warnings }
  }

  /** 保存 state。 */
  saveState(state) {
    this.ensureDirs()
    this.atomicWriteJson(this.paths.state, {
      schemaVersion: STATE_SCHEMA,
      updatedAt: new Date().toISOString(),
      plugins: state.plugins ?? [],
    })
  }

  /**
   * 读取市场表；损坏时重建。
   * @returns {{markets: object, warnings: string[]}}
   */
  readMarkets() {
    const warnings = []
    const raw = this.readJsonSafe(this.paths.marketplaces, emptyMarkets, warnings)
    if (raw === null) return { markets: emptyMarkets(), warnings }
    return { markets: normalizeMarkets(raw, warnings), warnings }
  }

  /** 保存市场表。 */
  saveMarkets(marketplaces) {
    this.ensureDirs()
    this.atomicWriteJson(this.paths.marketplaces, {
      schemaVersion: STATE_SCHEMA,
      updatedAt: new Date().toISOString(),
      markets: marketplaces.markets ?? [],
    })
  }

  /**
   * 自检：剔除已丢失的安装目录，清理不存在的回滚目录。
   *
   * @param {object} state
   * @param {{isValidInstall: (record: object) => boolean}} checker
   * @returns {{state: object, removed: object[], warnings: string[]}}
   */
  repairState(state, checker) {
    const warnings = []
    const removed = []
    const plugins = []
    for (const record of state.plugins ?? []) {
      const installExists = existsSync(record.installedPath)
      const valid = installExists && checker.isValidInstall(record)
      if (!valid) {
        removed.push(record)
        warnings.push(`插件 ${record.name}@${record.version} 的安装目录不可用（${record.installedPath}），已从状态剔除`)
        continue
      }
      const previousVersions = record.previousVersions.filter((item) => {
        if (existsSync(item.installedPath)) return true
        warnings.push(`插件 ${record.name} 的回滚版本 ${item.version} 目录丢失，已清理`)
        return false
      })
      plugins.push({ ...record, previousVersions })
    }
    return { state: { ...state, plugins }, removed, warnings }
  }

  /**
   * 获取进程锁（同步重试）。
   * @param {number} [timeoutMs]
   */
  acquireLock(timeoutMs = 5000) {
    if (this._lockHeld) return
    this.ensureDirs()
    const deadline = Date.now() + timeoutMs
    let acquired = false
    while (Date.now() < deadline) {
      try {
        const fd = openSync(this.paths.lock, 'wx')
        writeFileSync(fd, JSON.stringify({ pid: process.pid, at: new Date().toISOString(), host: os.hostname() }))
        closeSync(fd)
        acquired = true
        break
      } catch (error) {
        if (error?.code !== 'EEXIST') throw error
        if (this.stealStaleLock()) continue
        sleepSync(50)
      }
    }
    if (!acquired) {
      throw new Error('另一个 hub 操作正在进行（锁超时）；请稍后重试，或删除 tmp/hub.lock（确认没有其他 DSH 实例在写）')
    }
    this._lockHeld = true
  }

  /** 释放进程锁。 */
  releaseLock() {
    if (!this._lockHeld) return
    this._lockHeld = false
    try {
      unlinkSync(this.paths.lock)
    } catch {
      /* 锁文件可能已被回收 */
    }
  }

  /**
   * 同步执行 fn，期间持有进程锁。
   *
   * @template T
   * @param {() => T} fn
   * @param {{timeoutMs?: number}} [options]
   * @returns {T}
   */
  withLock(fn, options = {}) {
    if (this._lockHeld) {
      this.log('warn', '检测到同进程重入加锁，直接复用当前锁')
      return fn()
    }
    this.acquireLock(options.timeoutMs)
    try {
      return fn()
    } finally {
      this.releaseLock()
    }
  }

  /**
   * 异步执行 fn，期间持有进程锁。
   *
   * @template T
   * @param {() => Promise<T>} fn
   * @param {{timeoutMs?: number}} [options]
   * @returns {Promise<T>}
   */
  async withLockAsync(fn, options = {}) {
    if (this._lockHeld) {
      this.log('warn', '检测到同进程重入加锁，直接复用当前锁')
      return fn()
    }
    this.acquireLock(options.timeoutMs)
    try {
      return await fn()
    } finally {
      this.releaseLock()
    }
  }

  /** 抢占陈旧锁：pid 不存在或超过 60 秒。 */
  stealStaleLock() {
    try {
      const raw = JSON.parse(readFileSync(this.paths.lock, 'utf8'))
      let alive = false
      if (typeof raw.pid === 'number') {
        try {
          process.kill(raw.pid, 0)
          alive = true
        } catch {
          alive = false
        }
      }
      const ageMs = Date.now() - Date.parse(raw.at ?? '')
      const stale = !alive || !Number.isFinite(ageMs) || ageMs > 60_000
      if (!stale) return false
      rmSync(this.paths.lock, { force: true })
      this.log('warn', `抢占陈旧锁（pid=${String(raw.pid)}）`)
      return true
    } catch {
      try {
        rmSync(this.paths.lock, { force: true })
        return true
      } catch {
        return false
      }
    }
  }

  /** 清理状态文件（测试用）。 */
  reset() {
    for (const file of [this.paths.state, this.paths.marketplaces]) {
      rmSync(file, { force: true })
    }
  }
}