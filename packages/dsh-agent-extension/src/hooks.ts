/**
 * Hooks injection: map agent plugin hooks onto real host events and run the
 * commands through the host subprocess service (no `@deepseek-ai/*` import,
 * no homemade event channel).
 *
 * Probed host events:
 * - PreToolUse        → `tools/pre-execute` (waterfall, may deny)
 * - PostToolUse       → `tools/result` (emit, observe only)
 * - UserPromptSubmit  → `agent/inbox/inserted` (emit, observe only; the input cannot change)
 * - Stop              → `agent/turn-stopping` (serial, awaitable)
 * - SessionStart      → `session/created`
 * - SessionEnd        → `agent/disposed`
 *
 * Hooks whose event the host lacks (Notification / SubagentStop / PreCompact
 * and the like) keep their manifest entry and are marked inactive in
 * `/agent-plugin info`.
 *
 * @module dsh-agent-extension/hooks
 */

import { isCapabilityDisabled, readHooksConfig, normalizeHooks } from './capabilities.ts'
import type { PluginRecord } from './store.ts'
import type { HostContext, SubprocessService } from './host.ts'
import type { LogFn } from './log.ts'

/** One row of the agent-event → host-event mapping. */
export interface HookEventMapping {
  host: string | null
  mode?: string
  canBlock?: boolean
  note?: string
  reason?: string
}

/** The event mapping table; `host: null` means the host has no such event. */
export const HOOK_EVENT_MAP: Readonly<Record<string, HookEventMapping>> = Object.freeze({
  PreToolUse: { host: 'tools/pre-execute', mode: 'waterfall', canBlock: true },
  PostToolUse: { host: 'tools/result', mode: 'emit', canBlock: false },
  UserPromptSubmit: {
    host: 'agent/inbox/inserted',
    mode: 'emit',
    canBlock: false,
    note: '只能观察；DSH 该事件不可改写用户输入',
  },
  Stop: { host: 'agent/turn-stopping', mode: 'serial', canBlock: false },
  SessionStart: { host: 'session/created', mode: 'emit', canBlock: false },
  SessionEnd: { host: 'agent/disposed', mode: 'emit', canBlock: false },
  Notification: { host: null, reason: '宿主没有对应事件' },
  SubagentStop: { host: null, reason: '宿主没有对应事件' },
  PreCompact: { host: null, reason: '宿主没有对应事件' },
  PostCompact: { host: null, reason: '宿主没有对应事件' },
})

/** Extract the session id and working directory from an event payload, best effort. */
function contextOf(payload: unknown): { sessionId: string, cwd: string } {
  const record = (payload ?? {}) as Record<string, unknown>
  const agent = record.agent as Record<string, unknown> | undefined
  const session = (record.session ?? agent?.session) as Record<string, unknown> | undefined
  const id = session?.id ?? agent?.id ?? record.sessionId ?? ''
  const cwd = session?.cwd ?? agent?.cwd ?? process.cwd()
  return { sessionId: String(id ?? ''), cwd: String(cwd ?? process.cwd()) }
}

function messageText(message: unknown): string {
  const content = (message as Record<string, unknown> | null | undefined)?.content
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  return content
    .filter((block): block is Record<string, unknown> =>
      block !== null && typeof block === 'object' && (block as Record<string, unknown>).type === 'text')
    .map(block => block.text)
    .filter((text): text is string => typeof text === 'string')
    .join('\n')
}

/** Length cap on matcher regex strings; longer ones compare literally so a hostile regex cannot stall the host. */
const MAX_MATCHER_LENGTH = 256

/** Whether a matcher (regex string) matches. An empty matcher matches everything. */
export function matcherMatches(matcher: unknown, value: unknown): boolean {
  const text = String(matcher ?? '').trim()
  if (text === '' || text === '*') return true
  if (text === value) return true
  const target = String(value ?? '')
  if (text.length > MAX_MATCHER_LENGTH) return text === target
  try {
    return new RegExp(text, 'u').test(target)
  } catch {
    return text === target
  }
}

