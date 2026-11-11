/**
 * 记忆运行时（B0）：索引快照缓存、分层注入、工具契约、轮末/会话末捕获行为。
 *
 * 用 fake ctx / fake llm / fake store 搭最小 harness，不访问网络与真实宿主。
 */

import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'

import { afterEach, describe, expect, it, vi } from 'vitest'

import type {
  CommandDescriptor,
  CommandsService,
  HostContext,
  LlmStreamChunkLike,
  LlmStreamOptionsLike,
  PromptContextLike,
  PromptSectionLike,
  ToolDefinitionLike,
} from '../src/host.ts'
import type { LogFn } from '../src/log.ts'
import { MemoryRuntime } from '../src/memory-host.ts'
import { GET_MAX_CHARS } from '../src/memory/recall.ts'
import { MEMORY_GUIDE } from '../src/memory/runtime/prompt.ts'
import { MemoryStore, type SaveMemoryInput } from '../src/memory/store.ts'
import {
  defaultSettings,
  type CreatedRef,
  type MemoryEntry,
  type MemoryMeta,
  type MemorySettings,
  type MemoryType,
  type ProjectIdentity,
} from '../src/memory/types.ts'
import { removeDirs, tempHome } from './helpers.ts'

// ---------------------------------------------------------------------------
// fake 存储：模拟数据层 v2 的 search(scope, project, options) 语义
// ---------------------------------------------------------------------------

/** 数据层 v2 的检索选项（本 spec 的 fake 按此实现，用于验证下推）。 */
interface FakeSearchOptions {
  query?: string
  type?: MemoryType
  includeArchived?: boolean
  limit?: number
}

/** 一次检索调用，供断言 type/limit 是否下推。 */
interface FakeSearchCall {
  scope: 'global' | 'project' | 'all'
  project: string
  options: FakeSearchOptions
}

class FakeStore {
  settingsValue: MemorySettings = defaultSettings()
  readonly entries: MemoryEntry[] = []
  readonly searchCalls: FakeSearchCall[] = []
  readonly getCalls: string[] = []
  readonly promoted: string[] = []
  readonly captureCalls: Array<{ entries: number, skipped: boolean, created?: CreatedRef[] }> = []
  readonly recallCalls: Array<{
    sessionId: string
    injected: string[]
    used: string[]
    overflow: number
    searched: number
    searchUsed: number
  }> = []
  readonly injectionCalls: Array<{ sessionId?: string, entries: number, chars: number, truncated?: boolean }> = []
  readonly retrievalCalls: Array<{ sessionId: string, query: string, ids: string[] }> = []
  readonly projectTouches: ProjectIdentity[] = []
  private sequence = 0

  start(): void {}

  settings(): MemorySettings {
    return this.settingsValue
  }

  setSettings(patch: Partial<MemorySettings>): void {
    this.settingsValue = { ...this.settingsValue, ...patch }
  }

  seed(entry: MemoryEntry): MemoryEntry {
    this.entries.push(entry)
    return entry
  }

  entryById(id: string): MemoryEntry | undefined {
    return this.entries.find(entry => entry.id === id)
  }

  search(scope: 'global' | 'project' | 'all', project: string, options: FakeSearchOptions = {}): MemoryMeta[] {
    this.searchCalls.push({ scope, project, options })
    const query = (options.query ?? '').toLowerCase()
    const limit = options.limit ?? 10
    const pool = this.entries.filter((entry) => {
      if (scope === 'global' && entry.scope !== 'global') return false
      if (scope === 'project' && (entry.scope !== 'project' || entry.project !== project)) return false
      if (scope === 'all' && entry.scope === 'project' && entry.project !== project) return false
      if (options.includeArchived !== true && entry.status === 'archived') return false
      if (options.type !== undefined && entry.type !== options.type) return false
      if (query === '') return true
      const haystack = `${entry.name}\n${entry.description}\n${entry.content}\n${entry.tags.join(' ')}`.toLowerCase()
      return haystack.includes(query)
    })
    const sorted = [...pool].sort(
      (left, right) => right.importance - left.importance || right.updatedAt.localeCompare(left.updatedAt),
    )
    return sorted.slice(0, limit)
  }

  get(scope: 'global' | 'project', project: string, id: string): MemoryEntry | undefined {
    this.getCalls.push(`${scope}:${id}`)
    return this.entries.find(entry => entry.id === id && entry.scope === scope
      && (scope === 'global' || entry.project === project))
  }

  promoteRead(scope: 'global' | 'project', project: string, id: string): void {
    this.promoted.push(`${scope}:${id}`)
    const entry = this.get(scope, project, id)
    if (entry !== undefined) entry.tier = 'long'
  }

