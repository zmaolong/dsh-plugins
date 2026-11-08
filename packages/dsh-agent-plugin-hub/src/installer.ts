/**
 * Installer: copy agent plugins into the hub's own cache and maintain enable
 * state, versions, and rollback.
 *
 * Conventions:
 * - Copy, never reference the market directory; target path
 *   `cache/<format>/<market>/<plugin>/<version>/`;
 * - Copy into `tmp/` first, then rename to the target (atomic on one volume);
 * - Never silently overwrite: an existing same-version directory requires an
 *   explicit force (update --force / install --force);
 * - Rollback keeps the most recent version directories and cleans the rest.
 *
 * @module dsh-agent-plugin-hub/installer
 */

import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
} from 'node:fs'
import path from 'node:path'

import { scanCapabilities, emptyDisabledCapabilities, normalizeDisabledCapabilities } from './capabilities.ts'
import { isFormatId, isSafePluginName } from './formats.ts'
import { detectPluginManifest, isDirectory, validatePluginManifest } from './manifest.ts'
import { classifyUpdate, isInstallableVersion } from './version.ts'
import { hubError } from './hub.ts'
import type { HubStore, PluginRecord, StateFile } from './store.ts'
import type { MarketManager } from './market.ts'
import type { LogFn } from './log.ts'

/** Directories skipped during copy (large and never wanted in an install copy). */
const SKIP_DIRS = new Set(['.git', 'node_modules', 'tmp', '.cache'])

/** Recursively copy a directory; skips symlinks; returns the copied file count. */
export function copyDirectory(source: string, target: string): number {
  let count = 0
  const walk = (from: string, to: string, depth: number): void => {
    if (depth > 12) throw hubError(`目录层级过深，已中止复制：${from}`, 'source_unavailable')
    mkdirSync(to, { recursive: true })
    for (const entry of readdirSync(from, { withFileTypes: true })) {
      const src = path.join(from, entry.name)
      const dst = path.join(to, entry.name)
      if (entry.isSymbolicLink()) continue
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) continue
        walk(src, dst, depth + 1)
        continue
      }
      if (!entry.isFile()) continue
      copyFileSync(src, dst)
      count += 1
    }
  }
  walk(source, target, 0)
  return count
}

/** List version-shaped subdirectory names of one directory. */
function versionDirs(dir: string): string[] {
  if (!isDirectory(dir)) return []
  try {
    return readdirSync(dir, { withFileTypes: true })
      .filter(entry => entry.isDirectory())
      .map(entry => entry.name)
  } catch {
    return []
  }
}

/** Install result. */
export interface InstallResult {
  record: PluginRecord
  sourceDir: string
  targetDir: string
  warnings: string[]
  replaced: boolean
}

/** Update result. */
export interface UpdateResult {
  record: PluginRecord
  changed: boolean
  message: string
  warnings: string[]
  updateState: string
}

/** Rollback result. */
export interface RollbackResult {
  record: PluginRecord
  previousVersion: string
  warnings: string[]
}

/** Installs, uninstalls, enables, updates, and rolls back agent plugins. */
export class Installer {
  private readonly store: HubStore
  private readonly markets: MarketManager
  private readonly log: LogFn

  constructor(options: { store: HubStore, markets: MarketManager, log: LogFn }) {
    this.store = options.store
    this.markets = options.markets
    this.log = options.log
  }

  /** Plugin key: `<marketId>/<pluginName>`. */
  static keyFor(marketId: string, pluginName: string): string {
    return `${marketId}/${pluginName}`
  }

  /** Find a record in state by key or unique plugin name. */
  findRecord(state: StateFile, keyOrName: unknown): PluginRecord {
    const value = String(keyOrName ?? '').trim()
    if (value === '') throw hubError('请提供插件名或 key', 'bad_request')
    if (value.includes('/')) {
      const record = state.plugins.find(plugin => plugin.key === value)
      if (!record) throw hubError(`未安装该插件：${value}（用 /agent-plugin list 查看）`, 'not_found')
      return record
    }
    const matches = state.plugins.filter(plugin => plugin.name === value)
    if (matches.length === 0) throw hubError(`未安装名为 ${value} 的插件（用 /agent-plugin list 查看）`, 'not_found')
    if (matches.length > 1) {
      throw hubError(`插件名 ${value} 出现在多个市场，请改用完整 key：${matches.map(item => item.key).join('、')}`, 'conflict')
    }
    return matches[0] as PluginRecord
  }

