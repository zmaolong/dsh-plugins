/**
 * 最小 DSH 插件：只演示生命周期。
 *
 * 刻意不 import 任何 @deepseek-ai/* 包——profile 里 autoInstallPeers 是关的，
 * 第三方插件 import 宿主包会解析失败。能用 ctx 提供的接口就优先用 ctx。
 *
 * @module dsh-example-hello
 */

/** Cordis 插件名，用于日志与加载器识别。 */
export const name = 'example-hello'

/**
 * 插件入口：宿主在加载这一行时调用。
 * @param ctx - 宿主注入的上下文。
 */
export function apply(ctx) {
  console.log('[dsh-example-hello] 已加载（apply 执行）')
}