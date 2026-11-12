/**
 * 会话级捕获编排：事件缓冲、轮界、项目身份缓存与会话末一次补漏提炼。
 *
 * ADR-0006：轮末（`agent/turn-stopping`）不再触发模型请求，只做缓冲与统计；
 * 会话销毁（`agent/disposed`）在 `captureEnabled` 与 `captureSessionEnd` 都
 * 打开时执行一次批量补漏。同一会话保持「单运行 + 单排队（后到覆盖先到）」。
 *
 * 项目身份解析（会写 `.dsh/agent-extension/memory/config.json` 与
 * `.git/info/exclude`）只发生在事件/工具路径；提示词装配只读缓存。
 *
 * @module dsh-agent-extension/memory/runtime/capture-session
 */

import type { AgentLike, LlmService, SessionEventLike, SessionLike } from '../../host.ts'
import type { LogFn } from '../../log.ts'
import {
  EXTRACTION_MAX_OUTPUT_TOKENS,
  EXTRACTION_TEMPERATURE,
  buildExtractionMessages,
  digestOf,
  isHumanMessage,
  parseExtraction,
  textOfUserEvent,
  type ExistingMemory,
  type TurnDigest,
  type TurnEvent,
} from '../capture.ts'
import { resolveProject } from '../identity.ts'
import type { MemoryStore } from '../store.ts'
import { text, type CreatedRef, type MemoryScope, type ProjectIdentity } from '../types.ts'
import { buildRecallTurnMessage, renderRecallTurn, selectRecallTurnEntries } from './recall-turn.ts'
import { flushRecall, noteToolUsage as countToolUsage, recordCaptureAttempt, citedMemoryIds, type InjectionSample, type RecallCounters } from './stats.ts'

/** 每个会话缓冲的事件数上限；只影响记忆提炼输入。 */
const EVENT_BUFFER_LIMIT = 400
/** 内存里保留的会话数；最久未活跃的先淘汰。 */
const SESSION_LIMIT = 200
/** 项目身份缓存寿命。 */
const PROJECT_CACHE_TTL_MS = 30_000
/** 项目登记（projects.json）的最小间隔。 */
const PROJECT_TOUCH_INTERVAL_MS = 5 * 60_000
/** 一次提炼请求最多收集的字符数。 */
const EXTRACTION_MAX_CHARS = 20_000

/** 带轮次的缓冲事件。 */
export interface BufferedEvent extends TurnEvent {
  turn: number
}

/** 模型路由（会话最近一次请求头，或 agent options）。 */
export interface ModelRoute {
  provider: string
  model: string
}

/** 一个会话的缓冲与捕获状态。 */
export interface SessionBuffer extends RecallCounters {
  session: SessionLike
  sessionId: string
  agent: AgentLike | null
  subagent: boolean
  currentTurn: number
  lastCapturedTurn: number
  /** 引用回写已扫到的轮次；轮末增量扫描 assistant 文本用。 */
  lastCitedTurn: number
  /** 轮级召回已呈现过的 id（会话内冷却账本）。 */
  recalled: Set<string>
  /** 宿主缺 agent.inject 的提示只发一次。 */
  recallUnavailableWarned: boolean
  /** 待注入的轮级召回 prompt；在 inbox 发布周期之外（宏任务/status 触发）注入。 */
  pendingRecall: string | null
  /** 延迟注入的定时器；同一会话只挂一个。 */
  recallTimer: ReturnType<typeof setTimeout> | null
  events: BufferedEvent[]
  project: ProjectIdentity | null
  modelRoute: ModelRoute | null
  /** 首步（或刷新后）的装配样本；落盘一次后清标记。 */
  injection: InjectionSample | null
  injectionRecorded: boolean
  running: boolean
  pending: TurnDigest | null
  lastTouchedAt: number
}