  /** Validate each target path segment so the joined path cannot escape the cache directory. */
  safeTargetDir(format: string, marketId: string, pluginName: string, version: string): string {
    if (!isFormatId(format)) throw hubError(`未知插件格式：${format}`, 'bad_request')
    if (!isSafePluginName(pluginName)) throw hubError(`插件名不合法：${pluginName}`, 'bad_request')
    if (!isSafePluginName(marketId)) throw hubError(`市场 id 不合法：${marketId}`, 'bad_request')
    if (!isInstallableVersion(version)) {
      throw hubError(`版本号不合法（应为 SemVer）：${version}`, 'version_invalid')
    }
    return path.join(this.store.paths.cache, format, marketId, pluginName, version)
  }

  /** Install or reinstall one plugin from a market. */
  install(
    state: StateFile,
    request: { marketId: string, pluginName: string, force?: boolean },
  ): InstallResult {
    const marketId = String(request.marketId ?? '').trim()
    const pluginName = String(request.pluginName ?? '').trim()
    const market = this.markets.get(marketId)
    if (!market) throw hubError(`市场不存在：${marketId}（用 /agent-plugin market list 查看）`, 'not_found')
    const entry = (market.plugins ?? []).find(plugin => plugin.name === pluginName)
    if (!entry) throw hubError(`市场 ${marketId} 里没有插件 ${pluginName}，请先刷新该市场`, 'not_found')
    const sourceDir = this.markets.resolveInstallSource(market, pluginName)
    const detected = detectPluginManifest(sourceDir, { hintFormat: market.format })
    const meta = validatePluginManifest(detected.manifest, detected)
    if (meta.name !== pluginName) {
      throw hubError(`插件清单 name（${meta.name}）与市场条目（${pluginName}）不一致，拒绝安装`, 'conflict')
    }
    const warnings = [...detected.warnings, ...meta.warnings]
    const key = Installer.keyFor(market.id, meta.name)
    const existing = state.plugins.find(plugin => plugin.key === key) ?? null
    const targetDir = this.safeTargetDir(detected.format, market.id, meta.name, meta.version)
    const sameActive = existing !== null && existing.installedPath === targetDir
    if (existsSync(targetDir) && request.force !== true) {
      throw hubError(
        sameActive
          ? `插件 ${meta.name}@${meta.version} 已安装；如需重装请用 /agent-plugin update ${meta.name} --force`
          : `目标目录已存在：${targetDir}；如需覆盖请加 --force`,
        'conflict',
      )
    }
    const tmpDir = path.join(this.store.paths.tmp, `install-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`)
    mkdirSync(path.dirname(tmpDir), { recursive: true })
    // When overwriting an existing directory, rename it to a backup first and
    // delete the backup once the new directory is in place; a mid-way failure
    // restores it, avoiding the "delete-then-rename" window losing both.
    const backupDir = existsSync(targetDir)
      ? path.join(this.store.paths.tmp, `replace-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`)
      : ''
    try {
      const files = copyDirectory(sourceDir, tmpDir)
      if (files === 0) throw hubError(`插件源目录没有可复制的文件：${sourceDir}`, 'source_unavailable')
      mkdirSync(path.dirname(targetDir), { recursive: true })
      if (backupDir !== '') renameSync(targetDir, backupDir)
      renameSync(tmpDir, targetDir)
    } catch (error) {
      if (backupDir !== '' && existsSync(backupDir) && !existsSync(targetDir)) {
        try {
          renameSync(backupDir, targetDir)
        } catch {
          // Restore failure keeps the backup directory for manual inspection.
        }
      }
      rmSync(tmpDir, { force: true, recursive: true })
      throw error
    }
    if (backupDir !== '') {
      try {
        rmSync(backupDir, { force: true, recursive: true })
      } catch {
        this.log('warn', `清理旧版本备份失败（可手动删除）：${backupDir}`)
      }
    }
    const scan = scanCapabilities(targetDir, detected.format, detected.manifest)
    warnings.push(...scan.warnings)
    const previousVersions = existing ? [...existing.previousVersions] : []
    if (existing && existing.installedPath !== targetDir && existsSync(existing.installedPath)) {
      previousVersions.push({
        version: existing.version,
        installedPath: existing.installedPath,
        installedAt: existing.installedAt,
      })
    }
    const record: PluginRecord = {
      key,
      format: detected.format,
      name: meta.name,
      version: meta.version,
      market: market.id,
      installedPath: targetDir,
      enabled: existing ? existing.enabled : true,
      installedAt: new Date().toISOString(),
      capabilities: scan.summary,
      // Per-item toggles are user preference, kept across upgrades/reinstalls; a fresh install starts empty.
      disabledCapabilities: existing
        ? normalizeDisabledCapabilities(existing.disabledCapabilities)
        : emptyDisabledCapabilities(),
      previousVersions: previousVersions.slice(-5),
    }
    const others = state.plugins.filter(plugin => plugin.key !== key)
    state.plugins = [...others, record]
    this.pruneVersionDirs(record)
    this.log('info', `安装 ${key}@${meta.version}：${sourceDir} → ${targetDir}`)
    return { record, sourceDir, targetDir, warnings, replaced: existing !== null }
  }