  save(input: SaveMemoryInput): MemoryEntry {
    const now = new Date().toISOString()
    const project = input.scope === 'global' ? '' : input.project ?? ''
    const duplicate = this.entries.find(entry => entry.status !== 'archived'
      && entry.name === input.name && entry.content === input.content
      && entry.scope === input.scope && entry.project === project)
    if (duplicate !== undefined) {
      duplicate.reinforcement += 1
      duplicate.updatedAt = now
      return duplicate
    }
    const entry: MemoryEntry = {
      id: `m-${++this.sequence}`,
      name: input.name,
      description: input.description,
      type: input.type,
      scope: input.scope,
      project,
      tags: input.tags ?? [],
      importance: input.importance ?? 50,
      status: 'active',
      tier: input.tier ?? (input.source === 'user' ? 'long' : 'short'),
      reinforcement: 0,
      obsoleteVotes: 0,
      supersedes: input.supersedes ?? [],
      usedCount: 0,
      confidence: input.confidence ?? 50,
      pinned: input.pinned ?? false,
      mergedFrom: input.mergedFrom ?? [],
      source: input.source ?? 'capture',
      originSessionId: input.originSessionId ?? '',
      createdAt: now,
      updatedAt: now,
      content: input.content,
    }
    this.entries.push(entry)
    return entry
  }

  forget(scope: 'global' | 'project', project: string, id: string): { entry: MemoryEntry, archived: boolean } {
    const entry = this.entries.find(item => item.id === id && item.scope === scope
      && (scope === 'global' || item.project === project))
    if (entry === undefined) throw new Error(`记忆不存在：${id}`)
    entry.obsoleteVotes += 1
    entry.status = entry.obsoleteVotes >= 2 ? 'archived' : 'stale'
    return { entry, archived: entry.status === 'archived' }
  }

  recordCapture(
    entries: number,
    skipped: boolean,
    detail: { sessionId?: string, skippedReason?: string, error?: string, created?: readonly CreatedRef[] } = {},
  ): void {
    this.captureCalls.push({
      entries,
      skipped,
      ...(detail.created === undefined ? {} : { created: [...detail.created] }),
    })
  }

  recordRecall(
    sessionId: string,
    injected: readonly string[],
    used: readonly string[],
    overflow: number,
    metrics: { searched?: number, searchUsed?: number } = {},
  ): void {
    this.recallCalls.push({
      sessionId,
      injected: [...injected],
      used: [...used],
      overflow,
      searched: metrics.searched ?? 0,
      searchUsed: metrics.searchUsed ?? 0,
    })
  }

  recordInjection(detail: { sessionId?: string, entries: number, chars: number, truncated?: boolean }): void {
    this.injectionCalls.push(detail)
  }

  recordRetrieval(detail: { sessionId: string, query: string, ids: readonly string[] }): void {
    this.retrievalCalls.push({ sessionId: detail.sessionId, query: detail.query, ids: [...detail.ids] })
  }

  touchProject(identity: ProjectIdentity): void {
    this.projectTouches.push(identity)
  }

  listProjects(): ProjectIdentity[] {
    return []
  }

  countEntries(scope: 'global' | 'project', project = ''): number {
    return this.entries.filter(entry => entry.scope === scope
      && (scope === 'global' || entry.project === project)
      && entry.status !== 'archived').length
  }
}

// ---------------------------------------------------------------------------
// fake ctx / llm / 提示词服务
// ---------------------------------------------------------------------------

type FakeListener = (...args: unknown[]) => unknown

class FakeCtx {
  readonly listeners = new Map<string, FakeListener[]>()
  readonly commandMap = new Map<string, CommandDescriptor>()
  readonly commands: CommandsService
  readonly services: Record<string, unknown>

  constructor(services: Record<string, unknown>) {
    this.services = services
    this.commands = {
      register: (definition) => {
        this.commandMap.set(definition.name, definition)
        return () => {
          this.commandMap.delete(definition.name)
        }
      },
    }
  }

  get(name: string): unknown {
    return this.services[name]
  }

  on(event: string, listener: FakeListener): () => void {
    const current = this.listeners.get(event) ?? []
    current.push(listener)
    this.listeners.set(event, current)
    return () => {
      this.listeners.set(event, (this.listeners.get(event) ?? []).filter(item => item !== listener))
    }
  }

  inject(_deps: readonly string[], callback: (scope: unknown) => void): void {
    callback(this)
  }

  effect(): () => void {
    return () => {}
  }

  emit(event: string, ...args: unknown[]): void {
    for (const listener of [...(this.listeners.get(event) ?? [])]) listener(...args)
  }

  host(): HostContext {
    return this as unknown as HostContext
  }
}

interface FakeSystemPrompt {
  sections: PromptSectionLike[]
  contexts: PromptContextLike[]
  section(definition: PromptSectionLike): () => void
  context(definition: PromptContextLike): () => void
}

function createFakeSystemPrompt(): FakeSystemPrompt {
  const sections: PromptSectionLike[] = []
  const contexts: PromptContextLike[] = []
  return {
    sections,
    contexts,
    section(definition) {
      sections.push(definition)
      return () => {}
    },
    context(definition) {
      contexts.push(definition)
      return () => {}
    },
  }
}

