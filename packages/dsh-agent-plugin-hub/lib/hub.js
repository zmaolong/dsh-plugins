/**
 * Hub 编排层：路径解析、状态自检、市场/安装器/能力运行时装配与运维动作。
 *
 * home 解析顺序：config.home → DSH_AGENT_PLUGIN_HUB_HOME → ~/.dsh/agent-plugin-hub
 *
 * @module dsh-agent-plugin-hub/hub
 */

import { existsSync, readFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { scanCapabilities } from './capabilities.js'
import { FORMATS, findFormat } from './formats.js'
import { HookRuntime } from './hooks.js'
import { Installer } from './installer.js'
import { mcpAvailability } from './mcp.js'
import { detectPluginManifest, validatePluginManifest } from './manifest.js'
import { MarketManager } from './market.js'
import { PluginCommandRuntime } from './plugin-commands.js'
import { SkillRuntime } from './skills.js'
import { HubStore } from './store.js'

const PACKAGE = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))

export const HUB_NAME = 'dsh-agent-plugin-hub'
export const HUB_VERSION = PACKAGE.version

/** 展开配置里的 `~` / `~/`，其余原样交给 path.resolve。 */
function expandHome(value) {
  if (value === '~') return os.homedir()
  if (value.startsWith('~/') || value.startsWith('~\\')) {
    return path.join(os.homedir(), value.slice(2))
  }
  return value
}

export class AgentPluginHub {
  /**
   * @param {{ home?: string, ctx?: object, config?: object }} [options]
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
    this.state = { schemaVersion: 1, plugins: [] }
    this.warnings = []
    this.started = false
    this.skills = null
    this.pluginCommands = null
    this.hooks = null
  }

  /** 全部路径。 */
  get paths() {
    return this.store.paths
  }

  listFormats() {
    return this.formats.map((format) => ({
      id: format.id,
      label: format.label,
      pluginManifests: [...format.pluginManifests],
      marketplaceFiles: [...format.marketplaceFiles],
    }))
  }

  /** 启动：读状态并自检、装配市场与三个能力运行时。失败不抛出，记录原因。 */
  start() {
    this.store.ensureDirs()
    try {
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
      const message = error instanceof Error ? error.message : String(error)
      this.warnings.push(`hub 启动异常：${message}`)
      this.store.log('error', `hub 启动异常：${message}`)
    }
    return this
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
        warnings.push(`${record.name}: 能力扫描失败：${error instanceof Error ? error.message : String(error)}`)
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
      this.store.log('warn', `技能目录失效失败：${error instanceof Error ? error.message : String(error)}`)
    }
    try {
      this.pluginCommands?.sync()
    } catch (error) {
      this.store.log('warn', `重建插件命令失败：${error instanceof Error ? error.message : String(error)}`)
    }
    try {
      this.hooks?.refresh()
    } catch (error) {
      this.store.log('warn', `刷新 hooks 状态失败：${error instanceof Error ? error.message : String(error)}`)
    }
  }

  /** 供 /agent-plugin 使用的状态快照。 */
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
      if (!market) throw new Error(`市场不存在：${marketId}（用 /agent-plugin market list 查看）`)
      const plugin = (market.plugins ?? []).find((item) => item.name === pluginName)
      if (!plugin) throw new Error(`市场 ${marketId} 里没有插件 ${pluginName}，请先 /agent-plugin market refresh ${marketId}`)
      return { market, plugin }
    }
    const matches = []
    for (const market of this.markets.list()) {
      for (const plugin of market.plugins ?? []) {
        if (plugin.name === pluginName) matches.push({ market, plugin })
      }
    }
    if (matches.length === 0) {
      throw new Error(`所有市场里都没有插件 ${pluginName}；用 /agent-plugin market list 查看已添加市场，或先 refresh`)
    }
    if (matches.length > 1) {
      throw new Error(
        `插件 ${pluginName} 出现在多个市场：${matches.map((item) => item.market.id).join('、')}；`
        + `请指定市场：/agent-plugin install <marketId> ${pluginName}`,
      )
    }
    return matches[0]
  }

  /** 添加市场。 */
  async marketAdd(input) {
    return await this.store.withLockAsync(async () => {
      const market = await this.markets.add(input)
      return market
    })
  }

  /** 刷新一个或全部市场。 */
  async marketRefresh(marketId) {
    return await this.store.withLockAsync(async () => {
      if (marketId) return { refreshed: [await this.markets.refresh(marketId)], failures: [] }
      const results = await this.markets.refreshAll()
      return {
        refreshed: results.filter((item) => item.ok).map((item) => this.markets.get(item.id)),
        failures: results.filter((item) => !item.ok),
      }
    })
  }

  /** 移除市场。 */
  marketRemove(marketId) {
    return this.store.withLock(() => {
      const installed = this.state.plugins.filter((plugin) => plugin.market === marketId)
      if (installed.length > 0) {
        throw new Error(`该市场下还有已安装插件（${installed.map((item) => item.name).join('、')}），请先卸载再移除市场`)
      }
      const removed = this.markets.remove(marketId)
      return removed
    })
  }

  /** 安装插件。 */
  async install(input) {
    return await this.store.withLockAsync(async () => {
      const { market, plugin } = this.findMarketEntry(input.name, input.market)
      await this.markets.refresh(market.id)
      const refreshed = this.markets.get(market.id)
      const result = this.installer.install(this.state, {
        marketId: refreshed.id,
        pluginName: plugin.name,
        force: input.force === true,
      })
      this.store.saveState(this.state)
      this.syncRuntimes()
      return result
    })
  }

  /** 卸载插件。 */
  uninstall(name) {
    return this.store.withLock(() => {
      const record = this.installer.uninstall(this.state, name)
      this.store.saveState(this.state)
      this.syncRuntimes()
      return record
    })
  }

  /** 启用/禁用插件。 */
  setEnabled(name, enabled) {
    return this.store.withLock(() => {
      const record = this.installer.setEnabled(this.state, name, enabled)
      this.store.saveState(this.state)
      this.syncRuntimes()
      return record
    })
  }

  /** 更新插件。 */
  async update(name, force = false) {
    return await this.store.withLockAsync(async () => {
      const result = await this.installer.update(this.state, name, { force })
      if (result.changed) {
        this.store.saveState(this.state)
        this.syncRuntimes()
      }
      return result
    })
  }

  /** 回滚插件。 */
  rollback(name) {
    return this.store.withLock(() => {
      const result = this.installer.rollback(this.state, name)
      this.store.saveState(this.state)
      this.syncRuntimes()
      return result
    })
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