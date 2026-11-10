/**
 * 提示词注入：极短的使用指南（静态 section）+ 会话首步快照索引（动态 context）。
 *
 * 与 `AGENTS.md` 的分工：人写的静态规则留在 `AGENTS.md`，这里只声明
 * 「长期记忆工具怎么用」；行为策略（何时捕获、如何提炼）不写进提示词。
 *
 * 索引只在会话首次装配时渲染一次，之后每步返回同一个字符串；宿主按内容
 * 去重，压缩替换后会自动重新追加。refresh 由面板「刷新索引」显式失效。
 *
 * @module dsh-agent-extension/memory/runtime/prompt
 */

import type {
  AgentLike,
  AssembleContextLike,
  PromptContextLike,
  PromptSectionLike,
  SystemPromptService,
} from '../../host.ts'
import type { LogFn } from '../../log.ts'

/** 静态使用指南；保持极短，不复述「什么时候该记」的长篇策略。 */
export const MEMORY_GUIDE = `## Memory

长期记忆工具：\`memory_search\` / \`memory_get\` / \`memory_save\` / \`memory_forget\`。
- 保存前先 \`memory_search\` 查重；仅当用户显式要求记住，或出现稳定的偏好、决策、坑、项目事实且没有重复时才调用 \`memory_save\`。
- 不记录临时任务状态、密钥、凭证或大段代码；正文上限 8000 字符。
- 静态规则放 \`AGENTS.md\`，这里只存跨会话的长期事实；记忆是历史经验，当前指令与用户最新要求优先。
- 记忆过时用 \`memory_forget\` 标记；归档由用户在面板确认。`

/** section 与 context 在宿主提示词里的固定名字（面板刷新按名字定位）。 */
export const MEMORY_GUIDE_SECTION = 'agent-extension:memory-guide'
export const MEMORY_CONTEXT_SECTION = 'agent-extension:memory'

/** 会话 → 已渲染索引字符串的缓存上限（与运行时会话缓冲同量级）。 */
const RECALL_CACHE_LIMIT = 200

/**
 * 会话首步索引缓存。
 *
 * 只存内存；`invalidate` 由 `MemoryRuntime.invalidateRecall()` 暴露给面板。
 */
export class RecallCache {
  private readonly entries = new Map<string, string>()
  private readonly limit: number

  constructor(limit = RECALL_CACHE_LIMIT) {
    this.limit = Math.max(1, limit)
  }

  /** 取某会话已渲染的字符串；未命中返回 undefined。 */
  get(sessionId: string): string | undefined {
    if (sessionId === '') return undefined
    return this.entries.get(sessionId)
  }

  /** 记录某会话的首步渲染结果；超出上限时淘汰最早的一条。 */
  set(sessionId: string, value: string): void {
    if (sessionId === '') return
    if (!this.entries.has(sessionId) && this.entries.size >= this.limit) {
      const oldest = this.entries.keys().next().value
      if (oldest !== undefined) this.entries.delete(oldest)
    }
    this.entries.set(sessionId, value)
  }

  /** 失效一个会话（不传则清空全部）；下一次装配会重新渲染。 */
  invalidate(sessionId?: string): void {
    if (sessionId === undefined) {
      this.entries.clear()
      return
    }
    this.entries.delete(sessionId)
  }

  /** 当前缓存条数（诊断与测试用）。 */
  get size(): number {
    return this.entries.size
  }
}

/**
 * 向宿主的 systemPrompt 服务注册两条提示词贡献。
 *
 * 注册失败逐条记录并继续；返回的 disposer 由调用方统一回收。
 *
 * @param systemPrompt - 宿主提示词服务。
 * @param recallText - 渲染某 agent 的索引（内部按会话缓存）。
 * @param log - 失败日志。
 */
export function registerMemoryPrompt(
  systemPrompt: SystemPromptService,
  recallText: (agent: AgentLike | undefined) => string,
  log: LogFn,
): Array<() => void> {
  const disposers: Array<() => void> = []
  try {
    const section: PromptSectionLike = {
      name: MEMORY_GUIDE_SECTION,
      order: 700,
      text: MEMORY_GUIDE,
      interpolate: false,
    }
    disposers.push(systemPrompt.section(section))
  } catch (error) {
    log('warn', `注册记忆使用指南失败：${error instanceof Error ? error.message : String(error)}`)
  }
  try {
    const context: PromptContextLike = {
      name: MEMORY_CONTEXT_SECTION,
      order: 150,
      required: false,
      interpolate: false,
      text: (assembly: AssembleContextLike) => recallText(assembly.agent),
    }
    disposers.push(systemPrompt.context(context))
  } catch (error) {
    log('warn', `注册记忆上下文失败：${error instanceof Error ? error.message : String(error)}`)
  }
  if (disposers.length > 0) log('info', '记忆提示词已注册（使用指南 + 索引注入）')
  return disposers
}