interface FakeTools {
  registered: Map<string, ToolDefinitionLike>
  register(definition: ToolDefinitionLike): () => void
}

function createFakeTools(): FakeTools {
  const registered = new Map<string, ToolDefinitionLike>()
  return {
    registered,
    register(definition) {
      registered.set(definition.name, definition)
      return () => {
        registered.delete(definition.name)
      }
    },
  }
}

interface FakeLlm {
  calls: LlmStreamOptionsLike[]
  responses: string[]
  stream(options: LlmStreamOptionsLike): AsyncIterable<LlmStreamChunkLike>
}

function createFakeLlm(): FakeLlm {
  const llm: FakeLlm = {
    calls: [],
    responses: [],
    stream(options) {
      llm.calls.push(options)
      const content = llm.responses.shift() ?? '[]'
      return (async function* () {
        yield { type: 'text-delta', text: content }
        yield { type: 'finish', reason: 'stop' }
      })()
    },
  }
  return llm
}

// ---------------------------------------------------------------------------
// harness
// ---------------------------------------------------------------------------

let runtimes: MemoryRuntime[] = []
let tempDirs: string[] = []

afterEach(async () => {
  for (const runtime of runtimes) await runtime.dispose()
  runtimes = []
  removeDirs(...tempDirs)
  tempDirs = []
})

interface Harness {
  runtime: MemoryRuntime
  ctx: FakeCtx
  store: FakeStore
  systemPrompt: FakeSystemPrompt
  tools: FakeTools
  llm: FakeLlm
  logs: string[]
}

function createHarness(options: {
  captureEnabled?: boolean
  captureSessionEnd?: boolean
  injectEnabled?: boolean
} = {}): Harness {
  const store = new FakeStore()
  store.setSettings({
    ...(options.captureEnabled === undefined ? {} : { captureEnabled: options.captureEnabled }),
    ...(options.captureSessionEnd === undefined ? {} : { captureSessionEnd: options.captureSessionEnd }),
    ...(options.injectEnabled === undefined ? {} : { injectEnabled: options.injectEnabled }),
  })
  const logs: string[] = []
  const log: LogFn = (level, message) => {
    logs.push(`${level}:${message}`)
  }
  const systemPrompt = createFakeSystemPrompt()
  const tools = createFakeTools()
  const llm = createFakeLlm()
  const ctx = new FakeCtx({ systemPrompt, tools, llm })
  const runtime = new MemoryRuntime({
    ctx: ctx.host(),
    store: store as unknown as MemoryStore,
    log,
  })
  runtime.start()
  runtimes.push(runtime)
  return { runtime, ctx, store, systemPrompt, tools, llm, logs }
}

function makeCwd(): string {
  const dir = tempHome('memory-runtime-cwd-')
  tempDirs.push(dir)
  return dir
}

function makeEntry(overrides: Partial<MemoryEntry> & Pick<MemoryEntry, 'id' | 'name'>): MemoryEntry {
  const now = new Date().toISOString()
  return {
    description: '',
    type: 'preference',
    scope: 'global',
    project: '',
    tags: [],
    importance: 50,
    status: 'active',
    tier: 'long',
    reinforcement: 0,
    obsoleteVotes: 0,
    supersedes: [],
    usedCount: 0,
    confidence: 50,
    pinned: false,
    mergedFrom: [],
    source: 'capture',
    originSessionId: '',
    createdAt: now,
    updatedAt: now,
    content: '',
    ...overrides,
  }
}

function makeAgent(sessionId: string, cwd: string, options: { subagent?: boolean } = {}): {
  id: string
  session: {
    id: string
    header: { cwd: string, origin?: 'subagent' }
    requestHeader: () => { config: { provider: string, model: string } }
  }
  options: { provider: string, model: string }
} {
  return {
    id: `agent-${sessionId}`,
    session: {
      id: sessionId,
      header: { cwd, ...(options.subagent === true ? { origin: 'subagent' as const } : {}) },
      requestHeader: () => ({ config: { provider: 'test', model: 'test-model' } }),
    },
    options: { provider: 'test', model: 'test-model' },
  }
}

function renderRecall(systemPrompt: FakeSystemPrompt, agent: ReturnType<typeof makeAgent>): string {
  const context = systemPrompt.contexts.find(item => item.name === 'agent-extension:memory')
  expect(context, '应注册记忆上下文 provider').toBeTruthy()
  if (context === undefined) return ''
  return typeof context.text === 'function' ? context.text({ agent }) : context.text
}

