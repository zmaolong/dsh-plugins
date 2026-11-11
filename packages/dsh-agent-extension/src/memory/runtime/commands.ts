/**
 * 用户命令：`/remember`、`/forget`、`/memory`。
 *
 * 与模型工具共用同一个存储与去重逻辑；`/forget` 只投一票（标记 stale），
 * 归档由用户在面板确认。
 *
 * @module dsh-agent-extension/memory/runtime/commands
 */

import type { AgentLike, CommandDescriptor, CommandsService } from '../../host.ts'
import type { LogFn } from '../../log.ts'
import { formatCommandSummary } from '../recall.ts'
import type { MemoryStore } from '../store.ts'
import { LIMITS, text, type MemoryScope, type ProjectIdentity } from '../types.ts'

/** 命令运行所需能力。 */
export interface MemoryCommandOptions {
  store: MemoryStore
  /** 解析（并登记）某 agent 的项目身份。 */
  projectForAgent: (agent: AgentLike | undefined) => ProjectIdentity | null
  touchProject: (identity: ProjectIdentity) => void
}

/** 命令处理结果。 */
interface CommandOutcome {
  kind: 'success' | 'error'
  text: string
}

/** `/remember` 的 handler。 */
function commandRemember(input: { rawInput?: unknown, agent?: AgentLike }, options: MemoryCommandOptions): CommandOutcome {
  const raw = text(input.rawInput)
  if (raw === '') return { kind: 'error', text: '用法：/remember [global] <要记住的内容>' }
  const requestedGlobal = /^global\s+/iu.test(raw)
  const body = raw.replace(/^global\s+/iu, '').trim()
  if (body === '') return { kind: 'error', text: '用法：/remember [global] <要记住的内容>' }
  const project = options.projectForAgent(input.agent)
  const scope: MemoryScope = requestedGlobal || project === null ? 'global' : 'project'
  const name = body.length > LIMITS.name ? `${body.slice(0, LIMITS.name - 1)}…` : body
  let entry
  try {
    entry = options.store.save({
      name,
      description: body.slice(0, LIMITS.description),
      type: 'preference',
      scope,
      project: scope === 'project' ? project?.projectKey ?? '' : '',
      content: body.slice(0, LIMITS.content),
      importance: 70,
      originSessionId: input.agent?.session?.id ?? '',
      source: 'user',
    })
  } catch (error) {
    return { kind: 'error', text: error instanceof Error ? error.message : String(error) }
  }
  if (scope === 'project' && project !== null) options.touchProject(project)
  const target = scope === 'global' ? '全局' : `项目（${project?.displayName ?? ''}）`
  return {
    kind: 'success',
    text: `${entry.reinforcement > 0 ? '已强化已有记忆' : '已记住'}：${entry.name}（${target}，id=${entry.id}）`,
  }
}

/** `/forget` 的 handler：只投一票，归档交给面板。 */
function commandForget(input: { rawInput?: unknown, agent?: AgentLike }, options: MemoryCommandOptions): CommandOutcome {
  const id = text(input.rawInput)
  if (id === '') return { kind: 'error', text: '用法：/forget <记忆 id>' }
  const project = options.projectForAgent(input.agent)
  const inProject = options.store.get('project', project?.projectKey ?? '', id) !== undefined
  try {
    const result = options.store.forget(inProject ? 'project' : 'global', inProject ? project?.projectKey ?? '' : '', id)
    return {
      kind: 'success',
      text: result.archived
        ? `记忆 ${id} 已归档。`
        : `记忆 ${id} 已标记为过时；归档由用户在面板确认。`,
    }
  } catch (error) {
    return { kind: 'error', text: error instanceof Error ? error.message : String(error) }
  }
}

/** `/memory` 的 handler：全局 + 当前项目的概况。 */
function commandMemory(input: { rawInput?: unknown, agent?: AgentLike }, options: MemoryCommandOptions): CommandOutcome {
  const identity = options.projectForAgent(input.agent)
  return { kind: 'success', text: formatCommandSummary(options.store, identity) }
}

/**
 * 注册三个记忆命令；注册失败逐条记录。
 *
 * @param commands - 宿主 commands 服务。
 * @param options - 存储与项目身份能力。
 * @param log - 注册失败日志。
 */
export function registerMemoryCommands(
  commands: CommandsService,
  options: MemoryCommandOptions,
  log: LogFn,
): Array<() => void> {
  const definitions: CommandDescriptor[] = [
    {
      name: 'remember',
      description: '保存一条长期记忆（默认项目级，可写 global）',
      input: { hint: '[global] <要记住的内容>' },
      handler: input => commandRemember(input, options),
    },
    {
      name: 'forget',
      description: '把一条记忆标记为过时（归档由面板确认）',
      input: { hint: '<记忆 id>' },
      handler: input => commandForget(input, options),
    },
    {
      name: 'memory',
      description: '查看当前全局/项目记忆概况',
      handler: input => commandMemory(input, options),
    },
  ]
  const disposers: Array<() => void> = []
  for (const definition of definitions) {
    try {
      const dispose = commands.register(definition)
      if (typeof dispose === 'function') disposers.push(dispose)
    } catch (error) {
      log('warn', `注册命令 /${definition.name} 失败：${error instanceof Error ? error.message : String(error)}`)
    }
  }
  return disposers
}