  /** Remove directories that belong neither to the current nor a rollback version. */
  pruneVersionDirs(record: PluginRecord): void {
    const versionRoot = path.dirname(record.installedPath)
    const keep = new Set([record.installedPath, ...record.previousVersions.map(item => item.installedPath)])
    for (const entry of versionDirs(versionRoot)) {
      const full = path.join(versionRoot, entry)
      if (keep.has(full)) continue
      try {
        rmSync(full, { recursive: true, force: true })
      } catch (error) {
        this.log('warn', `清理旧版本目录失败：${full}：${error instanceof Error ? error.message : String(error)}`)
      }
    }
    // Clean empty version-parent directories (never past the cache root).
    let dir = versionRoot
    const cacheRoot = path.resolve(this.store.paths.cache)
    while (path.resolve(dir).startsWith(cacheRoot) && path.resolve(dir) !== cacheRoot) {
      try {
        if (readdirSync(dir).length > 0) break
        rmSync(dir, { recursive: false, force: true })
        dir = path.dirname(dir)
      } catch {
        break
      }
    }
  }

  /** Remove one installed plugin (state + directories). */
  uninstall(state: StateFile, keyOrName: unknown): PluginRecord {
    const record = this.findRecord(state, keyOrName)
    const targets = new Set([record.installedPath, ...record.previousVersions.map(item => item.installedPath)])
    state.plugins = state.plugins.filter(plugin => plugin.key !== record.key)
    for (const target of targets) {
      if (target === '' || !existsSync(target)) continue
      const resolved = path.resolve(target)
      if (!resolved.startsWith(path.resolve(this.store.paths.cache))) {
        this.log('warn', `拒绝删除 cache 之外的目录：${resolved}`)
        continue
      }
      rmSync(resolved, { recursive: true, force: true })
    }
    this.log('info', `卸载 ${record.key}`)
    return record
  }

  /** Enable / disable. */
  setEnabled(state: StateFile, keyOrName: unknown, enabled: boolean): PluginRecord {
    const record = this.findRecord(state, keyOrName)
    record.enabled = enabled === true
    this.log('info', `${record.enabled ? '启用' : '禁用'} ${record.key}`)
    return record
  }

