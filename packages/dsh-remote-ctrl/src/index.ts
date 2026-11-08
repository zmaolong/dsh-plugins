/**
 * dsh-remote-ctrl — DSH 的局域网远程访问网关。
 *
 * 定位：本包是一个 DSH 插件（cordis bundle）。宿主 web UI 只绑回环且拒绝
 * 通配地址，本插件自起一个 node:http 网关（默认 0.0.0.0:31080）把它反代
 * 出去：手机扫码（配对码）即得完整、自适应的 DSH Web UI —— 会话、流式
 * 输出、发送消息、工具审批、智能体提问全部是宿主原生能力，本插件不做
 * 任何业务 UI。桌面端面板（slots）负责展示地址、二维码与配对码。
 *
 * 只依赖 Node 内置模块与宿主 ctx 接口：不得 import 任何 @deepseek-ai/*。
 *
 * @module dsh-remote-ctrl
 */

import { RemoteCtrl, REMOTE_CTRL_VERSION } from './remote-ctrl.ts'
import { mountUiRoutes, type UiRoutesStatus } from './ui-routes.ts'
import type { HostContext, RemoteCtrlConfig } from './host.ts'

/** Cordis 插件名，用于日志与加载器识别。 */
export const name = 'remote-ctrl'

/** 本插件不硬依赖任何宿主服务：网关立即启动，上游服务晚到再挂载。 */
export const inject: string[] = []

/** 延迟等待可选服务就绪后执行 callback（失败只记日志，不抛宿主）。 */
function deferService(
  ctx: HostContext,
  deps: readonly string[],
  callback: (scope: HostContext) => void,
  onError: (message: string) => void,
): void {
  try {
    if (typeof ctx.inject !== 'function') {
      onError(`宿主 ctx 不支持 inject，无法等待服务 ${deps.join('+')}`)
      return
    }
    ctx.inject(deps, (scope: unknown) => {
      try {
        callback(scope as HostContext)
      } catch (error) {
        onError(`服务 ${deps.join('+')} 就绪后执行失败：${error instanceof Error ? error.message : String(error)}`)
      }
    })
  } catch (error) {
    onError(`等待服务 ${deps.join('+')} 失败：${error instanceof Error ? error.message : String(error)}`)
  }
}

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

  // 上游服务晚到：webServer（代理目标）与 connection（launch token 代换）。
  deferService(ctx, ['webServer'], scope => {
    if (ctrl.attachUpstream(scope, 'webServer')) ctrl.log('info', `宿主 web 服务已就绪：${ctrl.panelStatus().upstream.origin}`)
  }, message => ctrl.log('warn', message))
  deferService(ctx, ['connection'], scope => {
    ctrl.attachUpstream(scope, 'connection')
  }, message => ctrl.log('warn', message))

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

  ctrl.log('info', `v${REMOTE_CTRL_VERSION} 已加载；网关 http://${ctrl.panelStatus().host}:${ctrl.panelStatus().port}/；`
    + `面板 API：${uiRoutes.active ? '已挂载' : uiRoutes.reason}`)
  return ctrl
}
