/**
 * Text rendering: turn hub state into the readable Chinese text that
 * `/agent-plugin` command handlers return.
 *
 * @module dsh-agent-plugin-hub/report
 */

import { normalizeHooks, readHooksConfig, readMcpServers, scanSkills, scanCommands } from './capabilities.ts'
import { HOOK_EVENT_MAP } from './hooks.ts'
import { detectPluginManifest } from './manifest.ts'
import { formatMcpServers } from './mcp.ts'
import type { PluginRecord } from './store.ts'
import type { PluginCommandRuntime } from './plugin-commands.ts'

/** The hub face renderInfo reads. */
export interface ReportHubFacade {
  warnings: string[]
  pluginCommands: PluginCommandRuntime | null
  snapshot(): { mcp: { available: boolean, reason: string } }
}

/** Human-readable byte count. */
export function formatBytes(bytes: unknown): string {
  const value = Number(bytes) || 0
  if (value < 1024) return `${value} B`
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`
  if (value < 1024 * 1024 * 1024) return `${(value / 1024 / 1024).toFixed(1)} MB`
  return `${(value / 1024 / 1024 / 1024).toFixed(2)} GB`
}

/** Keep only the most recent warnings. */
function tailWarnings(list: unknown, limit = 8): string[] {
  return (Array.isArray(list) ? list as unknown[] : []).slice(-limit).map(String)
}

/** Snapshot shape renderStatus consumes (subset of AgentPluginHub.snapshot()). */
export interface HubSnapshot {
  name: string
  version: string
  home: string
  plugins: { total: number, enabled: number }
  cache: { bytes: number }
  markets: { total: number, plugins: number, errors: Array<{ id: string, error: string }> }
  skills: { registered: boolean, skills: number, reason: string }
  commands: { available: boolean, registered: Array<{ name: string }>, reason: string }
  hooks: { attached: boolean, reason: string }
  mcp: { available: boolean, reason: string }
  warnings: string[]
}

/** `/agent-plugin status`. */
export function renderStatus(snapshot: HubSnapshot): string {
  const lines = [
    `${snapshot.name} v${snapshot.version}`,
    `存储根：${snapshot.home}`,
    `已安装插件：${snapshot.plugins.enabled}/${snapshot.plugins.total} 启用，缓存 ${formatBytes(snapshot.cache.bytes)}`,
    `市场：${snapshot.markets.total} 个（可安装插件 ${snapshot.markets.plugins} 个）`,
    `技能 provider：${snapshot.skills.registered ? `已注册（${snapshot.skills.skills} 个技能）` : `未生效：${snapshot.skills.reason || '未知原因'}`}`,
    `插件命令：${snapshot.commands.available ? `已注册 ${snapshot.commands.registered.length} 个` : `未生效：${snapshot.commands.reason || '宿主未提供 commands 服务'}`}`,
    `hooks：${snapshot.hooks.attached ? '已挂到宿主事件（见 info 查看映射）' : `未生效：${snapshot.hooks.reason || '未知原因'}`}`,
    `MCP：${snapshot.mcp.available ? '可用' : `未生效：${snapshot.mcp.reason}`}`,
  ]
  for (const market of snapshot.markets.errors) {
    lines.push(`市场刷新错误：${market.id}：${market.error}`)
  }
  const warnings = tailWarnings(snapshot.warnings)
  if (warnings.length > 0) {
    lines.push('', '最近告警：', ...warnings.map(item => `- ${item}`))
  }
  lines.push('', '用 /agent-plugin help 查看全部子命令。')
  return lines.join('\n')
}

/** `/agent-plugin formats`. */
export function renderFormats(formats: Array<{
  id: string
  label: string
  pluginManifests: string[]
  marketplaceFiles: string[]
}>): string {
  return formats
    .map(format => [
      `${format.id}（${format.label}）`,
      `  plugin.json: ${format.pluginManifests.join(' | ')}`,
      `  marketplace.json: ${format.marketplaceFiles.join(' | ')}`,
    ].join('\n'))
    .join('\n\n')
}

/** `/agent-plugin list`. */
export function renderList(hub: { state: { plugins?: PluginRecord[] } }): string {  const plugins = hub.state.plugins ?? []
  if (plugins.length === 0) {
    return '还没有安装任何 Agent 插件。\n先用 /agent-plugin market add local <目录> 添加市场，再 /agent-plugin install <插件名>。'
  }
  const lines = ['已安装 Agent 插件：']
  for (const plugin of plugins) {
    const capabilities = plugin.capabilities ?? {}
    const list = (key: string): number => Array.isArray(capabilities[key]) ? (capabilities[key] as unknown[]).length : 0
    const summary = [
      `技能 ${list('skills')}`,
      `命令 ${list('commands')}`,
      `hooks ${list('hooks')}`,
      `MCP ${list('mcpServers')}`,
    ].join(' / ')
    lines.push(
      `- ${plugin.enabled ? '●' : '○'} ${plugin.name}@${plugin.version} [${plugin.format}]  ${summary}`,
      `  key: ${plugin.key}  市场: ${plugin.market}  ${plugin.enabled ? '已启用' : '已禁用'}`,
    )
  }
  lines.push('', '用 /agent-plugin info <插件名> 查看详情；enable/disable/uninstall 切换状态。')
  return lines.join('\n')
}

/** Hooks mapping notes for one plugin. */
function renderHooks(installedPath: string, formatId: string, manifest: Record<string, unknown> = {}): string[] {
  const hooks = normalizeHooks(readHooksConfig(installedPath, formatId, manifest).config)
  const lines: string[] = []
  if (Object.keys(hooks.events).length === 0) {
    lines.push('  hooks：无')
    return lines
  }
  lines.push(`  hooks：${Object.keys(hooks.events).join('、')}`)
  for (const event of Object.keys(hooks.events)) {
    const mapping = HOOK_EVENT_MAP[event]
    if (!mapping) {
      lines.push(`    ${event} → 未生效（未知事件）`)
    } else if (mapping.host === null) {
      lines.push(`    ${event} → 未生效（${mapping.reason}）`)
    } else {
      const note = mapping.canBlock === true ? '可阻断工具调用' : (mapping.note ?? '只观察，不能阻断')
      lines.push(`    ${event} → ${mapping.host}（${note}）`)
    }
  }
  return lines
}

/** `/agent-plugin info <插件名>`. */
export function renderInfo(hub: ReportHubFacade, record: PluginRecord): string {
  const warnings: string[] = []
  let manifest: Record<string, unknown> = {}
  try {
    manifest = detectPluginManifest(record.installedPath, { hintFormat: record.format }).manifest
  } catch {
    manifest = {}
  }
  const skills = scanSkills(record.installedPath, record.format)
  const commands = scanCommands(record.installedPath, record.format)
  warnings.push(...skills.warnings, ...commands.warnings)
  const registered = (hub.pluginCommands?.stats().registered ?? [])
    .filter(item => item.plugin === record.key)
    .map(item => `/${item.name}`)
  const mcp = readMcpServers(record.installedPath, record.format, manifest)
  warnings.push(...mcp.warnings)
  const mcpState = hub.snapshot().mcp
  const lines = [
    `插件：${record.name}@${record.version}（key：${record.key}）`,
    `格式：${record.format}  状态：${record.enabled ? '已启用' : '已禁用'}`,
    `市场：${record.market}`,
    `安装路径：${record.installedPath}`,
    `安装时间：${record.installedAt}`,
    '',
    '能力：',
    `  技能 ${skills.skills.length}：${skills.skills.map(skill => skill.name).join('、') || '（无）'}`,
    `  命令 ${commands.commands.length}：${commands.commands.map(command => command.name).join('、') || '（无）'}`,
  ]
  if (registered.length > 0) lines.push(`  宿主命令：${registered.join('、')}（渲染后返回文本，需复制发送）`)
  lines.push(...renderHooks(record.installedPath, record.format, manifest))
  lines.push(
    `  mcpServers ${mcp.servers.length}：${mcp.servers.map(server => server.name).join('、') || '（无）'}`,
    ...formatMcpServers(mcp.servers).map(line => `    ${line}`),
  )
  if (mcp.servers.length > 0) {
    lines.push(`    MCP 状态：${mcpState.available ? '已挂载' : `未生效（${mcpState.reason}）`}`)
  }
  if (record.previousVersions.length > 0) {
    lines.push('', `可回滚版本：${record.previousVersions.map(item => item.version).join('、')}`)
  }
  const extra = hub.warnings.filter(item => item.includes(record.name))
  const seen = [...new Set([...warnings, ...extra])].slice(0, 8)
  if (seen.length > 0) {
    lines.push('', '告警：', ...seen.map(item => `- ${item}`))
  }
  return lines.join('\n')
}

/** `/agent-plugin help`. */
export function renderHelp(): string {
  return [
    '用法：/agent-plugin <子命令> [参数]',
    '',
    '状态与排查',
    '  status                      总体状态（存储根、插件、市场、能力挂载）',
    '  list                        列出已安装 Agent 插件',
    '  info <插件名|key>           单个插件详情（含 hooks/MCP 是否生效）',
    '  formats                     支持的格式与清单路径',
    '  path                        存储根路径',
    '  version                     版本号',
    '',
    '市场',
    '  market list                 列出已添加市场',
    '  market add local <目录> [--name 名称]     本地目录（含 marketplace.json 或单插件目录）',
    '  market add git <仓库地址> [--name 名称]    git 仓库（浅克隆到 hub 缓存）',
    '  market add url <marketplace.json 地址>     marketplace.json 直链',
    '  market refresh [市场id]     刷新市场（省略 id 刷新全部）',
    '  market remove <市场id>      移除市场（先卸载其插件）',
    '',
    '插件',
    '  install <插件名> [--force]              在所有市场里查找并安装',
    '  install <市场id> <插件名> [--force]     指定市场安装',
    '  uninstall <插件名|key>                  卸载并删除安装副本',
    '  enable <插件名|key> / disable <...>     启用 / 禁用（禁用只改状态，不删文件）',
    '  update <插件名|key> [--force]           刷新市场后升级到最新版本',
    '  rollback <插件名|key>                   回滚到上一个版本',
    '',
    '说明：已安装插件的命令注册为 <插件名>-<命令名>（宿主命令名不允许冒号）；',
    '命令结果以文本返回，不会自动注入会话消息，需要复制发送。',
  ].join('\n')
}