  /**
   * Update to the market's latest version.
   *
   * `refresh:false` skips the market refresh (updateAll refreshes per market
   * once and reuses it, avoiding duplicate network). An incomparable version
   * (unknown) counts as "not updated" with a readable message — never a false
   * "updatable".
   */
  async update(
    state: StateFile,
    keyOrName: unknown,
    options: { force?: boolean, refresh?: boolean } = {},
  ): Promise<UpdateResult> {
    const record = this.findRecord(state, keyOrName)
    const market = this.markets.get(record.market)
    if (!market) throw hubError(`插件来源市场 ${record.market} 已不存在，请先添加该市场或改用回滚/卸载`, 'not_found')
    if (options.refresh !== false) await this.markets.refresh(market.id)
    const refreshed = this.markets.get(market.id)
    if (!refreshed) throw hubError(`市场 ${market.id} 刷新后不存在`, 'market_unavailable')
    const sourceDir = this.markets.resolveInstallSource(refreshed, record.name)
    const detected = detectPluginManifest(sourceDir, { hintFormat: refreshed.format })
    const meta = validatePluginManifest(detected.manifest, detected)
    const updateState = classifyUpdate(record.version, meta.version)
    if (updateState !== 'available' && options.force !== true) {
      const message = updateState === 'current'
        ? `已是最新版本 ${record.version}`
        : updateState === 'installed-newer'
          ? `市场版本 ${meta.version} 不高于已安装版本 ${record.version}，未更新`
          : `无法比较版本（已安装 ${record.version}，市场 ${meta.version || '未标注'}），未更新；如需强制覆盖请加 --force`
      return { record, changed: false, message, warnings: [], updateState }
    }
    const result = this.install(state, {
      marketId: refreshed.id,
      pluginName: record.name,
      force: true,
    })
    return {
      record: result.record,
      changed: true,
      message: `已更新 ${record.name}：${record.version} → ${result.record.version}`,
      warnings: result.warnings,
      updateState,
    }
  }

  /** Roll back to a history version. */
  rollback(state: StateFile, keyOrName: unknown, targetVersion?: string): RollbackResult {
    const record = this.findRecord(state, keyOrName)
    if (record.previousVersions.length === 0) {
      throw hubError(`插件 ${record.name} 没有可回滚的历史版本`, 'not_found')
    }
    // Pick and verify the target first; swap the record only after everything
    // succeeds so a failure loses no history.
    let target: (typeof record.previousVersions)[number] | null = null
    const wanted = String(targetVersion ?? '').trim()
    if (wanted !== '') {
      const candidate = record.previousVersions.find(item => item.version === wanted)
      if (!candidate) {
        const known = record.previousVersions.map(item => item.version).join('、')
        throw hubError(`插件 ${record.name} 未找到历史版本 ${wanted}（可用：${known || '无'}）`, 'not_found')
      }
      target = candidate
    } else {
      for (let index = record.previousVersions.length - 1; index >= 0; index -= 1) {
        const candidate = record.previousVersions[index]
        if (candidate !== undefined && existsSync(candidate.installedPath)) {
          target = candidate
          break
        }
      }
    }
    if (!target) throw hubError(`插件 ${record.name} 的历史版本目录都已被清理，无法回滚`, 'not_found')
    if (!existsSync(target.installedPath)) {
      throw hubError(`插件 ${record.name} 的历史版本 ${target.version} 目录已被清理，无法回滚`, 'not_found')
    }
    const detected = detectPluginManifest(target.installedPath, { hintFormat: record.format })
    const scan = scanCapabilities(target.installedPath, record.format, detected.manifest)

    const oldVersion = record.version
    const oldPath = record.installedPath
    const history = record.previousVersions.filter(item => item !== target)
    record.version = target.version
    record.installedPath = target.installedPath
    record.installedAt = new Date().toISOString()
    record.capabilities = scan.summary
    record.format = detected.format
    if (existsSync(oldPath)) {
      history.push({ version: oldVersion, installedPath: oldPath, installedAt: new Date().toISOString() })
    }
    record.previousVersions = history.slice(-5)
    this.pruneVersionDirs(record)
    this.log('info', `回滚 ${record.key}：${oldVersion} → ${record.version}`)
    return { record, previousVersion: oldVersion, warnings: scan.warnings }
  }

  /** Summarize install cache usage (bytes) and plugin count. */
  cacheStats(state: StateFile): { plugins: number, bytes: number } {
    let bytes = 0
    const countDir = (dir: string): void => {
      if (!existsSync(dir)) return
      let entries
      try {
        entries = readdirSync(dir, { withFileTypes: true })
      } catch {
        return
      }
      for (const entry of entries) {
        const full = path.join(dir, entry.name)
        try {
          if (entry.isDirectory()) countDir(full)
          else bytes += statSync(full).size
        } catch {
          /* a single failing file is ignored */
        }
      }
    }
    for (const record of state.plugins) countDir(record.installedPath)
    return { plugins: state.plugins.length, bytes }
  }
}