/** One hook command execution result. */
export interface HookRunResult {
  exitCode: number | null
  signal: unknown
  stdout: string
  stderr: string
  timedOut: boolean
}

/** Lazy-probed subprocess executor. */
export interface SubprocessExecutor {
  available: boolean
  reason: string
  run: (input: { command: string, cwd: string, payload: unknown, timeoutMs: number }) => Promise<HookRunResult>
}

/** Build a hook command executor over the host subprocess service. */
export function createSubprocessExecutor(ctx: unknown): SubprocessExecutor {
  const subprocess = (ctx as { get?: (name: string) => unknown } | null)?.get?.('subprocess') as SubprocessService | undefined
  if (!subprocess || typeof subprocess.spawn !== 'function') {
    return {
      available: false,
      reason: '宿主未提供 subprocess 服务，hooks 不执行外部命令',
      run: async () => {
        throw new Error('subprocess 不可用')
      },
    }
  }
  const run = async ({ command, cwd, payload, timeoutMs }: { command: string, cwd: string, payload: unknown, timeoutMs: number }): Promise<HookRunResult> => {
    let shell = 'sh'
    let platform = 'posix'
    try {
      const environment = await subprocess.terminalEnvironment?.()
      if (environment?.platform === 'windows') {
        platform = 'windows'
        shell = environment.defaultShell || process.env.ComSpec || 'cmd.exe'
      } else if (environment?.defaultShell) {
        shell = environment.defaultShell
      }
    } catch {
      platform = process.platform === 'win32' ? 'windows' : 'posix'
      if (platform === 'windows') shell = process.env.ComSpec || 'cmd.exe'
    }
    let executable = shell
    try {
      executable = await subprocess.resolveExecutable?.(shell) ?? shell
    } catch {
      /* resolution failure falls back to the raw shell for spawn */
    }
    const argv = platform === 'windows'
      ? [executable, '/d', '/s', '/c', command]
      : [executable, '-c', command]
    const handle = subprocess.spawn({
      argv,
      cwd,
      stdio: {
        stdin: { data: JSON.stringify(payload) },
        stdout: { maxBytes: 65536 },
        stderr: { maxBytes: 65536 },
      },
      graceMs: 1000,
      env: process.env,
    })
    let timedOut = false
    const timer = setTimeout(() => {
      timedOut = true
      try {
        handle.terminate()
      } catch {
        /* terminate failure is left to done */
      }
    }, Math.min(Math.max(timeoutMs, 1000), 600_000))
    try {
      const outcome = await handle.done
      const stdout = handle.collected?.stdout?.readFrom?.(0).text ?? ''
      const stderr = handle.collected?.stderr?.readFrom?.(0).text ?? ''
      return { exitCode: outcome?.exitCode ?? null, signal: outcome?.signal ?? null, stdout, stderr, timedOut }
    } finally {
      clearTimeout(timer)
    }
  }
  return { available: true, reason: '', run }
}

/** One hook execution record for the info display. */
export interface HookRecentRun {
  at: string
  event: string
  plugin: string
  exitCode: number | null
  timedOut: boolean
  stdout: string
  stderr: string
}

/** Hook runtime state exposed to status rendering. */
export interface HookStats {
  attached: boolean
  enabled: boolean
  reason: string
  events: Array<{ event: string, host: string | null, mode: string, effective: boolean, reason: string }>
  counters: Record<string, number>
  recent: HookRecentRun[]
}

/** One resolved hook command with its owning plugin. */
interface ResolvedHook {
  plugin: PluginRecord
  matcher: string
  command: string
  timeout: number
  cwd: string
}

