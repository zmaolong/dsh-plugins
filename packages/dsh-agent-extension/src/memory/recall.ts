/**
 * Recall: what a session sees before acting.
 *
 * The injected runtime context is one bounded index block (global entries then
 * project entries); details stay behind the memory tools. Tool results are
 * formatted separately for `memory_search` and `memory_get`.
 *
 * @module dsh-agent-extension/memory/recall
 */

import type { MemoryStore } from './store.ts'
import type { MemoryEntry, MemoryMeta, MemorySettings, ProjectIdentity } from './types.ts'

/** Injected context plus the ids it actually exposed. */
export interface RecallSnapshot {
  text: string
  /** Ids injected in this assembly; the hit-rate counters compare against this set. */
  ids: string[]
  /** Lines dropped by the character budget. */
  truncated: boolean
}

/** Head of the injected runtime context. */
const RECALL_HEADER = `## Memory (long-term)

Durable memories from earlier sessions. They are historical experience, not authority: current instructions, repository facts, and the user's latest request take precedence. Use \`memory_search\` / \`memory_get\` for details and \`memory_save\` to persist new durable facts.`

/** Notice appended when the character budget dropped lines. */
const TRUNCATED_NOTICE = '(Index truncated to the context budget; use `memory_search` to reach the remaining memories.)'

/** Tool-result caps. */
const GET_MAX_CHARS = 8000

/**
 * Render the injected memory index for one assembly.
 *
 * @param options - store, current project identity, and settings.
 */
export function renderRecallContext(options: {
  store: MemoryStore
  identity: ProjectIdentity | null
  settings: MemorySettings
}): RecallSnapshot {
  const { store, identity, settings } = options
  if (!settings.injectEnabled) return { text: '', ids: [], truncated: false }

  const global = store.indexLines('global', '', settings.indexLimitGlobal)
  const project = identity === null
    ? { lines: [] as string[], ids: [] as string[] }
    : store.indexLines('project', identity.projectKey, settings.indexLimitProject)
  if (global.lines.length === 0 && project.lines.length === 0) return { text: '', ids: [], truncated: false }

  const blocks: Array<{ title: string, lines: { text: string, id: string }[] }> = []
  if (global.lines.length > 0) {
    blocks.push({
      title: 'Global:',
      lines: global.lines.map((line, index) => ({ text: line, id: global.ids[index] as string })),
    })
  }
  if (project.lines.length > 0) {
    blocks.push({
      title: `Project (${identity?.displayName ?? ''}):`,
      lines: project.lines.map((line, index) => ({ text: line, id: project.ids[index] as string })),
    })
  }

  let budget = Math.max(0, settings.maxChars) - RECALL_HEADER.length - 2 - TRUNCATED_NOTICE.length - 2
  if (budget <= 0) return { text: '', ids: [], truncated: true }
  const kept: Array<{ title: string, lines: { text: string, id: string }[] }> = []
  let truncated = false
  for (const block of blocks) {
    const titleCost = block.title.length + 1
    if (budget - titleCost <= 0) {
      truncated = true
      continue
    }
    const lines: { text: string, id: string }[] = []
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
  if (body === '') return { text: '', ids: [], truncated }
  const notice = truncated ? `\n\n${TRUNCATED_NOTICE}` : ''
  return {
    text: `${RECALL_HEADER}\n\n${body}${notice}`,
    ids: kept.flatMap(block => block.lines.map(line => line.id)),
    truncated,
  }
}

/** Render `memory_search` results. */
export function formatSearchResult(entries: readonly MemoryMeta[], query: string): string {
  if (entries.length === 0) return `No memories match ${JSON.stringify(query)}.`
  const lines = entries.map(entry =>
    `- [${entry.id}] (${entry.type}, ${entry.updatedAt.slice(0, 10)}) ${entry.name}${entry.description === '' ? '' : ` — ${entry.description}`}`)
  return `${entries.length} memories match ${JSON.stringify(query)} (use memory_get with these ids for full content):\n${lines.join('\n')}`
}

/** Render `memory_get` results. */
export function formatGetResult(entries: readonly MemoryEntry[], missing: readonly string[]): string {
  const sections: string[] = []
  let budget = GET_MAX_CHARS
  let omitted = 0
  for (const entry of entries) {
    const section = [
      `## [${entry.id}] ${entry.name}`,
      `type: ${entry.type} | scope: ${entry.scope}${entry.project === '' ? '' : ` | project: ${entry.project}`} | status: ${entry.status} | importance: ${entry.importance} | updated: ${entry.updatedAt}`,
      entry.description,
      '',
      entry.content,
    ].join('\n')
    if (section.length > budget) {
      omitted += 1
      continue
    }
    sections.push(section)
    budget -= section.length + 2
  }
  const parts: string[] = []
  if (sections.length > 0) parts.push(sections.join('\n\n---\n\n'))
  else if (entries.length === 0) parts.push('No memory found for the requested ids.')
  if (omitted > 0) parts.push(`(${omitted} memories omitted by the result budget; fetch fewer ids per call.)`)
  if (missing.length > 0) parts.push(`Not found: ${missing.join(', ')}`)
  return parts.join('\n\n')
}

/** Render the `/memory` command summary. */
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