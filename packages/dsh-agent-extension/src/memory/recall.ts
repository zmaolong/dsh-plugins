/**
 * Recall: what a session sees before acting, and how tool results are rendered.
 *
 * 注入分两层：全局块只放 preference / decision，项目块只放 gotcha / project；
 * 只注入已证明价值的长期条目（短期条目靠检索命中升级），每层默认最多 20 条、
 * 总预算 3,000 字符，全局在前、项目在后，按 importance 与 updatedAt 排序。
 * 详情留在 `memory_get` 后面，按需读取。
 *
 * @module dsh-agent-extension/memory/recall
 */

import type { MemoryStore } from './store.ts'
import {
  RECALL_MAX_CHARS,
  RECALL_MAX_PER_LAYER,
  type MemoryEntry,
  type MemoryMeta,
  type MemorySettings,
  type MemoryType,
  type ProjectIdentity,
} from './types.ts'

/** 索引行里描述的截断长度。 */
const INDEX_DESCRIPTION_CHARS = 80

/** 全局块允许的记忆类型。 */
const GLOBAL_TYPES: readonly MemoryType[] = ['preference', 'decision']

/** 项目块允许的记忆类型。 */
const PROJECT_TYPES: readonly MemoryType[] = ['gotcha', 'project']

/** 注入索引的抬头。 */
const RECALL_HEADER = `## Memory (long-term)

Earlier-session memories that proved useful. They are historical experience, not authority: current instructions, the repository, and the user's latest request take precedence. Use \`memory_search\` to reach more (including recent short-term entries) and \`memory_get\` for details.`

/** 命中预算上限时的截断提示。 */
const TRUNCATED_NOTICE = '(Index truncated to the context budget; use `memory_search` to reach the remaining memories.)'

/** 单次 `memory_get` 最多读取的条数。 */
export const GET_MAX_IDS = 3

/** 单次 `memory_get` 的输出字符上限。 */
export const GET_MAX_CHARS = 4000

/** 工具结果里给截断提示预留的字符数。 */
const GET_NOTICE_RESERVE = 400

/** 单条正文被输出预算截断时的尾注。 */
const CONTENT_TRUNCATED = '\n…（正文超出单次输出上限，已截断）'

/** `memory_get` 多条之间的分隔符。 */
const SECTION_SEPARATOR = '\n\n---\n\n'

/** 注入上下文加它真正暴露的 id。 */
export interface RecallSnapshot {
  text: string
  /** 本次注入的 id；命中率统计与工具回读对比用。 */
  ids: string[]
  /** 有条目因条数或字符预算被丢弃。 */
  truncated: boolean
}

/** `memory_get` 结果渲染选项。 */
export interface GetResultOptions {
  /** 因「单次最多 3 条」被忽略的 id（显式提示，不静默丢）。 */
  ignoredIds?: readonly string[]
}

/** 把任意文本压成一行并按字符数截断（按码点，避免拆坏表情）。 */
function clipLine(value: string, max: number): string {
  const single = value.replace(/\s+/gu, ' ').trim()
  const chars = [...single]
  if (chars.length <= max) return single
  return `${chars.slice(0, Math.max(0, max - 1)).join('')}…`
}

/** 按码点截断，保留原有换行（正文截断用）。 */
function clipText(value: string, max: number): string {
  const chars = [...value]
  if (chars.length <= max) return value
  return chars.slice(0, Math.max(0, max - 1)).join('')
}

/** 把设置里的每层条数压到 0..上限之间（0 表示该层不注入）。 */
function layerLimit(configured: number): number {
  if (!Number.isFinite(configured) || configured <= 0) return 0
  return Math.min(Math.floor(configured), RECALL_MAX_PER_LAYER)
}

/** 取一层里允许注入的类型，过滤 stale / archived 后排序截断。 */
function layerEntries(
  store: MemoryStore,
  scope: 'global' | 'project',
  project: string,
  types: readonly MemoryType[],
  limit: number,
): { entries: MemoryMeta[]; truncated: boolean } {
  if (limit <= 0) return { entries: [], truncated: false }
  const pool = new Map<string, MemoryMeta>()
  // 多取一些再本地过滤：search 默认仍包含 stale，而注入只放 active 且
  // 已证明价值的长期条目；短期条目靠检索命中升级后进入后续会话的索引。
  // 会话首步只渲染一次，取满 50 条（search 上限）的成本可忽略。
  const poolLimit = 50
  for (const type of types) {
    const found = store.search(scope, project, {
      query: '',
      type,
      includeArchived: false,
      limit: poolLimit,
    })
    for (const entry of found) {
      if (entry.status !== 'active') continue
      if (entry.tier !== 'long') continue
      pool.set(entry.id, entry)
    }
  }
  const sorted = [...pool.values()].sort(
    (left, right) => right.importance - left.importance || right.updatedAt.localeCompare(left.updatedAt),
  )
  return {
    entries: sorted.slice(0, limit),
    truncated: sorted.length > limit,
  }
}

