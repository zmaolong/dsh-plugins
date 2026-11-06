/**
 * `/agent-plugin` 命令：hub 的唯一运维入口。
 *
 * 子命令：status / list / info / formats / path / version / help /
 * market list|add|refresh|remove / install / uninstall / enable / disable /
 * update / rollback。
 *
 * 命令处理器只返回文本（宿主命令无法把结果注入会话消息），错误信息中文可操作。
 *
 * @module dsh-agent-plugin-hub/commands
 */

import { splitArguments } from './frontmatter.js'
import { PluginCommandRuntime } from './plugin-commands.js'
import {
  renderFormats,
  renderHelp,
  renderInfo,
  renderList,
  renderStatus,
} from './report.js'

const USAGE = '用法：/agent-plugin <status|list|info|formats|path|version|market|install|uninstall|enable|disable|update|rollback|help>'

function success(text) {
  return { kind: 'success', text }
}

function failure(text) {
  return { kind: 'error', text }
}

/** 从参数里提取布尔开关与带值选项。 */
export function parseOptions(tokens) {
  const positional = []
  const options = {}
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index]
    if (token === '--force' || token === '-f') {
      options.force = true
      continue
    }
    if (token === '--name' || token === '--format' || token === '--type') {
      const value = tokens[index + 1] ?? ''
      options[token.slice(2)] = value
      index += 1
      continue
    }
    positional.push(token)
  }
  return { positional, options }
}

/** 描述市场来源。 */
function describeMarket(market) {
  return `${market.name}（${market.id}，${market.type}）：${market.location}`
}

/**
 * @param {object} ctx - Cordis 上下文（要求 commands 服务）。
 * @param {import('./hub.js').AgentPluginHub} hub
 */
