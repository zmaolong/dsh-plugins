/**
 * Hub 编排层：路径解析、存储迁移、状态自检、市场/安装器/能力运行时装配与运维动作。
 *
 * home 解析顺序：config.home → DSH_AGENT_PLUGIN_HUB_HOME → ~/.dsh/agent-plugin-hub
 *
 * 设计要点：
 * - start() 在读取 state/marketplaces 之前执行 lib/migrate.js 的 schema 迁移；
 *   迁移失败只记录 migrationError（随 /store 返回），不阻塞后续读取；
 * - 所有写操作经 runOperation 做进程内单写互斥，忙时抛 code='operation_in_progress'；
 *   读操作（snapshot/describe 的 fetch:false 分支）不加锁；
 * - describePlugin 统一「已安装 / 未安装」详情的数据解析，未安装时是否联网由 fetch 决定。
 *
 * @module dsh-agent-plugin-hub/hub
 */

import { existsSync, readFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import {
  CAPABILITY_KINDS,
  isCapabilityDisabled,
  normalizeDisabledCapabilities,
  normalizeHooks,
  readHooksConfig,
  readMcpServers,
  scanCapabilities,
  scanCommands,
  scanSkills,
} from './capabilities.js'
import { FORMATS, findFormat, isSafePluginName } from './formats.js'
import { HOOK_EVENT_MAP, HookRuntime } from './hooks.js'
import { Installer } from './installer.js'
import { mcpAvailability } from './mcp.js'
import { detectPluginManifest, validatePluginManifest } from './manifest.js'
import { MarketManager } from './market.js'
import { runMigrations } from './migrate.js'
import { PluginCommandRuntime } from './plugin-commands.js'
import { SkillRuntime } from './skills.js'
import { HubStore } from './store.js'
import { classifyUpdate, isInstallableVersion } from './version.js'

const PACKAGE = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))

export const HUB_NAME = 'dsh-agent-plugin-hub'
export const HUB_VERSION = PACKAGE.version

/** 错误 code → HTTP 状态码（ui-routes 直接使用）。 */
const STATUS_BY_CODE = Object.freeze({
  bad_request: 400,
  forbidden: 403,
  not_found: 404,
  method_not_allowed: 405,
  conflict: 409,
  operation_in_progress: 409,
  market_unavailable: 409,
  source_unavailable: 409,
  version_invalid: 422,
  network_error: 502,
  git_error: 502,
  internal: 500,
})

/**
 * 携带机器可读 code 的 hub 错误。
 *
 * @property {string} code - 供 UI 分支的稳定错误码。
 * @property {number} status - 建议的 HTTP 状态码。
 * @property {object} [operation] - 操作进行中时附带的操作对象。
 */
export class HubError extends Error {
  /**
   * @param {string} message - 中文可读文案。
   * @param {{ code?: string, status?: number, operation?: object }} [options]
   */
  constructor(message, options = {}) {
    super(message)
    this.name = 'HubError'
    this.code = options.code ?? 'bad_request'
    this.status = options.status ?? STATUS_BY_CODE[this.code] ?? 400
    if (options.operation) this.operation = options.operation
  }
}

/** 构造 HubError 的快捷方式。 */
export function hubError(message, code = 'bad_request', extra = {}) {
  return new HubError(message, { code, ...extra })
}

/** 用中文文案猜一个稳定 code（第三方模块只抛普通 Error）。 */
function guessCode(message) {
  if (/操作正在进行|operation_in_progress/iu.test(message)) return 'operation_in_progress'
  if (/市场已存在|目标目录已存在|已安装；如需重装|出现在多个市场|拒绝安装|冲突|已存在：/u.test(message)) return 'conflict'
  if (/版本号不合法|无法比较的版本|不可比较/u.test(message)) return 'version_invalid'
  if (/git .*失败|执行 git 失败/iu.test(message)) return 'git_error'
  if (/拉取 |fetch failed|ECONN|ETIMEDOUT|ENOTFOUND|HTTP \d|网络/u.test(message)) return 'network_error'
  if (/市场不存在|未安装|没有插件|未找到|找不到|不存在/u.test(message)) return 'not_found'
  return 'bad_request'
}

/**
 * 把任意异常规整为 HubError（保留已有 code/status）。
 *
 * @param {unknown} error
 * @returns {HubError}
 */
export function asHubError(error) {
  if (error instanceof HubError) return error
  const message = error instanceof Error ? error.message : String(error)
  return hubError(message, guessCode(message))
}

/** 取错误的可读文案。 */
function messageOf(error) {
  return error instanceof Error ? error.message : String(error)
}

function nonEmptyString(value) {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : ''
}

/** 作者字段归一：字符串 → {name}，对象 → {name,email,url}。供 ui-data 复用。 */
export function normalizeAuthor(value) {
  if (typeof value === 'string') {
    const name = value.trim()
    return name === '' ? null : { name, email: null, url: null }
  }
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null
  const name = nonEmptyString(value.name)
  if (name === '') return null
  return {
    name,
    email: nonEmptyString(value.email) || null,
    url: nonEmptyString(value.url) || null,
  }
}