function emitTurn(
  ctx: FakeCtx,
  agent: ReturnType<typeof makeAgent>,
  turn: number,
  userTexts: readonly string[],
  assistantText: string,
): void {
  const session = agent.session
  ctx.emit('session/event', session, { type: 'turn/start', seq: turn * 100, data: { turn } })
  let seq = turn * 100 + 1
  for (const text of userTexts) {
    ctx.emit('session/event', session, {
      type: 'user/message',
      seq,
      data: { source: { kind: 'user' }, content: [{ type: 'text', text }] },
    })
    seq += 1
  }
  ctx.emit('session/event', session, {
    type: 'assistant/message',
    seq,
    data: { message: { role: 'assistant', content: [{ type: 'text', text: assistantText }] } },
  })
  ctx.emit('session/event', session, { type: 'turn/end', seq: seq + 1, data: { turn } })
}

/** 等待提炼流跑完（异步迭代器）。 */
async function settle(): Promise<void> {
  await new Promise(resolve => setTimeout(resolve, 10))
}

/** 取一次提炼请求的 user payload。 */
function extractionPayload(call: LlmStreamOptionsLike | undefined): Record<string, unknown> {
  const content = call?.messages[1]?.content
  const first = Array.isArray(content) ? content[0] : undefined
  return JSON.parse(first?.text ?? '{}') as Record<string, unknown>
}

// ---------------------------------------------------------------------------
// 用例
// ---------------------------------------------------------------------------

describe('记忆运行时：索引快照', () => {
  it('同会话两次渲染返回同一字符串且不重复检索；invalidateRecall 后重新渲染', () => {
    const { runtime, store, systemPrompt } = createHarness()
    const cwd = makeCwd()
    store.seed(makeEntry({ id: 'm-pref', name: '偏好 A', description: '第一条偏好', importance: 60 }))
    const agent = makeAgent('s-cache', cwd)

    const first = renderRecall(systemPrompt, agent)
    expect(first).toContain('偏好 A')
    expect(first).toMatch(/m-pref · preference · 偏好 A · [^·]+ · 60/u)
    const callsAfterFirst = store.searchCalls.length
    expect(callsAfterFirst).toBeGreaterThan(0)

    const second = renderRecall(systemPrompt, agent)
    expect(second).toBe(first)
    expect(store.searchCalls.length).toBe(callsAfterFirst)

    // 数据变化不会打破「本会话首步快照」；显式刷新后才变化。
    store.seed(makeEntry({ id: 'm-pref2', name: '偏好 B', description: '更高重要性', importance: 90 }))
    expect(renderRecall(systemPrompt, agent)).toBe(first)
    runtime.invalidateRecall('s-cache')
    const refreshed = renderRecall(systemPrompt, agent)
    expect(refreshed).not.toBe(first)
    expect(refreshed).toContain('偏好 B')
    expect(store.searchCalls.length).toBeGreaterThan(callsAfterFirst)

    // provider 路径不得解析项目身份（否则会写 config.json / .git/info/exclude）。
    expect(existsSync(path.join(cwd, '.dsh', 'agent-extension', 'memory', 'config.json'))).toBe(false)
  })

  it('分层注入：全局只放 preference/decision，项目只放 gotcha/project，且预算 3000', () => {
    const { runtime, store, systemPrompt } = createHarness()
    const cwd = makeCwd()
    const identity = runtime.projectForPath(cwd)
    expect(identity).not.toBeNull()
    const project = identity?.projectKey ?? ''
    store.seed(makeEntry({ id: 'm-global-pref', name: '全局偏好', type: 'preference', importance: 90 }))
    store.seed(makeEntry({ id: 'm-global-decision', name: '全局决策', type: 'decision', importance: 80 }))
    store.seed(makeEntry({ id: 'm-global-gotcha', name: '全局坑不该注入', type: 'gotcha', importance: 100 }))
    store.seed(makeEntry({ id: 'm-project-gotcha', name: '项目坑', type: 'gotcha', scope: 'project', project, importance: 70 }))
    store.seed(makeEntry({ id: 'm-project-fact', name: '项目事实', type: 'project', scope: 'project', project, importance: 60 }))
    store.seed(makeEntry({ id: 'm-project-pref', name: '项目偏好不该注入', type: 'preference', scope: 'project', project, importance: 100 }))
    store.seed(makeEntry({ id: 'm-reference', name: '参考不该注入', type: 'reference', scope: 'project', project, importance: 100 }))

    const text = renderRecall(systemPrompt, makeAgent('s-layer', cwd))
    expect(text).toContain('全局偏好')
    expect(text).toContain('全局决策')
    expect(text).toContain('项目坑')
    expect(text).toContain('项目事实')
    expect(text).not.toContain('全局坑不该注入')
    expect(text).not.toContain('项目偏好不该注入')
    expect(text).not.toContain('参考不该注入')
    expect(text.indexOf('Global:')).toBeLessThan(text.indexOf('Project ('))

    // 大量条目 + 长描述：总预算压到 3,000 字符并追加截断提示。
    for (let index = 0; index < 30; index += 1) {
      store.seed(makeEntry({
        id: `m-many-${index}`,
        name: `项目坑 ${index}`,
        type: 'gotcha',
        scope: 'project',
        project,
        description: '填充描述'.repeat(40),
        importance: index,
      }))
    }
    store.setSettings({ indexLimitProject: 50 })
    const budgeted = renderRecall(systemPrompt, makeAgent('s-budget', cwd))
    expect(budgeted.length).toBeLessThanOrEqual(3000)
    expect(budgeted).toContain('Index truncated')
  })

  it('子代理会话不注入索引', () => {
    const { store, systemPrompt } = createHarness()
    const cwd = makeCwd()
    store.seed(makeEntry({ id: 'm-pref', name: '偏好' }))
    expect(renderRecall(systemPrompt, makeAgent('s-sub', cwd, { subagent: true }))).toBe('')
  })
})

