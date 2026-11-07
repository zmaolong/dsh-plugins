/**
 * hooks 注入：把 Agent 插件的 hooks 配置映射到宿主真实事件，并用宿主
 * subprocess 服务执行命令（不导入任何 @deepseek-ai/*，也不自造事件通道）。
 *
 * 已侦察到的宿主事件：
 * - PreToolUse        → `tools/pre-execute`（waterfall，可 deny）
 * - PostToolUse       → `tools/result`（emit，只观察）
 * - UserPromptSubmit  → `agent/inbox/inserted`（emit，只观察，不能改写入参）
 * - Stop              → `agent/turn-stopping`（serial，可等待）
 * - SessionStart      → `session/created`
 * - SessionEnd        → `agent/disposed`
 *
 * 宿主没有对应事件的 hooks（Notification / SubagentStop / PreCompact 等）
 * 只保留清单并在 `/agent-plugin info` 标注「未生效」。
 *
 * @module dsh-agent-plugin-hub/hooks
 */

import { isCapabilityDisabled, readHooksConfig, normalizeHooks } from './capabilities.js'

/** 事件映射表；`host` 为 null 表示宿主没有对应事件。 */
export const HOOK_EVENT_MAP = Object.freeze({
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

/** 从事件 payload 里尽量取出会话 id 与工作目录。 */
function contextOf(payload) {
  const agent = payload?.agent
  const session = payload?.session ?? agent?.session
  const id = session?.id ?? agent?.id ?? payload?.sessionId ?? ''
  const cwd = session?.cwd ?? agent?.cwd ?? process.cwd()
  return { sessionId: String(id ?? ''), cwd: String(cwd ?? process.cwd()) }
}

function messageText(message) {
  const content = message?.content
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  return content
    .filter((block) => block?.type === 'text' && typeof block.text === 'string')
    .map((block) => block.text)
    .join('\n')
}

/** 判断 matcher（正则字符串）是否匹配。空 matcher 表示匹配全部。 */
export function matcherMatches(matcher, value) {
  const text = String(matcher ?? '').trim()
  if (text === '' || text === '*') return true
  if (text === value) return true
  try {
    return new RegExp(text, 'u').test(String(value ?? ''))
  } catch {
    return text === String(value ?? '')
  }
}

/**
 * 用宿主 subprocess 服务跑一条 hook 命令。
 *
 * @param {object} ctx
 * @returns {{available: boolean, reason: string, run: Function}}
 */
export function createSubprocessExecutor(ctx) {
  const subprocess = ctx?.get?.('subprocess')
  if (!subprocess || typeof subprocess.spawn !== 'function') {
    return {
      available: false,
      reason: '宿主未提供 subprocess 服务，hooks 不执行外部命令',
      run: async () => {
        throw new Error('subprocess 不可用')
      },
    }
  }
  const run = async ({ command, cwd, payload, timeoutMs }) => {
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
      executable = await subprocess.resolveExecutable(shell)
    } catch {
      /* 解析失败时退回原样交给 spawn */
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
        /* 终止失败交给 done 处理 */
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

export class HookRuntime {
  /**
   * @param {{getEnabledPlugins: () => object[], store: import('./store.js').HubStore,
   *          config?: {hooks?: boolean}, executor?: object, mode?: 'subprocess'}} options
   */
  constructor(options) {
    this.getEnabledPlugins = options.getEnabledPlugins
    this.store = options.store
    this.config = options.config ?? {}
    this.ctx = null
    this.executor = options.executor ?? null
    this.disposers = []
    this.attached = false
    this.reason = ''
    this.recent = []
    this.counters = {}
    this.unmapped = new Set()
  }

  /** hooks 总开关（默认开启）。 */
  get enabled() {
    return this.config.hooks !== false
  }

  /** 注册事件监听；宿主没有对应服务时把原因写进 stats。 */
  attach(ctx) {
    if (!this.enabled) {
      this.reason = '配置 hooks: false，已停用 hooks'
      return false
    }
    this.ctx = ctx
    const executor = this.executor ?? createSubprocessExecutor(ctx)
    this.executor = executor
    if (!executor.available) {
      this.reason = executor.reason
      return false
    }
    const on = ctx?.on?.bind(ctx)
    if (typeof on !== 'function') {
      this.reason = '宿主 ctx 不支持事件监听'
      return false
    }
    const tools = ctx.get?.('tools')
    const register = (event, listener) => {
      try {
        const disposer = on(event, listener)
        if (typeof disposer === 'function') this.disposers.push(disposer)
        return true
      } catch (error) {
        this.store.log('warn', `监听宿主事件 ${event} 失败：${error instanceof Error ? error.message : String(error)}`)
        return false
      }
    }
    if (tools) {
      register('tools/pre-execute', async (exec, next) => this.onPreToolUse(exec, next))
      register('tools/result', (exec, result) => this.fire('PostToolUse', exec, result))
    }
    register('agent/inbox/inserted', (payload) => this.fire('UserPromptSubmit', payload))
    register('agent/turn-stopping', async (payload) => {
      await this.runEvent('Stop', payload, this.payloadFor('Stop', payload))
    })
    register('session/created', (session) => this.fire('SessionStart', { session }))
    register('agent/disposed', (payload) => this.fire('SessionEnd', payload))
    this.attached = true
    this.reason = tools ? '' : '宿主未提供 tools 服务，工具类 hooks 不会触发'
    return true
  }

  /** PreToolUse：waterfall 里执行，命中 deny 时阻断工具调用。 */
  async onPreToolUse(exec, next) {
    try {
      const decision = await this.runEvent('PreToolUse', exec, this.payloadFor('PreToolUse', exec))
      if (decision?.deny === true) {
        return { kind: 'deny', reason: decision.reason || `被 Agent 插件 hook 拒绝：${exec?.name ?? 'tool'}` }
      }
    } catch (error) {
      this.store.log('warn', `PreToolUse hook 执行异常（放行）：${error instanceof Error ? error.message : String(error)}`)
    }
    return next()
  }

  /** emit/serial 事件：执行并吞掉异常，绝不影响宿主主流程。 */
  async fire(hookEvent, ...args) {
    try {
      const payload = args[0] ?? {}
      await this.runEvent(hookEvent, payload, this.payloadFor(hookEvent, payload))
    } catch (error) {
      this.store.log('warn', `${hookEvent} hook 执行异常：${error instanceof Error ? error.message : String(error)}`)
    }
  }

  /** 构造某个 hook 事件的输入 JSON（贴近 Claude Code 的 stdin 结构）。 */
  payloadFor(hookEvent, payload) {
    const context = contextOf(payload)
    const base = {
      session_id: context.sessionId,
      transcript_path: '',
      cwd: context.cwd,
      hook_event_name: hookEvent,
    }
    if (hookEvent === 'PreToolUse' || hookEvent === 'PostToolUse') {
      return {
        ...base,
        tool_name: String(payload?.name ?? ''),
        tool_input: payload?.arguments ?? payload?.input ?? {},
      }
    }
    if (hookEvent === 'UserPromptSubmit') {
      return { ...base, prompt: messageText(payload?.message) }
    }
    if (hookEvent === 'SessionStart') {
      return { ...base, source: 'startup' }
    }
    if (hookEvent === 'SessionEnd') {
      return { ...base, reason: 'other' }
    }
    return base
  }

  /** 收集参与该事件的 hook 定义。 */
  groupsFor(hookEvent) {
    const groups = []
    for (const plugin of this.getEnabledPlugins()) {
      if (isCapabilityDisabled(plugin, 'hooks', hookEvent)) continue
      const hooks = readHooksConfig(plugin.installedPath, plugin.format, {})
      const normalized = normalizeHooks(hooks.config)
      for (const warning of normalized.warnings) {
        this.store.log('warn', `${plugin.name}: hooks 告警：${warning}`)
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

  /**
   * 执行一个 hook 事件的所有匹配命令。
   *
   * @returns {Promise<{deny?: boolean, reason?: string}>}
   */
  async runEvent(hookEvent, payload, hookPayload) {
    const mapping = HOOK_EVENT_MAP[hookEvent]
    if (!mapping || mapping.host === null) {
      this.unmapped.add(hookEvent)
      return {}
    }
    if (!this.executor?.available) {
      this.unmapped.add(hookEvent)
      return {}
    }
    const filterValue = hookEvent === 'PreToolUse' || hookEvent === 'PostToolUse'
      ? String(payload?.name ?? '')
      : hookEvent === 'SessionStart' ? 'startup' : ''
    const groups = this.groupsFor(hookEvent).filter((group) => matcherMatches(group.matcher, filterValue))
    if (groups.length === 0) return {}
    for (const group of groups) {
      let result
      try {
        result = await this.executor.run({
          command: group.command,
          cwd: group.cwd,
          payload: hookPayload,
          timeoutMs: group.timeout * 1000,
        })
      } catch (error) {
        this.store.log('warn', `hook 命令执行失败（${group.plugin.name}）：${error instanceof Error ? error.message : String(error)}`)
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

  /** 简单记录最近执行结果，供 info 展示。 */
  record(hookEvent, group, result) {
    this.counters[hookEvent] = (this.counters[hookEvent] ?? 0) + 1
    const entry = {
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
    this.store.log(level, `hook ${hookEvent} ${group.plugin.key} 退出码=${String(result.exitCode)} 超时=${String(result.timedOut)}`)
  }

  /** 能力清单：哪些事件已映射、哪些未生效。 */
  stats() {
    const effective = Object.entries(HOOK_EVENT_MAP).map(([event, mapping]) => ({
      event,
      host: mapping.host,
      mode: mapping.mode ?? '',
      effective: mapping.host !== null && this.attached && this.executor?.available === true,
      reason: mapping.host === null ? mapping.reason : (mapping.note ?? ''),
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

  /** 插件状态变化不需要重建监听（监听里实时读状态），只更新执行器可用性。 */
  refresh() {
    return this.attached
  }

  /** 卸载时注销全部监听。 */
  dispose() {
    for (const disposer of this.disposers) {
      try {
        disposer()
      } catch {
        /* 忽略 */
      }
    }
    this.disposers = []
    this.attached = false
  }
}

/** 简化版宿主事件载荷（兼容旧调用；真正输入以 payloadFor 为准）。 */
export function buildHostPayload(hookEvent, args) {
  const first = args[0]
  if (hookEvent === 'PostToolUse') return { name: first?.name, result: args[1] ?? null }
  return first ?? {}
}

/** 解析 Claude hook 输出：退出码 2 或 JSON 决策表示阻断。 */
export function parseHookDecision(result) {
  const { exitCode, stdout, timedOut } = result
  if (timedOut) return { deny: false }
  const text = String(stdout ?? '').trim()
  if (text !== '') {
    try {
      const parsed = JSON.parse(text)
      const permission = parsed?.hookSpecificOutput?.permissionDecision
      if (permission === 'deny' || permission === 'block') {
        return { deny: true, reason: String(parsed.hookSpecificOutput.permissionDecisionReason ?? '') }
      }
      if (parsed?.decision === 'block') {
        return { deny: true, reason: String(parsed.reason ?? '') }
      }
      if (parsed?.continue === false) {
        return { deny: true, reason: String(parsed.stopReason ?? '') }
      }
    } catch {
      /* 非 JSON 输出按普通文本处理 */
    }
  }
  if (exitCode === 2) {
    return { deny: true, reason: String(result.stderr ?? '').trim().slice(0, 500) || 'hook 以退出码 2 阻止该操作' }
  }
  return { deny: false }
}