/** `CaptureSessions` 依赖。 */
export interface CaptureSessionsOptions {
  store: MemoryStore
  log: LogFn
  /** 宿主 llm 服务（可能晚到，每次提炼时再取）。 */
  llm: () => LlmService | null
  /** 批量落盘派生的使用记录（与召回统计同一批时机；可省略）。 */
  flushUsage?: () => void
  /** 记录一批消费命中（assistant 文本引用回写；可省略）。 */
  touchUsage?: (ids: readonly string[]) => void
  /** 每个提炼任务完成后调用（此刻捕获统计刚更新；自动维护检查挂在这里）。 */
  afterCapture?: () => void
}

/** 会话缓冲、项目身份与提炼队列。 */
export class CaptureSessions {
  private readonly store: MemoryStore
  private readonly log: LogFn
  private readonly getLlm: () => LlmService | null
  private readonly flushUsage: () => void
  private readonly touchUsage: (ids: readonly string[]) => void
  private readonly afterCapture: (() => void) | null
  private readonly abort = new AbortController()
  private readonly buffers = new Map<string, SessionBuffer>()
  private readonly projectCache = new Map<string, { identity: ProjectIdentity, at: number }>()
  private readonly projectTouches = new Map<string, number>()
  /** 最近一次解析出的项目 key；维护 Run 的「当前项目优先」依据。 */
  private recentProject: { key: string; at: number } | null = null
  private readonly operations = new Set<Promise<unknown>>()
  private disposed = false

  constructor(options: CaptureSessionsOptions) {
    this.store = options.store
    this.log = options.log
    this.getLlm = options.llm
    this.flushUsage = options.flushUsage ?? (() => {})
    this.touchUsage = options.touchUsage ?? (() => {})
    this.afterCapture = options.afterCapture ?? null
  }

  // ---------------------------------------------------------------------------
  // 会话事件
  // ---------------------------------------------------------------------------

  /** 缓冲一条会话事件；首个事件顺带解析（并登记）项目身份。 */
  onSessionEvent(session: SessionLike, event: SessionEventLike): void {
    if (this.disposed) return
    const buffer = this.bufferForSession(session)
    const data = event.data !== null && typeof event.data === 'object' ? event.data as Record<string, unknown> : {}
    if (event.type === 'turn/start') {
      // 宿主通常带 data.turn；缺失时按轮界自增，保证 force 只看当前轮。
      const turn = typeof data.turn === 'number' ? data.turn : buffer.currentTurn + 1
      buffer.currentTurn = turn
    } else if (event.type === 'turn/end') {
      if (typeof data.turn === 'number') buffer.currentTurn = data.turn
    }
    buffer.events.push({ seq: event.seq, type: event.type, data: event.data, turn: buffer.currentTurn })
    if (buffer.events.length > EVENT_BUFFER_LIMIT) {
      buffer.events.splice(0, buffer.events.length - EVENT_BUFFER_LIMIT)
    }
    buffer.lastTouchedAt = Date.now()
    this.ensureProject(buffer)
    // 轮级轻量召回：真人 prompt 先暂存，注入延迟到 inbox 发布周期之外——
    // 宿主禁止在 append 发布期间重入 append（真机实测：同步 inject 抛
    // "session append cannot reenter while another append is being published"）。
    if (event.type === 'user/message' && isHumanMessage(event.data)) {
      const prompt = textOfUserEvent(event.data)
      if (prompt !== '') {
        buffer.pendingRecall = prompt
        this.scheduleRecallInject(buffer)
      }
    }
  }

  /**
   * 宿主 `agent/status` 事件（idle ⇄ running）：driver 被唤醒进入 running
   * 时补射一次延迟注入——此时 user/message 的发布已结束，inject 能被本轮
   * 最近的 step 边界认领。status 事件本身也可能在发布周期内发出，所以
   * 这里同样走宏任务，不在监听器里同步 inject。
   */
  onAgentStatus(payload: unknown): void {
    if (this.disposed) return
    const record = payload !== null && typeof payload === 'object' ? payload as Record<string, unknown> : {}
    if (record.status !== 'running') return
    const agent = record.agent as AgentLike | undefined
    if (agent?.session === undefined) return
    const buffer = this.buffers.get(this.sessionIdOf({ session: agent.session }))
    if (buffer === undefined || buffer.pendingRecall === null) return
    buffer.agent = agent
    this.scheduleRecallInject(buffer)
  }