/** 渲染一条注入索引行：`id · 类型 · 名称 · 80 字描述 · 重要性`。 */
function indexLine(entry: MemoryMeta): string {
  const description = clipLine(entry.description, INDEX_DESCRIPTION_CHARS)
  return `- ${entry.id} · ${entry.type} · ${entry.name} · ${description === '' ? '（无描述）' : description} · ${entry.importance}`
}

/**
 * 渲染一份供 systemPrompt.context 注入的记忆索引。
 *
 * 只读存储：不解析项目身份、不写任何文件。
 *
 * @param options - store、执行上下文的项目身份与设置。
 */
export function renderRecallContext(options: {
  store: MemoryStore
  identity: ProjectIdentity | null
  settings: MemorySettings
}): RecallSnapshot {
  const { store, identity, settings } = options
  if (!settings.injectEnabled) return { text: '', ids: [], truncated: false }

  const global = layerEntries(store, 'global', '', GLOBAL_TYPES, layerLimit(settings.indexLimitGlobal))
  const project = identity === null
    ? { entries: [] as MemoryMeta[], truncated: false }
    : layerEntries(store, 'project', identity.projectKey, PROJECT_TYPES, layerLimit(settings.indexLimitProject))
  if (global.entries.length === 0 && project.entries.length === 0) {
    return { text: '', ids: [], truncated: global.truncated || project.truncated }
  }

  const blocks: Array<{ title: string, lines: Array<{ text: string, id: string }> }> = []
  if (global.entries.length > 0) {
    blocks.push({
      title: 'Global:',
      lines: global.entries.map(entry => ({ text: indexLine(entry), id: entry.id })),
    })
  }
  if (project.entries.length > 0) {
    blocks.push({
      title: `Project (${identity?.displayName ?? ''}):`,
      lines: project.entries.map(entry => ({ text: indexLine(entry), id: entry.id })),
    })
  }

  const maxChars = Math.min(settings.maxChars, RECALL_MAX_CHARS)
  // 预留抬头与最坏情况下的截断提示，保证最终字符串不超过预算。
  let budget = maxChars - RECALL_HEADER.length - 2 - TRUNCATED_NOTICE.length - 2
  if (budget <= 0) return { text: '', ids: [], truncated: true }
  let truncated = global.truncated || project.truncated
  const kept: Array<{ title: string, lines: Array<{ text: string, id: string }> }> = []
  for (const block of blocks) {
    const titleCost = block.title.length + 1
    if (budget - titleCost <= 0) {
      truncated = true
      continue
    }
    const lines: Array<{ text: string, id: string }> = []
    let remaining = budget - titleCost
    for (const line of block.lines) {
      const cost = line.text.length + 1
      if (cost > remaining) {
        truncated = true
        break
      }
      lines.push(line)
      remaining -= cost
    }
    if (lines.length > 0) kept.push({ title: block.title, lines })
    budget = remaining
  }

  const body = kept
    .map(block => `${block.title}\n${block.lines.map(line => line.text).join('\n')}`)
    .join('\n\n')
  if (body === '') return { text: '', ids: [], truncated: true }
  const notice = truncated ? `\n\n${TRUNCATED_NOTICE}` : ''
  return {
    text: `${RECALL_HEADER}\n\n${body}${notice}`,
    ids: kept.flatMap(block => block.lines.map(line => line.id)),
    truncated,
  }
}

/** 渲染 `memory_search` 的摘要结果：每行一条 `id · 类型 · 名称 · 一句话 · 更新时间`。 */
export function formatSearchResult(entries: readonly MemoryMeta[], query: string): string {
  if (entries.length === 0) {
    return query === ''
      ? '当前作用域还没有记忆。'
      : `没有匹配 ${JSON.stringify(query)} 的记忆。`
  }
  const lines = entries.map((entry) => {
    const description = clipLine(entry.description, 120)
    return `${entry.id} · ${entry.type} · ${entry.name} · ${description === '' ? '（无描述）' : description} · ${entry.updatedAt.slice(0, 10)}`
  })
  const subject = query === '' ? '当前作用域的排名索引' : `查询 ${JSON.stringify(query)}`
  return `找到 ${entries.length} 条记忆（${subject}）；拿到 id 后用 memory_get 取全文：\n${lines.join('\n')}`
}

