/**
 * 记忆功能的宿主薄组合层。
 *
 * 每个插件实例一个运行时，负责把这些模块接到宿主 ctx 上：
 * - `memory/runtime/prompt.ts`：极短使用指南 + 会话首步索引快照；
 * - `memory/runtime/tools.ts`：四个模型工具；
 * - `memory/runtime/commands.ts`：`/remember`、`/forget`、`/memory`；
 * - `memory/runtime/capture-session.ts`：事件缓冲、项目身份与会话末补漏；
 * - `memory/runtime/stats.ts`：召回命中计数与批量落盘。
 *
 * 对外导出保持兼容：`MemoryRuntime`、`MemoryRuntimeOptions`、
 * `MEMORY_TOOL_NAMES`、`asMemoryType`。
 *
 * @module dsh-agent-extension/memory-host
 */

import type {
  AgentLike,
  HostContext,
  LlmService,
  SessionEventLike,
  SessionLike,
  SystemPromptService,
  ToolsService,
} from './host.ts'
import type { LogFn } from './log.ts'
import { renderRecallContext } from './memory/recall.ts'
import {
  CaptureSessions,
  RecallCache,
  registerMemoryCommands,
  registerMemoryPrompt,
  registerMemoryTools,
} from './memory/runtime/index.ts'
import type { MemoryStore } from './memory/store.ts'
import type { ProjectIdentity } from './memory/types.ts'
import { USAGE_FLUSH_INTERVAL_MS, UsageStore } from './memory/usage.ts'

/** 运行时构造选项。 */
export interface MemoryRuntimeOptions {
  ctx: HostContext
  store: MemoryStore
  log: LogFn
}

/** 记忆运行时：宿主服务注册、会话索引缓存与生命周期。 */
export class MemoryRuntime {
  private readonly ctx: HostContext
  private readonly store: MemoryStore
  private readonly log: LogFn
  private readonly sessions: CaptureSessions
  private readonly recallCache = new RecallCache()
  /** 派生的使用记录；记忆根目录不可用时为 null（测试里的 fake store）。 */
  private readonly usage: UsageStore | null
  /** 30 秒兜底落盘定时器；dispose 时清理。 */
  private usageTimer: ReturnType<typeof setInterval> | null = null
  private readonly disposers: Array<() => void> = []
  private llmService: LlmService | null = null
  private started = false
  private disposed = false

  constructor(options: MemoryRuntimeOptions) {
    this.ctx = options.ctx
    this.store = options.store
    this.log = options.log
    const root = typeof options.store.root === 'string' ? options.store.root.trim() : ''
    this.usage = root === '' ? null : new UsageStore({ root, log: options.log })
    this.sessions = new CaptureSessions({
      store: options.store,
      log: options.log,
      llm: () => this.llm(),
      // 与召回统计同一批时机落盘 usage（turn-stopping / disposed / dispose）。
      flushUsage: () => this.usage?.flush(),
    })
  }

  /** 接上宿主事件、提示词、工具与命令；单项失败不阻断其它项。 */
  start(): void {
    if (this.started) return
    this.started = true
    const steps: Array<[string, () => void]> = [
      ['存储目录', () => this.store.start()],
      ['使用记录', () => this.usage?.load()],
      ['事件监听', () => this.registerEventListeners()],
      ['提示词注入', () => this.registerPromptContributions()],
      ['模型工具', () => this.registerTools()],
      ['命令', () => this.registerCommands()],
    ]
    for (const [label, run] of steps) {
      try {
        run()
      } catch (error) {
        this.log('warn', `记忆初始化「${label}」失败：${error instanceof Error ? error.message : String(error)}`)
      }
    }
    this.startUsageTimer()
  }

  /** 30 秒兜底落盘：定时器不阻碍进程退出，dispose 时清理。 */
  private startUsageTimer(): void {
    if (this.usage === null || this.usageTimer !== null) return
    try {
      const timer = setInterval(() => {
        this.usage?.flush()
      }, USAGE_FLUSH_INTERVAL_MS)
      timer.unref?.()
      this.usageTimer = timer
    } catch (error) {
      this.log('warn', `启动使用记录定时落盘失败：${error instanceof Error ? error.message : String(error)}`)
    }
  }