  /** 合并调度一次延迟注入；同一会话同一时刻只挂一个宏任务。 */
  private scheduleRecallInject(buffer: SessionBuffer): void {
    if (this.disposed || buffer.recallTimer !== null) return
    buffer.recallTimer = setTimeout(() => {
      buffer.recallTimer = null
      this.attemptRecallInject(buffer)
    }, 0)
    buffer.recallTimer.unref?.()
  }

  /**
   * 真正的轮级召回注入：设置开启、非子代理、首步快照已渲染过（防同轮重复）
   * 且宿主 agent 暴露 inject 时，对暂存的 prompt 做一次检索并把命中记忆
   * 经 agent.inject 排队到下一 step 边界呈现。
   *
   * 重入冲突（`cannot reenter`）保留暂存等下一次触发重试；其它异常清掉
   * 暂存只记日志。检索/渲染/注入任何异常都不会影响主对话（fail-open）。
   */
  private attemptRecallInject(buffer: SessionBuffer): void {
    if (this.disposed || buffer.pendingRecall === null) return
    const prompt = buffer.pendingRecall
    const settings = this.store.settings()
    if (!settings.turnRecall || !settings.injectEnabled) {
      buffer.pendingRecall = null
      return
    }
    if (buffer.subagent || buffer.injection === null) {
      buffer.pendingRecall = null
      return
    }
    const agent = buffer.agent
    const inject = agent?.inject
    if (typeof inject !== 'function') {
      buffer.pendingRecall = null
      if (!buffer.recallUnavailableWarned) {
        buffer.recallUnavailableWarned = true
        this.log('info', '轮级召回不可用：宿主 agent 未暴露 inject，本会话跳过（每会话只提示一次）')
      }
      return
    }
    try {
      const exclude = new Set<string>([...buffer.injected, ...buffer.searched, ...buffer.recalled])
      const entries = selectRecallTurnEntries(this.store, prompt, buffer.project?.projectKey ?? '', exclude)
      const rendered = renderRecallTurn(entries)
      // 没命中也清暂存：同一 prompt 不反复检索（下一条用户消息会覆盖暂存）。
      buffer.pendingRecall = null
      if (rendered === '') return
      inject.call(agent, buildRecallTurnMessage(rendered))
      for (const entry of entries) buffer.recalled.add(entry.id)
      this.log('info', `轮级召回已注入 ${entries.length} 条（${entries.map(entry => entry.id).join(', ')}）`)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (message.includes('reenter')) {
        // 仍在发布周期内（status 事件同步触发等场景）：保留暂存，等下一次
        // status→running 或宏任务重试。
        return
      }
      buffer.pendingRecall = null
      this.log('warn', `轮级召回注入失败：${message}`)
    }
  }

  /** agent 注册（`agent/created`）：尽早捕获 agent 引用，首轮事件即可用。 */
  onAgentCreated(payload: unknown): void {
    if (this.disposed) return
    const record = payload !== null && typeof payload === 'object' ? payload as Record<string, unknown> : {}
    const agent = record.agent as AgentLike | undefined
    if (agent?.session === undefined) return
    this.bufferForSession(agent.session).agent = agent
  }

  /**
   * 轮末：只落盘召回统计，不再触发任何模型请求（ADR-0006）。
   *
   * 轮末仍更新 agent 与模型路由，供会话末补漏使用。
   */
  onTurnStopping(payload: unknown): void {
    if (this.disposed) return
    const record = payload !== null && typeof payload === 'object' ? payload as Record<string, unknown> : {}
    const agent = record.agent as AgentLike | undefined
    if (agent?.session === undefined) return
    const buffer = this.bufferForSession(agent.session)
    buffer.agent = agent
    buffer.modelRoute = this.modelRouteOf(agent) ?? buffer.modelRoute
    this.ensureProject(buffer)
    this.flushRecall(buffer)
    this.flushCitedUsage(buffer)
    this.flushUsage()
  }

