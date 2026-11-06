/**
 * dsh-agent-plugin-hub — DSH 的 Agent 插件运行时与市场（骨架）。
 *
 * 定位：本包是一个 DSH 插件（cordis bundle），负责在 DSH 里托管
 * 跨 Harness 的 Agent 插件（Claude Code / CodeBuddy / ZCode 等格式）。
 * 被托管的 Agent 插件不是 DSH 插件，不会出现在 DSH 的插件树里。
 *
 * 骨架阶段只做三件事：算出存储根、注册格式表、暴露 `/hub` 命令。
 *
 * @module dsh-agent-plugin-hub
 */

import { registerHubCommand } from './commands.js'
import { AgentPluginHub } from './hub.js'

/** Cordis 插件名，用于日志与加载器识别。 */
export const name = 'agent-plugin-hub'

/** 等待宿主提供 commands 服务后再注册 `/hub`。 */
export const inject = ['commands']

/**
 * 插件入口。
 * @param {object} ctx - 宿主注入的上下文（此时 commands 服务已可用）。
 * @param {{ home?: string }} [config] - 来自 cordis.patch.yml 的配置。
 */
export function apply(ctx, config = {}) {
  const hub = new AgentPluginHub({ home: config?.home })
  registerHubCommand(ctx, hub)
  console.log(`[dsh-agent-plugin-hub] 骨架已加载；home=${hub.home}`)
}