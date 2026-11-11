/**
 * 模型工具：`memory_search` / `memory_get` / `memory_save` / `memory_forget`。
 *
 * 契约（严格模式，ADR-0005/0006）：
 * - search 返回每行摘要并提示用 get 取全文，`type` 过滤下推到存储层；
 * - get 单次最多 3 条、总输出 4,000 字符，超限显式提示「已截断，请再取下一批」；
 * - save 要求 `scope` 必填，并提示先 search 查重；
 * - forget 只标记过时，不诱导模型二次调用归档。
 *
 * @module dsh-agent-extension/memory/runtime/tools
 */

import type { AgentLike, ToolDefinitionLike, ToolsService } from '../../host.ts'
import type { LogFn } from '../../log.ts'
import { formatGetResult, formatSearchResult, GET_MAX_CHARS, GET_MAX_IDS } from '../recall.ts'
import type { MemoryStore } from '../store.ts'
import {
  LIMITS,
  clampInt,
  isMemoryType,
  normalizeIds,
  normalizeTags,
  text,
  type MemoryEntry,
  type MemoryScope,
  type MemoryType,
  type ProjectIdentity,
} from '../types.ts'

/** 注册到宿主记忆工具的名字；路由与管理面按此列表判断工具是否存在。 */
export const MEMORY_TOOL_NAMES = ['memory_search', 'memory_get', 'memory_save', 'memory_forget'] as const

/** 给外部调用方收窄记忆类型。 */
export function asMemoryType(value: unknown): MemoryType | undefined {
  return isMemoryType(value) ? value : undefined
}

/** 工具运行所需的内存运行时能力。 */
export interface MemoryToolOptions {
  store: MemoryStore
  /** 解析（并登记）某 agent 的项目身份；工具执行属于写路径，允许解析。 */
  projectForAgent: (agent: AgentLike | undefined) => ProjectIdentity | null
  noteToolUsage: (agent: AgentLike | undefined, resultIds: readonly string[], usedIds: readonly string[]) => void
  /**
   * 记录一次成功的 `memory_search` 样本（诊断「最近检索」）。
   *
   * 由会话运行时或宿主装配注入；缺省时工具直接调 `store.recordRetrieval`，
   * 保证诊断数据面不会因为装配层遗漏而断档。
   */
  noteSearch?: (agent: AgentLike | undefined, query: string, resultIds: readonly string[]) => void
  /** 命中记账：只刷新派生的使用记录（内存累加，运行时批量落盘）。 */
  touchUsage: (ids: readonly string[]) => void
  touchProject: (identity: ProjectIdentity) => void
}

/**
 * 缺省检索样本记录器：从 agent 取会话 id（取不到用空串），直接写存储。
 *
 * @param store - 记忆存储。
 */
function defaultNoteSearch(store: MemoryStore): NonNullable<MemoryToolOptions['noteSearch']> {
  return (agent, query, resultIds) => {
    store.recordRetrieval({
      sessionId: typeof agent?.session?.id === 'string' ? agent.session.id : '',
      query,
      ids: resultIds,
    })
  }
}

/** 统一的结果渲染器：工具返回值是纯文本。 */
function textOutput(): ToolDefinitionLike['output'] {
  return {
    schema: { type: 'string' },
    render: (_args, value) => [{ type: 'text', text: String(value ?? '') }],
  }
}

