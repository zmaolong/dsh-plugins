/**
 * Hub orchestration: home resolution, storage migration, state self-repair,
 * market/installer/capability runtime assembly, and operations.
 *
 * Home resolution order: config.home → DSH_AGENT_PLUGIN_HUB_HOME → ~/.dsh/agent-plugin-hub
 *
 * Design points:
 * - start() runs the migrate.ts schema migration before reading
 *   state/marketplaces; a migration failure only records migrationError
 *   (returned with /store) and never blocks the reads;
 * - Every write goes through runOperation for in-process single-writer mutual
 *   exclusion; busy throws code='operation_in_progress'. Reads
 *   (snapshot/describe with fetch:false) take no lock;
 * - describePlugin unifies the "installed / not installed" detail data
 *   resolution; whether a missing entry touches the network is fetch's call.
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
  type CapabilityKind,
} from './capabilities.ts'
import { FORMATS, findFormat, isSafePluginName } from './formats.ts'
import { HOOK_EVENT_MAP, HookRuntime } from './hooks.ts'
import { Installer, type UpdateResult } from './installer.ts'
import { mcpAvailability, type McpAvailability } from './mcp.ts'
import { detectPluginManifest, validatePluginManifest } from './manifest.ts'
import { MarketManager } from './market.ts'
import { runMigrations } from './migrate.ts'
import { PluginCommandRuntime } from './plugin-commands.ts'
import { SkillRuntime, type SkillStats } from './skills.ts'
import { HubStore, type PluginRecord, type StateFile } from './store.ts'
import { classifyUpdate, isInstallableVersion } from './version.ts'
import type { PluginManifestInfo } from './manifest.ts'
import type { HostContext } from './host.ts'
import type { HookStats } from './hooks.ts'
import type { PluginCommandStats } from './plugin-commands.ts'

const PACKAGE = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { version: string }

export const HUB_NAME = 'dsh-agent-plugin-hub'
export const HUB_VERSION = PACKAGE.version

/** Stable hub error codes (the UI branches on these). */
export type HubErrorCode =
  | 'bad_request'
  | 'forbidden'
  | 'not_found'
  | 'method_not_allowed'
  | 'conflict'
  | 'market_exists'
  | 'operation_in_progress'
  | 'market_unavailable'
  | 'source_unavailable'
  | 'version_invalid'
  | 'network_error'
  | 'git_error'
  | 'internal'

/** Error code → HTTP status (ui-routes consumes this directly). */
export const STATUS_BY_CODE: Readonly<Record<HubErrorCode, number>> = Object.freeze({
  bad_request: 400,
  forbidden: 403,
  not_found: 404,
  method_not_allowed: 405,
  conflict: 409,
  market_exists: 409,
  operation_in_progress: 409,
  market_unavailable: 409,
  source_unavailable: 409,
  version_invalid: 422,
  network_error: 502,
  git_error: 502,
  internal: 500,
})

/** One in-flight operation (single-writer mutual exclusion). */
export interface HubOperation {
  id: string
  kind: string
  key: string | null
  marketId: string | null
  startedAt: string
  clientOpId: string | null
}

/**
 * A hub error carrying a machine-readable code.
 *
 * Every throw site names its code explicitly; `asHubError` maps a plain Error
 * from lower layers to `internal`.
 */
export class HubError extends Error {
  /** Stable error code for UI branching. */
  readonly code: HubErrorCode
  /** Suggested HTTP status. */
  readonly status: number
  /** The active operation when code is operation_in_progress. */
  readonly operation?: HubOperation

  constructor(message: string, options: { code?: HubErrorCode, status?: number, operation?: HubOperation } = {}) {
    super(message)
    this.name = 'HubError'
    this.code = options.code ?? 'bad_request'
    this.status = options.status ?? STATUS_BY_CODE[this.code] ?? 400
    if (options.operation) this.operation = options.operation
  }
}

/** HubError shortcut. */
export function hubError(
  message: string,
  code: HubErrorCode = 'bad_request',
  extra: { operation?: HubOperation } = {},
): HubError {
  return new HubError(message, { code, ...extra })
}

/** Normalize any thrown value into a HubError (keeping an existing code/status). */
export function asHubError(error: unknown): HubError {
  if (error instanceof HubError) return error
  const message = error instanceof Error ? error.message : String(error)
  return hubError(message, 'internal')
}

/** Readable message of any thrown value. */
function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function nonEmptyString(value: unknown): string {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : ''
}