  /** 停止后台工作、落盘统计并释放注册。 */
  async dispose(): Promise<void> {
    if (this.disposed) return
    this.disposed = true
    if (this.usageTimer !== null) {
      clearInterval(this.usageTimer)
      this.usageTimer = null
    }
    this.usage?.flush()
    const stopping = this.sessions.dispose()
    for (const dispose of this.disposers.splice(0)) {
      try {
        dispose()
      } catch {
        /* 单个 disposer 失败不阻断收尾 */
      }
    }
    this.recallCache.invalidate()
    await stopping
  }

  /**
   * 清空索引缓存；不传 sessionId 时清空全部。
   *
   * 面板「刷新索引」（`POST /memory/refresh-index`）经 hooks 调用。
   */
  invalidateRecall(sessionId?: string): void {
    this.recallCache.invalidate(sessionId)
  }

  /** 解析工作目录的项目身份（写路径，登记项目）。 */
  projectForPath(cwd: unknown): ProjectIdentity | null {
    return this.sessions.projectForPath(cwd)
  }

  /** 解析某个 agent 的项目身份（写路径）。 */
  projectForAgent(agent: AgentLike | undefined): ProjectIdentity | null {
    return this.sessions.projectForAgent(agent)
  }

  // ---------------------------------------------------------------------------
  // 事件 / 提示词
  // ---------------------------------------------------------------------------

  private registerEventListeners(): void {
    this.listen('session/event', (...args) => {
      this.sessions.onSessionEvent(args[0] as SessionLike, args[1] as SessionEventLike)
    })
    this.listen('agent/turn-stopping', (...args) => {
      this.sessions.onTurnStopping(args[0])
    })
    this.listen('agent/disposed', (...args) => {
      this.sessions.onAgentDisposed(args[0])
    })
  }

  private listen(event: string, listener: (...args: unknown[]) => void): void {
    try {
      const dispose = this.ctx.on(event, (...args) => {
        try {
          listener(...args)
        } catch (error) {
          this.log('warn', `处理 ${event} 失败：${error instanceof Error ? error.message : String(error)}`)
        }
      })
      if (typeof dispose === 'function') this.disposers.push(dispose as () => void)
    } catch (error) {
      this.log('warn', `订阅 ${event} 失败：${error instanceof Error ? error.message : String(error)}`)
    }
  }

  private registerPromptContributions(): void {
    const systemPrompt = this.service<SystemPromptService>('systemPrompt')
    if (systemPrompt !== null) {
      this.applyPrompt(systemPrompt)
      return
    }
    this.log('info', '等待 systemPrompt 服务就绪后注册记忆提示词')
    try {
      this.ctx.inject(['systemPrompt'], (scope) => {
        const ready = this.serviceFrom<SystemPromptService>(scope, 'systemPrompt')
        if (ready !== null) this.applyPrompt(ready)
      })
    } catch (error) {
      this.log('warn', `等待 systemPrompt 服务失败：${error instanceof Error ? error.message : String(error)}`)
    }
  }

  private applyPrompt(systemPrompt: SystemPromptService): void {
    this.disposers.push(...registerMemoryPrompt(systemPrompt, agent => this.recallText(agent), this.log))
  }

  /** 提示词装配入口：同一会话首步渲染一次，之后命中缓存。 */
  private recallText(agent: AgentLike | undefined): string {
    if (agent === undefined || this.disposed) return ''
    const sessionId = typeof agent.session?.id === 'string' ? agent.session.id : ''
    if (sessionId === '') return this.renderRecall(agent)
    const cached = this.recallCache.get(sessionId)
    if (cached !== undefined) return cached
    const rendered = this.renderRecall(agent)
    this.recallCache.set(sessionId, rendered)
    return rendered
  }