export function registerHubCommand(ctx, hub) {
  const commands = ctx?.get?.('commands') ?? ctx?.commands
  if (!commands || typeof commands.register !== 'function') {
    throw new Error('宿主未提供 commands 服务，无法注册 /agent-plugin')
  }
  return commands.register({
    name: 'agent-plugin',
    description: 'Agent Plugin Hub：添加市场、安装/更新/卸载 Claude Code 等 Agent 插件，并注入技能与命令。',
    input: { hint: '<子命令> [参数]（/agent-plugin help）' },
    async handler({ rawInput }) {
      const text = String(rawInput ?? '').trim()
      const tokens = splitArguments(text)
      const subcommand = tokens[0] ?? 'status'
      try {
        switch (subcommand) {
          case 'status':
            return success(renderStatus(hub.snapshot()))
          case 'help':
            return success(renderHelp())
          case 'formats':
            return success(renderFormats(hub.listFormats()))
          case 'path':
            return success(hub.paths.home)
          case 'version':
            return success(hub.snapshot().version)
          case 'list':
            return success(renderList(hub))
          case 'info': {
            const name = tokens[1]
            if (!name) return failure('用法：/agent-plugin info <插件名|key>')
            return success(renderInfo(hub, hub.findRecord(name)))
          }
          case 'market':
            return await runMarket(hub, tokens.slice(1))
          case 'install':
            return await runInstall(hub, tokens.slice(1))
          case 'uninstall':
            return runUninstall(hub, tokens.slice(1))
          case 'enable':
            return runToggle(hub, tokens.slice(1), true)
          case 'disable':
            return runToggle(hub, tokens.slice(1), false)
          case 'update':
            return await runUpdate(hub, tokens.slice(1))
          case 'rollback':
            return runRollback(hub, tokens.slice(1))
          default:
            return failure(`${USAGE}\n未知子命令：${subcommand}\n用 /agent-plugin help 查看完整用法。`)
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        return failure(`操作失败：${message}`)
      }
    },
  })
}

/** market 子命令。 */
async function runMarket(hub, tokens) {
  const action = tokens[0] ?? 'list'
  const { positional, options } = parseOptions(tokens.slice(1))
  switch (action) {
    case 'list': {
      const markets = hub.markets.list()
      if (markets.length === 0) {
        return success('还没有添加市场。\n示例：/agent-plugin market add local <目录>；/agent-plugin market add git <仓库地址>；/agent-plugin market add url <marketplace.json 地址>')
      }
      const lines = ['已添加市场：']
      for (const market of markets) {
        lines.push(
          `- ${describeMarket(market)}`,
          `  格式：${market.format}  插件：${market.plugins?.length ?? 0} 个  最近刷新：${market.lastRefreshed || '未刷新'}`,
        )
        if (market.refreshError) lines.push(`  刷新错误：${market.refreshError}`)
      }
      return success(lines.join('\n'))
    }
    case 'add': {
      const type = positional[0]
      const location = positional[1]
      if (!type || !location) {
        return failure('用法：/agent-plugin market add <local|git|url> <地址> [--name 名称] [--format claude|codebuddy|zcode]')
      }
      const market = await hub.marketAdd({
        type,
        location,
        name: options.name,
        format: options.format,
      })
      const lines = [
        `市场已添加：${describeMarket(market)}`,
        `格式：${market.format}  可安装插件：${market.plugins?.length ?? 0} 个`,
      ]
      if (market.refreshError) lines.push(`刷新错误：${market.refreshError}（稍后可用 /agent-plugin market refresh ${market.id} 重试）`)
      for (const plugin of (market.plugins ?? []).slice(0, 10)) {
        lines.push(`- ${plugin.name}${plugin.version ? `@${plugin.version}` : ''}${plugin.description ? `：${plugin.description}` : ''}${plugin.warning ? `（${plugin.warning}）` : ''}`)
      }
      if ((market.plugins?.length ?? 0) > 10) lines.push(`……共 ${market.plugins.length} 个，用 /agent-plugin install <插件名> 安装`)
      return success(lines.join('\n'))
    }
    case 'refresh': {
      const id = positional[0]
      const result = await hub.marketRefresh(id)
      const lines = []
      for (const market of result.refreshed) {
        lines.push(`已刷新 ${market.id}：${market.plugins?.length ?? 0} 个插件${market.refreshError ? `（错误：${market.refreshError}）` : ''}`)
      }
      for (const failure of result.failures) lines.push(`刷新失败 ${failure.id}：${failure.error}`)
      if (result.refreshed.length === 0 && result.failures.length === 0) lines.push('没有市场可刷新')
      return success(lines.join('\n'))
    }
    case 'remove': {
      const id = positional[0]
      if (!id) return failure('用法：/agent-plugin market remove <市场id>')
      const removed = hub.marketRemove(id)
      return success(`已移除市场：${removed.id}`)
    }
    default:
      return failure(`未知 market 子命令：${action}\n用法：/agent-plugin market <list|add|refresh|remove>`)
  }
}

/** install 子命令。 */
async function runInstall(hub, tokens) {
  const { positional, options } = parseOptions(tokens)
  if (positional.length === 0) {
    return failure('用法：/agent-plugin install <插件名> [--force]\n或：/agent-plugin install <市场id> <插件名> [--force]')
  }
  const marketId = positional.length >= 2 ? positional[0] : undefined
  const name = positional.length >= 2 ? positional[1] : positional[0]
  const result = await hub.install({ market: marketId, name, force: options.force === true })
  const plugin = result.record
  const market = hub.markets.get(plugin.market)
  const lines = [
    `安装完成：${plugin.name}@${plugin.version}（${plugin.format}）`,
    `来源：${market ? describeMarket(market) : plugin.market} → ${result.sourceDir}`,
    `目标：${plugin.installedPath}（${result.replaced ? '替换同版本副本' : '新安装'}）`,
    `状态：${plugin.enabled ? '已启用' : '已禁用'}`,
    `能力：技能 ${plugin.capabilities.skills?.length ?? 0} / 命令 ${plugin.capabilities.commands?.length ?? 0} / hooks ${plugin.capabilities.hooks?.length ?? 0} / MCP ${plugin.capabilities.mcpServers?.length ?? 0}`,
  ]
  const registered = (hub.pluginCommands?.stats().registered ?? []).filter((item) => item.plugin === plugin.key)
  if (registered.length > 0) lines.push(`已注册宿主命令：${registered.map((item) => `/${item.name}`).join('、')}（结果需复制发送）`)
  const warnings = [...new Set(result.warnings)].slice(0, 10)
  if (warnings.length > 0) lines.push('', '告警：', ...warnings.map((item) => `- ${item}`))
  return success(lines.join('\n'))
}

/** uninstall 子命令。 */
function runUninstall(hub, tokens) {
  const name = tokens[0]
  if (!name) return failure('用法：/agent-plugin uninstall <插件名|key>')
  const record = hub.uninstall(name)
  return success(`已卸载 ${record.name}@${record.version}（删除安装副本与状态记录）`)
}

/** enable / disable。 */
function runToggle(hub, tokens, enabled) {
  const name = tokens[0]
  if (!name) return failure(`用法：/agent-plugin ${enabled ? 'enable' : 'disable'} <插件名|key>`)
  const record = hub.setEnabled(name, enabled)
  const detail = enabled
    ? '已启用，技能/命令/hooks 将在下一次注册同步后生效'
    : '已禁用（文件保留，能力不再注册）'
  return success(`${record.name}@${record.version} ${detail}`)
}

/** update 子命令。 */
async function runUpdate(hub, tokens) {
  const { positional, options } = parseOptions(tokens)
  const name = positional[0]
  if (!name) return failure('用法：/agent-plugin update <插件名|key> [--force]')
  const result = await hub.update(name, options.force === true)
  const lines = [result.message]
  if (result.changed) {
    lines.push(`当前路径：${result.record.installedPath}`)
    lines.push(`能力：技能 ${result.record.capabilities.skills?.length ?? 0} / 命令 ${result.record.capabilities.commands?.length ?? 0}`)
    const warnings = [...new Set(result.warnings ?? [])].slice(0, 8)
    if (warnings.length > 0) lines.push('', '告警：', ...warnings.map((item) => `- ${item}`))
  }
  return success(lines.join('\n'))
}

/** rollback 子命令。 */
function runRollback(hub, tokens) {
  const name = tokens[0]
  if (!name) return failure('用法：/agent-plugin rollback <插件名|key>')
  const result = hub.rollback(name)
  const lines = [
    `已回滚 ${result.record.name}：当前版本 ${result.record.version}（原 ${result.previousVersion}）`,
    `路径：${result.record.installedPath}`,
  ]
  const warnings = [...new Set(result.warnings ?? [])].slice(0, 8)
  if (warnings.length > 0) lines.push('', '告警：', ...warnings.map((item) => `- ${item}`))
  return success(lines.join('\n'))
}

/** 兼容旧导出：把插件命令运行时暴露给命令模块（测试用）。 */
export { PluginCommandRuntime }