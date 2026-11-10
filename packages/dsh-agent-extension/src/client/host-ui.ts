/**
 * 宿主官方 UI primitives 的可选桥（ADR-0008 受控例外）。
 *
 * 浏览器半的 bundle 是 CJS 工厂闭包：宿主在加载插件时注入一个 `require`
 * 模块表，其中包含 `@deepseek-ai/dsh-client-ui-primitives`。这里用同步
 * `require` 取一次组件并缓存；宿主升级、模块表缺失或组件改名时降级为
 * `null`，由调用方退回自绘/系统打开，绝不让面板崩溃。
 *
 * 只取 `MarkdownText`（已核对宿主实现 props：`text/streaming/variant/...`），
 * 不扩大白名单。
 *
 * @module dsh-agent-extension/client/host-ui
 */

import type { ComponentType } from 'react'

/** 宿主 `MarkdownText` 需要的最小 props；`text` 为 Markdown 源文。 */
export interface HostMarkdownTextProps {
  text: string
  streaming?: boolean
  variant?: 'body' | 'compact'
  className?: string
}

/** 宿主 Markdown 渲染组件类型。 */
export type HostMarkdownText = ComponentType<HostMarkdownTextProps>

/** 缓存：`undefined` 表示还没探测过，`null` 表示宿主不提供。 */
let cached: HostMarkdownText | null | undefined

/**
 * 探测并返回宿主 `MarkdownText`，拿不到返回 `null`。
 *
 * 只探测一次；失败结果同样缓存，避免每次渲染都触发异常路径。
 */
export function loadHostMarkdownText(): HostMarkdownText | null {
  if (cached !== undefined) return cached
  cached = null
  try {
    const moduleTable = require('@deepseek-ai/dsh-client-ui-primitives') as { MarkdownText?: unknown }
    const component = moduleTable?.MarkdownText
    if (typeof component === 'function' || (typeof component === 'object' && component !== null)) {
      cached = component as HostMarkdownText
    }
  } catch {
    cached = null
  }
  return cached
}

/** 测试注入入口：覆盖探测结果（生产代码不调用）。 */
export function setHostMarkdownTextForTest(component: HostMarkdownText | null | undefined): void {
  cached = component
}