  /**
   * 轮末引用回写：assistant 文本引用的本会话已知记忆 id 计一次消费。
   *
   * B10 注入抬头「依赖时引用 id」规约的承接（codex citation 闭环）：模型
   * 不经 `memory_get`、直接在回复中依据注入索引行动时，消费信号只有这条
   * 通路能捕捉。只认「本会话暴露过的 id」（注入索引 ∪ 工具结果），正文里
   * 偶然出现的同形字符串不会误计；按轮增量扫描（游标推进到当前轮，重复
   * 轮不重复计）。
   */
  private flushCitedUsage(buffer: SessionBuffer): void {
    if (buffer.currentTurn <= buffer.lastCitedTurn) return
    const digest = this.digestForTurns(buffer, buffer.currentTurn, buffer.lastCitedTurn + 1)
    buffer.lastCitedTurn = buffer.currentTurn
    const text = digest === null ? '' : digest.assistantTexts.join('\n')
    if (text === '') return
    const known = new Set([...buffer.injected, ...buffer.searched, ...buffer.recalled])
    if (known.size === 0) return
    const cited = citedMemoryIds(text).filter(id => known.has(id))
    if (cited.length === 0) return
    this.touchUsage(cited)
    for (const id of cited) buffer.used.add(id)
  }

  /** 会话销毁：批量补漏提炼一次，然后释放缓冲。 */  onAgentDisposed(payload: unknown): void {
    if (this.disposed) return
    const record = payload !== null && typeof payload === 'object' ? payload as Record<string, unknown> : {}
    const agent = record.agent as AgentLike | undefined
    const sessionId = this.sessionIdOf(agent)
    if (sessionId === '') return
    const buffer = this.buffers.get(sessionId)
    if (buffer === undefined) return
    this.flushRecall(buffer)
    this.flushUsage()
    try {
      this.captureSessionEnd(buffer, agent)
    } catch (error) {
      this.log('warn', `会话结束补漏失败：${error instanceof Error ? error.message : String(error)}`)
    } finally {
      this.buffers.delete(sessionId)
    }
  }

  // ---------------------------------------------------------------------------
  // 项目身份
  // ---------------------------------------------------------------------------

  /** 解析项目身份（写路径，工具/命令/事件可用；提示词装配不要调用）。 */
  projectForPath(cwd: unknown): ProjectIdentity | null {
    const directory = text(cwd)
    if (directory === '') return null
    const cached = this.projectCache.get(directory)
    if (cached !== undefined && Date.now() - cached.at < PROJECT_CACHE_TTL_MS) {
      this.touchProject(cached.identity)
      return cached.identity
    }
    try {
      const identity = resolveProject(directory)
      this.projectCache.set(directory, { identity, at: Date.now() })
      this.touchProject(identity)
      return identity
    } catch (error) {
      this.log('warn', `解析项目身份失败：${error instanceof Error ? error.message : String(error)}`)
      return null
    }
  }

  /** 解析某 agent 的项目身份（写路径）。 */
  projectForAgent(agent: AgentLike | undefined): ProjectIdentity | null {
    return this.projectForPath(agent?.session?.header?.cwd)
  }

  /** 只读项目身份：提示词装配用，不解析、不写盘。 */
  cachedProjectForAgent(agent: AgentLike | undefined): ProjectIdentity | null {
    const directory = text(agent?.session?.header?.cwd)
    if (directory === '') return null
    const cached = this.projectCache.get(directory)
    if (cached === undefined || Date.now() - cached.at >= PROJECT_CACHE_TTL_MS) return null
    return cached.identity
  }

  /** 最近一次解析出的项目 key（维护 Run 选项目用）；没有则为空串。 */
  recentProjectKey(): string {
    return this.recentProject?.key ?? ''
  }

