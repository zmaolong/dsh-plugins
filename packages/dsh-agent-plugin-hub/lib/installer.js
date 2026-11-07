/**
 * 安装器：把 Agent 插件复制进 hub 自己的 cache，并维护启用状态、版本与回滚。
 *
 * 约定：
 * - 只复制、不引用市场目录；目标路径 `cache/<format>/<market>/<plugin>/<version>/`；
 * - 先复制到 `tmp/`，再 rename 到目标路径（同盘原子）；
 * - 不静默覆盖：同版本目录已存在时要求显式 force（update --force / install --force）；
 * - 回滚保留最近若干个版本目录，其余清理。
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

import { scanCapabilities, emptyDisabledCapabilities, normalizeDisabledCapabilities } from './capabilities.js'
import { isFormatId, isSafePluginName } from './formats.js'
import { detectPluginManifest, isDirectory, validatePluginManifest } from './manifest.js'

/** 复制时跳过的目录（体积大且不应进入安装副本）。 */
const SKIP_DIRS = new Set(['.git', 'node_modules', 'tmp', '.cache'])

/** 递归复制目录；跳过符号链接，返回复制文件数。 */
export function copyDirectory(source, target) {
  let count = 0
  const walk = (from, to, depth) => {
    if (depth > 12) throw new Error(`目录层级过深，已中止复制：${from}`)
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

/** 比较两个版本号（支持 `x.y.z[-pre]`）；返回 <0 / 0 / >0。 */
export function compareVersions(left, right) {
  const parse = (value) => {
    const text = String(value ?? '').trim().replace(/^v/u, '')
    const [main, pre = ''] = text.split('-', 2)
    const parts = main.split('.').map((part) => Number.parseInt(part, 10) || 0)
    return { parts, pre }
  }
  const a = parse(left)
  const b = parse(right)
  const length = Math.max(a.parts.length, b.parts.length)
  for (let index = 0; index < length; index += 1) {
    const diff = (a.parts[index] ?? 0) - (b.parts[index] ?? 0)
    if (diff !== 0) return diff
  }
  if (a.pre === b.pre) return 0
  if (a.pre === '') return 1
  if (b.pre === '') return -1
  return a.pre < b.pre ? -1 : 1
}

/** 判断目录里是否有一个版本号形式的子目录。 */
function versionDirs(dir) {
  if (!isDirectory(dir)) return []
  try {
    return readdirSync(dir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
  } catch {
    return []
  }
}

export class Installer {
  /**
   * @param {{store: import('./store.js').HubStore, markets: import('./market.js').MarketManager}} options
   */
  constructor(options) {
    this.store = options.store
    this.markets = options.markets
  }

  /** 插件 key：`<marketId>/<pluginName>`。 */
  static keyFor(marketId, pluginName) {
    return `${marketId}/${pluginName}`
  }

  /** 在 state 中按 key 或唯一插件名查找记录。 */
  findRecord(state, keyOrName) {
    const value = String(keyOrName ?? '').trim()
    if (value === '') throw new Error('请提供插件名或 key')
    if (value.includes('/')) {
      const record = state.plugins.find((plugin) => plugin.key === value)
      if (!record) throw new Error(`未安装该插件：${value}（用 /agent-plugin list 查看）`)
      return record
    }
    const matches = state.plugins.filter((plugin) => plugin.name === value)
    if (matches.length === 0) throw new Error(`未安装名为 ${value} 的插件（用 /agent-plugin list 查看）`)
    if (matches.length > 1) {
      throw new Error(`插件名 ${value} 出现在多个市场，请改用完整 key：${matches.map((item) => item.key).join('、')}`)
    }
    return matches[0]
  }

  /** 校验目标路径各段，防止拼出缓存目录外的路径。 */
  safeTargetDir(format, marketId, pluginName, version) {
    if (!isFormatId(format)) throw new Error(`未知插件格式：${format}`)
    if (!isSafePluginName(pluginName)) throw new Error(`插件名不合法：${pluginName}`)
    if (!isSafePluginName(marketId)) throw new Error(`市场 id 不合法：${marketId}`)
    if (!/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/u.test(version)) {
      throw new Error(`版本号不合法（应为 SemVer）：${version}`)
    }
    return path.join(this.store.paths.cache, format, marketId, pluginName, version)
  }

  /**
   * 安装/重装一个市场里的插件。
   *
   * @param {object} state - 当前 state（会被原地修改）
   * @param {{marketId: string, pluginName: string, force?: boolean}} request
   * @returns {{record: object, sourceDir: string, targetDir: string, warnings: string[], replaced: boolean}}
   */
  install(state, request) {
    const marketId = String(request.marketId ?? '').trim()
    const pluginName = String(request.pluginName ?? '').trim()
    const market = this.markets.get(marketId)
    if (!market) throw new Error(`市场不存在：${marketId}（用 /agent-plugin market list 查看）`)
    const entry = (market.plugins ?? []).find((plugin) => plugin.name === pluginName)
    if (!entry) throw new Error(`市场 ${marketId} 里没有插件 ${pluginName}，请先刷新该市场`)
    const sourceDir = this.markets.resolveInstallSource(market, pluginName)
    const detected = detectPluginManifest(sourceDir, { hintFormat: market.format })
    const meta = validatePluginManifest(detected.manifest, detected)
    if (meta.name !== pluginName) {
      throw new Error(`插件清单 name（${meta.name}）与市场条目（${pluginName}）不一致，拒绝安装`)
    }
    const warnings = [...detected.warnings, ...meta.warnings]
    const key = Installer.keyFor(market.id, meta.name)
    const existing = state.plugins.find((plugin) => plugin.key === key) ?? null
    const targetDir = this.safeTargetDir(detected.format, market.id, meta.name, meta.version)
    const sameActive = existing !== null && existing.installedPath === targetDir
    if (existsSync(targetDir) && !request.force) {
      throw new Error(
        sameActive
          ? `插件 ${meta.name}@${meta.version} 已安装；如需重装请用 /agent-plugin update ${meta.name} --force`
          : `目标目录已存在：${targetDir}；如需覆盖请加 --force`,
      )
    }
    const tmpDir = path.join(this.store.paths.tmp, `install-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`)
    mkdirSync(path.dirname(tmpDir), { recursive: true })
    try {
      const files = copyDirectory(sourceDir, tmpDir)
      if (files === 0) throw new Error(`插件源目录没有可复制的文件：${sourceDir}`)
      mkdirSync(path.dirname(targetDir), { recursive: true })
      if (existsSync(targetDir)) rmSync(targetDir, { force: true, recursive: true })
      renameSync(tmpDir, targetDir)
    } catch (error) {
      rmSync(tmpDir, { force: true, recursive: true })
      throw error
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
    const record = {
      key,
      format: detected.format,
      name: meta.name,
      version: meta.version,
      market: market.id,
      installedPath: targetDir,
      enabled: existing ? existing.enabled : true,
      installedAt: new Date().toISOString(),
      capabilities: scan.summary,
      // 逐项启停是用户偏好，升级/重装时保留；新安装为空表。
      disabledCapabilities: existing
        ? normalizeDisabledCapabilities(existing.disabledCapabilities)
        : emptyDisabledCapabilities(),
      previousVersions: previousVersions.slice(-5),
    }
    const others = state.plugins.filter((plugin) => plugin.key !== key)
    state.plugins = [...others, record]
    this.pruneVersionDirs(record)
    this.store.log('info', `安装 ${key}@${meta.version}：${sourceDir} → ${targetDir}`)
    return { record, sourceDir, targetDir, warnings, replaced: existing !== null }
  }

  /** 删除不属于当前版本与回滚版本的目录。 */
  pruneVersionDirs(record) {
    const versionRoot = path.dirname(record.installedPath)
    const keep = new Set([record.installedPath, ...record.previousVersions.map((item) => item.installedPath)])
    for (const entry of versionDirs(versionRoot)) {
      const full = path.join(versionRoot, entry)
      if (keep.has(full)) continue
      try {
        rmSync(full, { recursive: true, force: true })
      } catch (error) {
        this.store.log('warn', `清理旧版本目录失败：${full}：${error instanceof Error ? error.message : String(error)}`)
      }
    }
    // 清理空的版本父目录链（不越过 cache 根）。
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

  /** 移除一个已安装插件（状态 + 目录）。 */
  uninstall(state, keyOrName) {
    const record = this.findRecord(state, keyOrName)
    const targets = new Set([record.installedPath, ...record.previousVersions.map((item) => item.installedPath)])
    state.plugins = state.plugins.filter((plugin) => plugin.key !== record.key)
    for (const target of targets) {
      if (target === '' || !existsSync(target)) continue
      const resolved = path.resolve(target)
      if (!resolved.startsWith(path.resolve(this.store.paths.cache))) {
        this.store.log('warn', `拒绝删除 cache 之外的目录：${resolved}`)
        continue
      }
      rmSync(resolved, { recursive: true, force: true })
    }
    this.store.log('info', `卸载 ${record.key}`)
    return record
  }

  /** 启用/禁用。 */
  setEnabled(state, keyOrName, enabled) {
    const record = this.findRecord(state, keyOrName)
    record.enabled = enabled === true
    this.store.log('info', `${record.enabled ? '启用' : '禁用'} ${record.key}`)
    return record
  }

  /**
   * 更新到市场里的最新版本。
   *
   * @returns {Promise<{record: object, changed: boolean, message: string, warnings: string[]}>}
   */
  async update(state, keyOrName, options = {}) {
    const record = this.findRecord(state, keyOrName)
    const market = this.markets.get(record.market)
    if (!market) throw new Error(`插件来源市场 ${record.market} 已不存在，请先添加该市场或改用回滚/卸载`)
    await this.markets.refresh(market.id)
    const refreshed = this.markets.get(market.id)
    const sourceDir = this.markets.resolveInstallSource(refreshed, record.name)
    const detected = detectPluginManifest(sourceDir, { hintFormat: refreshed.format })
    const meta = validatePluginManifest(detected.manifest, detected)
    const comparison = compareVersions(meta.version, record.version)
    if (comparison <= 0 && !options.force) {
      return {
        record,
        changed: false,
        message: comparison === 0
          ? `已是最新版本 ${record.version}`
          : `市场版本 ${meta.version} 不高于已安装版本 ${record.version}，未更新`,
        warnings: [],
      }
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
    }
  }

  /** 回滚到上一个版本。 */
  rollback(state, keyOrName) {
    const record = this.findRecord(state, keyOrName)
    if (record.previousVersions.length === 0) {
      throw new Error(`插件 ${record.name} 没有可回滚的历史版本`)
    }
    let target = null
    while (record.previousVersions.length > 0) {
      const candidate = record.previousVersions.pop()
      if (existsSync(candidate.installedPath)) {
        target = candidate
        break
      }
    }
    if (!target) throw new Error(`插件 ${record.name} 的历史版本目录都已被清理，无法回滚`)
    const oldVersion = record.version
    const oldPath = record.installedPath
    record.version = target.version
    record.installedPath = target.installedPath
    record.installedAt = new Date().toISOString()
    const detected = detectPluginManifest(target.installedPath, { hintFormat: record.format })
    const scan = scanCapabilities(target.installedPath, record.format, detected.manifest)
    record.capabilities = scan.summary
    record.format = detected.format
    if (existsSync(oldPath)) {
      record.previousVersions.push({ version: oldVersion, installedPath: oldPath, installedAt: new Date().toISOString() })
      record.previousVersions = record.previousVersions.slice(-5)
    }
    this.pruneVersionDirs(record)
    this.store.log('info', `回滚 ${record.key}：${oldVersion} → ${record.version}`)
    return { record, previousVersion: oldVersion, warnings: scan.warnings }
  }

  /** 统计安装缓存占用（字节）与插件数。 */
  cacheStats(state) {
    let bytes = 0
    const countDir = (dir) => {
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
          /* 单个文件失败忽略 */
        }
      }
    }
    for (const record of state.plugins) countDir(record.installedPath)
    return { plugins: state.plugins.length, bytes }
  }
}