describe('记忆运行时：捕获行为', () => {
  it('turn-stopping 不触发提炼；disposed 触发一次批量补漏；force 不跨轮', async () => {
    const { ctx, store, llm } = createHarness()
    const cwd = makeCwd()
    const agent = makeAgent('s-capture', cwd)
    llm.responses.push(JSON.stringify([{
      name: '用 pnpm',
      description: '统一包管理器',
      type: 'preference',
      scope: 'global',
      importance: 80,
      tags: ['pnpm'],
      content: '统一使用 pnpm。',
    }]))

    emitTurn(ctx, agent, 1, ['记住：用 pnpm'], '好的')
    ctx.emit('agent/turn-stopping', { agent })
    expect(llm.calls, '轮末不得触发模型请求').toHaveLength(0)
    expect(store.captureCalls).toHaveLength(0)

    // 第 2 轮只有普通短句：若 force 跨轮泄漏，旧实现会在这里过闸门。
    emitTurn(ctx, agent, 2, ['看看这个函数'], '没问题')
    ctx.emit('agent/turn-stopping', { agent })
    expect(llm.calls).toHaveLength(0)

    ctx.emit('agent/disposed', { agent })
    await settle()
    expect(llm.calls).toHaveLength(1)
    expect(llm.calls[0]?.purpose).toBe('memory-capture')
    const payload = extractionPayload(llm.calls[0])
    expect((payload.turn as { user?: string[] } | undefined)?.user).toHaveLength(2)
    expect(store.entries).toHaveLength(1)
    expect(store.captureCalls.at(-1)).toMatchObject({ entries: 1, skipped: false })

    // 同一会话重复 disposed 不会再来一次。
    ctx.emit('agent/disposed', { agent })
    await settle()
    expect(llm.calls).toHaveLength(1)
  })

  it('会话末捕获只把新增条目写进样本 created；强化条目不在撤销集合', async () => {
    const { ctx, store, llm } = createHarness()
    const cwd = makeCwd()
    const existing = store.seed(makeEntry({
      id: 'm-existing',
      name: '已有偏好',
      description: '已经存在',
      content: '旧正文。',
    }))
    llm.responses.push(JSON.stringify([
      {
        name: '已有偏好',
        description: '已经存在',
        type: 'preference',
        scope: 'global',
        importance: 80,
        tags: [],
        content: '旧正文。',
      },
      {
        name: '新增事实',
        description: '这次新提炼出来的',
        type: 'decision',
        scope: 'global',
        importance: 70,
        tags: [],
        content: '新正文。',
      },
    ]))

    const agent = makeAgent('s-created-refs', cwd)
    emitTurn(ctx, agent, 1, ['记住：用 pnpm，并采用新约定'], '好的')
    ctx.emit('agent/disposed', { agent })
    await settle()

    const call = store.captureCalls.at(-1)
    expect(call).toMatchObject({ entries: 2, skipped: false })
    expect(call?.created).toHaveLength(1)
    const ref = call?.created?.[0]
    expect(ref?.scope).toBe('global')
    expect(ref?.project).toBe('')
    expect(ref?.id).not.toBe(existing.id)
    expect(store.entryById(existing.id)?.reinforcement).toBe(1)
  })

  it('captureEnabled=false 时轮末与会话末都不发请求', async () => {
    const { ctx, store, llm } = createHarness({ captureEnabled: false })
    const cwd = makeCwd()
    const agent = makeAgent('s-off', cwd)
    emitTurn(ctx, agent, 1, ['记住：以后都用 pnpm，这个仓库不要用 npm'], '好的')
    ctx.emit('agent/turn-stopping', { agent })
    ctx.emit('agent/disposed', { agent })
    await settle()
    expect(llm.calls).toHaveLength(0)
    expect(store.captureCalls).toHaveLength(0)
    expect(store.entries).toHaveLength(0)
  })

  it('captureSessionEnd=false 时会话末也不补漏', async () => {
    const { ctx, llm } = createHarness({ captureSessionEnd: false })
    const cwd = makeCwd()
    const agent = makeAgent('s-no-end', cwd)
    emitTurn(ctx, agent, 1, ['这个仓库统一使用 pnpm 管理依赖，禁止 npm 与 yarn'], '好的')
    ctx.emit('agent/disposed', { agent })
    await settle()
    expect(llm.calls).toHaveLength(0)
  })
})