  /** 真正的索引渲染；只读存储与内存缓冲，不解析项目身份。 */
  private renderRecall(agent: AgentLike): string {
    try {
      const settings = this.store.settings()
      if (!settings.injectEnabled) return ''
      const session = agent.session
      if (session !== undefined && this.sessions.isSubagent(session)) return ''
      const buffer = session === undefined ? null : this.sessions.bufferForSession(session)
      // 项目身份只读：优先事件路径已解析的结果，其次读缓存；绝不在这里 resolveProject。
      const identity = buffer?.project ?? this.sessions.cachedProjectForAgent(agent)
      const snapshot = renderRecallContext({ store: this.store, identity, settings })
      if (buffer !== null && session !== undefined) {
        for (const id of snapshot.ids) buffer.injected.add(id)
        this.sessions.noteInjection(session, {
          entries: snapshot.ids.length,
          chars: snapshot.text.length,
          truncated: snapshot.truncated,
        })
      }
      return snapshot.text
    } catch (error) {
      // 装配期异常绝不能拖垮宿主提示词。
      this.log('warn', `渲染记忆上下文失败：${error instanceof Error ? error.message : String(error)}`)
      return ''
    }
  }

  // ---------------------------------------------------------------------------
  // 工具 / 命令
  // ---------------------------------------------------------------------------

  private registerTools(): void {
    const tools = this.service<ToolsService>('tools')
    if (tools !== null) {
      this.applyTools(tools)
      return
    }
    this.log('info', '等待 tools 服务就绪后注册记忆工具')
    try {
      this.ctx.inject(['tools'], (scope) => {
        const ready = this.serviceFrom<ToolsService>(scope, 'tools')
        if (ready !== null) this.applyTools(ready)
      })
    } catch (error) {
      this.log('warn', `等待 tools 服务失败：${error instanceof Error ? error.message : String(error)}`)
    }
  }

  private applyTools(tools: ToolsService): void {
    this.disposers.push(...registerMemoryTools(tools, {
      store: this.store,
      projectForAgent: agent => this.sessions.projectForAgent(agent),
      noteToolUsage: (agent, resultIds, usedIds) => this.sessions.noteToolUsage(agent, resultIds, usedIds),
      touchUsage: ids => this.usage?.touch(ids),
      touchProject: identity => this.sessions.touchProject(identity),
    }, this.log))
  }

  private registerCommands(): void {
    const commands = this.ctx.commands
    if (commands === undefined) return
    this.disposers.push(...registerMemoryCommands(commands, {
      store: this.store,
      projectForAgent: agent => this.sessions.projectForAgent(agent),
      touchProject: identity => this.sessions.touchProject(identity),
    }, this.log))
  }

  // ---------------------------------------------------------------------------
  // 宿主服务查找
  // ---------------------------------------------------------------------------

  private service<T>(name: string): T | null {
    // `ctx.get` 读全局服务表且不声明 inject；属性代理会抛
    // "cannot get property <name> without inject"。
    try {
      const viaGet = this.ctx.get<T>(name)
      if (viaGet !== undefined && viaGet !== null) return viaGet
    } catch {
      /* 服务表可能拒绝未知键 */
    }
    return null
  }

  private serviceFrom<T>(scope: unknown, name: string): T | null {
    if (scope === null || typeof scope !== 'object') return null
    const getter = (scope as { get?: (key: string) => unknown }).get
    if (typeof getter === 'function') {
      try {
        const value = getter.call(scope, name)
        if (value !== undefined && value !== null) return value as T
      } catch {
        /* 退化到注入属性 */
      }
    }
    try {
      const direct = (scope as Record<string, unknown>)[name]
      if (direct !== undefined && direct !== null) return direct as T
    } catch {
      /* 属性代理拒绝未注入的服务 */
    }
    return null
  }

  private llm(): LlmService | null {
    if (this.llmService !== null) return this.llmService
    this.llmService = this.service<LlmService>('llm')
    return this.llmService
  }
}

/** 工具名列表（路由与管理面使用），保持原导出。 */
export { MEMORY_TOOL_NAMES, asMemoryType } from './memory/runtime/index.ts'