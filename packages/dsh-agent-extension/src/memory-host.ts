/**
 * Host wiring of the memory feature.
 *
 * One runtime per plugin instance owns:
 * - the injected memory index (`systemPrompt.context`) and the static usage
 *   guide (`systemPrompt.section`);
 * - the four model tools (`memory_search` / `memory_get` / `memory_save` /
 *   `memory_forget`) and the `/remember`, `/forget`, `/memory` commands;
 * - the per-session event buffer, the cheap capture gate at turn end, and the
 *   asynchronous extraction request (single running + single pending);
 * - capture and recall counters shown by the management panel.
 *
 * @module dsh-agent-extension/memory-host
 */

import type {
  AgentLike,
  AssembleContextLike,
  HostContext,
  LlmService,
  SessionEventLike,
  SessionLike,
  SystemPromptService,
  ToolDefinitionLike,
  ToolsService,
} from './host.ts'
import type { LogFn } from './log.ts'
import {
  EXTRACTION_MAX_OUTPUT_TOKENS,
  EXTRACTION_TEMPERATURE,
  buildExtractionMessages,
  digestOf,
  gateCapture,
  hasForceSignal,
  parseExtraction,
  type ExistingMemory,
  type TurnDigest,
  type TurnEvent,
} from './memory/capture.ts'
import { resolveProject } from './memory/identity.ts'
import {
  formatCommandSummary,
  formatGetResult,
  formatSearchResult,
  renderRecallContext,
} from './memory/recall.ts'
import { MemoryStore } from './memory/store.ts'
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
} from './memory/types.ts'

/** Buffered events per session; capture only reads the current turn. */
const EVENT_BUFFER_LIMIT = 400
/** Sessions kept in memory; the oldest is evicted first. */
const SESSION_LIMIT = 200
/** Project resolution cache lifetime. */
const PROJECT_CACHE_TTL_MS = 30_000
/** Minimum gap between project-registry touches. */
const PROJECT_TOUCH_INTERVAL_MS = 5 * 60_000
/** Maximum characters the extraction request may produce. */
const EXTRACTION_MAX_CHARS = 20_000
/** Static usage guide injected into every agent's system prompt. */
const MEMORY_GUIDE = `## Memory

Durable memory tools are available: \`memory_search\`, \`memory_get\`, \`memory_save\`, \`memory_forget\`.
- Save a memory when the user explicitly asks to remember something, or when a stable preference, decision, gotcha, or project fact emerges that will matter in later sessions.
- Never save transient task state, secrets, credentials, or large code excerpts.
- A memory describes experience from earlier sessions. Current instructions, the repository, and the user's latest request take precedence over it.
- Call \`memory_forget\` when one of your memories is clearly outdated.`

/** Runtime constructor options. */
export interface MemoryRuntimeOptions {
  ctx: HostContext
  store: MemoryStore
  log: LogFn
}

interface BufferedEvent extends TurnEvent {
  turn: number
}

interface SessionBuffer {
  session: SessionLike
  sessionId: string
  agent: AgentLike | null
  subagent: boolean
  currentTurn: number
  lastCapturedTurn: number
  events: BufferedEvent[]
  injected: Set<string>
  used: Set<string>
  overflow: Set<string>
  project: ProjectIdentity | null
  modelRoute: { provider: string, model: string } | null
  running: boolean
  pending: TurnDigest | null
  lastTouchedAt: number
}

/** The memory runtime: host services, capture queue and recall counters. */
export class MemoryRuntime {
  private readonly ctx: HostContext
  private readonly store: MemoryStore
  private readonly log: LogFn
  private readonly abort = new AbortController()
  private readonly buffers = new Map<string, SessionBuffer>()
  private readonly projectCache = new Map<string, { identity: ProjectIdentity, at: number }>()
  private readonly projectTouches = new Map<string, number>()
  private readonly operations = new Set<Promise<unknown>>()
  private readonly disposers: Array<() => void> = []
  private llmService: LlmService | null = null
  private started = false
  private disposed = false

  constructor(options: MemoryRuntimeOptions) {
    this.ctx = options.ctx
    this.store = options.store
    this.log = options.log
  }