  /** 登记项目（写 projects.json），5 分钟内同一项目只写一次。 */
  touchProject(identity: ProjectIdentity): void {
    this.recentProject = { key: identity.projectKey, at: Date.now() }
    const last = this.projectTouches.get(identity.projectKey) ?? 0
    if (Date.now() - last < PROJECT_TOUCH_INTERVAL_MS) return
    this.projectTouches.set(identity.projectKey, Date.now())
    try {
      this.store.touchProject(identity)
    } catch (error) {
      this.log('warn', `登记项目失败：${error instanceof Error ? error.message : String(error)}`)
    }
  }

  // ---------------------------------------------------------------------------
  // 缓冲与统计
  // ---------------------------------------------------------------------------

  /** 取（或创建）一个会话缓冲；做容量淘汰。 */
  bufferForSession(session: SessionLike): SessionBuffer {
    const sessionId = this.sessionIdOf({ session })
    const existing = this.buffers.get(sessionId)
    if (existing !== undefined) return existing
    const buffer: SessionBuffer = {
      session,
      sessionId,
      agent: null,
      subagent: session.header?.origin === 'subagent',
      currentTurn: 0,
      lastCapturedTurn: 0,
      lastCitedTurn: 0,
      recalled: new Set(),
      recallUnavailableWarned: false,
      pendingRecall: null,
      recallTimer: null,
      events: [],
      injected: new Set(),
      used: new Set(),
      overflow: new Set(),
      searched: new Set(),
      searchedCount: 0,
      searchUsed: new Set(),
      project: null,
      modelRoute: null,
      injection: null,
      injectionRecorded: false,
      running: false,
      pending: null,
      lastTouchedAt: Date.now(),
    }
    this.buffers.set(sessionId, buffer)
    if (this.buffers.size > SESSION_LIMIT) {
      let oldest: SessionBuffer | null = null
      for (const candidate of this.buffers.values()) {
        if (candidate.running) continue
        if (oldest === null || candidate.lastTouchedAt < oldest.lastTouchedAt) oldest = candidate
      }
      if (oldest !== null && oldest !== buffer) this.buffers.delete(oldest.sessionId)
    }
    return buffer
  }

  /** 该会话是否是子代理（子代理不注入、不捕获）。 */
  isSubagent(session: SessionLike | undefined): boolean {
    if (session === undefined) return false
    return this.bufferForSession(session).subagent
  }

  /** 工具检索/读取的命中记账（纯内存）。 */
  noteToolUsage(agent: AgentLike | undefined, resultIds: readonly string[], usedIds: readonly string[]): void {
    const session = agent?.session
    if (session === undefined) return
    countToolUsage(this.bufferForSession(session), resultIds, usedIds)
  }

  /** 记下一次装配样本（纯内存；下次轮末/会话末批量落盘）。 */
  noteInjection(session: SessionLike, sample: InjectionSample): void {
    if (this.disposed) return
    const buffer = this.bufferForSession(session)
    buffer.injection = sample
    buffer.injectionRecorded = false
  }

  /** 会话 id；缺省为空串。 */
  sessionIdOf(agent: AgentLike | undefined): string {
    const id = agent?.session?.id
    return typeof id === 'string' ? id : ''
  }

  /** 停止后台工作：中断流、落盘计数、等待在途任务。 */
  async dispose(): Promise<void> {
    if (this.disposed) return
    this.disposed = true
    this.abort.abort()
    for (const buffer of this.buffers.values()) {
      if (buffer.recallTimer !== null) {
        clearTimeout(buffer.recallTimer)
        buffer.recallTimer = null
      }
      this.flushRecall(buffer)
    }
    this.flushUsage()
    this.buffers.clear()
    await Promise.allSettled([...this.operations])
  }

  // ---------------------------------------------------------------------------
  // 内部：事件/身份/提炼
  // ---------------------------------------------------------------------------

  /** 首次事件时解析项目身份；此后只读缓冲里的值。 */
  private ensureProject(buffer: SessionBuffer): void {
    if (buffer.project !== null) return
    const identity = this.projectForPath(buffer.session.header?.cwd)
    if (identity !== null) buffer.project = identity
  }

