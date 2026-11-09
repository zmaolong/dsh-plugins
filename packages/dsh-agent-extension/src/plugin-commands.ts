/**
 * Commands shipped inside installed agent plugins, adapted as host commands
 * `<plugin>-<command>`.
 *
 * Limitation (probed): a host command handler can only return one text block —
 * it cannot inject the command result as a new user message. So this renders
 * the full Markdown text and asks the user to copy-send it; no homemade
 * execution channel.
 *
 * Host command names only allow `[a-z][a-z0-9_-]*` with no colon; the
 * namespace separator is therefore `-`.
 *
 * @module dsh-agent-extension/plugin-commands
 */

import { isCapabilityDisabled, scanCommands } from './capabilities.ts'
import { toCommandName } from './formats.ts'
import { renderCommandTemplate } from './frontmatter.ts'
import type { PluginRecord } from './store.ts'
import type { CommandsService } from './host.ts'
import type { LogFn } from './log.ts'

const COPY_HINT = '（Agent 插件命令不会自动注入会话；请复制上面内容发送给模型。）'

/** One registered plugin command. */
export interface RegisteredPluginCommand {
  name: string
  plugin: string
  file: string
}

/** One command registration conflict. */
export interface PluginCommandConflict {
  name: string
  plugin: string
  reason: string
}

/** Plugin command registration state. */
export interface PluginCommandStats {
  available: boolean
  reason: string
  registered: RegisteredPluginCommand[]
  conflicts: PluginCommandConflict[]
}

/** Host-side runtime for agent-plugin commands. */
export class PluginCommandRuntime {
  private readonly getEnabledPlugins: () => PluginRecord[]
  private readonly log: LogFn
  private commands: CommandsService | null = null
  private disposers = new Map<string, () => void>()

  /** Registration state. */
  registered: RegisteredPluginCommand[] = []
  /** Conflicts and failures. */
  conflicts: PluginCommandConflict[] = []
  reason = ''

  constructor(options: { getEnabledPlugins: () => PluginRecord[], log: LogFn }) {
    this.getEnabledPlugins = options.getEnabledPlugins
    this.log = options.log
  }

  /** Record the host commands service (missing service only records the reason). */
  attach(ctx: unknown): boolean {
    const commands = (ctx as { get?: (name: string) => unknown } | null)?.get?.('commands')
      ?? (ctx as { commands?: unknown } | null)?.commands
    if (!commands || typeof (commands as CommandsService).register !== 'function') {
      this.reason = '宿主未提供 commands 服务'
      return false
    }
    this.commands = commands as CommandsService
    this.reason = ''
    return true
  }

  /** Host command name for one plugin command. */
  static commandName(pluginName: string, commandName: string): string {
    return toCommandName(`${pluginName}-${commandName}`)
  }

  /** Unregister every registered plugin command. */
  clear(): void {
    for (const disposer of this.disposers.values()) {
      try {
        disposer()
      } catch (error) {
        this.log('warn', `注销插件命令失败：${error instanceof Error ? error.message : String(error)}`)
      }
    }
    this.disposers.clear()
    this.registered = []
    this.conflicts = []
  }

  /** Rebuild command registrations from the current enabled state. */
  sync(): void {
    this.clear()
    if (this.commands === null) return
    for (const plugin of this.getEnabledPlugins()) {
      const scan = scanCommands(plugin.installedPath, plugin.format)
      for (const warning of scan.warnings) this.log('warn', `${plugin.name}: ${warning}`)
      for (const command of scan.commands) {
        if (isCapabilityDisabled(plugin, 'commands', command.name)) continue
        const name = PluginCommandRuntime.commandName(plugin.name, command.name)
        if (this.disposers.has(name)) {
          this.conflicts.push({ name, plugin: plugin.key, reason: '同一插件内命令重名' })
          continue
        }
        const description = `[${plugin.name}] ${command.description}`.slice(0, 200)
        try {
          const disposer = this.commands.register({
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
          this.log('warn', `注册插件命令 /${name} 失败（冲突跳过）：${message}`)
        }
      }
    }
  }

  /** State for `/agent-plugin info` / status. */
  stats(): PluginCommandStats {
    return {
      available: this.commands !== null,
      reason: this.reason,
      registered: this.registered,
      conflicts: this.conflicts,
    }
  }
}