/** Hooks runtime: maps plugin hooks onto host events and executes commands. */
export class HookRuntime {
  private readonly getEnabledPlugins: () => PluginRecord[]
  private readonly log: LogFn
  private readonly config: { hooks?: boolean | undefined }
  private ctx: unknown = null
  private readonly fixedExecutor: SubprocessExecutor | null
  private executor: SubprocessExecutor | null
  private disposers: Array<() => void> = []

  /** Whether listeners attached. */
  attached = false
  reason = ''
  private recent: HookRecentRun[] = []
  private counters: Record<string, number> = {}
  private unmapped = new Set<string>()

  constructor(options: {
    getEnabledPlugins: () => PluginRecord[]
    log: LogFn
    config?: { hooks?: boolean | undefined }
    executor?: SubprocessExecutor | null
  }) {
    this.getEnabledPlugins = options.getEnabledPlugins
    this.log = options.log
    this.config = options.config ?? {}
    this.fixedExecutor = options.executor ?? null
    this.executor = this.fixedExecutor
  }

  /** Master switch (default on). */
  get enabled(): boolean {
    return this.config.hooks !== false
  }

  /** Attach event listeners; a missing host service lands in stats as the reason. */
  attach(ctx: unknown): boolean {
    if (!this.enabled) {
      this.reason = '配置 hooks: false，已停用 hooks'
      return false
    }
    this.ctx = ctx
    const host = ctx as HostContext
    const on = host?.on?.bind(host)
    if (typeof on !== 'function') {
      this.reason = '宿主 ctx 不支持事件监听'
      return false
    }
    const register = (event: string, listener: (...args: unknown[]) => unknown): boolean => {
      try {
        const disposer = on(event, listener)
        if (typeof disposer === 'function') this.disposers.push(disposer as () => void)
        return true
      } catch (error) {
        this.log('warn', `监听宿主事件 ${event} 失败：${error instanceof Error ? error.message : String(error)}`)
        return false
      }
    }
    // Listeners do not depend on tools/subprocess: late services are fine, the executor probes lazily at run time.
    register('tools/pre-execute', async (...args: unknown[]) => this.onPreToolUse(args[0], args[1] as () => unknown))
    register('tools/result', (...args: unknown[]) => this.fire('PostToolUse', args[0], args[1]))
    register('agent/inbox/inserted', (...args: unknown[]) => this.fire('UserPromptSubmit', args[0]))
    register('agent/turn-stopping', async (...args: unknown[]) => {
      await this.runEvent('Stop', args[0], this.payloadFor('Stop', args[0]))
    })
    register('session/created', (...args: unknown[]) => this.fire('SessionStart', { session: args[0] }))
    register('agent/disposed', (...args: unknown[]) => this.fire('SessionEnd', args[0]))
    this.attached = true
    this.probeExecutor()
    return true
  }

  /**
   * Resolve a usable subprocess executor (lazy probe).
   *
   * The host activates on service availability: this plugin may start before
   * the subprocess row, so `ctx.get('subprocess')` can be undefined at attach
   * time. Failures are not cached — every run and stats display re-probes, and
   * hooks recover automatically once the service arrives.
   */
  probeExecutor(): SubprocessExecutor | null {
    if (this.executor?.available === true) return this.executor
    if (this.fixedExecutor) {
      this.executor = this.fixedExecutor
      return this.executor
    }
    const created = createSubprocessExecutor(this.ctx)
    this.executor = created.available ? created : null
    this.reason = created.available ? '' : created.reason
    return this.executor
  }

  /** PreToolUse: runs inside the waterfall; a matching deny blocks the tool call. */
  async onPreToolUse(exec: unknown, next: () => unknown): Promise<unknown> {
    try {
      const decision = await this.runEvent('PreToolUse', exec, this.payloadFor('PreToolUse', exec))
      if (decision?.deny === true) {
        return { kind: 'deny', reason: decision.reason || `被 Agent 插件 hook 拒绝：${String((exec as Record<string, unknown> | null)?.name ?? 'tool')}` }
      }
    } catch (error) {
      this.log('warn', `PreToolUse hook 执行异常（放行）：${error instanceof Error ? error.message : String(error)}`)
    }
    return next()
  }

