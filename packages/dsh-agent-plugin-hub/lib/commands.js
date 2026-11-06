/**
 * `/hub` 命令：骨架期唯一可见入口，用来确认插件已加载、路径与格式是否正确。
 *
 * 命令直接返回文本，不产生模型消息；等安装器与市场实现后，再增加
 * `/hub install`、`/hub market add` 这类真正改变状态的子命令。
 *
 * @module dsh-agent-plugin-hub/commands
 */

const USAGE = '用法：/hub [status|formats|path|version]'

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
    name: 'hub',
    description: 'Agent Plugin Hub（骨架）：查看状态、支持格式与存储路径。',
    input: { hint: '[status|formats|path|version]' },
    handler({ rawInput }) {
      const [subcommand = 'status'] = String(rawInput ?? '').trim().split(/\s+/u)
      switch (subcommand) {
        case 'status': {
          const status = hub.status()
          return success([
            `${status.name} v${status.version}（骨架）`,
            `存储根：${status.home}`,
            `格式：${status.formats.join(', ')}`,
            `状态文件：${status.state === 'present' ? '已存在' : '尚未创建'}`,
            '能力：市场/安装/技能/命令/hooks/MCP 尚未实现',
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
        default:
          return failure(`${USAGE}\n未知子命令：${subcommand}`)
      }
    },
  })
}