describe('记忆运行时：工具契约', () => {
  it('memory_search 摘要每行 id · 类型 · 名称 · 一句话 · 更新时间，type 下推', async () => {
    const { tools, store } = createHarness()
    store.seed(makeEntry({ id: 'm-gotcha', name: '坑：pnpm workspace', type: 'gotcha', description: '工作区要先构建' }))
    store.seed(makeEntry({ id: 'm-pref', name: '偏好：pnpm', type: 'preference', description: '统一包管理器' }))
    const search = tools.registered.get('memory_search')
    expect(search).toBeTruthy()
    const agent = makeAgent('s-search', makeCwd())
    const result = String(await search?.execute({ query: 'pnpm', type: 'gotcha', limit: 5 }, { agent }))

    const call = store.searchCalls.at(-1)
    expect(call?.options).toMatchObject({ query: 'pnpm', type: 'gotcha', limit: 5 })
    // 检索成功后写入一条样本：会话 id 与查询原样带到 noteSearch。
    expect(store.retrievalCalls.at(-1)).toMatchObject({ sessionId: 's-search', query: 'pnpm', ids: ['m-gotcha'] })
    expect(result).toContain('坑：pnpm workspace')
    expect(result).not.toContain('偏好：pnpm')
    expect(result).toMatch(/m-gotcha · gotcha · 坑：pnpm workspace · .+ · \d{4}-\d{2}-\d{2}/u)
    expect(result).toContain('memory_get')
  })

  it('memory_get 单次最多 3 条；超出显式提示，不静默丢', async () => {
    const { tools, store } = createHarness()
    for (let index = 1; index <= 4; index += 1) {
      store.seed(makeEntry({ id: `m-${index}`, name: `记忆 ${index}`, content: `正文 ${index}` }))
    }
    const get = tools.registered.get('memory_get')
    const agent = makeAgent('s-get', makeCwd())
    const result = String(await get?.execute({ ids: ['m-1', 'm-2', 'm-3', 'm-4'] }, { agent }))

    const requested = [...new Set(store.getCalls.map(item => item.split(':')[1]))]
    expect(requested).toEqual(['m-1', 'm-2', 'm-3'])
    expect(result).toContain('已忽略 1 个 id')
    expect(result).toContain('请再取下一批')
    expect(result).not.toContain('正文 4')
    // 正文被真正读取即使用证明：命中条目触发短期 → 长期升级。
    expect(store.promoted).toEqual(['global:m-1', 'global:m-2', 'global:m-3'])
  })

  it('memory_get 总输出不超过 4,000 字符，超出返回「已截断，请再取下一批」', async () => {
    const { tools, store } = createHarness()
    store.seed(makeEntry({ id: 'm-big', name: '超长记忆', content: '正文内容'.repeat(1000) }))
    const get = tools.registered.get('memory_get')
    const result = String(await get?.execute({ ids: ['m-big'] }, { agent: makeAgent('s-big', makeCwd()) }))
    expect(result.length).toBeLessThanOrEqual(GET_MAX_CHARS)
    expect(result).toContain('已截断，请再取下一批')
    expect(result).toContain('正文超出单次输出上限')
  })

  it('memory_forget 只提示「已标记过时；归档由用户在面板确认」', async () => {
    const { tools, store } = createHarness()
    store.seed(makeEntry({ id: 'm-old', name: '过时记忆' }))
    const forget = tools.registered.get('memory_forget')
    const result = String(await forget?.execute({ id: 'm-old', reason: '已失效' }, { agent: makeAgent('s-forget', makeCwd()) }))
    expect(result).toContain('已标记过时；归档由用户在面板确认')
    expect(result).not.toMatch(/again|再调/iu)
    expect(store.entryById('m-old')?.status).toBe('stale')
  })

  it('memory_save 命中写入闸门（secrets 拦截）返回「未保存」错误文本，让模型可改写重试', async () => {
    const { tools, store } = createHarness()
    const save = tools.registered.get('memory_save')
    const agent = makeAgent('s-secret', makeCwd())
    // secrets 检查在真 MemoryStore.save 内部；FakeStore 用抛错模拟闸门拒绝，
    // 本用例验证的是工具层的错误承接（store 侧拦截已在 memory.store.spec 覆盖）。
    const reject = vi.spyOn(store, 'save').mockImplementation(() => {
      throw new Error('内容疑似包含敏感凭据（GitHub token（gh?_…）），未写入。')
    })
    const result = String(await save?.execute(
      { name: '部署配置', description: 'x', scope: 'global', content: 'token = ghp_AbCdEfGhIjKlMnOpQrStUvWx' },
      { agent },
    ))
    expect(result).toContain('未保存：')
    expect(result).toContain('敏感凭据')
    reject.mockRestore()
  })

  it('严格模式契约固化在工具描述与使用指南里', () => {
    const { tools, systemPrompt } = createHarness()
    const guide = systemPrompt.sections.find(item => item.name === 'agent-extension:memory-guide')
    const context = systemPrompt.contexts.find(item => item.name === 'agent-extension:memory')
    expect(guide?.order).toBe(700)
    expect(context?.order).toBe(150)
    expect(context?.required).toBe(false)
    const search = tools.registered.get('memory_search')?.description ?? ''
    const get = tools.registered.get('memory_get')?.description ?? ''
    const save = tools.registered.get('memory_save')?.description ?? ''
    const forget = tools.registered.get('memory_forget')?.description ?? ''
    expect(search).toContain('memory_get')
    expect(search).toContain('summary line')
    expect(search).toContain('pushed down')
    expect(get).toContain('three')
    expect(get).toContain('4,000')
    expect(save).toContain('memory_search')
    expect(save).toContain('scope` is required')
    expect(save).toContain('stable preference')
    expect(save).toContain('8000')
    expect(forget).toContain('management panel')
    expect(forget).not.toMatch(/call memory_forget again/iu)

    expect(MEMORY_GUIDE).toContain('memory_search')
    expect(MEMORY_GUIDE).toContain('查重')
    expect(MEMORY_GUIDE).toContain('AGENTS.md')
    expect(MEMORY_GUIDE.length).toBeLessThan(800)
  })
})

