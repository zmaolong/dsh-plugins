/**
 * dsh-agent-extension — DSH 的智能体扩展（Agent Extension）运行时与市场。
 *
 * 定位：本包是一个 DSH 插件（cordis bundle），负责在 DSH 里托管
 * 跨 Harness 的 Agent 插件（Claude Code / CodeBuddy / ZCode 等格式）。
 * 被托管的 Agent 插件不是 DSH 插件，不会出现在 DSH 的插件树里。
 *
 * 只依赖 Node 内置模块与宿主 ctx 接口：不得 import 任何 @deepseek-ai/*。
 *
 * @module dsh-agent-extension
 */

import { registerHubCommand } from './commands.ts'
import { AgentPluginHub, HUB_VERSION } from './hub.ts'
import { MemoryRuntime } from './memory-host.ts'
import { MemoryStore } from './memory/store.ts'
import { mountUiRoutes, type UiRoutesStatus } from './ui-routes.ts'
import type { HubConfig, HostContext } from './host.ts'
import type { LogFn } from './log.ts'
import type { MemoryRouteHooks } from './memory-routes.ts'

/** Cordis 插件名，用于日志与加载器识别。 */
export const name = 'agent-extension'

/** 等待宿主提供 commands 服务后再注册 `/agent-plugin`。 */
export const inject = ['commands']

/**
 * 延迟等待可选服务就绪后执行 callback。
 *
 * 宿主按「服务可用性」驱动激活：本插件只硬依赖 commands，skills / webServer
 * 可能在本插件 apply 之后才注册。直接用 ctx.get() 会拿到 undefined，
 * 因此失败时用 ctx.inject(deps, callback) 挂到服务出现的那一刻。
 */
function deferService(
  ctx: HostContext,
  deps: readonly string[],
  callback: (scope: unknown) => void,
  onError: (message: string) => void,
): void {
  try {
    if (typeof ctx.inject !== 'function') {
      onError(`宿主 ctx 不支持 inject，无法等待服务 ${deps.join('+')}`)
      return
    }
    ctx.inject(deps, (scope) => {
      try {
        callback(scope)
      } catch (error) {
        onError(`服务 ${deps.join('+')} 就绪后执行失败：${error instanceof Error ? error.message : String(error)}`)
      }
    })
  } catch (error) {
    onError(`等待服务 ${deps.join('+')} 失败：${error instanceof Error ? error.message : String(error)}`)
  }
}

/**
 * 插件入口。启动失败不会让宿主加载失败：错误写入 hub 日志并在 status 里展示。
 *
 * @param ctx - 宿主注入的上下文（此时 commands 服务已可用）。
 * @param config - 来自 cordis.patch.yml 的配置。
 * @returns AgentPluginHub
 */
export function apply(ctx: HostContext, config: HubConfig = {}): AgentPluginHub {
  const hub = new AgentPluginHub({
    ...(config?.home !== undefined ? { home: config.home } : {}),
    ctx,
    config,
  })
  hub.start()
  const memoryLog: LogFn = (level, message) => hub.log(level, `memory: ${message}`)
  const memory = new MemoryStore({ home: hub.home, log: memoryLog })
  let memoryRuntime: MemoryRuntime | null = null
  try {
    memoryRuntime = new MemoryRuntime({ ctx, store: memory, log: memoryLog })
    memoryRuntime.start()
    hub.log('info', `记忆已启用：${memory.root}`)
    if (typeof ctx.effect === 'function') {
      ctx.effect(() => () => { void memoryRuntime?.dispose() }, 'dsh-agent-extension: memory runtime')
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    hub.warnings.push(`记忆功能启动失败：${message}`)
    hub.log('error', `记忆功能启动失败：${message}`)
  }
  try {
    const disposeCommand = registerHubCommand(ctx, hub)
    if (typeof disposeCommand === 'function') {
      ctx.effect(() => disposeCommand, 'dsh-agent-extension: /agent-plugin command')
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    hub.warnings.push(message)
    hub.log('error', `注册 /agent-plugin 失败：${message}`)
  }
  try {
    ctx.effect?.(() => () => hub.dispose(), 'dsh-agent-extension: hub lifecycle')
  } catch {
    /* the host may not support effect; process exit reclaims everything */
  }
  // skills：start() 里若服务尚未就绪会注册失败，这里等服务出现后补注册。
  if (!hub.skills?.registered) {
    deferService(ctx, ['skills'], (scope) => {
      if (hub.skills && !hub.skills.registered) hub.skills.register(scope)
    }, (message) => hub.log('warn', message))
  }
  // 插件页「智能体扩展」Tab 的 HTTP 数据面；webServer 晚到也没关系。
  // 记忆面板的「刷新索引」通过 hooks 显式失效会话首步索引快照。
  const memoryHooks: MemoryRouteHooks = {
    refreshRecall: () => memoryRuntime?.invalidateRecall(),
  }
  let uiRoutes: UiRoutesStatus = { active: false, reason: '未挂载', path: '/agent-plugin/api', dispose: () => {} }
  try {
    uiRoutes = mountUiRoutes(ctx, hub, memory, memoryHooks)
    if (uiRoutes.active && typeof ctx.effect === 'function') {
      ctx.effect(() => () => uiRoutes.dispose(), 'dsh-agent-extension: plugin-page API')
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    hub.uiRoutes = { active: false, reason: `挂载插件页 API 失败：${message}`, path: '/agent-plugin/api' }
    hub.log('error', hub.uiRoutes.reason)
  }
  if (!hub.uiRoutes.active) {
    deferService(ctx, ['webServer'], (scope) => {
      if (hub.uiRoutes.active) return
      const status = mountUiRoutes(scope as HostContext, hub, memory, memoryHooks)
      if (typeof (scope as HostContext | null)?.effect === 'function') {
        (scope as HostContext).effect(() => () => status.dispose?.(), 'dsh-agent-extension: plugin-page API')
      }
    }, (message) => {
      hub.uiRoutes = { active: false, reason: message, path: '/agent-plugin/api' }
      hub.log('warn', message)
    })
  }
  hub.log('info',
    `v${HUB_VERSION} 已加载；home=${hub.home}；`
    + `已安装 ${hub.state.plugins.length} 个插件，市场 ${hub.markets.list().length} 个；`
    + `插件页 API：${hub.uiRoutes.active ? '已挂载' : hub.uiRoutes.reason}`)
  return hub
}
