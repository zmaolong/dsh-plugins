/**
 * 记忆领域词汇与服务端专属助手。
 *
 * 跨端共用的类型、常量与纯函数放在 `src/shared/memory-wire.ts`，这里转出它们
 * 的公开面，因此既有导入路径（`./memory/types.ts`）保持不变。本文件只额外
 * 提供服务端专属的 schema 版本、项目身份与 Markdown 归一化助手。
 *
 * @module dsh-agent-extension/memory/types
 */

export * from '../shared/memory-wire.ts'

import { LIMITS, type ProjectIdentitySource } from '../shared/memory-wire.ts'

/** 单条记忆磁盘文件的当前 schema 版本。 */
export const MEMORY_SCHEMA = 3

/** 一个解析后的项目身份。 */
export interface ProjectIdentity {
  projectKey: string
  identity: string
  source: ProjectIdentitySource
  displayName: string
  /** 仓库根目录；非 git 项目为工作目录。 */
  root: string
}

/** 去空白后的非空字符串，或空字符串。 */
export function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

/** 归一化标签列表：去空白、丢空项/逗号、去重、限制长度与数量。 */
export function normalizeTags(value: unknown): string[] {
  const raw = Array.isArray(value)
    ? value
    : typeof value === 'string' ? value.split(',') : []
  const out: string[] = []
  for (const item of raw) {
    const tag = text(item).replace(/[,\n]/gu, ' ').trim()
    if (tag === '' || out.includes(tag)) continue
    out.push(tag.slice(0, LIMITS.tag))
    if (out.length >= LIMITS.tags) break
  }
  return out
}

/** 归一化 id 列表：去重、丢空项。 */
export function normalizeIds(value: unknown): string[] {
  const raw = Array.isArray(value) ? value : []
  const out: string[] = []
  for (const item of raw) {
    const id = text(item)
    if (id !== '' && !out.includes(id)) out.push(id)
  }
  return out
}