  /** Wire host events, prompt contributions, tools and commands. */
  start(): void {
    if (this.started) return
    this.started = true
    const steps: Array<[string, () => void]> = [
      ['存储目录', () => this.store.start()],
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
  }

  /** Stop background work and flush session counters. */
  async dispose(): Promise<void> {
    if (this.disposed) return
    this.disposed = true
    this.abort.abort()
    for (const dispose of this.disposers.splice(0)) {
      try {
        dispose()
      } catch {
        /* one failing disposer never blocks teardown */
      }
    }
    for (const buffer of this.buffers.values()) this.flushRecall(buffer)
    await Promise.allSettled([...this.operations])
  }

  /** Resolve the project identity of one working directory (cached and registered). */
  projectForPath(cwd: unknown): ProjectIdentity | null {
    const directory = text(cwd)
    if (directory === '') return null
    let local = directory
    const cached = this.projectCache.get(local)
    if (cached !== undefined && Date.now() - cached.at < PROJECT_CACHE_TTL_MS) {
      this.touchProject(cached.identity)
      return cached.identity
    }
    try {
      const identity = resolveProject(local)
      this.projectCache.set(local, { identity, at: Date.now() })
      this.touchProject(identity)
      return identity
    } catch (error) {
      this.log('warn', `解析项目身份失败：${error instanceof Error ? error.message : String(error)}`)
      return null
    }
  }

  /** Resolve the project identity of one live agent (null when it has no cwd). */
  projectForAgent(agent: AgentLike | undefined): ProjectIdentity | null {
    return this.projectForPath(agent?.session?.header?.cwd)
  }

  private touchProject(identity: ProjectIdentity): void {
    const last = this.projectTouches.get(identity.projectKey) ?? 0
    if (Date.now() - last < PROJECT_TOUCH_INTERVAL_MS) return
    this.projectTouches.set(identity.projectKey, Date.now())
    try {
      this.store.touchProject(identity)
    } catch (error) {
      this.log('warn', `登记项目失败：${error instanceof Error ? error.message : String(error)}`)
    }
  }

  private registerEventListeners(): void {
    this.listen('session/event', (...args) => {
      this.onSessionEvent(args[0] as SessionLike, args[1] as SessionEventLike)
    })
    this.listen('agent/turn-stopping', (...args) => {
      this.onTurnStopping(args[0])
    })
    this.listen('agent/disposed', (...args) => {
      this.onAgentDisposed(args[0])
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
    let registered = 0
    try {
      const section = systemPrompt.section({
        name: 'agent-extension:memory-guide',
        order: 700,
        text: MEMORY_GUIDE,
        interpolate: false,
      })
      this.disposers.push(section)
      registered += 1
    } catch (error) {
      this.log('warn', `注册记忆使用指南失败：${error instanceof Error ? error.message : String(error)}`)
    }
    try {
      const context = systemPrompt.context({
        name: 'agent-extension:memory',
        order: 150,
        required: false,
        interpolate: false,
        text: (assembly: AssembleContextLike) => this.recallText(assembly.agent),
      })
      this.disposers.push(context)
      registered += 1
    } catch (error) {
      this.log('warn', `注册记忆上下文失败：${error instanceof Error ? error.message : String(error)}`)
    }
    if (registered > 0) this.log('info', '记忆提示词已注册（使用指南 + 索引注入）')
  }

  private recallText(agent: AgentLike | undefined): string {
    if (agent === undefined || this.disposed) return ''
    try {
      const settings = this.store.settings()
      if (!settings.injectEnabled) return ''
      const buffer = agent.session === undefined ? null : this.bufferFor(agent.session)
      if (buffer !== null && buffer.subagent) return ''
      const identity = this.projectForAgent(agent)
      const snapshot = renderRecallContext({ store: this.store, identity, settings })
      if (buffer !== null) {
        for (const id of snapshot.ids) buffer.injected.add(id)
      }
      return snapshot.text
    } catch (error) {
      // A failing provider must never fail the host's prompt assembly.
      this.log('warn', `渲染记忆上下文失败：${error instanceof Error ? error.message : String(error)}`)
      return ''
    }
  }

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
    const registrations: ToolDefinitionLike[] = [
      this.searchTool(),
      this.getTool(),
      this.saveTool(),
      this.forgetTool(),
    ]
    let registered = 0
    for (const definition of registrations) {
      try {
        this.disposers.push(tools.register(definition))
        registered += 1
      } catch (error) {
        this.log('warn', `注册工具 ${definition.name} 失败：${error instanceof Error ? error.message : String(error)}`)
      }
    }
    if (registered > 0) this.log('info', `记忆工具已注册：${registered} 个（memory_search / memory_get / memory_save / memory_forget）`)
  }

  private output(schema: Record<string, unknown> = { type: 'string' }): ToolDefinitionLike['output'] {
    return {
      schema,
      render: (_args, value) => [{ type: 'text', text: String(value ?? '') }],
    }
  }

  private searchTool(): ToolDefinitionLike {
    return {
      name: 'memory_search',
      description: 'Search durable long-term memories (global and current project) by keywords. Returns ids and one-line summaries; use memory_get for full content.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Keywords to search; empty lists the ranked index.' },
          scope: { type: 'string', enum: ['all', 'global', 'project'], description: 'Search scope; defaults to all.' },
          type: { type: 'string', enum: ['preference', 'decision', 'gotcha', 'project', 'reference'] },
          limit: { type: 'number', description: 'Maximum results (default 10, max 50).' },
        },
        required: ['query'],
      },
      output: this.output(),
      execute: async (args, exec) => {
        const record = args !== null && typeof args === 'object' ? args as Record<string, unknown> : {}
        const query = text(record.query)
        const scopeValue = record.scope === 'global' || record.scope === 'project' ? record.scope : 'all'
        const type = isMemoryType(record.type) ? record.type : undefined
        const limit = clampInt(record.limit, 1, 50, 10)
        const project = this.projectForAgent(exec.agent)
        const results = this.store.search(scopeValue, project?.projectKey ?? '', query, limit)
          .filter(entry => type === undefined || entry.type === type)
        this.noteToolUsage(exec.agent, results.map(entry => entry.id), [])
        return formatSearchResult(results, query)
      },
    }
  }

  private getTool(): ToolDefinitionLike {
    return {
      name: 'memory_get',
      description: 'Read the full content of one or more memories by id (fetch ids from memory_search).',
      parameters: {
        type: 'object',
        properties: {
          ids: { type: 'array', items: { type: 'string' }, description: 'Memory ids returned by memory_search.' },
        },
        required: ['ids'],
      },
      output: this.output(),
      execute: async (args, exec) => {
        const record = args !== null && typeof args === 'object' ? args as Record<string, unknown> : {}
        const ids = normalizeIds(record.ids).slice(0, 10)
        const project = this.projectForAgent(exec.agent)
        const entries: MemoryEntry[] = []
        const missing: string[] = []
        for (const id of ids) {
          const entry = this.store.get('project', project?.projectKey ?? '', id)
            ?? this.store.get('global', '', id)
          if (entry === undefined) missing.push(id)
          else entries.push(entry)
        }
        this.noteToolUsage(exec.agent, entries.map(entry => entry.id), [])
        return formatGetResult(entries, missing)
      },
    }
  }

  private saveTool(): ToolDefinitionLike {
    return {
      name: 'memory_save',
      description: 'Persist one durable fact (preference, decision, gotcha, project fact or reference) so later sessions can recall it. Use when the user explicitly asks to remember something.',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Short title (<=60 chars).' },
          description: { type: 'string', description: 'One-sentence summary.' },
          type: { type: 'string', enum: ['preference', 'decision', 'gotcha', 'project', 'reference'] },
          scope: { type: 'string', enum: ['global', 'project'], description: 'global for cross-project preferences, project for repository facts.' },
          content: { type: 'string', description: 'Markdown body with the durable detail.' },
          tags: { type: 'array', items: { type: 'string' } },
          importance: { type: 'number', description: '0-100; default 50.' },
          supersedes: { type: 'array', items: { type: 'string' }, description: 'Memory ids this fact replaces.' },
        },
        required: ['name', 'description', 'type', 'content'],
      },
      output: this.output(),
      execute: async (args, exec) => {
        const record = args !== null && typeof args === 'object' ? args as Record<string, unknown> : {}
        const project = this.projectForAgent(exec.agent)
        const scope: MemoryScope = record.scope === 'global' || project === null ? 'global' : 'project'
        const entry = this.store.save({
          name: text(record.name),
          description: text(record.description),
          type: isMemoryType(record.type) ? record.type : 'reference',
          scope,
          project: scope === 'project' ? project?.projectKey ?? '' : '',
          content: text(record.content),
          tags: normalizeTags(record.tags),
          importance: clampInt(record.importance, 0, 100, 50),
          supersedes: normalizeIds(record.supersedes),
          originSessionId: exec.agent?.session?.id ?? '',
        })
        if (scope === 'project' && project !== null) this.touchProject(project)
        const verb = entry.reinforcement > 0 ? 'Reinforced' : 'Saved'
        return `${verb} memory ${entry.id} (${entry.type}, ${entry.scope}).`
      },
    }
  }

  private forgetTool(): ToolDefinitionLike {
    return {
      name: 'memory_forget',
      description: 'Flag one memory as outdated. The first call marks it stale; the second call archives it so it stops being injected.',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'Memory id from memory_search.' },
          reason: { type: 'string', description: 'Why the memory no longer holds.' },
        },
        required: ['id'],
      },
      output: this.output(),
      execute: async (args, exec) => {
        const record = args !== null && typeof args === 'object' ? args as Record<string, unknown> : {}
        const id = text(record.id)
        const project = this.projectForAgent(exec.agent)
        const foundProject = this.store.get('project', project?.projectKey ?? '', id) !== undefined
        const scope: MemoryScope = foundProject ? 'project' : 'global'
        const projectKey = scope === 'project' ? project?.projectKey ?? '' : ''
        const result = this.store.forget(scope, projectKey, id, text(record.reason))
        return result.archived
          ? `Memory ${id} archived after two obsolete votes.`
          : `Memory ${id} marked stale (1/2 votes). Call memory_forget again to archive it.`
      },
    }
  }

  private registerCommands(): void {
    const commands = this.ctx.commands
    if (commands === undefined) return
    const definitions = [
      {
        name: 'remember',
        description: '保存一条长期记忆（默认项目级，可写 global）',
        input: { hint: '[global] <要记住的内容>' },
        handler: (input: { rawInput?: unknown, agent?: AgentLike }) => this.commandRemember(input),
      },
      {
        name: 'forget',
        description: '把一条记忆标记为过时（两次标记后归档）',
        input: { hint: '<记忆 id>' },
        handler: (input: { rawInput?: unknown, agent?: AgentLike }) => this.commandForget(input),
      },
      {
        name: 'memory',
        description: '查看当前全局/项目记忆概况',
        handler: (input: { rawInput?: unknown, agent?: AgentLike }) => this.commandMemory(input),
      },
    ]
    for (const definition of definitions) {
      try {
        const dispose = commands.register(definition)
        if (typeof dispose === 'function') this.disposers.push(dispose)
      } catch (error) {
        this.log('warn', `注册命令 /${definition.name} 失败：${error instanceof Error ? error.message : String(error)}`)
      }
    }
  }

  private commandRemember(input: { rawInput?: unknown, agent?: AgentLike }): { kind: 'success' | 'error', text: string } {
    const raw = text(input.rawInput)
    if (raw === '') return { kind: 'error', text: '用法：/remember [global] <要记住的内容>' }
    const scope: MemoryScope = /^global\s+/iu.test(raw) ? 'global' : 'project'
    const body = raw.replace(/^global\s+/iu, '').trim()
    if (body === '') return { kind: 'error', text: '用法：/remember [global] <要记住的内容>' }
    const project = this.projectForAgent(input.agent)
    const resolvedScope: MemoryScope = scope === 'global' || project === null ? 'global' : 'project'
    const name = body.length > LIMITS.name ? `${body.slice(0, LIMITS.name - 1)}…` : body
    const entry = this.store.save({
      name,
      description: body.slice(0, LIMITS.description),
      type: 'preference',
      scope: resolvedScope,
      project: resolvedScope === 'project' ? project?.projectKey ?? '' : '',
      content: body,
      importance: 70,
      originSessionId: input.agent?.session?.id ?? '',
    })
    if (resolvedScope === 'project' && project !== null) this.touchProject(project)
    const target = resolvedScope === 'global' ? '全局' : `项目（${project?.displayName ?? ''}）`
    return {
      kind: 'success',
      text: `${entry.reinforcement > 0 ? '已强化已有记忆' : '已记住'}：${entry.name}（${target}，id=${entry.id}）`,
    }
  }

  private commandForget(input: { rawInput?: unknown, agent?: AgentLike }): { kind: 'success' | 'error', text: string } {
    const id = text(input.rawInput)
    if (id === '') return { kind: 'error', text: '用法：/forget <记忆 id>' }
    const project = this.projectForAgent(input.agent)
    const inProject = this.store.get('project', project?.projectKey ?? '', id) !== undefined
    try {
      const result = this.store.forget(inProject ? 'project' : 'global', inProject ? project?.projectKey ?? '' : '', id)
      return {
        kind: 'success',
        text: result.archived
          ? `记忆 ${id} 已归档（两次标记为过时）。`
          : `记忆 ${id} 已标记为过时（1/2）；再次标记将归档。`,
      }
    } catch (error) {
      return { kind: 'error', text: error instanceof Error ? error.message : String(error) }
    }
  }

  private commandMemory(input: { rawInput?: unknown, agent?: AgentLike }): { kind: 'success' | 'error', text: string } {
    const identity = this.projectForAgent(input.agent)
    return { kind: 'success', text: formatCommandSummary(this.store, identity) }
  }

  private onSessionEvent(session: SessionLike, event: SessionEventLike): void {
    if (this.disposed) return
    const buffer = this.bufferFor(session)
    const data = event.data !== null && typeof event.data === 'object' ? event.data as Record<string, unknown> : {}
    if (event.type === 'turn/start' || event.type === 'turn/end') {
      const turn = typeof data.turn === 'number' ? data.turn : buffer.currentTurn
      buffer.currentTurn = turn
    }
    buffer.events.push({ seq: event.seq, type: event.type, data: event.data, turn: buffer.currentTurn })
    if (buffer.events.length > EVENT_BUFFER_LIMIT) buffer.events.splice(0, buffer.events.length - EVENT_BUFFER_LIMIT)
    buffer.lastTouchedAt = Date.now()
  }

  private onTurnStopping(payload: unknown): void {
    if (this.disposed) return
    const record = payload !== null && typeof payload === 'object' ? payload as Record<string, unknown> : {}
    const agent = record.agent as AgentLike | undefined
    if (agent?.session === undefined) return
    const buffer = this.bufferFor(agent.session)
    buffer.agent = agent
    buffer.modelRoute = this.modelRouteOf(agent)
    this.flushRecall(buffer)
    if (buffer.subagent) return
    const settings = this.store.settings()
    if (!settings.captureEnabled) {
      buffer.lastCapturedTurn = buffer.currentTurn
      return
    }
    const digest = this.digestForTurns(buffer, buffer.currentTurn)
    if (digest === null) return
    const force = hasForceSignal(buffer.events.map(event => ({ seq: event.seq, type: event.type, data: event.data })), digest)
    const gate = gateCapture(digest, {
      subagent: buffer.subagent,
      enabled: settings.captureEnabled,
      capturedThroughThisTurn: buffer.lastCapturedTurn >= buffer.currentTurn,
      force,
    })
    if (!gate.capture) {
      buffer.lastCapturedTurn = buffer.currentTurn
      this.store.recordCapture(0, true)
      return
    }
    this.enqueueExtraction(buffer, digest)
  }

  private onAgentDisposed(payload: unknown): void {
    if (this.disposed) return
    const record = payload !== null && typeof payload === 'object' ? payload as Record<string, unknown> : {}
    const agent = record.agent as AgentLike | undefined
    const sessionId = this.sessionIdOf(agent)
    if (sessionId === '') return
    const buffer = this.buffers.get(sessionId)
    if (buffer === undefined) return
    this.flushRecall(buffer)
    const settings = this.store.settings()
    if (settings.captureEnabled && settings.captureSessionEnd && !buffer.subagent && buffer.modelRoute !== null) {
      const digest = this.digestForTurns(buffer, Number.MAX_SAFE_INTEGER, buffer.lastCapturedTurn + 1)
      if (digest !== null) this.enqueueExtraction(buffer, digest)
    }
    this.buffers.delete(sessionId)
  }

  private digestForTurns(buffer: SessionBuffer, turn: number, fromTurn?: number): TurnDigest | null {
    const from = fromTurn ?? turn
    const events = buffer.events
      .filter(event => event.turn >= from && event.turn <= turn)
      .map(event => ({ seq: event.seq, type: event.type, data: event.data }))
    if (events.length === 0) return null
    return digestOf(events, buffer.sessionId, turn)
  }

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
    void task.finally(() => this.operations.delete(task))
  }

  private async runExtraction(buffer: SessionBuffer, digest: TurnDigest): Promise<void> {
    const llm = this.llm()
    if (llm === null) {
      this.log('warn', '记忆提炼需要 llm 服务，但宿主尚未提供')
      this.store.recordCapture(0, true)
      return
    }
    if (buffer.modelRoute === null) {
      this.log('warn', '记忆提炼缺少模型路由（会话尚无请求头），跳过')
      this.store.recordCapture(0, true)
      return
    }
    const project = buffer.project ?? this.projectForPath(buffer.session.header?.cwd)
    buffer.project = project
    const projectKey = project?.projectKey ?? ''
    const existing: ExistingMemory[] = this.store
      .search('all', projectKey, '', 50)
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
      // Extraction is a parsing task: thinking would consume the output budget
      // and truncate the JSON array on reasoning-first models.
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
      this.store.recordCapture(0, true)
      return
    }
    let written = 0
    for (const item of items) {
      const scope: MemoryScope = item.scope === 'global' || project === null ? 'global' : 'project'
      try {
        this.store.save({
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
      } catch (error) {
        this.log('warn', `写入记忆失败：${error instanceof Error ? error.message : String(error)}`)
      }
    }
    this.store.recordCapture(written, written === 0)
    if (written > 0 && project !== null) this.touchProject(project)
  }

  private modelRouteOf(agent: AgentLike): { provider: string, model: string } | null {
    try {
      const header = agent.session?.requestHeader?.()
      const config = header?.config
      if (config !== undefined && typeof config.provider === 'string' && config.provider !== ''
        && typeof config.model === 'string' && config.model !== '') {
        return { provider: config.provider, model: config.model }
      }
    } catch {
      /* a disposed session may reject header reads; fall back to agent options */
    }
    const options = agent.options
    if (options !== undefined && typeof options.provider === 'string' && options.provider !== ''
      && typeof options.model === 'string' && options.model !== '') {
      return { provider: options.provider, model: options.model }
    }
    return null
  }

  private noteToolUsage(agent: AgentLike | undefined, resultIds: readonly string[], usedIds: readonly string[]): void {
    const session = agent?.session
    if (session === undefined) return
    const buffer = this.bufferFor(session)
    for (const id of usedIds) buffer.used.add(id)
    for (const id of resultIds) {
      if (buffer.injected.has(id)) buffer.used.add(id)
      else buffer.overflow.add(id)
    }
  }

  private flushRecall(buffer: SessionBuffer): void {
    if (buffer.injected.size === 0 && buffer.overflow.size === 0) return
    try {
      this.store.recordRecall(buffer.sessionId, [...buffer.injected], [...buffer.used], buffer.overflow.size)
    } catch (error) {
      this.log('warn', `写命中率统计失败：${error instanceof Error ? error.message : String(error)}`)
    }
  }

  private bufferFor(session: SessionLike): SessionBuffer {
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
      events: [],
      injected: new Set(),
      used: new Set(),
      overflow: new Set(),
      project: null,
      modelRoute: null,
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

  private sessionIdOf(agent: AgentLike | undefined): string {
    const id = agent?.session?.id
    return typeof id === 'string' ? id : ''
  }

  private service<T>(name: string): T | null {
    // `ctx.get` reads the global service store without declaring an inject;
    // the property proxy would throw "cannot get property <name> without inject".
    try {
      const viaGet = this.ctx.get<T>(name)
      if (viaGet !== undefined && viaGet !== null) return viaGet
    } catch {
      /* the service store may reject unknown keys */
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
        /* fall through to the injected property */
      }
    }
    try {
      const direct = (scope as Record<string, unknown>)[name]
      if (direct !== undefined && direct !== null) return direct as T
    } catch {
      /* the property proxy rejects services this scope did not inject */
    }
    return null
  }

  private llm(): LlmService | null {
    if (this.llmService !== null) return this.llmService
    this.llmService = this.service<LlmService>('llm')
    return this.llmService
  }
}

/** Export the type list used by routes; keeps the import graph one-way. */
export const MEMORY_TOOL_NAMES = ['memory_search', 'memory_get', 'memory_save', 'memory_forget'] as const

/** Narrow a memory type value for external callers. */
export function asMemoryType(value: unknown): MemoryType | undefined {
  return isMemoryType(value) ? value : undefined
}