/** marketplace 条目的 source 可读标签。 */
function sourceLabel(source) {
  if (!source || typeof source !== 'object') return ''
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

/** 声明级更新判定：缺版本或不可比较一律 unknown。 */
function declaredUpdateState(currentVersion, latestVersion) {
  const latest = nonEmptyString(latestVersion)
  if (latest === '') return 'unknown'
  const state = classifyUpdate(nonEmptyString(currentVersion), latest)
  return typeof state === 'string' && state !== '' ? state : 'unknown'
}

/**
 * 已安装插件的更新信息（声明级检测：条目 version vs 安装记录 version）。
 *
 * @param {{currentVersion?: string|null, latestVersion?: string|null, orphan?: boolean}} input
 * @returns {{state: string, currentVersion: string|null, latestVersion: string|null, checkedBy: string, reason: string|null}}
 */
export function buildUpdateInfo({ currentVersion, latestVersion, orphan = false } = {}) {
  const current = nonEmptyString(currentVersion) || null
  const latest = nonEmptyString(latestVersion) || null
  if (orphan) {
    return {
      state: 'unknown',
      currentVersion: current,
      latestVersion: null,
      checkedBy: 'none',
      reason: '来源市场已移除，无法检查更新',
    }
  }
  if (latest === null) {
    return {
      state: 'unknown',
      currentVersion: current,
      latestVersion: null,
      checkedBy: 'declared',
      reason: '市场条目没有声明版本，无法判断是否有更新',
    }
  }
  const state = declaredUpdateState(current ?? '', latest)
  if (state === 'unknown') {
    return {
      state: 'unknown',
      currentVersion: current,
      latestVersion: latest,
      checkedBy: 'declared',
      reason: `版本号无法比较：${current ?? '未知'} vs ${latest}`,
    }
  }
  return { state, currentVersion: current, latestVersion: latest, checkedBy: 'declared', reason: null }
}

/** 组装 describe 用的清单摘要（无正文）。 */
function pickManifest(meta, raw) {
  return {
    name: meta.name,
    version: meta.version,
    description: meta.description ?? '',
    author: normalizeAuthor(meta.author),
    homepage: nonEmptyString(meta.homepage) || null,
    repository: nonEmptyString(meta.repository) || null,
    license: nonEmptyString(meta.license) || null,
    keywords: Array.isArray(meta.keywords) ? meta.keywords.filter((item) => typeof item === 'string') : [],
    category: nonEmptyString(meta.category) || null,
    icon: meta.icon ?? null,
    rawKeys: raw !== null && typeof raw === 'object' && !Array.isArray(raw) ? Object.keys(raw) : [],
  }
}

/**
 * 扫描一个插件目录并整理成 describe 的能力分区（剔除技能/命令正文）。
 *
 * @param {{hub: AgentPluginHub, root: string, formatId: string, manifest: object, record: object|null, pluginName: string}} input
 * @returns {object} capabilities + sources + warnings
 */
function shapeCapabilities({ hub, root, formatId, manifest, record, pluginName }) {
  const warnings = []
  const skillsScan = scanSkills(root, formatId)
  const commandsScan = scanCommands(root, formatId)
  const hooksRead = readHooksConfig(root, formatId, manifest)
  const hooksParsed = normalizeHooks(hooksRead.config)
  const mcpRead = readMcpServers(root, formatId, manifest)
  warnings.push(
    ...skillsScan.warnings,
    ...commandsScan.warnings,
    ...hooksRead.warnings,
    ...hooksParsed.warnings,
    ...mcpRead.warnings,
  )
  const hookStats = hub.hooks?.stats() ?? { attached: false, reason: 'hooks 运行时未装配', events: [] }
  const hooks = Object.keys(hooksParsed.events).map((event) => {
    const groups = hooksParsed.events[event]
    const mapping = HOOK_EVENT_MAP[event]
    const enabled = record ? !isCapabilityDisabled(record, 'hooks', event) : true
    const hostStat = (hookStats.events ?? []).find((item) => item.event === event) ?? null
    let effective = false
    let reason = ''
    if (!mapping) {
      reason = '未知事件（宿主不会触发）'
    } else if (mapping.host === null) {
      reason = mapping.reason ?? '宿主没有对应事件'
    } else if (!enabled) {
      reason = '该 hooks 事件已在插件里禁用'
    } else {
      effective = hostStat?.effective === true
      reason = effective ? (mapping.note ?? '') : (hostStat?.reason || hookStats.reason || 'hooks 未挂载')
    }
    return {
      event,
      host: mapping?.host ?? null,
      mode: mapping?.mode ?? '',
      canBlock: mapping?.canBlock === true,
      entries: groups.reduce((sum, group) => sum + group.entries.length, 0),
      enabled,
      effective,
      reason,
    }
  })
  const mcpState = mcpAvailability(hub.ctx)
  const mcpServers = mcpRead.servers.map((server) => ({
    name: server.name,
    transport: server.transport,
    command: server.command,
    args: server.args,
    url: server.url,
    enabled: record ? !isCapabilityDisabled(record, 'mcpServers', server.name) : true,
    effective: false,
    reason: mcpState.reason,
  }))
  const commandOwner = record?.name ?? pluginName
  return {
    skills: skillsScan.skills.map((skill) => ({
      name: skill.name,
      description: skill.description ?? '',
      whenToUse: skill.whenToUse ?? '',
      enabled: record ? !isCapabilityDisabled(record, 'skills', skill.name) : true,
    })),
    commands: commandsScan.commands.map((command) => ({
      name: command.name,
      rawName: command.rawName ?? command.name,
      hostName: PluginCommandRuntime.commandName(commandOwner, command.name),
      description: command.description ?? '',
      argumentHint: command.argumentHint ?? '',
      enabled: record ? !isCapabilityDisabled(record, 'commands', command.name) : true,
    })),
    hooks,
    mcpServers,
    hooksSource: hooksRead.source ?? '',
    mcpSource: mcpRead.source ?? '',
    warnings,
  }
}

/** 展开配置里的 `~` / `~/`，其余原样交给 path.resolve。 */
function expandHome(value) {
  if (value === '~') return os.homedir()
  if (value.startsWith('~/') || value.startsWith('\\~\\') || value.startsWith('~\\')) {
    return path.join(os.homedir(), value.slice(2))
  }
  return value
}

export class AgentPluginHub {
  /**
   * @param {{ home?: string, ctx?: object, config?: object, hookExecutor?: object }} [options]
   */
  constructor(options = {}) {
    const configured = typeof options.home === 'string' ? options.home.trim() : ''
    const fromEnv = typeof process.env.DSH_AGENT_PLUGIN_HUB_HOME === 'string'
      ? process.env.DSH_AGENT_PLUGIN_HUB_HOME.trim()
      : ''
    const fallback = path.join(os.homedir(), '.dsh', 'agent-plugin-hub')
    this.home = path.resolve(expandHome(configured || fromEnv || fallback))
    this.formats = FORMATS
    this.ctx = options.ctx ?? null
    this.config = options.config ?? {}
    this.hookExecutor = options.hookExecutor ?? null
    this.store = new HubStore(this.home)
    this.markets = new MarketManager({ store: this.store })
    this.installer = new Installer({ store: this.store, markets: this.markets })
    this.state = { schemaVersion: 2, plugins: [] }
    this.warnings = []
    this.started = false
    /** 存储 schema 迁移结果：{migrated, from, to, backup}；未迁移为 null。 */
    this.migration = null
    /** 迁移失败原因（随 /store 返回，可读中文）。 */
    this.migrationError = null
    /** 当前在途写操作（单写互斥）；空闲为 null。 */
    this._operation = null
    this._operationSeq = 0
    /** 插件页 Web UI 的 HTTP 路由状态，由 index.js 在挂载后回填。 */
    this.uiRoutes = { active: false, reason: '未挂载' }
    this.skills = null
    this.pluginCommands = null
    this.hooks = null
  }

  /** 全部路径。 */
  get paths() {
    return this.store.paths
  }

  /** 是否有写操作在途。 */
  get busy() {
    return this._operation !== null
  }

  /** 当前在途操作列表（供 /store 的 operations 字段）。 */
  operationsList() {
    return this._operation === null ? [] : [{ ...this._operation }]
  }

  listFormats() {
    return this.formats.map((format) => ({
      id: format.id,
      label: format.label,
      pluginManifests: [...format.pluginManifests],
      marketplaceFiles: [...format.marketplaceFiles],
    }))
  }

  /** 启动：迁移存储 → 读状态并自检 → 装配市场与三个能力运行时。失败不抛出，记录原因。 */
  start() {
    this.store.ensureDirs()
    try {
      this.runMigrationsOnce()
      const read = this.store.readState()
      this.state = read.state
      this.warnings.push(...read.warnings)
      this.markets.load()
      this.warnings.push(...this.markets.warnings)
      const repair = this.store.repairState(this.state, {
        isValidInstall: (record) => {
          try {
            const detected = detectPluginManifest(record.installedPath, { hintFormat: record.format })
            validatePluginManifest(detected.manifest, detected)
            return true
          } catch {
            return false
          }
        },
      })
      this.warnings.push(...repair.warnings)
      if (repair.removed.length > 0) {
        this.state = repair.state
        this.store.saveState(this.state)
      }
      const getEnabledPlugins = () => this.getEnabledPlugins()
      this.skills = new SkillRuntime({ getEnabledPlugins, store: this.store })
      this.pluginCommands = new PluginCommandRuntime({ getEnabledPlugins, store: this.store })
      this.hooks = new HookRuntime({
        getEnabledPlugins,
        store: this.store,
        config: this.config,
        ...(this.hookExecutor ? { executor: this.hookExecutor } : {}),
      })
      if (this.ctx) {
        this.skills.register(this.ctx)
        this.pluginCommands.attach(this.ctx)
        this.pluginCommands.sync()
        this.hooks.attach(this.ctx)
      }
      this.refreshCapabilities({ save: true })
      this.started = true
      this.store.log('info', `hub 启动完成：home=${this.home}，插件 ${this.state.plugins.length} 个，市场 ${this.markets.list().length} 个`)
    } catch (error) {
      const message = messageOf(error)
      this.warnings.push(`hub 启动异常：${message}`)
      this.store.log('error', `hub 启动异常：${message}`)
    }
    return this
  }

  /** 执行一次 schema 迁移；失败只记录 migrationError（不阻塞读取）。 */
  runMigrationsOnce() {
    try {
      const result = runMigrations(this.store)
      if (result !== null && typeof result === 'object') {
        this.migration = {
          migrated: result.migrated === true,
          from: Number.isInteger(result.from) ? result.from : null,
          to: Number.isInteger(result.to) ? result.to : null,
          backup: typeof result.backup === 'string' && result.backup !== '' ? result.backup : null,
        }
      }
      if (this.migration?.migrated) {
        this.warnings.push(`存储 schema 已迁移：v${String(this.migration.from)} → v${String(this.migration.to)}（备份：${this.migration.backup ?? '无'}）`)
        this.store.log('info', `存储 schema 已迁移：v${String(this.migration.from)} → v${String(this.migration.to)}`)
      }
      return this.migration
    } catch (error) {
      this.migrationError = messageOf(error)
      this.warnings.push(`存储迁移失败：${this.migrationError}`)
      this.store.log('error', `存储迁移失败：${this.migrationError}`)
      return null
    }
  }

  /**
   * 单写互斥地执行一个操作（同步或异步 fn 均可）。
   *
   * 忙时抛 code='operation_in_progress' 的 HubError；完成后从 operations 列表移除。
   *
   * @template T
   * @param {string} kind - 操作类型（market-add / install / update / update-all / describe ...）。
   * @param {{ key?: string|null, marketId?: string|null, clientOpId?: string|null }} [meta]
   * @param {() => T | Promise<T>} fn
   * @returns {T | Promise<T>}
   */
  runOperation(kind, meta = {}, fn) {
    const operation = this.beginOperation(kind, meta)
    let result
    try {
      result = fn()
    } catch (error) {
      this.endOperation(operation)
      throw asHubError(error)
    }
    if (result !== null && typeof result === 'object' && typeof result.then === 'function') {
      return result.then(
        (value) => {
          this.endOperation(operation)
          return value
        },
        (error) => {
          this.endOperation(operation)
          throw asHubError(error)
        },
      )
    }
    this.endOperation(operation)
    return result
  }

  /** 登记在途操作；忙时抛 operation_in_progress。 */
  beginOperation(kind, meta = {}) {
    if (this._operation !== null) {
      const active = this._operation
      throw hubError(
        `另一个操作正在进行（${active.kind}），请稍候重试`,
        'operation_in_progress',
        { operation: active },
      )
    }
    this._operationSeq += 1
    const operation = {
      id: `op-${Date.now().toString(36)}-${this._operationSeq.toString(36)}`,
      kind,
      key: nonEmptyString(meta?.key) || null,
      marketId: nonEmptyString(meta?.marketId) || null,
      startedAt: new Date().toISOString(),
      clientOpId: nonEmptyString(meta?.clientOpId) || null,
    }
    this._operation = operation
    return operation
  }

  /** 注销在途操作。 */
  endOperation(operation) {
    if (this._operation === operation) this._operation = null
  }

  /** 当前启用的插件记录。 */
  getEnabledPlugins() {
    return (this.state.plugins ?? []).filter((plugin) => plugin.enabled && existsSync(plugin.installedPath))
  }

  /** 重新扫描已安装插件的能力摘要；可选立即失效技能目录。 */
  refreshCapabilities(options = {}) {
    const warnings = []
    for (const record of this.state.plugins ?? []) {
      if (!existsSync(record.installedPath)) continue
      try {
        const detected = detectPluginManifest(record.installedPath, { hintFormat: record.format })
        const meta = validatePluginManifest(detected.manifest, detected)
        const scan = scanCapabilities(record.installedPath, detected.format, detected.manifest)
        record.format = detected.format
        record.capabilities = scan.summary
        if (meta.version !== record.version) {
          warnings.push(`${record.name}: 清单版本 ${meta.version} 与状态版本 ${record.version} 不一致（以清单为准）`)
          record.version = meta.version
        }
        warnings.push(...scan.warnings.map((item) => `${record.name}: ${item}`))
      } catch (error) {
        warnings.push(`${record.name}: 能力扫描失败：${messageOf(error)}`)
      }
    }
    this.warnings.push(...warnings)
    if (options.save === true) this.store.saveState(this.state)
    this.syncRuntimes()
    return warnings
  }

  /** 能力状态变化后：失效技能目录、重建插件命令、刷新 hooks 视图。 */
  syncRuntimes() {
    try {
      this.skills?.invalidate()
    } catch (error) {
      this.store.log('warn', `技能目录失效失败：${messageOf(error)}`)
    }
    try {
      this.pluginCommands?.sync()
    } catch (error) {
      this.store.log('warn', `重建插件命令失败：${messageOf(error)}`)
    }
    try {
      this.hooks?.refresh()
    } catch (error) {
      this.store.log('warn', `刷新 hooks 状态失败：${messageOf(error)}`)
    }
  }

  /** 供 /agent-plugin 命令使用的状态快照（可含 cache）。 */
  snapshot() {
    const plugins = this.state.plugins ?? []
    const markets = this.markets.list()
    return {
      name: HUB_NAME,
      version: HUB_VERSION,
      home: this.home,
      started: this.started,
      formats: this.formats.map((format) => format.id),
      plugins: {
        total: plugins.length,
        enabled: plugins.filter((plugin) => plugin.enabled).length,
      },
      markets: {
        total: markets.length,
        errors: markets.filter((market) => market.refreshError).map((market) => ({ id: market.id, error: market.refreshError })),
        plugins: markets.reduce((sum, market) => sum + (market.plugins?.length ?? 0), 0),
      },
      skills: this.skills?.stats() ?? { registered: false, skills: 0 },
      commands: this.pluginCommands?.stats() ?? { available: false, registered: [] },
      hooks: this.hooks?.stats() ?? { attached: false, events: [] },
      mcp: mcpAvailability(this.ctx),
      ui: { ...this.uiRoutes },
      busy: this.busy,
      operations: this.operationsList(),
      migrationError: this.migrationError,
      cache: this.installer.cacheStats(this.state),
      warnings: this.warnings.slice(-20),
    }
  }

  /** 按 key / 唯一插件名找记录。 */
  findRecord(keyOrName) {
    return this.installer.findRecord(this.state, keyOrName)
  }

  /**
   * 在所有市场里找插件条目。
   * @returns {{market: object, plugin: object}}
   */
  findMarketEntry(pluginName, marketId) {
    if (marketId) {
      const market = this.markets.get(marketId)
      if (!market) throw hubError(`市场不存在：${marketId}（用 /agent-plugin market list 查看）`, 'not_found')
      const plugin = (market.plugins ?? []).find((item) => item.name === pluginName)
      if (!plugin) throw hubError(`市场 ${marketId} 里没有插件 ${pluginName}，请先 /agent-plugin market refresh ${marketId}`, 'not_found')
      return { market, plugin }
    }
    const matches = []
    for (const market of this.markets.list()) {
      for (const plugin of market.plugins ?? []) {
        if (plugin.name === pluginName) matches.push({ market, plugin })
      }
    }
    if (matches.length === 0) {
      throw hubError(`所有市场里都没有插件 ${pluginName}；用 /agent-plugin market list 查看已添加市场，或先 refresh`, 'not_found')
    }
    if (matches.length > 1) {
      throw hubError(
        `插件 ${pluginName} 出现在多个市场：${matches.map((item) => item.market.id).join('、')}；`
        + `请指定市场：/agent-plugin install <marketId> ${pluginName}`,
        'conflict',
      )
    }
    return matches[0]
  }

  /**
   * 解析 describe / icon 的目标：已安装记录优先，其次市场条目。
   *
   * @param {{key?: string, market?: string, name?: string}} input
   * @param {{allowMissingEntry?: boolean}} [settings] - fetch 允许刷新时可暂缺条目。
   * @returns {{key: string, name: string, market: object|null, entry: object|null, record: object|null}}
   */
  resolvePluginTarget(input = {}, settings = {}) {
    const keyText = nonEmptyString(input.key)
    const marketId = nonEmptyString(input.market)
    const nameText = nonEmptyString(input.name)
    const allowMissingEntry = settings.allowMissingEntry === true
    const findEntry = (market, name) => (market?.plugins ?? []).find((plugin) => plugin.name === name) ?? null
    if (keyText.includes('/')) {
      const slash = keyText.indexOf('/')
      const keyMarket = keyText.slice(0, slash)
      const keyName = keyText.slice(slash + 1)
      if (!isSafePluginName(keyName)) throw hubError(`插件 key 不合法：${keyText}`, 'bad_request')
      const record = (this.state.plugins ?? []).find((plugin) => plugin.key === keyText) ?? null
      const market = this.markets.get(keyMarket)
      if (!record && !market) throw hubError(`市场不存在：${keyMarket}（key：${keyText}）`, 'not_found')
      const entry = findEntry(market, keyName)
      if (!record && !entry && !allowMissingEntry) {
        throw hubError(`市场 ${keyMarket} 里没有插件 ${keyName}，请先刷新市场`, 'not_found')
      }
      return { key: keyText, name: record?.name ?? keyName, market, entry, record }
    }
    const name = nameText || keyText
    if (marketId !== '') {
      if (name === '') throw hubError('请提供插件名（name）或完整 key', 'bad_request')
      const expectedKey = Installer.keyFor(marketId, name)
      const record = (this.state.plugins ?? []).find((plugin) => plugin.key === expectedKey) ?? null
      const market = this.markets.get(marketId)
      if (!record && !market) throw hubError(`市场不存在：${marketId}`, 'not_found')
      const entry = findEntry(market, name)
      if (!record && !entry && !allowMissingEntry) {
        throw hubError(`市场 ${marketId} 里没有插件 ${name}，请先刷新市场`, 'not_found')
      }
      return { key: expectedKey, name: record?.name ?? name, market, entry, record }
    }
    if (name === '') throw hubError('请提供插件 key 或 name', 'bad_request')
    const candidates = new Map()
    for (const record of this.state.plugins ?? []) {
      if (record.name !== name) continue
      const market = this.markets.get(record.market)
      candidates.set(record.key, {
        record,
        market,
        entry: market ? findEntry(market, record.name) : null,
      })
    }
    for (const market of this.markets.list()) {
      for (const entry of market.plugins ?? []) {
        if (entry.name !== name) continue
        const key = Installer.keyFor(market.id, entry.name)
        const existing = candidates.get(key)
        if (existing) {
          if (!existing.market) existing.market = market
          if (!existing.entry) existing.entry = entry
          continue
        }
        candidates.set(key, { record: null, market, entry })
      }
    }
    if (candidates.size === 0) {
      throw hubError(`未找到插件：${name}（用 /agent-plugin list 或 GET /store 查看已安装与市场条目）`, 'not_found')
    }
    if (candidates.size > 1) {
      throw hubError(
        `插件名 ${name} 出现在多个市场：${[...candidates.keys()].join('、')}；请改用完整 key 或指定 market`,
        'conflict',
      )
    }
    const [key, target] = [...candidates.entries()][0]
    return { key, name: target.record?.name ?? name, market: target.market, entry: target.entry, record: target.record }
  }

  /**
   * 统一详情数据（已安装读安装目录；未安装解析源目录）。
   *
   * `fetch:true` 才允许联网：先刷新所属市场，再允许 git 源克隆；默认零网络。
   *
   * @param {{key?: string, market?: string, name?: string, fetch?: boolean}} [options]
   */
  async describePlugin(options = {}) {
    const fetchAllowed = options.fetch === true
    const keyText = nonEmptyString(options.key)
    const marketId = nonEmptyString(options.market)
    const nameText = nonEmptyString(options.name)
    const resolve = () => this.resolvePluginTarget(
      { key: keyText, market: marketId, name: nameText },
      { allowMissingEntry: fetchAllowed },
    )
    if (!fetchAllowed) {
      return await this.collectDescribe(resolve(), { allowClone: false, warnings: [] })
    }
    return await this.runOperation(
      'describe',
      { key: keyText || null, marketId: marketId || null },
      () => this.store.withLockAsync(async () => {
        const warnings = []
        let target = resolve()
        if (!target.record && target.market) {
          try {
            await this.markets.refresh(target.market.id)
            const market = this.markets.get(target.market.id) ?? target.market
            const entry = (market.plugins ?? []).find((plugin) => plugin.name === target.name) ?? null
            target = { ...target, market, entry }
          } catch (error) {
            warnings.push(`刷新市场失败：${messageOf(error)}`)
          }
          if (!target.record && !target.entry) {
            throw hubError(`市场 ${target.market?.id ?? ''} 里没有插件 ${target.name}（刷新后仍不存在）`, 'not_found')
          }
        }
        return await this.collectDescribe(target, { allowClone: true, warnings })
      }),
    )
  }

  /**
   * 根据解析好的目标收集 describe 数据。
   *
   * @param {{key: string, name: string, market: object|null, entry: object|null, record: object|null}} target
   * @param {{allowClone: boolean, warnings: string[]}} context
   */
  async collectDescribe(target, context) {
    const { key, name, market, entry, record } = target
    const warnings = [...context.warnings]
    const formatHint = market?.format ?? record?.format ?? 'claude'
    const installed = record
      ? { installed: true, key: record.key, version: record.version, enabled: record.enabled !== false }
      : { installed: false, key: null, version: null, enabled: null }
    let root = null
    let source
    if (record) {
      root = record.installedPath
      const exists = existsSync(root)
      source = {
        kind: 'installed',
        label: root,
        resolved: exists,
        cloneRequired: false,
        reason: exists ? null : '安装目录不存在，无法读取能力清单',
      }
      if (!exists) warnings.push(source.reason)
    } else if (entry && market) {
      let resolution = null
      try {
        resolution = await this.markets.resolvePluginSourceRoot(market, entry.name, {
          allowClone: context.allowClone === true,
        })
      } catch (error) {
        resolution = { resolved: false, path: null, cloneRequired: false, reason: messageOf(error) }
      }
      const resolved = resolution?.resolved === true
      source = {
        kind: entry.source?.kind ?? 'unknown',
        label: sourceLabel(entry.source),
        resolved,
        cloneRequired: resolution?.cloneRequired === true,
        reason: nonEmptyString(resolution?.reason) || null,
      }
      if (resolved) {
        root = resolution?.path ?? null
      } else {
        if (source.reason) warnings.push(source.reason)
        if (source.cloneRequired && !context.allowClone) {
          warnings.push('来源目录尚未缓存；POST /describe 带 fetch:true 允许联网克隆后查看详情')
        }
      }
    } else {
      source = {
        kind: 'unknown',
        label: '',
        resolved: false,
        cloneRequired: false,
        reason: '无法解析插件来源（市场条目缺失）',
      }
      warnings.push(source.reason)
    }
    let manifest = null
    let capabilities = null
    let hooksSource = ''
    let mcpSource = ''
    let format = record?.format || market?.format || ''
    let version = record?.version ?? ''
    let versionValid = true
    if (root !== null && root !== '' && existsSync(root)) {
      try {
        const detected = detectPluginManifest(root, { hintFormat: formatHint })
        const meta = validatePluginManifest(detected.manifest, detected)
        warnings.push(...detected.warnings, ...(meta.warnings ?? []))
        format = detected.format
        manifest = pickManifest(meta, detected.manifest)
        const scan = shapeCapabilities({
          hub: this,
          root,
          formatId: detected.format,
          manifest: detected.manifest,
          record,
          pluginName: name,
        })
        warnings.push(...scan.warnings)
        hooksSource = scan.hooksSource
        mcpSource = scan.mcpSource
        capabilities = {
          skills: scan.skills,
          commands: scan.commands,
          hooks: scan.hooks,
          mcpServers: scan.mcpServers,
        }
        if (!record) version = meta.version || entry?.version || ''
      } catch (error) {
        warnings.push(`读取插件清单失败：${messageOf(error)}`)
      }
    }
    if (!record && version === '') version = nonEmptyString(entry?.version)
    versionValid = version === '' || isInstallableVersion(version)
    const orphan = record !== null && market === null
    const update = record
      ? buildUpdateInfo({ currentVersion: record.version, latestVersion: entry?.version, orphan })
      : {
        state: 'none',
        currentVersion: null,
        latestVersion: nonEmptyString(entry?.version) || null,
        checkedBy: 'declared',
        reason: null,
      }
    const installable = record
      ? false
      : (entry
        ? entry.installable !== false && versionValid && (source.resolved === true || source.cloneRequired === true)
        : false)
    let blockedReason = null
    if (!record) {
      if (!entry) {
        blockedReason = '市场里没有该插件条目'
      } else if (!versionValid) {
        blockedReason = `版本号不合法（需 x.y.z 三段），当前安装器不接受：${version}`
      } else if (entry.installable === false) {
        blockedReason = nonEmptyString(entry.warning) || '来源类型无法安装'
      } else if (source.resolved !== true && source.cloneRequired !== true) {
        blockedReason = source.reason || '来源无法解析，暂时不能安装'
      }
    }
    const counts = {
      skills: capabilities?.skills.length ?? 0,
      commands: capabilities?.commands.length ?? 0,
      hooks: capabilities?.hooks.length ?? 0,
      mcpServers: capabilities?.mcpServers.length ?? 0,
    }
    return {
      key,
      name,
      version,
      versionValid,
      format,
      market: market ?? null,
      entry: entry ?? null,
      record: record ?? null,
      installed,
      orphan,
      update,
      source,
      manifest,
      capabilities,
      hooksSource,
      mcpSource,
      counts,
      installable,
      blockedReason,
      warnings: [...new Set(warnings)].slice(0, 20),
    }
  }

  /** 添加市场（可能自动识别来源类型）。 */
  marketAdd(input = {}) {
    return this.runOperation('market-add', { key: null, marketId: null, clientOpId: input.clientOpId }, () => (
      this.store.withLockAsync(async () => {
        const market = await this.markets.add({
          type: input.type,
          location: input.location,
          name: input.name,
          format: input.format,
        })
        return market
      })
    ))
  }

  /** 刷新一个或全部市场；失败进 failures（单 id 失败也不再整体 400）。 */
  marketRefresh(marketId) {
    const id = nonEmptyString(marketId)
    return this.runOperation('market-refresh', { marketId: id || null }, () => (
      this.store.withLockAsync(async () => {
        if (id !== '') {
          if (!this.markets.get(id)) throw hubError(`市场不存在：${id}`, 'not_found')
          try {
            return { refreshed: [await this.markets.refresh(id)], failures: [] }
          } catch (error) {
            return { refreshed: [], failures: [{ id, error: messageOf(error), code: asHubError(error).code }] }
          }
        }
        const results = await this.markets.refreshAll()
        const failures = []
        const refreshed = []
        for (const item of results) {
          if (item.ok) {
            const market = this.markets.get(item.id)
            if (market) refreshed.push(market)
            continue
          }
          failures.push({ id: item.id, error: item.error, code: asHubError(new Error(item.error ?? '刷新失败')).code })
        }
        return { refreshed, failures }
      })
    ))
  }

  /**
   * 移除市场；允许保留已安装插件并返回将被孤立的插件名（对齐 ZCODE ADR-0003）。
   *
   * 返回值同时摊平市场字段（`id/name`）以保持 CLI 文案兼容。
   */
  marketRemove(marketId) {
    const id = nonEmptyString(marketId)
    return this.runOperation('market-remove', { marketId: id }, () => (
      this.store.withLock(() => {
        if (id === '') throw hubError('请提供市场 id', 'bad_request')
        if (!this.markets.get(id)) throw hubError(`市场不存在：${id}`, 'not_found')
        const orphaned = (this.state.plugins ?? [])
          .filter((plugin) => plugin.market === id)
          .map((plugin) => plugin.name)
        const removed = this.markets.remove(id)
        return { ...removed, market: removed, orphaned }
      })
    ))
  }

  /** 安装插件。 */
  install(input = {}) {
    const name = nonEmptyString(input.name)
    const marketId = nonEmptyString(input.market)
    return this.runOperation('install', {
      key: marketId && name ? Installer.keyFor(marketId, name) : null,
      marketId: marketId || null,
      clientOpId: input.clientOpId,
    }, () => (
      this.store.withLockAsync(async () => {
        const { market, plugin } = this.findMarketEntry(name, marketId || undefined)
        if (input.refresh !== false) await this.markets.refresh(market.id)
        const refreshed = this.markets.get(market.id)
        if (!refreshed) throw hubError(`市场 ${market.id} 刷新后不存在`, 'market_unavailable')
        const result = this.installer.install(this.state, {
          marketId: refreshed.id,
          pluginName: plugin.name,
          force: input.force === true,
        })
        this.store.saveState(this.state)
        this.syncRuntimes()
        return result
      })
    ))
  }

  /** 卸载插件。 */
  uninstall(keyOrName) {
    return this.runOperation('uninstall', { key: this.keyOf(keyOrName) }, () => (
      this.store.withLock(() => {
        const record = this.installer.uninstall(this.state, keyOrName)
        this.store.saveState(this.state)
        this.syncRuntimes()
        return record
      })
    ))
  }

  /** 启用/禁用插件。 */
  setEnabled(keyOrName, enabled) {
    return this.runOperation('enable', { key: this.keyOf(keyOrName) }, () => (
      this.store.withLock(() => {
        const record = this.installer.setEnabled(this.state, keyOrName, enabled)
        this.store.saveState(this.state)
        this.syncRuntimes()
        return record
      })
    ))
  }

  /** 启用/禁用插件里的单项能力（技能、命令、hooks 事件、MCP server 清单）。 */
  setCapabilityEnabled(keyOrName, kind, name, enabled) {
    if (!CAPABILITY_KINDS.includes(kind)) {
      throw hubError(`未知能力种类：${String(kind)}（可选 ${CAPABILITY_KINDS.join(' / ')}）`, 'bad_request')
    }
    const capability = nonEmptyString(name)
    if (capability === '') throw hubError('请提供能力名称', 'bad_request')
    return this.runOperation('capability', { key: this.keyOf(keyOrName) }, () => (
      this.store.withLock(() => {
        const record = this.findRecord(keyOrName)
        if (!record.disabledCapabilities) record.disabledCapabilities = normalizeDisabledCapabilities()
        const normalized = normalizeDisabledCapabilities(record.disabledCapabilities)
        record.disabledCapabilities = normalized
        const list = normalized[kind]
        const index = list.indexOf(capability)
        if (enabled === true && index >= 0) list.splice(index, 1)
        if (enabled !== true && index < 0) list.push(capability)
        this.store.saveState(this.state)
        this.syncRuntimes()
        this.store.log('info', `${enabled === true ? '启用' : '禁用'} ${record.key} 的能力 ${kind}:${capability}`)
        return record
      })
    ))
  }

  /**
   * 更新插件到市场最新版本。
   *
   * @param {string} keyOrName
   * @param {boolean} [force]
   * @param {{refresh?: boolean, clientOpId?: string}} [options] - refresh:false 复用刚刷新过的市场。
   */
  update(keyOrName, force = false, options = {}) {
    return this.runOperation('update', { key: this.keyOf(keyOrName), clientOpId: options.clientOpId }, () => (
      this.store.withLockAsync(async () => {
        let previousVersion = null
        try {
          previousVersion = this.findRecord(keyOrName).version
        } catch {
          previousVersion = null
        }
        const result = await this.installer.update(this.state, keyOrName, {
          force,
          refresh: options.refresh !== false,
        })
        if (result.changed) {
          this.store.saveState(this.state)
          this.syncRuntimes()
        }
        return { ...result, previousVersion: result.changed ? previousVersion : null }
      })
    ))
  }

  /**
   * 全部更新：按市场去重刷新一次 → 串行更新所有声明级「可更新」插件 → 一次 save/sync。
   *
   * 单个插件失败不中断；孤立插件（来源市场已移除）不进入候选。
   *
   * @param {{force?: boolean, keys?: string[], clientOpId?: string}} [options]
   * @returns {Promise<{succeeded: object[], failed: object[], aborted: boolean, marketFailures: object[], summary: object, message: string}>}
   */
  updateAll(options = {}) {
    return this.runOperation('update-all', { clientOpId: options.clientOpId }, () => (
      this.store.withLockAsync(async () => {
        const force = options.force === true
        const onlyKeys = Array.isArray(options.keys) && options.keys.length > 0
          ? new Set(options.keys.map((item) => String(item)))
          : null
        const records = (this.state.plugins ?? [])
          .filter((record) => onlyKeys === null || onlyKeys.has(record.key))
        const marketIds = [...new Set(
          records
            .map((record) => record.market)
            .filter((id) => id !== '' && this.markets.get(id) !== null),
        )]
        const marketFailures = []
        for (const id of marketIds) {
          try {
            await this.markets.refresh(id)
          } catch (error) {
            marketFailures.push({ id, error: messageOf(error), code: asHubError(error).code })
          }
        }
        const succeeded = []
        const failed = []
        let skipped = 0
        let changed = false
        for (const record of records) {
          const current = (this.state.plugins ?? []).find((plugin) => plugin.key === record.key) ?? record
          const market = current.market === '' ? null : this.markets.get(current.market)
          if (market === null) {
            skipped += 1
            continue
          }
          const entry = (market.plugins ?? []).find((plugin) => plugin.name === current.name) ?? null
          if (entry === null || declaredUpdateState(current.version, entry.version) !== 'available') {
            skipped += 1
            continue
          }
          try {
            const result = await this.installer.update(this.state, current.key, { force, refresh: false })
            if (result.changed) {
              changed = true
              succeeded.push({
                key: current.key,
                changed: true,
                message: result.message,
                version: result.record?.version ?? null,
              })
            } else {
              skipped += 1
            }
          } catch (error) {
            failed.push({ key: current.key, error: messageOf(error), code: asHubError(error).code })
          }
        }
        if (changed) {
          this.store.saveState(this.state)
          this.syncRuntimes()
        }
        const summary = {
          total: records.length,
          updated: succeeded.length,
          skipped,
          failed: failed.length,
          markets: marketIds.length,
        }
        return {
          succeeded,
          failed,
          aborted: false,
          marketFailures,
          summary,
          message: `全部更新完成：更新 ${summary.updated} 个，跳过 ${skipped} 个，失败 ${failed.length} 个`,
        }
      })
    ))
  }

  /** 回滚插件（targetVersion 省略时回滚到最新可用历史版本）。 */
  rollback(keyOrName, targetVersion) {
    return this.runOperation('rollback', { key: this.keyOf(keyOrName) }, () => (
      this.store.withLock(() => {
        const result = this.installer.rollback(this.state, keyOrName, targetVersion)
        this.store.saveState(this.state)
        this.syncRuntimes()
        return result
      })
    ))
  }

  /** 从 key / 插件名推导 key（仅完整 key 才返回字符串）。 */
  keyOf(keyOrName) {
    const value = nonEmptyString(keyOrName)
    return value.includes('/') ? value : null
  }

  /** 某个格式的定义（排查用）。 */
  formatOf(id) {
    return findFormat(id) ?? null
  }

  /** 卸载：注销技能 provider、插件命令与 hooks 监听。 */
  dispose() {
    try {
      this.skills?.dispose()
    } catch {
      /* 忽略 */
    }
    try {
      this.pluginCommands?.clear()
    } catch {
      /* 忽略 */
    }
    try {
      this.hooks?.dispose()
    } catch {
      /* 忽略 */
    }
    this.started = false
  }
}