  /** 落盘一个会话的召回计数与装配样本。 */
  private flushRecall(buffer: SessionBuffer): void {
    const injection = buffer.injection !== null && !buffer.injectionRecorded ? buffer.injection : undefined
    flushRecall({
      store: this.store,
      sessionId: buffer.sessionId,
      counters: buffer,
      ...(injection === undefined ? {} : { injection }),
      log: this.log,
    })
    if (injection !== undefined) buffer.injectionRecorded = true
  }

  /** 会话末的批量补漏：开关、子代理、模型路由都满足才发一次请求。 */
  private captureSessionEnd(buffer: SessionBuffer, agent: AgentLike | undefined): void {
    const settings = this.store.settings()
    if (!settings.captureEnabled) return
    if (!settings.captureSessionEnd) return
    if (buffer.subagent) return
    if (agent !== undefined) buffer.agent = agent
    buffer.modelRoute = buffer.modelRoute ?? this.modelRouteOf(agent)
    if (buffer.modelRoute === null) {
      this.log('warn', '会话结束补漏缺少模型路由（会话尚无请求头），跳过')
      recordCaptureAttempt(this.store, this.log, 0, true, {
        sessionId: buffer.sessionId,
        skippedReason: 'no-model-route',
      })
      return
    }
    const digest = this.digestForTurns(buffer, buffer.currentTurn, buffer.lastCapturedTurn + 1)
    if (digest === null
      || (digest.userTexts.length === 0 && digest.assistantTexts.length === 0 && !digest.hadToolCalls)) {
      recordCaptureAttempt(this.store, this.log, 0, true, {
        sessionId: buffer.sessionId,
        skippedReason: 'empty-session',
      })
      return
    }
    this.enqueueExtraction(buffer, digest)
  }

  /** 取 `[fromTurn, turn]` 区间的事件摘要。 */
  private digestForTurns(buffer: SessionBuffer, turn: number, fromTurn: number): TurnDigest | null {
    const events = buffer.events
      .filter(event => event.turn >= fromTurn && event.turn <= turn)
      .map(event => ({ seq: event.seq, type: event.type, data: event.data, turn: event.turn }))
    if (events.length === 0) return null
    return digestOf(events, buffer.sessionId, turn)
  }

  /** 入队一次提炼：单运行 + 单排队（新的覆盖旧的）。 */
  private enqueueExtraction(buffer: SessionBuffer, digest: TurnDigest): void {
    buffer.lastCapturedTurn = Math.max(buffer.lastCapturedTurn, digest.turn)
    if (buffer.running) {
      buffer.pending = digest
      return
    }
    buffer.running = true
    const task = this.runExtraction(buffer, digest)
      .catch((error) => {
        this.log('warn', `记忆提炼失败：${error instanceof Error ? error.message : String(error)}`)
      })
      .finally(() => {
        buffer.running = false
        const pending = buffer.pending
        buffer.pending = null
        if (pending !== null && !this.disposed) this.enqueueExtraction(buffer, pending)
      })
    this.operations.add(task)
    void task.finally(() => {
      this.operations.delete(task)
      this.afterCapture?.()
    })
  }

