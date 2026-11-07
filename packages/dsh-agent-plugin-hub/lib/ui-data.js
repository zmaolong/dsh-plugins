/**
 * 插件页 Web UI 的只读数据整形：把 hub 状态整理成浏览器可直接渲染的 JSON。
 *
 * 文本与结构化数据分离：这里只产出数据，渲染与本地化在 Client 端完成。
 *
 * @module dsh-agent-plugin-hub/ui-data
 */

import {
  CAPABILITY_KINDS,
  isCapabilityDisabled,
  normalizeHooks,
  readHooksConfig,
  readMcpServers,
  scanCommands,
  scanSkills,
} from './capabilities.js'
import { HOOK_EVENT_MAP } from './hooks.js'
import { detectPluginManifest } from './manifest.js'
import { mcpAvailability } from './mcp.js'
import { PluginCommandRuntime } from './plugin-commands.js'

/** 单条已安装插件的摘要（列表用）。 */
function pluginSummary(record) {
  return {
    key: record.key,
    name: record.name,
    version: record.version,
    format: record.format,
    market: record.market,
    enabled: record.enabled,
    installedAt: record.installedAt,
    capabilities: record.capabilities ?? {},
    disabledCapabilities: record.disabledCapabilities ?? {
      skills: [],
      commands: [],
      hooks: [],
      mcpServers: [],
    },
    previousVersions: (record.previousVersions ?? []).map((item) => item.version),
  }
}

/** 市场条目摘要（含可安装插件清单）。 */
function marketSummary(market) {
  return {
    id: market.id,
    name: market.name,
    type: market.type,
    location: market.location,
    format: market.format,
    lastRefreshed: market.lastRefreshed,
    refreshError: market.refreshError ?? '',
    warnings: market.warnings ?? [],
    plugins: (market.plugins ?? []).map((plugin) => ({
      name: plugin.name,
      version: plugin.version ?? '',
      description: plugin.description ?? '',
      installable: plugin.installable !== false,
      warning: plugin.warning ?? '',
      sourceKind: plugin.source?.kind ?? '',
    })),
  }
}

/**
 * 构建插件页整体状态。
 * @param {import('./hub.js').AgentPluginHub} hub
 */
export function buildUiState(hub) {
  const snapshot = hub.snapshot()
  return {
    version: snapshot.version,
    home: snapshot.home,
    started: snapshot.started,
    hooksEnabled: hub.config?.hooks !== false,
    ui: snapshot.ui,
    mcp: snapshot.mcp,
    runtime: {
      skills: snapshot.skills,
      commands: snapshot.commands,
      hooks: {
        attached: snapshot.hooks.attached,
        reason: snapshot.hooks.reason,
        events: snapshot.hooks.events,
      },
    },
    formats: hub.listFormats(),
    markets: hub.markets.list().map(marketSummary),
    plugins: (hub.state.plugins ?? []).map(pluginSummary),
    cache: snapshot.cache,
    warnings: snapshot.warnings,
  }
}

/** hooks 事件到宿主映射的有效性。 */
function hookEffectiveness(hub, event) {
  const mapping = HOOK_EVENT_MAP[event]
  const attached = hub.hooks?.stats().attached === true
  if (!mapping) return { effective: false, reason: '未知事件（宿主不会触发）' }
  if (mapping.host === null) return { effective: false, reason: mapping.reason ?? '宿主没有对应事件' }
  return {
    effective: attached,
    reason: attached ? (mapping.note ?? '') : (hub.hooks?.stats().reason || 'hooks 未挂载'),
  }
}

/**
 * 构建单个插件的详情（能力分组与逐项启停状态）。
 * @param {import('./hub.js').AgentPluginHub} hub
 * @param {string} keyOrName
 */
export function buildUiPluginDetail(hub, keyOrName) {
  const record = hub.findRecord(keyOrName)
  const warnings = []
  let manifest = {}
  try {
    manifest = detectPluginManifest(record.installedPath, { hintFormat: record.format }).manifest ?? {}
  } catch (error) {
    warnings.push(`读取 plugin.json 失败：${error instanceof Error ? error.message : String(error)}`)
  }
  const skillsScan = scanSkills(record.installedPath, record.format)
  const commandsScan = scanCommands(record.installedPath, record.format)
  const hooksRead = readHooksConfig(record.installedPath, record.format, manifest)
  const hooksParsed = normalizeHooks(hooksRead.config)
  const mcpRead = readMcpServers(record.installedPath, record.format, manifest)
  warnings.push(...skillsScan.warnings, ...commandsScan.warnings, ...hooksRead.warnings, ...hooksParsed.warnings, ...mcpRead.warnings)

  const registeredCommands = new Set((hub.pluginCommands?.stats().registered ?? []).map((item) => item.name))
  const skills = skillsScan.skills.map((skill) => ({
    name: skill.name,
    description: skill.description,
    whenToUse: skill.whenToUse ?? '',
    enabled: !isCapabilityDisabled(record, 'skills', skill.name),
    resourceBase: skill.dir,
  }))
  const commands = commandsScan.commands.map((command) => {
    const hostName = PluginCommandRuntime.commandName(record.name, command.name)
    return {
      name: command.name,
      hostName,
      description: command.description,
      argumentHint: command.argumentHint ?? '',
      enabled: !isCapabilityDisabled(record, 'commands', command.name),
      registered: registeredCommands.has(hostName),
    }
  })
  const hooks = Object.keys(hooksParsed.events).map((event) => {
    const groups = hooksParsed.events[event]
    const mapping = HOOK_EVENT_MAP[event]
    const effectiveness = hookEffectiveness(hub, event)
    return {
      event,
      host: mapping?.host ?? null,
      mode: mapping?.mode ?? '',
      entries: groups.reduce((sum, group) => sum + group.entries.length, 0),
      enabled: !isCapabilityDisabled(record, 'hooks', event),
      effective: effectiveness.effective,
      reason: effectiveness.reason,
      canBlock: mapping?.canBlock === true,
    }
  })
  const mcpState = mcpAvailability(hub.ctx)
  const mcpServers = mcpRead.servers.map((server) => ({
    name: server.name,
    transport: server.transport,
    command: server.command,
    args: server.args,
    url: server.url,
    enabled: !isCapabilityDisabled(record, 'mcpServers', server.name),
    effective: false,
    reason: mcpState.reason,
  }))
  return {
    plugin: pluginSummary(record),
    capabilities: { skills, commands, hooks, mcpServers },
    hooksSource: hooksRead.source,
    mcpSource: mcpRead.source,
    mcp: mcpState,
    warnings: [...new Set([...warnings])].slice(0, 20),
  }
}

/** 供 UI 展示的能力种类（稳定顺序）。 */
export const UI_CAPABILITY_KINDS = CAPABILITY_KINDS