describe('记忆运行时：使用记录采集', () => {
  interface UsageFileShape {
    schema: number
    entries: Record<string, { usedCount: number, lastUsedAt: string }>
  }

  it('search/get 命中只改内存；turn-stopping 与 disposed 批量落盘 usage', async () => {
    const home = tempHome('memory-runtime-usage-')
    tempDirs.push(home)
    const store = new MemoryStore({ home })
    store.start()
    const alpha = store.save({
      name: '偏好 Alpha',
      description: '利用率采集样本',
      type: 'preference',
      scope: 'global',
      content: 'Alpha 正文。',
    })

    const tools = createFakeTools()
    const ctx = new FakeCtx({ systemPrompt: createFakeSystemPrompt(), tools, llm: createFakeLlm() })
    const runtime = new MemoryRuntime({ ctx: ctx.host(), store, log: () => {} })
    runtime.start()
    runtimes.push(runtime)

    const agent = makeAgent('s-usage', makeCwd())
    const usageFile = path.join(store.root, 'usage.json')
    expect(existsSync(usageFile)).toBe(false)

    const search = tools.registered.get('memory_search')
    const get = tools.registered.get('memory_get')
    expect(search).toBeTruthy()
    expect(get).toBeTruthy()
    // 一次 search（命中 1 条）+ 两次 get 同一条：同一次工具调用只计一次，
    // 跨调用累加为 3。
    await search?.execute({ query: '' }, { agent })
    await get?.execute({ ids: [alpha.id] }, { agent })
    await get?.execute({ ids: [alpha.id] }, { agent })
    expect(existsSync(usageFile), '读路径只改内存，不写盘').toBe(false)

    ctx.emit('agent/turn-stopping', { agent })
    expect(existsSync(usageFile), '轮末应批量落盘').toBe(true)
    const first = JSON.parse(readFileSync(usageFile, 'utf8')) as UsageFileShape
    expect(first.schema).toBe(1)
    expect(first.entries[alpha.id]?.usedCount).toBe(3)
    expect(first.entries[alpha.id]?.lastUsedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/u)

    await get?.execute({ ids: [alpha.id] }, { agent })
    ctx.emit('agent/disposed', { agent })
    const second = JSON.parse(readFileSync(usageFile, 'utf8')) as UsageFileShape
    expect(second.entries[alpha.id]?.usedCount).toBe(4)
  })

  it('30 秒定时器兜底 flush usage；dispose 时清理定时器', async () => {
    vi.useFakeTimers()
    const home = tempHome('memory-runtime-usage-timer-')
    tempDirs.push(home)
    const store = new MemoryStore({ home })
    store.start()
    try {
      const tools = createFakeTools()
      const ctx = new FakeCtx({ systemPrompt: createFakeSystemPrompt(), tools, llm: createFakeLlm() })
      const runtime = new MemoryRuntime({ ctx: ctx.host(), store, log: () => {} })
      runtime.start()
      const alpha = store.save({
        name: '定时落盘样本',
        description: '30 秒兜底',
        type: 'reference',
        scope: 'global',
        content: '正文。',
      })
      const agent = makeAgent('s-usage-timer', makeCwd())
      await tools.registered.get('memory_search')?.execute({ query: '' }, { agent })

      const usageFile = path.join(store.root, 'usage.json')
      expect(existsSync(usageFile), '未到 30 秒不落盘').toBe(false)
      vi.advanceTimersByTime(30_000)
      expect(existsSync(usageFile), '定时器触发后落盘').toBe(true)
      const raw = JSON.parse(readFileSync(usageFile, 'utf8')) as UsageFileShape
      expect(raw.entries[alpha.id]?.usedCount).toBe(1)

      // 在 fake timers 生效时 dispose：清除定时器并 flush。
      await runtime.dispose()
      vi.advanceTimersByTime(30_000)
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('记忆运行时：检索命中率口径', () => {
  it('search 结果 id 后续 get 只计一次 searchUsed，flush 写入 store 的 stats 行', async () => {
    const home = tempHome('memory-runtime-stats-')
    tempDirs.push(home)
    const store = new MemoryStore({ home })
    store.start()
    const alpha = store.save({
      name: '偏好 Alpha',
      description: '第一条偏好',
      type: 'preference',
      scope: 'global',
      content: 'Alpha 正文。',
    })
    const beta = store.save({
      name: '偏好 Beta',
      description: '第二条偏好',
      type: 'preference',
      scope: 'global',
      content: 'Beta 正文。',
    })

    const tools = createFakeTools()
    const ctx = new FakeCtx({ systemPrompt: createFakeSystemPrompt(), tools, llm: createFakeLlm() })
    const runtime = new MemoryRuntime({ ctx: ctx.host(), store, log: () => {} })
    runtime.start()
    runtimes.push(runtime)

    const agent = makeAgent('s-stats', makeCwd())
    const search = tools.registered.get('memory_search')
    expect(search).toBeTruthy()
    // 两次检索各返回 2 条：searched 按结果条数累计为 4。
    await search?.execute({ query: '' }, { agent })
    await search?.execute({ query: '' }, { agent })

    const get = tools.registered.get('memory_get')
    expect(get).toBeTruthy()
    // 同一 id 读两次只计一次；另一个 id 读一次 → searchUsed = 2。
    await get?.execute({ ids: [alpha.id] }, { agent })
    await get?.execute({ ids: [alpha.id] }, { agent })
    await get?.execute({ ids: [beta.id] }, { agent })
    // 检索之后才出现、从未被 search 返回的 id 不计入 searchUsed。
    const gamma = store.save({
      name: '偏好 Gamma',
      description: '后来才出现',
      type: 'preference',
      scope: 'global',
      content: 'Gamma 正文。',
    })
    await get?.execute({ ids: [gamma.id] }, { agent })

    ctx.emit('agent/turn-stopping', { agent })
    const row = store.stats().sessions.find(item => item.sessionId === 's-stats')
    expect(row).toMatchObject({ injected: 0, injectedUsed: 0, searched: 4, searchUsed: 2 })

    const persisted = JSON.parse(readFileSync(path.join(store.root, 'stats.json'), 'utf8')) as {
      sessions: Array<Record<string, unknown>>
    }
    expect(persisted.sessions[0]).toMatchObject({ sessionId: 's-stats', searched: 4, searchUsed: 2 })
  })
})

describe('记忆运行时：最近检索样本', () => {
  it('memory_search 成功后 stats.recentRetrievals 出现一条，ids ≤10 且 query 保留', async () => {
    const home = tempHome('memory-runtime-retrieval-')
    tempDirs.push(home)
    const store = new MemoryStore({ home })
    store.start()
    for (let index = 0; index < 12; index += 1) {
      store.save({
        name: `检索样本 ${index}`,
        description: `第 ${index} 条`,
        type: 'reference',
        scope: 'global',
        content: `正文 ${index}。`,
      })
    }

    const tools = createFakeTools()
    const ctx = new FakeCtx({ systemPrompt: createFakeSystemPrompt(), tools, llm: createFakeLlm() })
    const runtime = new MemoryRuntime({ ctx: ctx.host(), store, log: () => {} })
    runtime.start()
    runtimes.push(runtime)

    const agent = makeAgent('s-retrieval', makeCwd())
    const search = tools.registered.get('memory_search')
    expect(search).toBeTruthy()
    await search?.execute({ query: '检索样本', limit: 12 }, { agent })

    const rows = store.stats().recentRetrievals
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ sessionId: 's-retrieval', query: '检索样本', results: 12 })
    expect(rows[0]?.ids).toHaveLength(10)
    expect(rows[0]?.at).toMatch(/^\d{4}-\d{2}-\d{2}T/u)

    // 样本随 stats.json 落盘，诊断视图重启后仍可读。
    const persisted = JSON.parse(readFileSync(path.join(store.root, 'stats.json'), 'utf8')) as {
      recentRetrievals: Array<Record<string, unknown>>
    }
    expect(persisted.recentRetrievals[0]).toMatchObject({ sessionId: 's-retrieval', query: '检索样本', results: 12 })
    expect(persisted.recentRetrievals[0]?.ids).toHaveLength(10)
  })
})