/** Loose author normalization: string → {name}, object → {name,email,url}; absent fields stay null. Reused by ui-data. */
export function normalizeAuthor(value: unknown): { name: string, email: string | null, url: string | null } | null {
  if (typeof value === 'string') {
    const name = value.trim()
    return name === '' ? null : { name, email: null, url: null }
  }
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null
  const record = value as Record<string, unknown>
  const name = nonEmptyString(record.name)
  if (name === '') return null
  return {
    name,
    email: nonEmptyString(record.email) || null,
    url: nonEmptyString(record.url) || null,
  }
}

/** Readable label of a marketplace entry source. */
export function sourceLabel(source: unknown): string {
  if (!source || typeof source !== 'object') return ''
  const record = source as Record<string, unknown>
  switch (record.kind) {
    case 'local':
      return String(record.raw ?? '')
    case 'github':
      return [String(record.repo ?? ''), typeof record.path === 'string' && record.path !== '' ? `#${record.path}` : ''].filter(Boolean).join('')
    case 'git':
      return [String(record.url ?? ''), typeof record.path === 'string' && record.path !== '' ? `#${record.path}` : ''].filter(Boolean).join('')
    case 'npm':
      return typeof record.package === 'string' ? record.package : 'npm'
    default:
      return typeof record.raw === 'string' ? record.raw : String(record.kind ?? '')
  }
}

/** Declared-level update classification: a missing or incomparable version stays unknown. */
function declaredUpdateState(currentVersion: unknown, latestVersion: unknown): 'available' | 'current' | 'installed-newer' | 'unknown' {
  const latest = nonEmptyString(latestVersion)
  if (latest === '') return 'unknown'
  const state = classifyUpdate(nonEmptyString(currentVersion), latest)
  return state
}

/** Update information of an installed plugin (declared-level: entry version vs install record version). */
export interface UpdateInfo {
  state: 'available' | 'current' | 'installed-newer' | 'unknown' | 'none'
  currentVersion: string | null
  latestVersion: string | null
  checkedBy: 'declared' | 'none'
  reason: string | null
}

