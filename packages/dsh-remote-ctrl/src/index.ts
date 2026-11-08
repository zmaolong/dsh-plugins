/**
 * dsh-remote-ctrl — DSH 的局域网远程控制。
 *
 * 定位：本包是一个 DSH 插件（cordis bundle）。它自起一个 node:http 服务
 * （默认绑定 0.0.0.0，所有局域网地址皆可访问），手机浏览器通过配对码
 * 连接后可以：浏览会话与实时输出、发送消息、批准工具调用、回答提问；
 * 桌面端面板（slots）负责展示地址、二维码与配对码。
 *
 * 只依赖 Node 内置模块与宿主 ctx 接口：不得 import 任何 @deepseek-ai/*。
 *
 * @module dsh-remote-ctrl
 */

import { deferService } from './bridge.ts'
import { RemoteCtrl, REMOTE_CTRL_VERSION } from './remote-ctrl.ts'
import { mountUiRoutes, type UiRoutesStatus } from './ui-routes.ts'
import type { HostContext, RemoteCtrlConfig } from './host.ts'

/** Cordis 插件名，用于日志与加载器识别。 */
export const name = 'remote-ctrl'

/** 本插件不硬依赖任何宿主服务：自起 HTTP 服务立即可用，会话服务晚到再桥接。 */
export const inject: string[] = []

/**
 * 插件入口。启动失败不会让宿主加载失败：错误写入日志并在面板 status 里展示。
 *
 * @param ctx - 宿主注入的上下文。
 * @param config - 来自 cordis.patch.yml 的配置。
 * @returns RemoteCtrl
 */
export function apply(ctx: HostContext, config: RemoteCtrlConfig = {}): RemoteCtrl {
  const ctrl = new RemoteCtrl(ctx, config)
  ctrl.start()
  try {
    ctx.effect?.(() => () => ctrl.dispose(), 'dsh-remote-ctrl: lifecycle')
  } catch {
    /* the host may not support effect; process exit reclaims everything */
  }

  // never[] 逆变：带具体参数形状（如 (request, next)）的监听器都能安全传入。
  const listen = (event: string, listener: (...args: never[]) => unknown, label: string): void => {
    try {
      const dispose = ctx.on(event, listener as (...args: unknown[]) => unknown)
      if (typeof dispose === 'function') ctx.effect?.(() => dispose as () => void, label)
    } catch (error) {
      ctrl.log('warn', `订阅 ${event} 失败：${error instanceof Error ? error.message : String(error)}`)
    }
  }

  listen('session/event', (session, event) => ctrl.onSessionEvent(session, event), 'dsh-remote-ctrl: session/event')
  listen('agent/assistant-stream', payload => ctrl.onAssistantStream(payload), 'dsh-remote-ctrl: agent/assistant-stream')
  listen('approval/request', (request: unknown, next: () => unknown) => ctrl.onApprovalRequest(request, next), 'dsh-remote-ctrl: approval answerer')
  listen('user-questions/request', (request: unknown, next: () => unknown) => ctrl.onQuestionRequest(request, next), 'dsh-remote-ctrl: questions answerer')
  for (const event of ['api-session/added', 'api-session/removed', 'api-session/status', 'api-session/activity']) {
    listen(event, () => ctrl.scheduleSessionsRefresh(), `dsh-remote-ctrl: ${event}`)
  }

  // 会话服务晚到：就绪后逐个桥接（每个服务独立等待，缺一个不影响其余能力）。
  for (const service of ['sessionQuery', 'sessionController'] as const) {
    deferService(ctx, [service], scope => {
      ctrl.bridge.attach(scope, service)
    }, message => ctrl.log('warn', message))
  }

  // 桌面面板数据面：挂到宿主 webServer（回环专用）；webServer 晚到也没关系。
  let uiRoutes: UiRoutesStatus = { active: false, reason: '未挂载', path: '/remote-ctrl/api', dispose: () => {} }
  try {
    uiRoutes = mountUiRoutes(ctx, ctrl)
    if (uiRoutes.active && typeof ctx.effect === 'function') {
      ctx.effect(() => () => uiRoutes.dispose(), 'dsh-remote-ctrl: panel API')
    }
  } catch (error) {
    uiRoutes = { active: false, reason: `挂载面板 API 失败：${error instanceof Error ? error.message : String(error)}`, path: '/remote-ctrl/api', dispose: () => {} }
  }
  if (!uiRoutes.active) {
    deferService(ctx, ['webServer'], scope => {
      const status = mountUiRoutes(scope, ctrl)
      if (status.active && typeof (scope as HostContext | null)?.effect === 'function') {
        (scope as HostContext).effect(() => () => status.dispose(), 'dsh-remote-ctrl: panel API')
      }
    }, message => ctrl.log('warn', message))
  }

  ctrl.log('info', `v${REMOTE_CTRL_VERSION} 已加载；远程服务 http://${ctrl.panelStatus().host}:${ctrl.panelStatus().port}/；`
    + `面板 API：${uiRoutes.active ? '已挂载' : uiRoutes.reason}`)
  return ctrl
}
