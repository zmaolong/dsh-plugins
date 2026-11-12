/**
 * 外部记忆导入桥（survey P1：agentcairn native_memory / codex
 * external_agent_import 对位）：把外部 agent 的记忆文本导入本插件的五类型
 * 事实库。
 *
 * plan/apply 分离：`planImport` 只解析与判定（新建/强化/冲突提示），不落盘；
 * `applyImport` 复算同一计划后逐条 `store.save`（source=import、tier=long——
 * 用户显式迁移的内容直接长驻）。apply 幂等：同指纹条目由 save 转强化，重复
 * apply 不产生重复条目；宁可多写不可错删（fail-safe，冲突条目照建并标注）。
 *
 * 支持两种输入形态：
 * 1. frontmatter 文档（ZCode 全局记忆格式：`name/description/metadata.type`
 *    + 正文；支持多文档连排，`metadata:` 嵌套块由本模块自带解析器处理——
 *    通用 frontmatter 解析器会跳过嵌套结构）；
 * 2. 朴素 Markdown：按二级标题分条（标题即名称）。
 *
 * @module dsh-agent-extension/memory/import
 */

import { fingerprintOf } from './store.ts'
import { IMPORT_MAX_ITEMS, LIMITS, normalizeTags, text, type MemoryScope, type MemoryType } from './types.ts'

export { IMPORT_MAX_ITEMS, IMPORT_SOURCE_MAX_CHARS } from '../shared/memory-wire.ts'

/** 计划里的一条候选。 */
export interface ImportPlanItem {
  index: number
  name: string
  description: string
  type: MemoryType
  scope: MemoryScope
  content: string
  tags: string[]
  /** create = 新建；reinforce = 指纹命中既有条目（apply 转强化）；conflict = 同名不同内容（照建并提示）。 */
  action: 'create' | 'reinforce' | 'conflict'
  /** reinforce/conflict 命中的既有条目 id。 */
  existingId?: string
  reason: string
}

/** 一次导入计划。 */
export interface ImportPlan {
  items: ImportPlanItem[]
  /** 解析出来但被上限截掉的条数。 */
  dropped: number
}

/** apply 的结果。 */
export interface ImportApplyResult {
  created: number
  reinforced: number
  conflicts: number
  ids: string[]
  failed: number
  /** 超上限被截掉的候选条数。 */
  dropped: number
}

/** 外部类型（ZCode 全局记忆四类）到五类型的映射；未知落 reference。 */
function mapExternalType(raw: unknown): MemoryType {
  const value = text(raw)
  if (value === 'user') return 'preference'
  if (value === 'feedback') return 'preference'
  if (value === 'project') return 'project'
  if (value === 'reference') return 'reference'
  if (value === 'preference' || value === 'decision' || value === 'gotcha') return value
  return 'reference'
}

/** 解析一段 frontmatter 文档头（支持 `metadata:` 下一层的 `type` 等嵌套键）。 */
function parseImportFrontmatter(source: string): { data: Record<string, unknown>, bodyStart: number } | null {
  if (!source.startsWith('---')) return null
  const firstLineEnd = source.indexOf('\n')
  if (firstLineEnd === -1) return null
  const headerStart = firstLineEnd + 1
  const closing = source.indexOf('\n---', headerStart)
  if (closing === -1) return null
  const header = source.slice(headerStart, closing)
  const data: Record<string, unknown> = {}
  let metadata: Record<string, unknown> | null = null
  for (const line of header.split('\n')) {
    if (line.trim() === '' || line.trimStart().startsWith('#')) continue
    const nested = /^\s+([A-Za-z0-9_.-]+)\s*:\s*(.*)$/u.exec(line)
    if (nested !== null && metadata !== null) {
      metadata[nested[1] as string] = nested[2]?.trim() ?? ''
      continue
    }
    const pair = /^([A-Za-z0-9_.-]+)\s*:\s*(.*)$/u.exec(line)
    if (pair === null) continue
    const key = pair[1] as string
    const value = pair[2]?.trim() ?? ''
    if (value === '') {
      if (key === 'metadata') {
        metadata = {}
        data.metadata = metadata
      } else {
        data[key] = ''
      }
      continue
    }
    metadata = null
    data[key] = value
  }
  return { data, bodyStart: closing + 4 }
}