/** 构造四个记忆工具的定义（不注册）。 */
export function createMemoryTools(options: MemoryToolOptions): ToolDefinitionLike[] {
  const { store } = options
  const noteSearch = options.noteSearch ?? defaultNoteSearch(store)

  const search: ToolDefinitionLike = {
    name: 'memory_search',
    description: 'Search durable long-term memories (global and current project) by keywords; an empty query lists the ranked index. Each result is one summary line: id · type · name · one-sentence description · updated date. Call memory_get with those ids for full content. The `type` filter is pushed down to the store.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Keywords to search; an empty string lists the ranked index.' },
        scope: { type: 'string', enum: ['all', 'global', 'project'], description: 'Search scope; defaults to all.' },
        type: {
          type: 'string',
          enum: ['preference', 'decision', 'gotcha', 'project', 'reference'],
          description: 'Only return memories of this type (filtered by the store).',
        },
        limit: { type: 'number', description: 'Maximum results (default 10, max 50).' },
      },
      required: ['query'],
    },
    output: textOutput(),
    execute: async (args, exec) => {
      const record = args !== null && typeof args === 'object' ? args as Record<string, unknown> : {}
      const query = text(record.query)
      const scopeValue = record.scope === 'global' || record.scope === 'project' ? record.scope : 'all'
      const type = asMemoryType(record.type)
      const limit = clampInt(record.limit, 1, 50, 10)
      const project = options.projectForAgent(exec.agent)
      const results = store.search(scopeValue, project?.projectKey ?? '', {
        query,
        ...(type === undefined ? {} : { type }),
        includeArchived: false,
        limit,
      })
      const resultIds = results.map(entry => entry.id)
      options.noteToolUsage(exec.agent, resultIds, [])
      noteSearch(exec.agent, query, resultIds)
      options.touchUsage(resultIds)
      return formatSearchResult(results, query)
    },
  }

  const get: ToolDefinitionLike = {
    name: 'memory_get',
    description: `Read the full content of one to three memories by id (ids come from memory_search). One call returns at most ${GET_MAX_IDS} memories and ${formatNumber(GET_MAX_CHARS)} characters; when the output budget cuts the result it says so explicitly and lists the ids to fetch next.`,
    parameters: {
      type: 'object',
      properties: {
        ids: {
          type: 'array',
          items: { type: 'string' },
          description: `Memory ids from memory_search (at most ${GET_MAX_IDS} per call).`,
        },
      },
      required: ['ids'],
    },
    output: textOutput(),
    execute: async (args, exec) => {
      const record = args !== null && typeof args === 'object' ? args as Record<string, unknown> : {}
      const ids = normalizeIds(record.ids)
      const requested = ids.slice(0, GET_MAX_IDS)
      const ignored = ids.slice(GET_MAX_IDS)
      const project = options.projectForAgent(exec.agent)
      const entries: MemoryEntry[] = []
      const missing: string[] = []
      for (const id of requested) {
        const entry = store.get('project', project?.projectKey ?? '', id)
          ?? store.get('global', '', id)
        if (entry === undefined) missing.push(id)
        else entries.push(entry)
      }
      options.noteToolUsage(exec.agent, [], entries.map(entry => entry.id))
      options.touchUsage(entries.map(entry => entry.id))
      // 正文被真正读取即使用证明：短期条目升级为长期（写回真源，一次性）。
      for (const entry of entries) {
        store.promoteRead(entry.scope, entry.project, entry.id)
      }
      return formatGetResult(entries, missing, { ignoredIds: ignored })
    },
  }

  const save: ToolDefinitionLike = {
    name: 'memory_save',
    description: 'Persist one durable fact (stable preference, decision, gotcha, project fact or reference) so later sessions can recall it. First run memory_search to check for duplicates; save only when the user explicitly asks to remember something, or when such a stable fact emerges and no existing memory already covers it. `scope` is required: global = a cross-project user preference or working convention; project = anything tied to this repository. New memories start as short-term (not injected into the session index); they are promoted to long-term (and injected) once actually read via memory_get or re-confirmed by another save. The Markdown body is capped at 8000 characters; longer input is truncated.',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Short title (<=60 chars).' },
        description: { type: 'string', description: 'One-sentence summary.' },
        type: { type: 'string', enum: ['preference', 'decision', 'gotcha', 'project', 'reference'] },
        scope: {
          type: 'string',
          enum: ['global', 'project'],
          description: 'Required. global = cross-project preference/convention; project = fact tied to this repository.',
        },
        content: { type: 'string', description: 'Markdown body with the durable detail (<=8000 chars).' },
        tags: { type: 'array', items: { type: 'string' } },
        importance: { type: 'number', description: '0-100; default 50.' },
        supersedes: { type: 'array', items: { type: 'string' }, description: 'Memory ids this fact replaces.' },
      },
      required: ['name', 'description', 'type', 'scope', 'content'],
    },
    output: textOutput(),
    execute: async (args, exec) => {
      const record = args !== null && typeof args === 'object' ? args as Record<string, unknown> : {}
      const name = text(record.name)
      const content = text(record.content)
      if (name === '') return '未保存：name 不能为空。'
      if (content === '') return '未保存：content 不能为空。'
      const scopeValue = record.scope
      if (scopeValue !== 'global' && scopeValue !== 'project') {
        return '未保存：scope 必填，只能是 global（跨项目偏好/约定）或 project（本仓库事实）。'
      }
      const project = options.projectForAgent(exec.agent)
      if (scopeValue === 'project' && project === null) {
        return '未保存：当前会话没有项目身份（工作目录不在 git 仓库内），请改用 scope=global。'
      }
      const scope: MemoryScope = scopeValue
      const description = text(record.description).slice(0, LIMITS.description)
        || content.replace(/\s+/gu, ' ').slice(0, LIMITS.description)
      let entry
      try {
        entry = store.save({
          name: name.slice(0, LIMITS.name),
          description,
          type: asMemoryType(record.type) ?? 'reference',
          scope,
          project: scope === 'project' ? project?.projectKey ?? '' : '',
          content: content.slice(0, LIMITS.content),
          tags: normalizeTags(record.tags),
          importance: clampInt(record.importance, 0, 100, 50),
          supersedes: normalizeIds(record.supersedes),
          originSessionId: exec.agent?.session?.id ?? '',
          source: 'tool',
        })
      } catch (error) {
        return `未保存：${error instanceof Error ? error.message : String(error)}`
      }
      if (scope === 'project' && project !== null) options.touchProject(project)
      const verb = entry.reinforcement > 0 ? '已强化已有记忆' : '已保存记忆'
      return `${verb} ${entry.id}（${entry.type}，${entry.scope}）。`
    },
  }

  const forget: ToolDefinitionLike = {
    name: 'memory_forget',
    description: 'Flag one memory as outdated. This marks it stale (it stops being injected but stays searchable); archiving is confirmed by the user in the management panel, so never call this twice to force an archive.',
    parameters: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Memory id from memory_search.' },
        reason: { type: 'string', description: 'Why the memory no longer holds.' },
      },
      required: ['id'],
    },
    output: textOutput(),
    execute: async (args, exec) => {
      const record = args !== null && typeof args === 'object' ? args as Record<string, unknown> : {}
      const id = text(record.id)
      if (id === '') return '未标记：id 不能为空。'
      const project = options.projectForAgent(exec.agent)
      const foundProject = store.get('project', project?.projectKey ?? '', id) !== undefined
      const scope: MemoryScope = foundProject ? 'project' : 'global'
      try {
        const result = store.forget(scope, scope === 'project' ? project?.projectKey ?? '' : '', id, text(record.reason))
        return result.archived
          ? `记忆 ${id} 已归档。`
          : `记忆 ${id} 已标记过时；归档由用户在面板确认。`
      } catch (error) {
        return `未标记：${error instanceof Error ? error.message : String(error)}`
      }
    },
  }

  return [search, get, save, forget]
}

/**
 * 向宿主 tools 服务注册四个记忆工具。
 *
 * @param tools - 宿主 tools 服务。
 * @param options - 存储与项目身份能力。
 * @param log - 注册失败日志。
 */
export function registerMemoryTools(
  tools: ToolsService,
  options: MemoryToolOptions,
  log: LogFn,
): Array<() => void> {
  const disposers: Array<() => void> = []
  for (const definition of createMemoryTools(options)) {
    try {
      disposers.push(tools.register(definition))
    } catch (error) {
      log('warn', `注册工具 ${definition.name} 失败：${error instanceof Error ? error.message : String(error)}`)
    }
  }
  if (disposers.length > 0) log('info', `记忆工具已注册：${disposers.length} 个（${MEMORY_TOOL_NAMES.join(' / ')}）`)
  return disposers
}

/** 给工具描述用的千位分隔数字（避免模板里写死 4,000 的魔法串）。 */
function formatNumber(value: number): string {
  return value.toLocaleString('en-US')
}