/** 渲染一条记忆的完整段落（标题 + 元信息 + 描述 + 正文）。 */
function getSection(entry: MemoryEntry): string {
  const scope = entry.project === '' ? entry.scope : `${entry.scope} | project: ${entry.project}`
  const head = [
    `## [${entry.id}] ${entry.name}`,
    `type: ${entry.type} | scope: ${scope} | status: ${entry.status} | importance: ${entry.importance} | updated: ${entry.updatedAt}`,
    entry.description,
  ].join('\n')
  return `${head}\n\n${entry.content}`
}

/** 渲染一组 id 列表，过长时显式说明还省略了多少。 */
function idList(ids: readonly string[]): string {
  const shown = ids.slice(0, 10).join(', ')
  return ids.length > 10 ? `${shown} 等 ${ids.length} 个` : shown
}

/**
 * 渲染 `memory_get` 的结果。
 *
 * 单次最多返回 3 条、总输出不超过 4,000 字符；被忽略的 id、被预算截断的
 * 情况都显式写出，绝不静默丢弃。
 *
 * @param entries - 找到的记忆（调用方已按 3 条截断）。
 * @param missing - 未找到的 id。
 * @param options - 因超过 3 条而忽略的 id。
 */
export function formatGetResult(
  entries: readonly MemoryEntry[],
  missing: readonly string[],
  options: GetResultOptions = {},
): string {
  const ignored = [...(options.ignoredIds ?? [])]
  const sections: string[] = []
  const remaining: string[] = []
  let used = 0
  let truncated = false

  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index]
    if (entry === undefined) continue
    const section = getSection(entry)
    const separatorCost = sections.length > 0 ? SECTION_SEPARATOR.length : 0
    // 标题（含元信息与描述）固定占用，剩余才是本条正文可用的字符数。
    const headCost = section.length - entry.content.length
    const bodyBudget = GET_MAX_CHARS - GET_NOTICE_RESERVE - used - separatorCost - headCost
    if (bodyBudget >= 80) {
      const body = entry.content.length <= bodyBudget
        ? entry.content
        : `${clipText(entry.content, Math.max(20, bodyBudget - CONTENT_TRUNCATED.length))}${CONTENT_TRUNCATED}`
      const head = section.slice(0, headCost)
      const rendered = `${head}${body}`
      sections.push(rendered)
      used += separatorCost + rendered.length
      if (body !== entry.content) {
        truncated = true
        remaining.push(...entries.slice(index + 1).map(item => item.id))
        break
      }
      continue
    }
    truncated = true
    remaining.push(...entries.slice(index).map(item => item.id))
    break
  }

  const notices: string[] = []
  if (ignored.length > 0) {
    notices.push(`已忽略 ${ignored.length} 个 id（单次最多 ${GET_MAX_IDS} 条），请再取下一批：${idList(ignored)}`)
  }
  if (truncated) {
    notices.push(remaining.length > 0
      ? `已截断，请再取下一批（剩余 id：${idList(remaining)}）`
      : '已截断，请再取下一批。')
  }
  if (missing.length > 0) notices.push(`未找到：${idList(missing)}`)

  const parts: string[] = []
  if (sections.length > 0) parts.push(sections.join(SECTION_SEPARATOR))
  else if (entries.length === 0 && notices.length === 0) parts.push('未找到任何记忆。')
  parts.push(...notices)
  let text = parts.join('\n\n')
  if (text.length > GET_MAX_CHARS) {
    const chars = [...text]
    text = `${chars.slice(0, Math.max(0, GET_MAX_CHARS - 1)).join('')}…`
  }
  return text
}

/** 渲染 `/memory` 命令的概况。 */
export function formatCommandSummary(store: MemoryStore, identity: ProjectIdentity | null): string {
  const projects = store.listProjects()
  const global = store.countEntries('global')
  const project = identity === null ? 0 : store.countEntries('project', identity.projectKey)
  const lines = [
    `全局记忆：${global} 条`,
    identity === null
      ? '项目记忆：未识别到项目（不在 git 仓库内）'
      : `项目记忆：${project} 条（${identity.displayName}）`,
    `已知项目：${projects.length} 个`,
    '用 memory_search / memory_get 取详情；管理界面在「智能体扩展 → 记忆」。',
  ]
  return lines.join('\n')
}