/** 一条解析出的候选。 */
export interface ParsedImport {
  name: string
  description: string
  type: MemoryType
  content: string
  tags: string[]
}

/** 解析一段正文为候选（frontmatter 形态）。 */
function candidateFromFrontmatter(data: Record<string, unknown>, body: string): ParsedImport | null {
  const name = text(data.name).slice(0, LIMITS.name)
  const content = body.trim().slice(0, LIMITS.content)
  if (name === '' || content === '') return null
  const description = text(data.description).slice(0, LIMITS.description)
    || content.replace(/\s+/gu, ' ').slice(0, LIMITS.description)
  const metadata = data.metadata !== null && typeof data.metadata === 'object'
    ? data.metadata as Record<string, unknown>
    : {}
  const tags = normalizeTags(data.tags)
  return {
    name,
    description,
    type: mapExternalType(data.type ?? metadata.type),
    content,
    tags,
  }
}

/** 从普通正文构造候选：首行截名称，全文即正文。 */
function candidateFromPlainText(source: string): ParsedImport | null {
  const content = source.trim().slice(0, LIMITS.content)
  if (content === '') return null
  const firstLine = content.split('\n', 1)[0] ?? ''
  const name = firstLine.replace(/^#+\s*/u, '').replace(/\s+/gu, ' ').trim().slice(0, LIMITS.name)
    || '未命名导入'
  const description = content.replace(/\s+/gu, ' ').slice(0, LIMITS.description)
  return { name, description, type: 'reference', content, tags: [] }
}

/**
 * 解析导入输入为候选列表。
 *
 * 形态判定：以 `---` 开头按 frontmatter 文档连排扫描（文档间共享 `---`
 * 分隔行——上一文档的正文结束即下一文档的头开始）；否则若含二级标题按
 * 标题分条（首个标题前的前言不作为条目）；都否则整段作为单条候选。
 * 正文里独立的 `---` 行会被当作文档分隔（导出单事实文件不含分隔线）。
 */
export function parseImportSource(source: string): ParsedImport[] {
  const raw = typeof source === 'string' ? source.replace(/^\uFEFF/u, '') : ''
  if (raw.trim() === '') return []
  const candidates: ParsedImport[] = []
  if (raw.startsWith('---')) {
    let rest = raw
    while (rest.trim() !== '' && candidates.length < IMPORT_MAX_ITEMS + 1) {
      const parsed = parseImportFrontmatter(rest)
      if (parsed === null) {
        // 头残缺的尾巴按普通文本兜底成一条，绝不静默丢弃。
        const fallback = candidateFromPlainText(rest)
        if (fallback !== null) candidates.push(fallback)
        break
      }
      const bodyEnd = rest.indexOf('\n---', parsed.bodyStart)
      const body = bodyEnd === -1 ? rest.slice(parsed.bodyStart) : rest.slice(parsed.bodyStart, bodyEnd)
      const candidate = candidateFromFrontmatter(parsed.data, body)
      if (candidate !== null) candidates.push(candidate)
      rest = bodyEnd === -1 ? '' : rest.slice(bodyEnd).replace(/^\s+/, '')
    }
    return candidates.slice(0, IMPORT_MAX_ITEMS)
  }
  if (/^##\s/imu.test(raw)) {
    const sections = raw.split(/^(?=##\s)/imu)
    for (const section of sections) {
      if (candidates.length >= IMPORT_MAX_ITEMS) break
      const trimmed = section.trim()
      if (trimmed === '') continue
      // 标题只认段落首行；首行不是二级标题的段落是前言，跳过。
      const firstLine = trimmed.split('\n', 1)[0] ?? ''
      const heading = /^##\s+(.+)$/u.exec(firstLine)
      if (heading === null) continue
      const content = trimmed.slice(firstLine.length).trim().slice(0, LIMITS.content)
      if (content === '') continue
      const name = (heading[1] ?? '').replace(/\s+/gu, ' ').trim().slice(0, LIMITS.name) || '未命名导入'
      const description = content.replace(/\s+/gu, ' ').slice(0, LIMITS.description)
      candidates.push({ name, description, type: 'reference', content, tags: [] })
    }
    return candidates
  }
  const single = candidateFromPlainText(raw)
  return single === null ? [] : [single]
}

/**
 * 产出导入计划（不落盘）。
 *
 * @param store - 形状最小化的存储访问（真实实例或测试 fake）。
 * @param source - 导入文本。
 * @param scope - 目标作用域。
 * @param project - 项目作用域的项目 key。
 */
export function planImport(
  store: { entries(scope: MemoryScope, project?: string): Array<{ id: string, name: string, description: string, content: string }> },
  source: string,
  scope: MemoryScope,
  project = '',
): ImportPlan {
  const parsed = parseImportSource(source)
  const existing = store.entries(scope, project)
  const fingerprints = new Map(existing.map(entry => [
    fingerprintOf(entry.name, entry.description, entry.content),
    entry.id,
  ]))
  const byName = new Map(existing.map(entry => [entry.name, entry.id]))
  const items: ImportPlanItem[] = []
  // 批内互查：同一批里的同名不同内容也是冲突（apply 顺序写入，后者照建）；
  // 批内同指纹由 apply 顺序 save 自然转强化，无需在这里特判。
  const pendingNames = new Set<string>()
  let dropped = 0
  for (const candidate of parsed) {
    if (items.length >= IMPORT_MAX_ITEMS) {
      dropped += 1
      continue
    }
    const fingerprint = fingerprintOf(candidate.name, candidate.description, candidate.content)
    const matchedId = fingerprints.get(fingerprint)
    if (matchedId !== undefined) {
      items.push({
        index: items.length,
        name: candidate.name,
        description: candidate.description,
        type: candidate.type,
        scope,
        content: candidate.content,
        tags: candidate.tags,
        action: 'reinforce',
        existingId: matchedId,
        reason: '与既有条目指纹一致，导入转为一次强化',
      })
      continue
    }
    const storeSameName = byName.get(candidate.name)
    const batchSameName = pendingNames.has(candidate.name)
    const conflict = storeSameName !== undefined || batchSameName
    items.push({
      index: items.length,
      name: candidate.name,
      description: candidate.description,
      type: candidate.type,
      scope,
      content: candidate.content,
      tags: candidate.tags,
      action: conflict ? 'conflict' : 'create',
      ...(storeSameName === undefined ? {} : { existingId: storeSameName }),
      reason: conflict
        ? (storeSameName === undefined
          ? '与本次导入的前一条同名但内容不同：照建新条目并在维护时研判，不覆盖既有内容'
          : '存在同名但内容不同的条目：照建新条目并在维护时研判，不覆盖既有内容')
        : '新建条目',
    })
    pendingNames.add(candidate.name)
  }
  return { items, dropped }
}

/** apply 的最小存储形状。 */
export interface ImportStoreLike {
  save(input: {
    name: string
    description: string
    type: MemoryType
    scope: MemoryScope
    project?: string
    content: string
    tags?: string[]
    source?: string
    tier?: 'short' | 'long'
  }): { id: string, reinforcement: number }
  entries(scope: MemoryScope, project?: string): Array<{ id: string, name: string, description: string, content: string }>
}

/**
 * 执行导入：服务端复算计划后逐条写入（source=import、tier=long）。
 *
 * 幂等：同指纹由 save 转强化；重复 apply 不会产生重复条目。单条失败不阻断
 * 其余条目（失败条目计进 `failed` 由调用方呈现）。
 */
export function applyImport(
  store: ImportStoreLike,
  source: string,
  scope: MemoryScope,
  project = '',
): ImportApplyResult {
  const plan = planImport(store, source, scope, project)
  const result: ImportApplyResult = { created: 0, reinforced: 0, conflicts: 0, ids: [], failed: 0, dropped: plan.dropped }
  for (const item of plan.items) {
    try {
      const saved = store.save({
        name: item.name,
        description: item.description,
        type: item.type,
        scope,
        ...(scope === 'project' && project !== '' ? { project } : {}),
        content: item.content,
        tags: item.tags,
        source: 'import',
        tier: 'long',
      })
      result.ids.push(saved.id)
      if (item.action === 'reinforce' || saved.reinforcement > 0) result.reinforced += 1
      else if (item.action === 'conflict') result.conflicts += 1
      else result.created += 1
    } catch {
      result.failed += 1
    }
  }
  return result
}
