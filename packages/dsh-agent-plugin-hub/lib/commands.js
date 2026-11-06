/**
 * `/agent-plugin` 命令：本插件唯一可见入口，用来确认插件已加载、路径与格式是否正确。
 *
 * 命令直接返回文本，不产生模型消息；安装器与市场实现后，再增加
 * `/agent-plugin install`、`/agent-plugin market add` 这类真正改变状态的子命令。
 *
 * @module dsh-agent-plugin-hub/commands
 */

const USAGE = '用法：/agent-plugin [status|formats|path|version|help]'

function success(text) {
  return { kind: 'success', text }
}

function failure(text) {
  return { kind: 'error', text }
}

/**
 * @param {object} ctx - Cordis 上下文（此命令插件要求 commands 服务）。
 * @param {import('./hub.js').AgentPluginHub} hub
 */
export function registerHubCommand(ctx, hub) {
  ctx.commands.register({
    name: 'agent-plugin',
    description: 'Agent Plugin Hub：管理 Claude Code / CodeBuddy / ZCode 等 Agent 插件。',
    input: { hint: '[status|formats|path|version|help]' },
    handler({ rawInput }) {
      const [subcommand = 'status'] = String(rawInput ?? '').trim().split(/\s+/u)
      switch (subcommand) {
        case 'status': {
          const status = hub.status()
          return success([
            `${status.name} v${status.version}`,
            `存储根：${status.home}`,
            `格式：${status.formats.join(', ')}`,
            `状态文件：${status.state === 'present' ? '已存在' : '尚未创建'}`,
            '能力：市场/安装/技能/命令/hooks/MCP 尚未实现（骨架）',
          ].join('\n'))
        }
        case 'formats':
          return success(
            hub.listFormats()
              .map((format) => [
                `${format.id}（${format.label}）`,
                `  manifest: ${format.pluginManifests.join(' | ')}`,
                `  market:   ${format.marketplaceFiles.join(' | ')}`,
              ].join('\n'))
              .join('\n\n'),
          )
        case 'path':
          return success(hub.paths.home)
        case 'version':
          return success(hub.status().version)
        case 'help':
          return success(USAGE)
        default:
          return failure(`${USAGE}\n未知子命令：${subcommand}`)
      }
    },
  })
}