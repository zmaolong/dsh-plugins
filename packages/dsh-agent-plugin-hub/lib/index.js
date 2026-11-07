/**
 * dsh-agent-plugin-hub — DSH 的 Agent 插件运行时与市场。
 *
 * 定位：本包是一个 DSH 插件（cordis bundle），负责在 DSH 里托管
 * 跨 Harness 的 Agent 插件（Claude Code / CodeBuddy / ZCode 等格式）。
 * 被托管的 Agent 插件不是 DSH 插件，不会出现在 DSH 的插件树里。
 *
 * 只依赖 Node 内置模块与宿主 ctx 接口：不得 import 任何 @deepseek-ai/*。
 *
 * @module dsh-agent-plugin-hub
 */

import { registerHubCommand } from './commands.js'
import { AgentPluginHub, HUB_VERSION } from './hub.js'
import { mountUiRoutes } from './ui-routes.js'

/** Cordis 插件名，用于日志与加载器识别。 */
export const name = 'agent-plugin-hub'

/** 等待宿主提供 commands 服务后再注册 `/agent-plugin`。 */
export const inject = ['commands']

/**
 * 插件入口。启动失败不会让宿主加载失败：错误写入 hub 日志并在 status 里展示。
 *
 * @param {object} ctx - 宿主注入的上下文（此时 commands 服务已可用）。
 * @param {{ home?: string, hooks?: boolean }} [config] - 来自 cordis.patch.yml 的配置。
 * @returns {AgentPluginHub}
 */
export function apply(ctx, config = {}) {
  const hub = new AgentPluginHub({ home: config?.home, ctx, config })
  hub.start()
  try {
    registerHubCommand(ctx, hub)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    hub.warnings.push(message)
    hub.store.log('error', `注册 /agent-plugin 失败：${message}`)
  }
  try {
    ctx.effect?.(() => () => hub.dispose())
  } catch {
    /* 宿主不支持 effect 时忽略；进程退出由宿主回收 */
  }
  // 插件页「Agent Plugin」Tab 的 HTTP 数据面；宿主没有 webServer 时只记录原因。
  let uiRoutes = { dispose: () => {} }
  try {
    uiRoutes = mountUiRoutes(ctx, hub)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    hub.uiRoutes = { active: false, reason: `挂载插件页 API 失败：${message}`, path: '/agent-plugin/api' }
    hub.store.log('error', hub.uiRoutes.reason)
  }
  try {
    ctx.effect?.(() => () => uiRoutes.dispose())
  } catch {
    /* 同上 */
  }
  console.log(
    `[dsh-agent-plugin-hub] v${HUB_VERSION} 已加载；home=${hub.home}；`
    + `已安装 ${hub.state.plugins.length} 个 Agent 插件，市场 ${hub.markets.list().length} 个；`
    + `插件页 API：${hub.uiRoutes.active ? '已挂载' : hub.uiRoutes.reason}`,
  )
  return hub
}