  /** emit/serial events: run and swallow errors so the host main flow never breaks. */
  async fire(hookEvent: string, ...args: unknown[]): Promise<void> {
    try {
      const payload = args[0] ?? {}
      await this.runEvent(hookEvent, payload, this.payloadFor(hookEvent, payload))
    } catch (error) {
      this.log('warn', `${hookEvent} hook 执行异常：${error instanceof Error ? error.message : String(error)}`)
    }
  }

  /** Build the stdin JSON for one hook event (mirrors the Claude Code structure). */
  payloadFor(hookEvent: string, payload: unknown): Record<string, unknown> {
    const context = contextOf(payload)
    const record = (payload ?? {}) as Record<string, unknown>
    const base = {
      session_id: context.sessionId,
      transcript_path: '',
      cwd: context.cwd,
      hook_event_name: hookEvent,
    }
    if (hookEvent === 'PreToolUse' || hookEvent === 'PostToolUse') {
      return {
        ...base,
        tool_name: String(record.name ?? ''),
        tool_input: record.arguments ?? record.input ?? {},
      }
    }
    if (hookEvent === 'UserPromptSubmit') {
      return { ...base, prompt: messageText(record.message) }
    }
    if (hookEvent === 'SessionStart') {
      return { ...base, source: 'startup' }
    }
    if (hookEvent === 'SessionEnd') {
      return { ...base, reason: 'other' }
    }
    return base
  }

  /** Collect the hook definitions participating in one event. */
  groupsFor(hookEvent: string): ResolvedHook[] {
    const groups: ResolvedHook[] = []
    for (const plugin of this.getEnabledPlugins()) {
      if (isCapabilityDisabled(plugin, 'hooks', hookEvent)) continue
      const hooks = readHooksConfig(plugin.installedPath, plugin.format, {})
      const normalized = normalizeHooks(hooks.config)
      for (const warning of normalized.warnings) {
        this.log('warn', `${plugin.name}: hooks 告警：${warning}`)
      }
      const eventGroups = normalized.events[hookEvent]
      if (!eventGroups || !Array.isArray(eventGroups)) continue
      for (const group of eventGroups) {
        for (const entry of group.entries) {
          groups.push({
            plugin,
            matcher: group.matcher,
            command: entry.command,
            timeout: entry.timeout,
            cwd: plugin.installedPath,
          })
        }
      }
    }
    return groups
  }

  /** Run every matching command of one hook event. */
  async runEvent(hookEvent: string, payload: unknown, hookPayload: unknown): Promise<{ deny?: boolean, reason?: string }> {
    const mapping = HOOK_EVENT_MAP[hookEvent]
    if (!mapping || mapping.host === null) {
      this.unmapped.add(hookEvent)
      return {}
    }
    const executor = this.probeExecutor()
    if (executor === null) {
      this.unmapped.add(hookEvent)
      return {}
    }
    const filterValue = hookEvent === 'PreToolUse' || hookEvent === 'PostToolUse'
      ? String((payload as Record<string, unknown> | null)?.name ?? '')
      : hookEvent === 'SessionStart' ? 'startup' : ''
    const groups = this.groupsFor(hookEvent).filter(group => matcherMatches(group.matcher, filterValue))
    if (groups.length === 0) return {}
    for (const group of groups) {
      let result: HookRunResult
      try {
        result = await executor.run({
          command: group.command,
          cwd: group.cwd,
          payload: hookPayload,
          timeoutMs: group.timeout * 1000,
        })
      } catch (error) {
        this.log('warn', `hook 命令执行失败（${group.plugin.name}）：${error instanceof Error ? error.message : String(error)}`)
        continue
      }
      this.record(hookEvent, group, result)
      if (hookEvent === 'PreToolUse') {
        const decision = parseHookDecision(result)
        if (decision.deny) return decision
      }
    }
    return {}
  }

