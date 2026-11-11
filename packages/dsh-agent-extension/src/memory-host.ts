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

import path from 'node:path'

import { hubError } from './hub.ts'
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
import {
  MAINTENANCE_MAX_CANDIDATES,
  MAINTENANCE_MAX_OUTPUT_TOKENS,
  MAINTENANCE_PURPOSE,
  MAINTENANCE_TEMPERATURE,
  MaintenanceLog,
  buildMaintenanceMessages,
  computeMaintenanceDue,
  executeMaintenancePlan,
  newMaintenanceRunId,
  parseMaintenancePlan,
  prescreenMaintenance,
  pruneMaintenanceTrash,
  validateMaintenancePlan,
} from './memory/maintenance.ts'
import { renderRecallContext } from './memory/recall.ts'
import {
  CaptureSessions,
  RecallCache,
  registerMemoryCommands,
  registerMemoryPrompt,
  registerMemoryTools,
} from './memory/runtime/index.ts'
import type { MemoryStore } from './memory/store.ts'
import {
  text,
  type MaintenanceModelRef,
  type MaintenanceRun,
  type MaintenanceStatusWire,
  type MemoryScope,
  type MemorySettings,
  type ProjectIdentity,
  type MaintenanceState,
} from './memory/types.ts'
import { USAGE_FLUSH_INTERVAL_MS, UsageStore } from './memory/usage.ts'

/** 宿主默认模型服务的结构面（ctx.get('agentDefaultModel')）。 */
interface AgentDefaultModelService {
  currentSelection?: () => unknown
}

/** 从一个选择值里取字符串 id（兼容 `{ id }` / `{ key }` / `{ name }`）。 */
function selectionText(value: unknown): string {
  if (typeof value === 'string') return value.trim()
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return ''
  const record = value as Record<string, unknown>
  return text(record.id) || text(record.key) || text(record.name)
}