export function buildUpdateInfo(input: {
  currentVersion?: string | null | undefined
  latestVersion?: string | null | undefined
  orphan?: boolean | undefined
} = {}): UpdateInfo {
  const current = nonEmptyString(input.currentVersion) || null
  const latest = nonEmptyString(input.latestVersion) || null
  if (input.orphan === true) {
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

/** Manifest summary for describe (no bodies). */
function pickManifest(meta: PluginManifestInfo, raw: unknown): {
  name: string
  version: string
  description: string
  author: ReturnType<typeof normalizeAuthor>
  homepage: string | null
  repository: string | null
  license: string | null
  keywords: string[]
  category: string | null
  icon: string | null
  rawKeys: string[]
} {
  return {
    name: meta.name,
    version: meta.version,
    description: meta.description ?? '',
    author: normalizeAuthor(meta.author),
    homepage: nonEmptyString(meta.homepage) || null,
    repository: nonEmptyString(meta.repository) || null,
    license: nonEmptyString(meta.license) || null,
    keywords: Array.isArray(meta.keywords) ? meta.keywords.filter((item): item is string => typeof item === 'string') : [],
    category: nonEmptyString(meta.category) || null,
    icon: meta.icon ?? null,
    rawKeys: raw !== null && typeof raw === 'object' && !Array.isArray(raw) ? Object.keys(raw) : [],
  }
}

/** Describe-level hooks row. */
export interface DescribeHook {
  event: string
  host: string | null
  mode: string
  canBlock: boolean
  entries: number
  enabled: boolean
  effective: boolean
  reason: string
}

/** Describe-level MCP row. */
export interface DescribeMcpServer {
  name: string
  transport: string
  command: string
  args: string[]
  url: string
  enabled: boolean
  effective: false
  reason: string
}

/** Input for shapeCapabilities. */
interface ShapeCapabilitiesInput {
  hub: AgentPluginHub
  root: string
  formatId: string
  manifest: Record<string, unknown>
  record: PluginRecord | null
  pluginName: string
}

/**
 * Scan one plugin directory and shape it into describe capability sections
 * (skill/command bodies stripped).
 */
function shapeCapabilities({ hub, root, formatId, manifest, record, pluginName }: ShapeCapabilitiesInput): {
  skills: Array<{ name: string, description: string, whenToUse: string, enabled: boolean }>
  commands: Array<{ name: string, rawName: string, hostName: string, description: string, argumentHint: string, enabled: boolean }>
  hooks: DescribeHook[]
  mcpServers: DescribeMcpServer[]
  hooksSource: string
  mcpSource: string
  warnings: string[]
} {
  const warnings: string[] = []
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
  const hookStats: HookStats = hub.hooks?.stats() ?? { attached: false, reason: 'hooks 运行时未装配', events: [], enabled: false, counters: {}, recent: [] }
  const hooks: DescribeHook[] = Object.keys(hooksParsed.events).map((event) => {
    const groups = hooksParsed.events[event] ?? []
    const mapping = HOOK_EVENT_MAP[event]
    const enabled = record ? !isCapabilityDisabled(record, 'hooks', event) : true
    const hostStat = (hookStats.events ?? []).find(item => item.event === event) ?? null
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
  const mcpServers: DescribeMcpServer[] = mcpRead.servers.map(server => ({
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
    skills: skillsScan.skills.map(skill => ({
      name: skill.name,
      description: skill.description ?? '',
      whenToUse: skill.whenToUse ?? '',
      enabled: record ? !isCapabilityDisabled(record, 'skills', skill.name) : true,
    })),
    commands: commandsScan.commands.map(command => ({
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

/** Expand `~` / `~/` in a config value; everything else goes to path.resolve verbatim. */
function expandHome(value: string): string {
  if (value === '~') return os.homedir()
  if (value.startsWith('~/') || value.startsWith('\\~\\') || value.startsWith('~\\')) {
    return path.join(os.homedir(), value.slice(2))
  }
  return value
}

/** Resolved describe target. */
interface PluginTarget {
  key: string
  name: string
  market: import('./store.ts').MarketRecord | null
  entry: import('./store.ts').StoredEntry | null
  record: PluginRecord | null
}

/** Resolved source facts in describe output. */
export interface DescribeSource {
  kind: string
  label: string
  resolved: boolean
  cloneRequired: boolean
  reason: string | null
}

/** Full describe payload (see HOST-API.md GET/POST /describe). */
export interface DescribeResult {
  key: string
  name: string
  version: string
  versionValid: boolean
  format: string
  market: import('./store.ts').MarketRecord | null
  entry: import('./store.ts').StoredEntry | null
  record: PluginRecord | null
  installed: { installed: boolean, key: string | null, version: string | null, enabled: boolean | null }
  orphan: boolean
  update: UpdateInfo
  source: DescribeSource
  manifest: ReturnType<typeof pickManifest> | null
  capabilities: {
    skills: Array<{ name: string, description: string, whenToUse: string, enabled: boolean }>
    commands: Array<{ name: string, rawName: string, hostName: string, description: string, argumentHint: string, enabled: boolean }>
    hooks: DescribeHook[]
    mcpServers: DescribeMcpServer[]
  } | null
  hooksSource: string
  mcpSource: string
  counts: { skills: number, commands: number, hooks: number, mcpServers: number }
  installable: boolean
  blockedReason: string | null
  warnings: string[]
}

/** Options for AgentPluginHub construction. */
export interface AgentPluginHubOptions {
  home?: string
  ctx?: HostContext | null
  config?: import('./host.ts').HubConfig
  hookExecutor?: import('./hooks.ts').SubprocessExecutor | null
}

/** The hub orchestration instance. */
export class AgentPluginHub {
  readonly home: string
  readonly formats: typeof FORMATS
  readonly ctx: HostContext | null
  readonly config: import('./host.ts').HubConfig
  readonly hookExecutor: import('./hooks.ts').SubprocessExecutor | null
  readonly store: HubStore
  readonly markets: MarketManager
  readonly installer: Installer
  state: StateFile
  warnings: string[]
  started = false
  /** Storage schema migration result; null when nothing migrated. */
  migration: { migrated: boolean, from: number | null, to: number | null, backup: string | null } | null = null
  /** Migration failure reason (returned with /store; readable Chinese). */
  migrationError: string | null = null
  /** HTTP route state of the plugin-page Web UI, filled by index.js after mount. */
  uiRoutes: { active: boolean, reason: string, path?: string } = { active: false, reason: '未挂载' }
  skills: SkillRuntime | null = null
  pluginCommands: PluginCommandRuntime | null = null
  hooks: HookRuntime | null = null
  private operation: HubOperation | null = null
  private operationSeq = 0

  constructor(options: AgentPluginHubOptions = {}) {
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
    this.markets = new MarketManager({ store: this.store, log: (level, message) => this.log(level, message) })
    this.installer = new Installer({ store: this.store, markets: this.markets, log: (level, message) => this.log(level, message) })
    this.state = { schemaVersion: 2, updatedAt: '', plugins: [] }
    this.warnings = []
  }

  /** All storage paths. */
  get paths(): HubStore['paths'] {
    return this.store.paths
  }

  /** Whether a write operation is in flight. */
  get busy(): boolean {
    return this.operation !== null
  }

  /** The active operations list (the /store `operations` field). */
  operationsList(): HubOperation[] {
    return this.operation === null ? [] : [{ ...this.operation }]
  }

  /** Double-write one diagnostic line: ctx.logger (prefixed) + the on-disk hub.log. */
  log(level: 'info' | 'warn' | 'error', message: string): void {
    this.store.log(level, message)
    const logger = this.ctx?.logger
    const line = `dsh-agent-plugin-hub: ${message}`
    if (level === 'error') logger?.error(line)
    else if (level === 'warn') logger?.warn(line)
    else logger?.info(line)
  }

  listFormats(): Array<{ id: string, label: string, pluginManifests: string[], marketplaceFiles: string[] }> {
    return this.formats.map(format => ({
      id: format.id,
      label: format.label,
      pluginManifests: [...format.pluginManifests],
      marketplaceFiles: [...format.marketplaceFiles],
    }))
  }

  /** Start: migrate storage → read state and self-repair → assemble runtimes. Never throws; failures land in warnings. */
  start(): this {
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
      const getEnabledPlugins = (): PluginRecord[] => this.getEnabledPlugins()
      const log = (level: 'info' | 'warn' | 'error', message: string): void => this.log(level, message)
      this.skills = new SkillRuntime({ getEnabledPlugins, log })
      this.pluginCommands = new PluginCommandRuntime({ getEnabledPlugins, log })
      this.hooks = new HookRuntime({
        getEnabledPlugins,
        config: this.config,
        log,
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
      this.log('info', `hub 启动完成：home=${this.home}，插件 ${this.state.plugins.length} 个，市场 ${this.markets.list().length} 个`)
    } catch (error) {
      const message = messageOf(error)
      this.warnings.push(`hub 启动异常：${message}`)
      this.store.log('error', `hub 启动异常：${message}`)
    }
    return this
  }

  /** Run the schema migration once; a failure only records migrationError (reads keep working). */
  runMigrationsOnce(): typeof this.migration {
    try {
      const result = runMigrations(this.store)
      this.migration = {
        migrated: result.migrated === true,
        from: Number.isInteger(result.from) ? result.from : null,
        to: Number.isInteger(result.to) ? result.to : null,
        backup: typeof result.backup === 'string' && result.backup !== '' ? result.backup : null,
      }
      if (this.migration?.migrated === true) {
        this.warnings.push(`存储 schema 已迁移：v${String(this.migration.from)} → v${String(this.migration.to)}（备份：${this.migration.backup ?? '无'}）`)
        this.log('info', `存储 schema 已迁移：v${String(this.migration.from)} → v${String(this.migration.to)}`)
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
   * Run one operation under single-writer mutual exclusion (sync or async fn).
   *
   * Busy throws a HubError with code='operation_in_progress'; the operation
   * leaves the list when done.
   *
   * @param kind - operation kind (market-add / install / update / update-all / describe …).
   * @param meta - operation metadata for the operations list.
   * @param fn - the operation body.
   */
  runOperation<T>(kind: string, meta: { key?: string | null, marketId?: string | null, clientOpId?: string | null } = {}, fn: () => T): T {
    const operation = this.beginOperation(kind, meta)
    let result: T
    try {
      result = fn()
    } catch (error) {
      this.endOperation(operation)
      throw asHubError(error)
    }
    if (result !== null && typeof result === 'object' && typeof (result as { then?: unknown }).then === 'function') {
      return (result as unknown as Promise<T>).then(
        (value) => {
          this.endOperation(operation)
          return value
        },
        (error: unknown) => {
          this.endOperation(operation)
          throw asHubError(error)
        },
      ) as T
    }
    this.endOperation(operation)
    return result
  }

  /** Begin an operation; busy throws operation_in_progress. */
  beginOperation(
    kind: string,
    meta: { key?: string | null, marketId?: string | null, clientOpId?: string | null } = {},
  ): HubOperation {
    if (this.operation !== null) {
      const active = this.operation
      throw hubError(
        `另一个操作正在进行（${active.kind}），请稍候重试`,
        'operation_in_progress',
        { operation: active },
      )
    }
    this.operationSeq += 1
    const operation: HubOperation = {
      id: `op-${Date.now().toString(36)}-${this.operationSeq.toString(36)}`,
      kind,
      key: nonEmptyString(meta.key) || null,
      marketId: nonEmptyString(meta.marketId) || null,
      startedAt: new Date().toISOString(),
      clientOpId: nonEmptyString(meta.clientOpId) || null,
    }
    this.operation = operation
    return operation
  }

  /** End an operation. */
  endOperation(operation: HubOperation): void {
    if (this.operation === operation) this.operation = null
  }

  /** Currently enabled plugin records. */
  getEnabledPlugins(): PluginRecord[] {
    return (this.state.plugins ?? []).filter(plugin => plugin.enabled && existsSync(plugin.installedPath))
  }

  /** Re-scan the capability summary of every installed plugin; optionally invalidate the skill catalog immediately. */
  refreshCapabilities(options: { save?: boolean } = {}): string[] {
    const warnings: string[] = []
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
        warnings.push(...scan.warnings.map(item => `${record.name}: ${item}`))
      } catch (error) {
        warnings.push(`${record.name}: 能力扫描失败：${messageOf(error)}`)
      }
    }
    this.warnings.push(...warnings)
    if (options.save === true) this.store.saveState(this.state)
    this.syncRuntimes()
    return warnings
  }

  /** After capability changes: invalidate the skill catalog, rebuild plugin commands, refresh the hooks view. */
  syncRuntimes(): void {
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

  /** State snapshot for the `/agent-plugin` command (cache included). */
  snapshot(): {
    name: string
    version: string
    home: string
    started: boolean
    formats: string[]
    plugins: { total: number, enabled: number }
    markets: { total: number, errors: Array<{ id: string, error: string }>, plugins: number }
    skills: SkillStats
    commands: PluginCommandStats
    hooks: HookStats
    mcp: McpAvailability
    ui: { active: boolean, reason: string, path?: string }
    busy: boolean
    operations: HubOperation[]
    migrationError: string | null
    cache: { plugins: number, bytes: number }
    warnings: string[]
  } {
    const plugins = this.state.plugins ?? []
    const markets = this.markets.list()
    return {
      name: HUB_NAME,
      version: HUB_VERSION,
      home: this.home,
      started: this.started,
      formats: this.formats.map(format => format.id),
      plugins: {
        total: plugins.length,
        enabled: plugins.filter(plugin => plugin.enabled).length,
      },
      markets: {
        total: markets.length,
        errors: markets.filter(market => market.refreshError).map(market => ({ id: market.id, error: market.refreshError ?? '' })),
        plugins: markets.reduce((sum, market) => sum + (market.plugins?.length ?? 0), 0),
      },
      skills: this.skills?.stats() ?? { registered: false, reason: '', skills: 0, providers: 0, warnings: [] },
      commands: this.pluginCommands?.stats() ?? { available: false, reason: '', registered: [], conflicts: [] },
      hooks: this.hooks?.stats() ?? { attached: false, enabled: true, reason: '', events: [], counters: {}, recent: [] },
      mcp: mcpAvailability(this.ctx),
      ui: { ...this.uiRoutes },
      busy: this.busy,
      operations: this.operationsList(),
      migrationError: this.migrationError,
      cache: this.installer.cacheStats(this.state),
      warnings: this.warnings.slice(-20),
    }
  }

  /** Find a record by key / unique plugin name. */
  findRecord(keyOrName: string): PluginRecord {
    return this.installer.findRecord(this.state, keyOrName)
  }

  /** Find one plugin entry across all markets. */
  findMarketEntry(pluginName: string, marketId?: string): { market: import('./store.ts').MarketRecord, plugin: import('./store.ts').StoredEntry } {
    if (marketId) {
      const market = this.markets.get(marketId)
      if (!market) throw hubError(`市场不存在：${marketId}（用 /agent-plugin market list 查看）`, 'not_found')
      const plugin = (market.plugins ?? []).find(item => item.name === pluginName)
      if (!plugin) throw hubError(`市场 ${marketId} 里没有插件 ${pluginName}，请先 /agent-plugin market refresh ${marketId}`, 'not_found')
      return { market, plugin }
    }
    const matches: Array<{ market: import('./store.ts').MarketRecord, plugin: import('./store.ts').StoredEntry }> = []
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
        `插件 ${pluginName} 出现在多个市场：${matches.map(item => item.market.id).join('、')}；`
        + `请指定市场：/agent-plugin install <marketId> ${pluginName}`,
        'conflict',
      )
    }
    return matches[0] as { market: import('./store.ts').MarketRecord, plugin: import('./store.ts').StoredEntry }
  }

  /**
   * Resolve the describe / icon target: the installed record wins, then the
   * market entry.
   *
   * @param input - key / market / name selectors.
   * @param settings - fetch-allowed flows may tolerate a missing entry.
   */
  resolvePluginTarget(
    input: { key?: string, market?: string, name?: string } = {},
    settings: { allowMissingEntry?: boolean } = {},
  ): PluginTarget {
    const keyText = nonEmptyString(input.key)
    const marketId = nonEmptyString(input.market)
    const nameText = nonEmptyString(input.name)
    const allowMissingEntry = settings.allowMissingEntry === true
    const findEntry = (market: import('./store.ts').MarketRecord | null, name: string): import('./store.ts').StoredEntry | null =>
      (market?.plugins ?? []).find(plugin => plugin.name === name) ?? null
    if (keyText.includes('/')) {
      const slash = keyText.indexOf('/')
      const keyMarket = keyText.slice(0, slash)
      const keyName = keyText.slice(slash + 1)
      if (!isSafePluginName(keyName)) throw hubError(`插件 key 不合法：${keyText}`, 'bad_request')
      const record = (this.state.plugins ?? []).find(plugin => plugin.key === keyText) ?? null
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
      const record = (this.state.plugins ?? []).find(plugin => plugin.key === expectedKey) ?? null
      const market = this.markets.get(marketId)
      if (!record && !market) throw hubError(`市场不存在：${marketId}`, 'not_found')
      const entry = findEntry(market, name)
      if (!record && !entry && !allowMissingEntry) {
        throw hubError(`市场 ${marketId} 里没有插件 ${name}，请先刷新市场`, 'not_found')
      }
      return { key: expectedKey, name: record?.name ?? name, market, entry, record }
    }
    if (name === '') throw hubError('请提供插件 key 或 name', 'bad_request')
    const candidates = new Map<string, { record: PluginRecord | null, market: import('./store.ts').MarketRecord | null, entry: import('./store.ts').StoredEntry | null }>()
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
    const [key, target] = [...candidates.entries()][0] as [string, NonNullable<ReturnType<typeof candidates.get>>]
    return { key, name: target.record?.name ?? name, market: target.market, entry: target.entry, record: target.record }
  }

  /**
   * Unified detail data (installed reads the install directory; missing
   * entries resolve their source directory).
   *
   * Only `fetch:true` may touch the network: refresh the owning market first,
   * then allow git clones. The default is zero-network.
   */
  async describePlugin(options: { key?: string, market?: string, name?: string, fetch?: boolean } = {}): Promise<DescribeResult> {
    const fetchAllowed = options.fetch === true
    const keyText = nonEmptyString(options.key)
    const marketId = nonEmptyString(options.market)
    const nameText = nonEmptyString(options.name)
    const resolve = (): PluginTarget => this.resolvePluginTarget(
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
        const warnings: string[] = []
        let target = resolve()
        if (!target.record && target.market) {
          try {
            await this.markets.refresh(target.market.id)
            const market = this.markets.get(target.market.id) ?? target.market
            const entry = (market.plugins ?? []).find(plugin => plugin.name === target.name) ?? null
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

  /** Collect describe data for a resolved target. */
  async collectDescribe(
    target: PluginTarget,
    context: { allowClone: boolean, warnings: string[] },
  ): Promise<DescribeResult> {
    const { key, name, market, entry, record } = target
    const warnings = [...context.warnings]
    const formatHint = market?.format ?? record?.format ?? 'claude'
    const installed = record
      ? { installed: true, key: record.key, version: record.version, enabled: record.enabled !== false }
      : { installed: false, key: null, version: null, enabled: null }
    let root: string | null = null
    let source: DescribeSource
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
      if (!exists && source.reason) warnings.push(source.reason)
    } else if (entry && market) {
      let resolution: import('./market.ts').ResolvedSourceRoot | { resolved: false, path: null, cloneRequired: false, reason: string } | null = null
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
      if (source.reason) warnings.push(source.reason)
    }
    let manifest: ReturnType<typeof pickManifest> | null = null
    let capabilities: DescribeResult['capabilities'] = null
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
    const update: UpdateInfo = record
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
    let blockedReason: string | null = null
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

  /** Add a market (the source type may be auto-detected). */
  marketAdd(input: { type?: string | undefined, location: string, name?: string | undefined, format?: string | undefined, clientOpId?: string | undefined }): Promise<import('./store.ts').MarketRecord> {
    return this.runOperation('market-add', { key: null, marketId: null, clientOpId: input.clientOpId ?? null }, () => (
      this.store.withLockAsync(async () => {
        const market = await this.markets.add({
          ...(input.type !== undefined ? { type: input.type } : {}),
          location: input.location,
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.format !== undefined ? { format: input.format } : {}),
        })
        return market
      })
    ))
  }

  /** Preview a market source without registering it (read-only; git sources use a tmp clone cache). */
  marketPreview(input: { location: string, format?: string | undefined, refresh?: boolean | undefined }): Promise<import('./market.ts').MarketPreview> {
    return this.markets.preview({
      location: input.location,
      ...(input.format !== undefined ? { format: input.format } : {}),
      ...(input.refresh !== undefined ? { refresh: input.refresh } : {}),
    })
  }

  /** Refresh one or all markets; failures land in `failures` (a single id no longer 400s the whole call). */
  marketRefresh(marketId?: string): Promise<{ refreshed: import('./store.ts').MarketRecord[], failures: Array<{ id: string, error: string, code: HubErrorCode }> }> {
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
        const failures: Array<{ id: string, error: string, code: HubErrorCode }> = []
        const refreshed: import('./store.ts').MarketRecord[] = []
        for (const item of results) {
          if (item.ok) {
            const market = this.markets.get(item.id)
            if (market) refreshed.push(market)
            continue
          }
          failures.push({ id: item.id, error: item.error ?? '刷新失败', code: asHubError(new Error(item.error ?? '刷新失败')).code })
        }
        return { refreshed, failures }
      })
    ))
  }

  /**
   * Remove a market; installed plugins may stay and their names return as
   * `orphaned` (aligned with ZCODE ADR-0003).
   */
  marketRemove(marketId: string): import('./store.ts').MarketRecord & { market: import('./store.ts').MarketRecord, orphaned: string[] } {
    const id = nonEmptyString(marketId)
    return this.runOperation('market-remove', { marketId: id }, () => (
      this.store.withLock(() => {
        if (id === '') throw hubError('请提供市场 id', 'bad_request')
        if (!this.markets.get(id)) throw hubError(`市场不存在：${id}`, 'not_found')
        const orphaned = (this.state.plugins ?? [])
          .filter(plugin => plugin.market === id)
          .map(plugin => plugin.name)
        const removed = this.markets.remove(id)
        return { ...removed, market: removed, orphaned }
      })
    ))
  }

  /** Install a plugin. */
  install(input: { market?: string | undefined, name?: string | undefined, force?: boolean | undefined, refresh?: boolean | undefined, clientOpId?: string | undefined }): Promise<ReturnType<Installer['install']>> {
    const name = nonEmptyString(input.name)
    const marketId = nonEmptyString(input.market)
    return this.runOperation('install', {
      key: marketId !== '' && name !== '' ? Installer.keyFor(marketId, name) : null,
      marketId: marketId || null,
      clientOpId: input.clientOpId ?? null,
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

  /** Uninstall a plugin. */
  uninstall(keyOrName: string): PluginRecord {
    return this.runOperation('uninstall', { key: this.keyOf(keyOrName) }, () => (
      this.store.withLock(() => {
        const record = this.installer.uninstall(this.state, keyOrName)
        this.store.saveState(this.state)
        this.syncRuntimes()
        return record
      })
    ))
  }

  /** Enable / disable a plugin. */
  setEnabled(keyOrName: string, enabled: boolean): PluginRecord {
    return this.runOperation('enable', { key: this.keyOf(keyOrName) }, () => (
      this.store.withLock(() => {
        const record = this.installer.setEnabled(this.state, keyOrName, enabled)
        this.store.saveState(this.state)
        this.syncRuntimes()
        return record
      })
    ))
  }

  /** Enable / disable one capability item of a plugin (skill, command, hooks event, MCP server entry). */
  setCapabilityEnabled(keyOrName: string, kind: string, name: string, enabled: boolean): PluginRecord {
    if (!CAPABILITY_KINDS.includes(kind as CapabilityKind)) {
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
        const list = normalized[kind as CapabilityKind]
        const index = list.indexOf(capability)
        if (enabled === true && index >= 0) list.splice(index, 1)
        if (enabled !== true && index < 0) list.push(capability)
        this.store.saveState(this.state)
        this.syncRuntimes()
        this.log('info', `${enabled === true ? '启用' : '禁用'} ${record.key} 的能力 ${kind}:${capability}`)
        return record
      })
    ))
  }

  /**
   * Update one plugin to the market's latest version.
   *
   * @param options - refresh:false reuses a just-refreshed market.
   */
  update(
    keyOrName: string,
    force = false,
    options: { refresh?: boolean, clientOpId?: string | undefined } = {},
  ): Promise<UpdateResult & { previousVersion: string | null }> {
    return this.runOperation('update', { key: this.keyOf(keyOrName), clientOpId: options.clientOpId ?? null }, () => (
      this.store.withLockAsync(async () => {
        let previousVersion: string | null = null
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
   * Update everything: refresh per market once → serially update every
   * declared-level "available" plugin → one save/sync.
   *
   * A single plugin failure never aborts the loop; orphaned plugins (their
   * market was removed) stay out of the candidates.
   */
  updateAll(options: { force?: boolean, keys?: string[], clientOpId?: string | undefined } = {}): Promise<{
    succeeded: Array<{ key: string, changed: true, message: string, version: string | null }>
    failed: Array<{ key: string, error: string, code: HubErrorCode }>
    aborted: boolean
    marketFailures: Array<{ id: string, error: string, code: HubErrorCode }>
    summary: { total: number, updated: number, skipped: number, failed: number, markets: number }
    message: string
  }> {
    return this.runOperation('update-all', { clientOpId: options.clientOpId ?? null }, () => (
      this.store.withLockAsync(async () => {
        const force = options.force === true
        const onlyKeys = Array.isArray(options.keys) && options.keys.length > 0
          ? new Set(options.keys.map(item => String(item)))
          : null
        const records = (this.state.plugins ?? [])
          .filter(record => onlyKeys === null || onlyKeys.has(record.key))
        const marketIds = [...new Set(
          records
            .map(record => record.market)
            .filter((id): id is string => id !== '' && this.markets.get(id) !== null),
        )]
        const marketFailures: Array<{ id: string, error: string, code: HubErrorCode }> = []
        for (const id of marketIds) {
          try {
            await this.markets.refresh(id)
          } catch (error) {
            marketFailures.push({ id, error: messageOf(error), code: asHubError(error).code })
          }
        }
        const succeeded: Array<{ key: string, changed: true, message: string, version: string | null }> = []
        const failed: Array<{ key: string, error: string, code: HubErrorCode }> = []
        let skipped = 0
        let changed = false
        for (const record of records) {
          const current = (this.state.plugins ?? []).find(plugin => plugin.key === record.key) ?? record
          const market = current.market === '' ? null : this.markets.get(current.market)
          if (market === null) {
            skipped += 1
            continue
          }
          const entry = (market.plugins ?? []).find(plugin => plugin.name === current.name) ?? null
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
          aborted: false as const,
          marketFailures,
          summary,
          message: `全部更新完成：更新 ${summary.updated} 个，跳过 ${skipped} 个，失败 ${failed.length} 个`,
        }
      })
    ))
  }

  /** Roll back a plugin (without targetVersion, to the newest usable history version). */
  rollback(keyOrName: string, targetVersion?: string): ReturnType<Installer['rollback']> {
    return this.runOperation('rollback', { key: this.keyOf(keyOrName) }, () => (
      this.store.withLock(() => {
        const result = this.installer.rollback(this.state, keyOrName, targetVersion)
        this.store.saveState(this.state)
        this.syncRuntimes()
        return result
      })
    ))
  }

  /** Derive the key from key / plugin name (only a full key returns a string). */
  keyOf(keyOrName: string): string | null {
    const value = nonEmptyString(keyOrName)
    return value.includes('/') ? value : null
  }

  /** One format's definition (troubleshooting). */
  formatOf(id: string): ReturnType<typeof findFormat> | null {
    return findFormat(id) ?? null
  }

  /** Unload: unregister the skill provider, plugin commands, and hooks listeners. */
  dispose(): void {
    try {
      this.skills?.dispose()
    } catch {
      /* ignored */
    }
    try {
      this.pluginCommands?.clear()
    } catch {
      /* ignored */
    }
    try {
      this.hooks?.dispose()
    } catch {
      /* ignored */
    }
    this.started = false
  }
}