  /** Record recent runs for the info display. */
  record(hookEvent: string, group: ResolvedHook, result: HookRunResult): void {
    this.counters[hookEvent] = (this.counters[hookEvent] ?? 0) + 1
    const entry: HookRecentRun = {
      at: new Date().toISOString(),
      event: hookEvent,
      plugin: group.plugin.key,
      exitCode: result.exitCode,
      timedOut: result.timedOut,
      stdout: String(result.stdout ?? '').slice(0, 500),
      stderr: String(result.stderr ?? '').slice(0, 500),
    }
    this.recent.push(entry)
    if (this.recent.length > 20) this.recent.shift()
    const level = result.exitCode === 0 && !result.timedOut ? 'info' : 'warn'
    this.log(level, `hook ${hookEvent} ${group.plugin.key} 退出码=${String(result.exitCode)} 超时=${String(result.timedOut)}`)
  }

  /** Capability listing: which events mapped, which are inactive. */
  stats(): HookStats {
    const executor = this.probeExecutor()
    const effective = Object.entries(HOOK_EVENT_MAP).map(([event, mapping]) => ({
      event,
      host: mapping.host,
      mode: mapping.mode ?? '',
      effective: mapping.host !== null && this.attached && executor !== null,
      reason: mapping.host === null
        ? (mapping.reason ?? '')
        : executor === null ? (this.reason || 'subprocess 服务不可用') : (mapping.note ?? ''),
    }))
    return {
      attached: this.attached,
      enabled: this.enabled,
      reason: this.reason,
      events: effective,
      counters: { ...this.counters },
      recent: this.recent.slice(-5),
    }
  }

  /** Plugin state changes do not rebuild listeners (they read state live); only refresh executor availability. */
  refresh(): boolean {
    return this.attached
  }

  /** Unregister every listener on dispose. */
  dispose(): void {
    for (const disposer of this.disposers) {
      try {
        disposer()
      } catch {
        /* ignored */
      }
    }
    this.disposers = []
    this.attached = false
  }
}

/** Simplified host event payload (legacy callers; the real input comes from payloadFor). */
export function buildHostPayload(hookEvent: string, args: readonly unknown[]): Record<string, unknown> {
  const first = args[0]
  if (hookEvent === 'PostToolUse') {
    const record = (first ?? {}) as Record<string, unknown>
    return { name: record.name, result: args[1] ?? null }
  }
  return (first as Record<string, unknown>) ?? {}
}

/** Hook decision parsed from a command run. */
export interface HookDecision {
  deny: boolean
  reason?: string
}

/** Parse a Claude hook output: exit code 2 or a JSON decision blocks. */
export function parseHookDecision(result: HookRunResult): HookDecision {
  const { exitCode, stdout, timedOut } = result
  if (timedOut) return { deny: false }
  const text = String(stdout ?? '').trim()
  if (text !== '') {
    try {
      const parsed = JSON.parse(text) as Record<string, unknown>
      const hookSpecificOutput = parsed.hookSpecificOutput as Record<string, unknown> | undefined
      const permission = hookSpecificOutput?.permissionDecision
      if (permission === 'deny' || permission === 'block') {
        return { deny: true, reason: String(hookSpecificOutput?.permissionDecisionReason ?? '') }
      }
      if (parsed.decision === 'block') {
        return { deny: true, reason: String(parsed.reason ?? '') }
      }
      if (parsed.continue === false) {
        return { deny: true, reason: String(parsed.stopReason ?? '') }
      }
    } catch {
      /* non-JSON output is treated as plain text */
    }
  }
  if (exitCode === 2) {
    return { deny: true, reason: String(result.stderr ?? '').trim().slice(0, 500) || 'hook 以退出码 2 阻止该操作' }
  }
  return { deny: false }
}
