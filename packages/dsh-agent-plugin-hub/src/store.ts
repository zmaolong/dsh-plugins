/**
 * Persistence layer: atomic state.json / marketplaces.json IO, the process
 * lock, self-repair, and the log file.
 *
 * Design points:
 * - Atomic writes: write a sibling temp file first, then rename over the
 *   target, so a torn file never appears;
 * - Process lock: exclusive creation of `tmp/hub.lock` recording pid + time;
 *   a stale lock from a crashed process can be stolen;
 * - Self-repair: a corrupt state backs up to logs/ and rebuilds; half-installed
 *   or missing directories drop out of the state and get reported.
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

import { normalizeDisabledCapabilities, type CapabilityMap } from './capabilities.ts'
import { normalizeAuthor, normalizeEntryMeta, normalizeMarketDisplay, normalizeStringArray, type Author, type EntryMeta, type MarketDisplay, type SourceRef } from './manifest.ts'

/** Current persistence schema. Main code reads/writes only this schema; old data migrates in migrate.ts. */
export const STATE_SCHEMA = 2

/** One rolled-back previous install of a plugin. */
export interface PreviousVersion {
  version: string
  installedPath: string
  installedAt: string
}

/** One installed agent plugin record in state.json. */
export interface PluginRecord {
  key: string
  format: string
  name: string
  version: string
  market: string
  installedPath: string
  enabled: boolean
  installedAt: string
  capabilities: Record<string, unknown>
  disabledCapabilities: CapabilityMap
  previousVersions: PreviousVersion[]
}

/** state.json shape (schema v2). */
export interface StateFile {
  schemaVersion: number
  updatedAt: string
  plugins: PluginRecord[]
}

/** One stored marketplace entry (whitelisted display metadata only). */
export interface StoredEntry {
  name: string
  version: string
  description: string
  source: SourceRef
  installable: boolean
  meta: EntryMeta
  warning?: string | undefined
  origin?: string | undefined
}

/** Market source kind. */
export type MarketType = 'local' | 'git' | 'url'

/** One marketplace record in marketplaces.json. */
export interface MarketRecord {
  id: string
  name: string
  title: string
  format: string
  type: MarketType
  location: string
  addedAt: string
  lastRefreshed: string
  display: MarketDisplay
  owner: Author
  featured: string[]
  plugins: StoredEntry[]
  refreshError?: string | undefined
  warnings: string[]
}

/** marketplaces.json shape (schema v2). */
export interface MarketsFile {
  schemaVersion: number
  updatedAt: string
  markets: MarketRecord[]
}

/** Blocking sleep (milliseconds) for lock retries. */
function sleepSync(ms: number): void {
  const shared = new Int32Array(new SharedArrayBuffer(4))
  Atomics.wait(shared, 0, 0, ms)
}

