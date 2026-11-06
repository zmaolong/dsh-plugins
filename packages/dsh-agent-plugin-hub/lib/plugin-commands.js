/**
 * 已安装 Agent 插件自带的命令适配：注册成宿主命令 `<plugin>-<command>`。
 *
 * 限制（已侦察）：宿主命令处理器只能返回一段文本，不能把命令结果作为新的
 * 用户消息注入会话。因此这里渲染完整 Markdown 文本并提示用户“复制发送”，
 * 不做自造执行通道。
 *
 * 宿主命令名只允许 `[a-z][a-z0-9_-]*`，不允许冒号；故命名空间分隔符用 `-`。
 *
 * @module dsh-agent-plugin-hub/plugin-commands
 */

import { scanCommands } from './capabilities.js'
import { toCommandName } from './formats.js'
import { renderCommandTemplate } from './frontmatter.js'

const COPY_HINT = '（Agent 插件命令不会自动注入会话；请复制上面内容发送给模型。）'

export class PluginCommandRuntime {
  /**
   * @param {{getEnabledPlugins: () => object[], store: import('./store.js').HubStore}} options
   */
  constructor(options) {
    this.getEnabledPlugins = options.getEnabledPlugins
    this.store = options.store
    this.ctx = null
    this.disposers = new Map()
    this.conflicts = []
    this.registered = []
    this.reason = ''
  }

  /** 记录宿主 commands 服务（缺失时只记录原因）。 */
  attach(ctx) {
    const commands = ctx?.get?.('commands') ?? ctx?.commands
    if (!commands || typeof commands.register !== 'function') {
      this.reason = '宿主未提供 commands 服务'
      return false
    }
    this.ctx = commands
    this.reason = ''
    return true
  }

  /** 生成一个插件命令在宿主里的名字。 */
  static commandName(pluginName, commandName) {
    return toCommandName(`${pluginName}-${commandName}`)
  }

  /** 注销全部已注册的插件命令。 */
  clear() {
    for (const disposer of this.disposers.values()) {
      try {
        disposer()
      } catch (error) {
        this.store.log('warn', `注销插件命令失败：${error instanceof Error ? error.message : String(error)}`)
      }
    }
    this.disposers.clear()
    this.registered = []
    this.conflicts = []
  }

  /** 按当前启用状态重建命令注册。 */
  sync() {
    this.clear()
    if (this.ctx === null) return
    for (const plugin of this.getEnabledPlugins()) {
      const scan = scanCommands(plugin.installedPath, plugin.format)
      for (const warning of scan.warnings) this.store.log('warn', `${plugin.name}: ${warning}`)
      for (const command of scan.commands) {
        const name = PluginCommandRuntime.commandName(plugin.name, command.name)
        if (this.disposers.has(name)) {
          this.conflicts.push({ name, plugin: plugin.key, reason: '同一插件内命令重名' })
          continue
        }
        const description = `[${plugin.name}] ${command.description}`.slice(0, 200)
        try {
          const disposer = this.ctx.register({
            name,
            description,
            input: { hint: command.argumentHint || '[参数]' },
            handler: ({ rawInput }) => {
              const rendered = renderCommandTemplate(command.body, rawInput ?? '')
              return { kind: 'success', text: `${rendered}\n\n${COPY_HINT}` }
            },
          })
          this.disposers.set(name, disposer)
          this.registered.push({ name, plugin: plugin.key, file: command.file })
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          this.conflicts.push({ name, plugin: plugin.key, reason: message })
          this.store.log('warn', `注册插件命令 /${name} 失败（冲突跳过）：${message}`)
        }
      }
    }
  }

  /** 供 /agent-plugin info / status 展示。 */
  stats() {
    return {
      available: this.ctx !== null,
      reason: this.reason,
      registered: this.registered,
      conflicts: this.conflicts,
    }
  }
}