/** 归一化宿主默认模型选择（`currentSelection()` 的返回形状按容错处理）。 */
function modelSelectionOf(raw: unknown): MaintenanceModelRef | null {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return null
  const record = raw as Record<string, unknown>
  const provider = selectionText(record.provider) || text(record.providerId) || text(record.providerID)
  const model = selectionText(record.model) || text(record.modelId) || text(record.modelID)
  return provider === '' || model === '' ? null : { provider, model }
}

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
  /** 维护状态文件；记忆根目录不可用时为 null。 */
  private readonly maintenanceLog: MaintenanceLog | null
  /** 维护 Run 的中断信号；dispose 时取消在途模型请求。 */
  private readonly maintenanceAbort = new AbortController()
  /** 同一时刻只允许一个维护 Run。 */
  private maintenanceTask: Promise<MaintenanceRun> | null = null
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
    this.maintenanceLog = root === '' ? null : new MaintenanceLog(root, options.log)
    this.sessions = new CaptureSessions({
      store: options.store,
      log: options.log,
      llm: () => this.llm(),
      // 与召回统计同一批时机落盘 usage（turn-stopping / disposed / dispose）。
      flushUsage: () => this.usage?.flush(),
      // assistant 文本引用回写与工具命中共用同一条 usage 通道。
      touchUsage: ids => this.usage?.touch(ids),
      // 会话末补漏完成后检查维护 due：达标且开关开启时后台自动跑一次。
      afterCapture: () => { void this.autoMaintainIfNeeded() },
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
    this.maintenanceAbort.abort()
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

  // ---------------------------------------------------------------------------
  // 维护 Run（ADR-0006）
  // ---------------------------------------------------------------------------

  /** 维护状态与 due 读数（面板进入时提示阈值）。 */
  maintenanceStatus(): MaintenanceStatusWire {
    const log = this.maintenanceLog
    if (log === null) {
      return { due: false, reason: 'unavailable', writesSince: 0, daysSince: -1, lastRunAt: null, recentRuns: [] }
    }
    try {
      const state = log.state()
      const stats = this.store.stats()
      const due = computeMaintenanceDue({
        lastRunAt: state.lastRunAt,
        capturedEntries: stats.capturedEntries,
        capturedEntriesAtLastRun: state.capturedEntriesAtLastRun,
        writeThreshold: this.store.settings().autoMaintenanceThreshold,
      })
      return {
        due: due.due,
        reason: due.reason,
        writesSince: due.writesSince,
        daysSince: due.daysSince,
        lastRunAt: state.lastRunAt,
        recentRuns: log.recent(),
      }
    } catch (error) {
      this.log('warn', `读取维护状态失败：${error instanceof Error ? error.message : String(error)}`)
      return { due: false, reason: 'unavailable', writesSince: 0, daysSince: -1, lastRunAt: null, recentRuns: [] }
    }
  }

  /**
   * 手动触发一次维护 Run：全局 + 一个项目（当前项目优先，其次最久未维护）。
   *
   * 每 Run 的模型/解析/执行失败都落一条 failed 流水并返回，不向调用方抛错。
   */
  async runMaintenance(request: { scope?: MemoryScope, project?: string } = {}): Promise<{ run: MaintenanceRun }> {
    if (this.disposed) throw hubError('记忆运行时已销毁', 'conflict')
    if (this.maintenanceLog === null) throw hubError('记忆维护不可用：缺少存储根目录', 'internal')
    if (this.maintenanceTask !== null) throw hubError('维护正在进行中，请稍后重试', 'conflict')
    const task = this.performMaintenance(request)
    this.maintenanceTask = task
    try {
      return { run: await task }
    } finally {
      if (this.maintenanceTask === task) this.maintenanceTask = null
    }
  }

  /**
   * 撤销一次维护 Run：用 trash 快照覆盖写回并标记 `undone`。
   *
   * 已撤销的 Run 幂等返回 `{ restored: 0 }`；不存在的 Run 抛 not_found。
   */
  undoMaintenance(runId: string): { restored: number } {
    const id = text(runId)
    if (id === '') throw hubError('缺少维护记录 id', 'bad_request')
    const log = this.maintenanceLog
    if (log === null) throw hubError('记忆维护不可用：缺少存储根目录', 'internal')
    const run = log.state().runs.find(item => item.id === id)
    if (run === undefined) throw hubError(`维护记录不存在：${id}`, 'not_found')
    if (run.undone) return { restored: 0 }
    const restored = this.store.restoreTrashRun(path.join(this.store.root, 'trash', id))
    log.markUndone(id)
    this.log('info', `维护 Run ${id} 已撤销：恢复 ${restored} 个文件`)
    return { restored }
  }

  /**
   * 会话末补漏后的自动维护检查：开关开启且 due 达标时后台跑一次 Run。
   *
   * 失败只记日志（含维护互斥冲突——手动 Run 进行中时自动跳过）。
   */
  private async autoMaintainIfNeeded(): Promise<void> {
    if (this.disposed || this.maintenanceTask !== null) return
    const settings = this.store.settings()
    if (!settings.autoMaintenance) return
    if (!this.maintenanceStatus().due) return
    try {
      await this.runMaintenance({})
      this.log('info', '维护达到阈值，已自动执行一次维护 Run')
    } catch (error) {
      this.log('warn', `自动维护执行失败：${error instanceof Error ? error.message : String(error)}`)
    }
  }

  /** 解析工作目录的项目身份（写路径，登记项目）。 */
  projectForPath(cwd: unknown): ProjectIdentity | null {
    return this.sessions.projectForPath(cwd)
  }

  /** 派生使用记录快照（面板列表融合 usedCount 用）；不可用时返回空表。 */
  usageSnapshot(): Readonly<Record<string, { usedCount: number; lastUsedAt: string }>> {
    return this.usage?.snapshot() ?? {}
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
      // 消费信号参与注入排序；load 幂等，未触发过工具时也能拿到已落盘记录。
      this.usage?.load()
      const snapshot = renderRecallContext({ store: this.store, identity, settings, usage: this.usage?.snapshot() ?? {} })
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
  // 维护 Run 内部实现
  // ---------------------------------------------------------------------------

  /** 选择本 Run 的项目：当前项目优先，其次从未维护/最久未维护的项目。 */
  private chooseMaintenanceProject(state: MaintenanceState): string {
    const projects = this.store.listProjects()
      .filter(project => project.key !== '' && this.store.countEntries('project', project.key) > 0)
    const current = this.sessions.recentProjectKey()
    if (current !== '' && projects.some(project => project.key === current)) return current
    // listProjects 已按 lastSeen 倒序：从未维护的项目里取最近出现的。
    const never = projects.find(project => state.projectRuns[project.key] === undefined)
    if (never !== undefined) return never.key
    let best = ''
    let bestAt = ''
    for (const project of projects) {
      const at = state.projectRuns[project.key] ?? ''
      if (best === '' || at < bestAt) {
        best = project.key
        bestAt = at
      }
    }
    return best
  }

  /** 维护模型：设置里成对指定时用它，否则继承宿主默认模型。 */
  private maintenanceRoute(settings: MemorySettings): MaintenanceModelRef | null {
    const provider = settings.maintenanceProvider.trim()
    const model = settings.maintenanceModel.trim()
    if (provider !== '' && model !== '') return { provider, model }
    const service = this.service<AgentDefaultModelService>('agentDefaultModel')
    if (service === null || typeof service.currentSelection !== 'function') return null
    try {
      return modelSelectionOf(service.currentSelection())
    } catch {
      return null
    }
  }

  /** 一次维护 Run 的完整流水线；错误以 failed Run 形式落盘。 */
  private async performMaintenance(request: { scope?: MemoryScope, project?: string }): Promise<MaintenanceRun> {
    const store = this.store
    const log = this.maintenanceLog
    if (log === null) throw hubError('记忆维护不可用：缺少存储根目录', 'internal')
    const now = Date.now()
    const at = new Date(now).toISOString()
    try {
      const removed = pruneMaintenanceTrash(path.join(store.root, 'trash'), now, this.log)
      if (removed > 0) this.log('info', `维护开始前清理了 ${removed} 个过期 trash 目录`)
    } catch (error) {
      this.log('warn', `清理旧 trash 失败：${error instanceof Error ? error.message : String(error)}`)
    }

    const state = log.state()
    const requestedProject = text(request.project)
    let projectKey = ''
    if (requestedProject !== '') {
      if (store.getProject(requestedProject) === undefined && store.countEntries('project', requestedProject) === 0) {
        throw hubError(`未知项目：${requestedProject}`, 'not_found')
      }
      projectKey = requestedProject
    } else if (request.scope !== 'global') {
      projectKey = this.chooseMaintenanceProject(state)
    }
    const scope: MemoryScope = projectKey === '' ? 'global' : 'project'
    const entries = [
      ...store.entries('global'),
      ...(projectKey === '' ? [] : store.entries('project', projectKey)),
    ]
    this.usage?.load()
    const usage = this.usage?.snapshot() ?? {}
    const prescreen = prescreenMaintenance({
      entries,
      usage,
      now,
      limit: MAINTENANCE_MAX_CANDIDATES,
      allEntries: store.allEntries(),
      observationDays: store.settings().observationDays,
    })
    const runId = newMaintenanceRunId(now)
    const counts = {
      candidates: prescreen.candidates.length,
      merges: 0,
      staled: 0,
      restored: 0,
      deleted: 0,
    }
    const base = {
      id: runId,
      at,
      scope,
      project: projectKey,
      model: null,
      status: 'empty' as const,
      counts,
      actions: [],
      error: '',
      undone: false,
    }

    if (prescreen.candidates.length === 0) {
      const run: MaintenanceRun = base
      this.recordMaintenanceRun(run)
      return run
    }

    const settings = store.settings()
    const model = this.maintenanceRoute(settings)
    if (model === null) {
      const run: MaintenanceRun = {
        ...base,
        status: 'failed',
        error: '未配置维护模型：请在设置里选择维护模型，或先打开一个会话以使用宿主默认模型',
      }
      this.recordMaintenanceRun(run)
      return run
    }
    const llm = this.llm()
    if (llm === null) {
      const run: MaintenanceRun = {
        ...base,
        model,
        status: 'failed',
        error: '宿主未提供 llm 服务，维护 Run 无法研判',
      }
      this.recordMaintenanceRun(run)
      return run
    }

    const messages = buildMaintenanceMessages({
      prescreen,
      project: projectKey === '' ? null : {
        key: projectKey,
        displayName: store.getProject(projectKey)?.displayName ?? projectKey,
      },
      usage,
      now,
    })
    let raw = ''
    let finishFailure: { message: string, code: string, status?: number } | null = null
    const chunkTypes = new Map<string, number>()
    try {
      const parts: string[] = []
      let length = 0
      const stream = llm.stream({
        provider: model.provider,
        model: model.model,
        messages: messages.map(message => ({
          role: message.role,
          content: [{ type: 'text' as const, text: message.content }],
        })),
        maxTokens: MAINTENANCE_MAX_OUTPUT_TOKENS,
        temperature: MAINTENANCE_TEMPERATURE,
        reasoningEffort: 'off',
        purpose: MAINTENANCE_PURPOSE,
        signal: this.maintenanceAbort.signal,
      })
      for await (const chunk of stream) {
        chunkTypes.set(chunk.type, (chunkTypes.get(chunk.type) ?? 0) + 1)
        if (chunk.type === 'text-delta' && typeof chunk.text === 'string') {
          parts.push(chunk.text)
          length += chunk.text.length
        } else if (chunk.type === 'block-end' && chunk.block?.type === 'text' && typeof chunk.block.text === 'string') {
          parts.push(chunk.block.text)
          length += chunk.block.text.length
        } else if (chunk.type === 'finish') {
          // 模型端鉴权/路由失败不会抛错，而是以 error/aborted finish 结束；把原因带回 Run.error。
          const reason = chunk.reason as unknown
          if (reason !== null && typeof reason === 'object' && 'failure' in (reason as Record<string, unknown>)) {
            const failure = (reason as { failure?: Record<string, unknown> }).failure ?? {}
            finishFailure = {
              message: typeof failure.message === 'string' ? failure.message : String(failure.code ?? 'unknown'),
              code: typeof failure.code === 'string' ? failure.code : 'unknown',
              ...(typeof failure.status === 'number' ? { status: failure.status } : {}),
            }
          }
        }
        if (length > 200_000) break
      }
      raw = parts.join('')
    } catch (error) {
      const run: MaintenanceRun = {
        ...base,
        model,
        status: 'failed',
        error: `维护模型调用失败：${error instanceof Error ? error.message : String(error)}`,
      }
      this.recordMaintenanceRun(run)
      return run
    }

    if (raw.trim() === '' && finishFailure !== null) {
      const detail = finishFailure.status === undefined
        ? finishFailure.code
        : `${finishFailure.code}/${finishFailure.status}`
      const run: MaintenanceRun = {
        ...base,
        model,
        status: 'failed',
        error: `维护模型调用失败：${finishFailure.message}（${detail}）`,
      }
      this.recordMaintenanceRun(run)
      return run
    }

    const plan = parseMaintenancePlan(raw)
    if (plan === null) {
      const snippet = raw.slice(0, 240).replace(/\s+/gu, ' ')
      const types = [...chunkTypes].map(([type, count]) => `${type}:${count}`).join(', ')
      const run: MaintenanceRun = {
        ...base,
        model,
        status: 'failed',
        error: snippet === ''
          ? `维护模型没有返回文本（chunks: ${types === '' ? 'none' : types}）`
          : `维护模型输出无法解析为结构化计划（开头：${snippet}）`,
      }
      this.recordMaintenanceRun(run)
      return run
    }

    const validated = validateMaintenancePlan(plan, prescreen)
    if (validated.rejected.length > 0) {
      for (const rejection of validated.rejected.slice(0, 20)) {
        this.log('warn', `维护计划被拒绝（${rejection.kind} ${rejection.id}）：${rejection.reason}`)
      }
      if (validated.truncated) this.log('warn', '维护计划动作数超过上限，已截断')
    }
    const execution = executeMaintenancePlan(store, validated, prescreen, {
      trashRoot: path.join(store.root, 'trash', runId),
      candidates: prescreen.candidates.length,
      log: this.log,
    })
    const run: MaintenanceRun = {
      ...base,
      model,
      status: execution.error !== ''
        ? 'failed'
        : execution.actions.length === 0 ? 'empty' : 'completed',
      counts: execution.counts,
      actions: execution.actions,
      error: execution.error,
    }
    this.recordMaintenanceRun(run)
    return run
  }

  /** 写一条维护流水；写入失败只记日志，不影响返回。 */
  private recordMaintenanceRun(run: MaintenanceRun): void {
    try {
      this.maintenanceLog?.record(run, this.store.stats().capturedEntries)
    } catch (error) {
      this.log('warn', `写维护流水失败：${error instanceof Error ? error.message : String(error)}`)
    }
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