function timestampForFile(date: Date = new Date()): string {
  return date.toISOString().replace(/[:.]/gu, '-')
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

/** The empty state file. */
export function emptyState(): StateFile {
  return { schemaVersion: STATE_SCHEMA, updatedAt: new Date().toISOString(), plugins: [] }
}

/** The empty market table. */
export function emptyMarkets(): MarketsFile {
  return { schemaVersion: STATE_SCHEMA, updatedAt: new Date().toISOString(), markets: [] }
}

/** Normalize one plugin record; invalid records return `null`. */
function normalizePluginRecord(record: unknown, warnings: string[]): PluginRecord | null {
  if (!isObject(record)) return null
  const key = typeof record.key === 'string' ? record.key.trim() : ''
  const name = typeof record.name === 'string' ? record.name.trim() : ''
  const format = typeof record.format === 'string' ? record.format.trim() : ''
  const version = typeof record.version === 'string' ? record.version.trim() : ''
  if (key === '' || name === '' || format === '' || version === '') {
    warnings.push(`丢弃字段不全的插件记录：${JSON.stringify(record).slice(0, 120)}`)
    return null
  }
  const previousVersions: PreviousVersion[] = Array.isArray(record.previousVersions)
    ? (record.previousVersions as unknown[])
      .filter((item): item is Record<string, unknown> =>
        isObject(item) && typeof item.version === 'string' && typeof item.installedPath === 'string')
      .slice(-5)
      .map(item => ({
        version: item.version as string,
        installedPath: item.installedPath as string,
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

/** Normalize one persisted marketplace entry (meta is whitelisted; unknown fields drop). */
function normalizeStoredEntry(entry: unknown): StoredEntry | null {
  if (!isObject(entry)) return null
  const name = typeof entry.name === 'string' ? entry.name.trim() : ''
  if (name === '') return null
  const normalized: StoredEntry = {
    name,
    version: typeof entry.version === 'string' ? entry.version.trim() : '',
    description: typeof entry.description === 'string' ? entry.description.trim() : '',
    source: isObject(entry.source) ? entry.source as SourceRef : { kind: 'unknown' },
    installable: entry.installable !== false,
    meta: normalizeEntryMeta(entry.meta),
  }
  const warning = typeof entry.warning === 'string' ? entry.warning.trim() : ''
  if (warning !== '') normalized.warning = warning
  const origin = typeof entry.origin === 'string' ? entry.origin.trim() : ''
  if (origin !== '') normalized.origin = origin
  return normalized
}

/** Normalize one marketplace record. */
function normalizeMarketRecord(record: unknown, warnings: string[]): MarketRecord | null {
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
  const plugins: StoredEntry[] = []
  for (const entry of Array.isArray(record.plugins) ? record.plugins : []) {
    const normalized = normalizeStoredEntry(entry)
    if (normalized !== null) plugins.push(normalized)
  }
  const type: MarketType = ['local', 'git', 'url'].includes(String(record.type))
    ? record.type as MarketType
    : 'local'
  return {
    id,
    name,
    title,
    format: typeof record.format === 'string' ? record.format : 'claude',
    type,
    location: typeof record.location === 'string' ? record.location : '',
    addedAt: typeof record.addedAt === 'string' ? record.addedAt : new Date().toISOString(),
    lastRefreshed: typeof record.lastRefreshed === 'string' ? record.lastRefreshed : '',
    display,
    owner,
    featured: normalizeStringArray(record.featured),
    plugins,
    refreshError: typeof record.refreshError === 'string' && record.refreshError !== '' ? record.refreshError : undefined,
    warnings: Array.isArray(record.warnings)
      ? record.warnings.filter((item): item is string => typeof item === 'string')
      : [],
  }
}

/**
 * Normalize any raw state object to the current schema (shared by readState
 * and migrate.ts).
 *
 * @param raw - raw state.json value.
 * @param warnings - tolerance warnings collector.
 */
export function normalizeState(raw: unknown, warnings: string[] = []): StateFile {
  if (!isObject(raw)) {
    warnings.push('state 顶层必须是 JSON 对象，已按空表处理')
    return emptyState()
  }
  if (raw.schemaVersion !== STATE_SCHEMA) {
    warnings.push(`state.json 的 schemaVersion=${String(raw.schemaVersion)}（当前 ${STATE_SCHEMA}）；请先运行迁移`)
  }
  const plugins: PluginRecord[] = []
  const seen = new Set<string>()
  for (const record of Array.isArray(raw.plugins) ? raw.plugins : []) {
    const normalized = normalizePluginRecord(record, warnings)
    if (normalized === null) continue
    if (seen.has(normalized.key)) {
      warnings.push(`插件 ${normalized.key} 在 state 中重复，保留最后一条`)
      const index = plugins.findIndex(item => item.key === normalized.key)
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
 * Normalize any raw marketplaces object to the current schema (shared by
 * readMarkets and migrate.ts).
 *
 * @param raw - raw marketplaces.json value.
 * @param warnings - tolerance warnings collector.
 */
export function normalizeMarkets(raw: unknown, warnings: string[] = []): MarketsFile {
  if (!isObject(raw)) {
    warnings.push('marketplaces 顶层必须是 JSON 对象，已按空表处理')
    return emptyMarkets()
  }
  if (raw.schemaVersion !== STATE_SCHEMA) {
    warnings.push(`marketplaces.json 的 schemaVersion=${String(raw.schemaVersion)}（当前 ${STATE_SCHEMA}）；请先运行迁移`)
  }
  const markets: MarketRecord[] = []
  const ids = new Set<string>()
  for (const record of Array.isArray(raw.markets) ? raw.markets : []) {
    const normalized = normalizeMarketRecord(record, warnings)
    if (normalized === null) continue
    if (ids.has(normalized.id)) {
      warnings.push(`市场 id ${normalized.id} 重复，保留最后一条`)
      const index = markets.findIndex(item => item.id === normalized.id)
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

/** Storage paths of the hub home. */
export interface StorePaths {
  home: string
  state: string
  marketplaces: string
  cache: string
  markets: string
  logs: string
  tmp: string
  lock: string
  logFile: string
}

/** Install validity checker used by self-repair. */
export interface InstallChecker {
  isValidInstall: (record: PluginRecord) => boolean
}

/** Atomic IO, locking, self-repair, and logging over the hub home directory. */
export class HubStore {
  readonly home: string
  private lockHeld = false

  /** @param home - hub storage root (absolute path). */
  constructor(home: string) {
    this.home = home
  }

  /** All storage paths. */
  get paths(): StorePaths {
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

  /** Create the base directories (idempotent). */
  ensureDirs(): void {
    for (const dir of [this.home, this.paths.cache, this.paths.markets, this.paths.logs, this.paths.tmp]) {
      mkdirSync(dir, { recursive: true })
    }
  }

  /** Append one log line; never throws. */
  log(level: string, message: string): void {
    const line = `${new Date().toISOString()} [${level}] ${message}\n`
    try {
      mkdirSync(this.paths.logs, { recursive: true })
      appendFileSync(this.paths.logFile, line, 'utf8')
    } catch {
      /* log failures never break the main flow */
    }
  }

  /** Atomic JSON write: temp file + rename. */
  atomicWriteJson(filePath: string, value: unknown): void {
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

  /** Read JSON; a missing file returns `null`, a corrupt file backs up and returns the empty factory value. */
  readJsonSafe<T>(
    filePath: string,
    emptyFactory?: () => T,
    warnings: string[] = [],
  ): unknown {
    if (!existsSync(filePath)) return null
    let text: string
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
   * Read state: fields normalize to the current schema only; old schema files
   * migrate at startup through migrate.ts.
   */
  readState(): { state: StateFile, warnings: string[] } {
    const warnings: string[] = []
    const raw = this.readJsonSafe(this.paths.state, emptyState, warnings)
    if (raw === null) return { state: emptyState(), warnings }
    return { state: normalizeState(raw, warnings), warnings }
  }

  /** Save state. */
  saveState(state: StateFile): void {
    this.ensureDirs()
    this.atomicWriteJson(this.paths.state, {
      schemaVersion: STATE_SCHEMA,
      updatedAt: new Date().toISOString(),
      plugins: state.plugins ?? [],
    })
  }

  /** Read the market table; a corrupt file rebuilds. */
  readMarkets(): { markets: MarketsFile, warnings: string[] } {
    const warnings: string[] = []
    const raw = this.readJsonSafe(this.paths.marketplaces, emptyMarkets, warnings)
    if (raw === null) return { markets: emptyMarkets(), warnings }
    return { markets: normalizeMarkets(raw, warnings), warnings }
  }

  /** Save the market table. */
  saveMarkets(markets: MarketsFile): void {
    this.ensureDirs()
    this.atomicWriteJson(this.paths.marketplaces, {
      schemaVersion: STATE_SCHEMA,
      updatedAt: new Date().toISOString(),
      markets: markets.markets ?? [],
    })
  }

  /**
   * Self-repair: drop installs whose directories are gone, clean missing
   * rollback directories.
   *
   * @param state - current state file.
   * @param checker - install validity predicate.
   */
  repairState(
    state: StateFile,
    checker: InstallChecker,
  ): { state: StateFile, removed: PluginRecord[], warnings: string[] } {
    const warnings: string[] = []
    const removed: PluginRecord[] = []
    const plugins: PluginRecord[] = []
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

  /** Acquire the process lock (synchronous retry). */
  acquireLock(timeoutMs: number = 5000): void {
    if (this.lockHeld) return
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
        if ((error as NodeJS.ErrnoException | null)?.code !== 'EEXIST') throw error
        if (this.stealStaleLock()) continue
        sleepSync(50)
      }
    }
    if (!acquired) {
      throw new Error('另一个 hub 操作正在进行（锁超时）；请稍后重试，或删除 tmp/hub.lock（确认没有其他 DSH 实例在写）')
    }
    this.lockHeld = true
  }

  /** Release the process lock. */
  releaseLock(): void {
    if (!this.lockHeld) return
    this.lockHeld = false
    try {
      unlinkSync(this.paths.lock)
    } catch {
      /* the lock file may already be reclaimed */
    }
  }

  /**
   * Run `fn` synchronously while holding the process lock.
   *
   * @param fn - critical section.
   * @param options - lock timeout.
   */
  withLock<T>(fn: () => T, options: { timeoutMs?: number } = {}): T {
    if (this.lockHeld) {
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
   * Run `fn` asynchronously while holding the process lock.
   *
   * @param fn - critical section.
   * @param options - lock timeout.
   */
  async withLockAsync<T>(fn: () => Promise<T>, options: { timeoutMs?: number } = {}): Promise<T> {
    if (this.lockHeld) {
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

  /** Steal a stale lock: its pid is gone or it is older than 60 seconds. */
  stealStaleLock(): boolean {
    try {
      const raw = JSON.parse(readFileSync(this.paths.lock, 'utf8')) as { pid?: unknown, at?: unknown }
      let alive = false
      if (typeof raw.pid === 'number') {
        try {
          process.kill(raw.pid, 0)
          alive = true
        } catch {
          alive = false
        }
      }
      const ageMs = Date.now() - Date.parse(typeof raw.at === 'string' ? raw.at : '')
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

  /** Clear state files (tests). */
  reset(): void {
    for (const file of [this.paths.state, this.paths.marketplaces]) {
      rmSync(file, { force: true })
    }
  }
}