  /** 一次提炼请求：拼输入、收集文本、解析并写入。 */
  private async runExtraction(buffer: SessionBuffer, digest: TurnDigest): Promise<void> {
    const llm = this.getLlm()
    if (llm === null) {
      this.log('warn', '记忆提炼需要 llm 服务，但宿主尚未提供')
      recordCaptureAttempt(this.store, this.log, 0, true, {
        sessionId: buffer.sessionId,
        skippedReason: 'llm-unavailable',
      })
      return
    }
    if (buffer.modelRoute === null) {
      this.log('warn', '记忆提炼缺少模型路由（会话尚无请求头），跳过')
      recordCaptureAttempt(this.store, this.log, 0, true, {
        sessionId: buffer.sessionId,
        skippedReason: 'no-model-route',
      })
      return
    }
    const project = buffer.project ?? this.projectForPath(buffer.session.header?.cwd)
    buffer.project = project
    const projectKey = project?.projectKey ?? ''
    const existing: ExistingMemory[] = this.store
      .search('all', projectKey, { query: '', limit: 50 })
      .filter(entry => entry.status === 'active')
      .map(entry => ({ id: entry.id, type: entry.type, name: entry.name, description: entry.description }))
    const messages = buildExtractionMessages({
      digest,
      project: project === null ? null : { key: project.projectKey, displayName: project.displayName },
      existing,
    })
    const parts: string[] = []
    let length = 0
    const chunkTypes = new Map<string, number>()
    let finishReason = ''
    const stream = llm.stream({
      provider: buffer.modelRoute.provider,
      model: buffer.modelRoute.model,
      messages: messages.map(message => ({
        role: message.role,
        content: [{ type: 'text' as const, text: message.content }],
      })),
      maxTokens: EXTRACTION_MAX_OUTPUT_TOKENS,
      temperature: EXTRACTION_TEMPERATURE,
      // 提炼是解析任务：思考会挤占输出预算，把 JSON 数组截断。
      reasoningEffort: 'off',
      purpose: 'memory-capture',
      ...(buffer.sessionId === '' ? {} : { sessionId: buffer.sessionId }),
      signal: this.abort.signal,
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
        const reason = chunk.reason as unknown
        finishReason = reason !== null && typeof reason === 'object' && 'kind' in (reason as Record<string, unknown>)
          ? String((reason as Record<string, unknown>).kind)
          : String(reason ?? '')
      }
      if (length > EXTRACTION_MAX_CHARS) break
    }
    const raw = parts.join('')
    const items = parseExtraction(raw)
    if (items === null) {
      const shape = [...chunkTypes].map(([type, count]) => `${type}:${count}`).join(' ')
      this.log('warn', `记忆提炼返回了无法解析的 JSON，已跳过（长度 ${raw.length}，结束 ${finishReason || 'unknown'}，块 ${shape || 'none'}，开头：${raw.slice(0, 160).replace(/\s+/gu, ' ')}）`)
      recordCaptureAttempt(this.store, this.log, 0, true, {
        sessionId: buffer.sessionId,
        skippedReason: 'parse-error',
      })
      return
    }
    let written = 0
    // 只收集该次捕获**新增**的条目引用；强化条目的 createdAt 早于 updatedAt，
    // 不进入撤销集合（ADR-0006：撤销不回退强化）。
    const created: CreatedRef[] = []
    for (const item of items) {
      const scope: MemoryScope = item.scope === 'global' || project === null ? 'global' : 'project'
      try {
        const saved = this.store.save({
          name: item.name,
          description: item.description,
          type: item.type,
          scope,
          project: scope === 'project' ? projectKey : '',
          content: item.content,
          tags: item.tags,
          importance: item.importance,
          supersedes: item.supersedes,
          originSessionId: buffer.sessionId,
        })
        written += 1
        if (saved.createdAt === saved.updatedAt) {
          created.push({ id: saved.id, scope: saved.scope, project: saved.project })
        }
      } catch (error) {
        this.log('warn', `写入记忆失败：${error instanceof Error ? error.message : String(error)}`)
      }
    }
    recordCaptureAttempt(this.store, this.log, written, written === 0, {
      sessionId: buffer.sessionId,
      ...(written === 0 ? { skippedReason: 'no-durable-fact' } : {}),
      ...(created.length === 0 ? {} : { created }),
    })
    if (written > 0 && project !== null) this.touchProject(project)
  }

  /** 会话最近一次请求头里的模型路由，退化到 agent options。 */
  private modelRouteOf(agent: AgentLike | undefined): ModelRoute | null {
    try {
      const header = agent?.session?.requestHeader?.()
      const config = header?.config
      if (config !== undefined && typeof config.provider === 'string' && config.provider !== ''
        && typeof config.model === 'string' && config.model !== '') {
        return { provider: config.provider, model: config.model }
      }
    } catch {
      /* 已销毁的会话可能拒绝读请求头；退化到 agent options */
    }
    const options = agent?.options
    if (options !== undefined && typeof options.provider === 'string' && options.provider !== ''
      && typeof options.model === 'string' && options.model !== '') {
      return { provider: options.provider, model: options.model }
    }
    return null
  }
}