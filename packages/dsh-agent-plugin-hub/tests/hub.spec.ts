/**
 * Host-integration specs, ported from test/hub.test.mjs (node:test → vitest),
 * driven with a fake ctx: skill provider, plugin command registration, hook
 * event mapping, command handling, persistence recovery, schema v2 + corrupt
 * state self-check, and single-writer mutual exclusion. Fully offline.
 */

import { afterEach, describe, expect, it } from 'vitest'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

import { AgentPluginHub, HubError } from '../src/hub.ts'
import { registerHubCommand } from '../src/commands.ts'
import { matcherMatches } from '../src/hooks.ts'
import type { SubprocessExecutor } from '../src/hooks.ts'
import type { CommandOutcome, HostContext, HubConfig, SkillCandidate, SkillLoaded } from '../src/host.ts'
import {
  copyFixture,
  createFakeCtx,
  createFakeExecutor,
  listenerOf,
  removeDirs,
  tempHome,
  type FakeCtx,
  type FakeExecutorRequest,
} from './helpers.ts'

/** Fake registered command face (host command contract); type alias keeps it comparable to the fake map value. */
type FakeCommand = {
  name: string
  description: string
  handler: (input: { rawInput?: string }) => Promise<CommandOutcome> | CommandOutcome
}

/** Fake skill provider face, typed against the host skill contract. */
type FakeProvider = {
  name: string
  list: (options?: unknown) => Promise<SkillCandidate[]>
  get: (candidate: unknown, options?: unknown) => Promise<SkillLoaded>
}

/** Host event listener face (the hub registers opaque listeners). */
type HostListener = (...args: unknown[]) => unknown

interface SetupOptions {
  ctx?: FakeCtx
  services?: Record<string, unknown>
  config?: HubConfig
  hookExecutor?: SubprocessExecutor
}

describe('宿主集成测试（假 ctx）：技能 provider、插件命令注册、hooks 事件映射、命令处理、持久化恢复、schema v2 与状态损坏自检、单写互斥', () => {
  // Temp dirs registered by each test; removed in afterEach (old cleanup(t, ...)).
  let tempDirs: string[] = []

  afterEach(() => {
    removeDirs(...tempDirs)
    tempDirs = []
  })

  async function setup(options: SetupOptions = {}) {
    const work = tempHome('hub-ctx-')
    tempDirs.push(work)
    const marketDir = copyFixture('claude-market', work)
    const ctx = options.ctx ?? createFakeCtx(options.services)
    const hub = new AgentPluginHub({
      home: path.join(work, 'hub-home'),
      // FakeCtx mirrors the hub's HostContext face structurally; cast to satisfy tsc.
      ctx: ctx as unknown as HostContext,
      config: options.config ?? {},
      ...(options.hookExecutor !== undefined ? { hookExecutor: options.hookExecutor } : {}),
    })
    hub.start()
    registerHubCommand(ctx, hub)
    const market = await hub.marketAdd({ type: 'local', location: marketDir })
    return { work, marketDir, ctx, hub, market }
  }

  /** Await an operation and return its thrown error as HubError (busy writes throw inside runOperation). */
  async function hubErrorOf(fn: () => unknown): Promise<HubError> {
    try {
      await fn()
    } catch (error) {
      return error as HubError
    }
    throw new Error('预期操作应失败，但成功返回了')
  }

  it('技能 provider：注册、列出候选、读取完整内容', async () => {
    const { ctx, hub, market } = await setup()
    expect(hub.skills?.registered).toBe(true)
    expect(ctx.state.providers.length).toBe(1)
    await hub.install({ name: 'demo-claude', market: market.id })
    const provider = ctx.state.providers[0] as FakeProvider
    const candidates = await provider.list({})
    expect(candidates.length).toBe(1)
    const candidate = candidates[0] as SkillCandidate
    expect(candidate.name).toBe('greet')
    expect(candidate.source).toBe('agent-plugin')
    expect(candidate.resourceBase.kind).toBe('directory')
    expect(candidate.resourceBase.path.endsWith(path.join('skills', 'greet'))).toBeTruthy()
    const skill = await provider.get(candidate, {})
    expect(skill.content).toMatch(/测试夹具技能/)
    expect(skill.name).toBe('greet')
  })

  it('插件命令：注册为 <插件>-<命令>，渲染参数并提示复制发送', async () => {
    const { ctx, hub, market } = await setup()
    await hub.install({ name: 'demo-claude', market: market.id })
    const command = ctx.state.commands.get('demo-claude-hello') as FakeCommand
    expect(command, '应注册 demo-claude-hello').toBeTruthy()
    expect(command.description).toMatch(/demo-claude/)
    const result = await command.handler({ rawInput: '张三' })
    expect(result.kind).toBe('success')
    expect(result.text).toMatch(/张三/)
    expect(result.text).toMatch(/复制/)
  })

  it('插件命令冲突：跳过并记录，不影响其它命令', async () => {
    const rawCtx = createFakeCtx()
    // 预占一个会冲突的名字（宿主注册器会抛错）。
    rawCtx.state.commands.set('demo-claude-hello', { name: 'demo-claude-hello' })
    const { hub, market } = await setup({ ctx: rawCtx })
    await hub.install({ name: 'demo-claude', market: market.id })
    const stats = hub.pluginCommands?.stats()
    expect(stats?.conflicts.some((item) => item.name === 'demo-claude-hello')).toBeTruthy()
  })

  it('hooks：PreToolUse 退出码 2 阻断、matcher 过滤、未映射事件标注未生效', async () => {
    const executor = createFakeExecutor((request) => {
      const payload = request.payload as { hook_event_name?: string }
      if (payload.hook_event_name === 'PreToolUse') {
        return { exitCode: 2, signal: null, stdout: '', stderr: '禁止执行', timedOut: false }
      }
      return { exitCode: 0, signal: null, stdout: '', stderr: '', timedOut: false }
    })
    const { ctx, hub, market } = await setup({ hookExecutor: executor })
    await hub.install({ name: 'demo-claude', market: market.id })
    const stats = hub.hooks?.stats()
    expect(stats?.attached).toBe(true)
    const pre = stats?.events.find((item) => item.event === 'PreToolUse')
    expect(pre?.effective).toBe(true)
    const notification = stats?.events.find((item) => item.event === 'Notification')
    expect(notification?.effective).toBe(false)

    const preListener = listenerOf(ctx, 'tools/pre-execute')[0] as HostListener
    const denied = (await preListener({ name: 'Bash', arguments: { command: 'ls' } }, async () => ({ kind: 'allow' }))) as { kind: string, reason: string }
    expect(denied.kind).toBe('deny')
    expect(denied.reason).toMatch(/禁止执行/)
    expect(executor.calls.length).toBe(1)
    const firstCall = executor.calls[0] as FakeExecutorRequest
    expect((firstCall.payload as { tool_name?: string }).tool_name).toBe('Bash')

    const postListener = listenerOf(ctx, 'tools/result')[0] as HostListener
    const allowed = (await preListener({ name: 'Read', arguments: {} }, async () => ({ kind: 'allow' }))) as { kind: string }
    expect(allowed.kind).toBe('allow')
    expect(executor.calls.length, 'matcher 不匹配时不应执行').toBe(1)

    await postListener({ name: 'Bash', arguments: {} }, { isError: false })
    expect(executor.calls.length).toBe(2)

    const stopListener = listenerOf(ctx, 'agent/turn-stopping')[0] as HostListener
    await stopListener({ agent: { id: 's1' } })
    const lastCall = executor.calls.at(-1) as FakeExecutorRequest
    expect((lastCall.payload as { hook_event_name?: string }).hook_event_name).toBe('Stop')
  })

  it('hooks 关闭配置时不注册监听', async () => {
    const executor = createFakeExecutor()
    const { ctx, hub } = await setup({ hookExecutor: executor, config: { hooks: false } })
    expect(hub.hooks?.stats().attached).toBe(false)
    expect(listenerOf(ctx, 'tools/pre-execute').length).toBe(0)
  })

  it('禁用后技能与命令消失，重新启用后恢复', async () => {
    const { ctx, hub, market } = await setup()
    const { record } = await hub.install({ name: 'demo-claude', market: market.id })
    const provider = ctx.state.providers[0] as FakeProvider
    expect((await provider.list({})).length).toBe(1)
    expect(ctx.state.commands.has('demo-claude-hello')).toBeTruthy()
    hub.setEnabled(record.key, false)
    expect((await provider.list({})).length).toBe(0)
    expect(ctx.state.commands.has('demo-claude-hello')).toBe(false)
    hub.setEnabled(record.key, true)
    expect((await provider.list({})).length).toBe(1)
    expect(ctx.state.commands.has('demo-claude-hello')).toBeTruthy()
  })

  it('持久化：重启后状态、技能与命令恢复', async () => {
    const { work, hub, market } = await setup()
    const home = path.join(work, 'hub-home')
    await hub.install({ name: 'demo-claude', market: market.id })

    const restartedCtx = createFakeCtx()
    const restarted = new AgentPluginHub({
      home,
      // FakeCtx mirrors the hub's HostContext face structurally; cast to satisfy tsc.
      ctx: restartedCtx as unknown as HostContext,
    })
    restarted.start()
    expect(restarted.state.plugins.length).toBe(1)
    expect(restarted.state.plugins[0]?.enabled).toBe(true)
    expect(restartedCtx.state.providers.length).toBe(1)
    const restartedProvider = restartedCtx.state.providers[0] as FakeProvider
    const candidates = await restartedProvider.list({})
    expect(candidates.map((item) => item.name)).toEqual(['greet'])
    expect(restartedCtx.state.commands.has('demo-claude-hello')).toBeTruthy()
  })

  it('state 损坏：启动自检并恢复为空状态，仍能正常工作', async () => {
    const work = tempHome('hub-ctx-')
    tempDirs.push(work)
    const marketDir = copyFixture('claude-market', work)
    const home = path.join(work, 'hub-home')
    const first = new AgentPluginHub({ home })
    first.start()
    first.store.ensureDirs()
    writeFileSync(first.store.paths.state, '{ 坏掉的 JSON')
    const hub = new AgentPluginHub({
      home,
      // FakeCtx mirrors the hub's HostContext face structurally; cast to satisfy tsc.
      ctx: createFakeCtx() as unknown as HostContext,
    })
    hub.start()
    expect(hub.state.plugins.length).toBe(0)
    expect(hub.warnings.some((item) => item.includes('损坏'))).toBeTruthy()
    expect(typeof hub.migrationError, '损坏文件导致迁移失败，应记录 migrationError 而不阻塞启动').toBe('string')
    const market = await hub.marketAdd({ type: 'local', location: marketDir })
    const result = await hub.install({ name: 'demo-claude', market: market.id })
    expect(result.record.name).toBe('demo-claude')
  })

  it('/agent-plugin 命令：status / list / info / formats / help / install / update 文本', async () => {
    const { ctx, market } = await setup()
    const command = ctx.state.commands.get('agent-plugin') as FakeCommand
    expect(command).toBeTruthy()
    const status = await command.handler({ rawInput: 'status' })
    expect(status.kind).toBe('success')
    expect(status.text).toMatch(/dsh-agent-plugin-hub/)
    const formats = await command.handler({ rawInput: 'formats' })
    expect(formats.text).toMatch(/claude/)
    const help = await command.handler({ rawInput: 'help' })
    expect(help.text).toMatch(/market add/)
    const installed = await command.handler({ rawInput: `install ${market.id} demo-claude` })
    expect(installed.kind, installed.text).toBe('success')
    expect(installed.text).toMatch(/安装完成/)
    const list = await command.handler({ rawInput: 'list' })
    expect(list.text).toMatch(/demo-claude/)
    const info = await command.handler({ rawInput: 'info demo-claude' })
    expect(info.text).toMatch(/hooks/)
    expect(info.text).toMatch(/MCP 状态：未生效/)
    const unknown = await command.handler({ rawInput: 'bogus' })
    expect(unknown.kind).toBe('error')
    expect(unknown.text).toMatch(/未知子命令/)
    const badInstall = await command.handler({ rawInput: 'install not-exist-plugin' })
    expect(badInstall.kind).toBe('error')
    expect(badInstall.text).toMatch(/都没有插件/)
  })

  it('market remove 允许保留已安装插件（ADR-0003）：orphaned + 重新添加后恢复', async () => {
    const { ctx, hub, market } = await setup()
    const { record } = await hub.install({ name: 'demo-claude', market: market.id })
    const removed = hub.marketRemove(market.id)
    expect(removed.id).toBe(market.id)
    expect(removed.orphaned).toEqual(['demo-claude'])
    expect(removed.market.id).toBe(market.id)
    expect(hub.markets.list().length).toBe(0)
    expect(hub.state.plugins.length, '卸载前不允许删安装副本').toBe(1)
    expect(hub.findRecord(record.key).version).toBe('0.1.0')
    expect(hub.markets.get(record.market)).toBeNull()

    // 重新添加同一来源（id 稳定）→ 插件记录重新关联市场，不再孤立
    const readded = await hub.marketAdd({ type: 'local', location: removed.market.location })
    expect(readded.id).toBe(record.market)
    expect(hub.markets.get(record.market)?.id).toBe(record.market)
    expect((await hub.describePlugin({ key: record.key })).market).not.toBeNull()

    const command = ctx.state.commands.get('agent-plugin') as FakeCommand
    const cliRemove = await command.handler({ rawInput: `market remove ${readded.id}` })
    expect(cliRemove.kind, cliRemove.text).toBe('success')
    expect(cliRemove.text).toMatch(/已移除市场/)
    expect(hub.state.plugins.length).toBe(1)
  })

  it('schema v2：state/marketplaces 结构、重启可读、无旧字段', async () => {
    const { ctx, hub, market } = await setup()
    await hub.install({ name: 'demo-claude', market: market.id })
    const stateRaw = JSON.parse(readFileSync(hub.store.paths.state, 'utf8')) as { schemaVersion: number, plugins: unknown[] }
    expect(stateRaw.schemaVersion).toBe(2)
    expect(stateRaw.plugins.length).toBe(1)
    const marketsRaw = JSON.parse(readFileSync(hub.store.paths.marketplaces, 'utf8')) as {
      schemaVersion: number
      markets: Array<{
        title: string
        display: { title: string, description: string, owner: { name: string } }
        plugins: Array<{ meta: { description?: string } }>
      }>
    }
    expect(marketsRaw.schemaVersion).toBe(2)
    const stored = marketsRaw.markets[0] as (typeof marketsRaw.markets)[number]
    expect(stored.title).toBe('fixture-claude-market')
    expect(stored.display.title).toBe('fixture-claude-market')
    expect(typeof stored.display.description).toBe('string')
    expect(stored.display.owner.name).toBe('dsh-agent-plugin-hub fixtures')
    expect('root' in stored, 'schema v2 不再持久化 root').toBe(false)
    const storedEntry = stored.plugins[0] as Record<string, unknown> & { meta: { description?: string } }
    expect('raw' in storedEntry, '条目不存完整 raw').toBe(false)
    expect(storedEntry.meta.description).toMatch(/Claude Code/u)

    const restarted = new AgentPluginHub({
      home: hub.home,
      // FakeCtx mirrors the hub's HostContext face structurally; cast to satisfy tsc.
      ctx: ctx as unknown as HostContext,
    })
    restarted.start()
    expect(restarted.migrationError).toBeNull()
    expect(restarted.state.plugins.length).toBe(1)
    expect(restarted.markets.list()[0]?.title).toBe('fixture-claude-market')
    expect(restarted.markets.list()[0]?.plugins[0]?.meta.description).toMatch(/Claude Code/u)
  })

  it('单写互斥：busy 时写操作抛 operation_in_progress，读快照可用', async () => {
    const { hub } = await setup()
    let release: (value: unknown) => void = () => {}
    const pending = hub.runOperation('update', { key: 'k/n' }, () => new Promise((resolve) => {
      release = resolve
    }))
    expect(hub.busy).toBe(true)
    expect(hub.operationsList()[0]?.kind).toBe('update')
    expect(hub.operationsList()[0]?.key).toBe('k/n')
    const enableError = await hubErrorOf(() => hub.setEnabled('demo-claude', false))
    expect(enableError.code).toBe('operation_in_progress')
    expect(enableError.status).toBe(409)
    const refreshError = await hubErrorOf(() => hub.marketRefresh())
    expect(refreshError.code).toBe('operation_in_progress')
    const snapshot = hub.snapshot()
    expect(snapshot.busy).toBe(true)
    expect(snapshot.operations.length).toBe(1)
    release({})
    await pending
    expect(hub.busy).toBe(false)
    expect(hub.operationsList()).toEqual([])
  })

  it('迁移失败不阻塞启动与 CLI：migrationError 可查', async () => {
    const work = tempHome('hub-ctx-migrate-')
    tempDirs.push(work)
    const marketDir = copyFixture('claude-market', work)
    const home = path.join(work, 'hub-home')
    mkdirSync(home, { recursive: true })
    writeFileSync(
      path.join(home, 'marketplaces.json'),
      `${JSON.stringify({ schemaVersion: 99, markets: [] }, null, 2)}\n`,
    )
    const ctx = createFakeCtx()
    const hub = new AgentPluginHub({
      home,
      // FakeCtx mirrors the hub's HostContext face structurally; cast to satisfy tsc.
      ctx: ctx as unknown as HostContext,
    })
    hub.start()
    expect(hub.migrationError).toMatch(/schemaVersion/u)
    registerHubCommand(ctx, hub)
    const command = ctx.state.commands.get('agent-plugin') as FakeCommand
    const status = await command.handler({ rawInput: 'status' })
    expect(status.kind).toBe('success')
    expect(status.text).toMatch(/dsh-agent-plugin-hub/)
    const market = await hub.marketAdd({ type: 'local', location: marketDir })
    expect(market.type).toBe('local')
  })

  it('/agent-plugin market 命令文案不回归：add/list/refresh/remove', async () => {
    const { ctx, hub, market } = await setup()
    const command = ctx.state.commands.get('agent-plugin') as FakeCommand
    const list = await command.handler({ rawInput: 'market list' })
    expect(list.kind).toBe('success')
    expect(list.text).toMatch(/已添加市场/)
    expect(list.text.includes(market.id)).toBeTruthy()
    const refresh = await command.handler({ rawInput: `market refresh ${market.id}` })
    expect(refresh.kind).toBe('success')
    expect(refresh.text).toMatch(/已刷新/)
    const duplicate = await command.handler({ rawInput: `market add local ${market.location.replace(/\\/gu, '/')}` })
    expect(duplicate.kind).toBe('error')
    expect(duplicate.text).toMatch(/市场已存在/)
    const removed = await command.handler({ rawInput: `market remove ${market.id}` })
    expect(removed.kind).toBe('success')
    expect(removed.text).toMatch(/已移除市场/)
    const empty = await command.handler({ rawInput: 'market list' })
    expect(empty.text).toMatch(/还没有添加市场/)
    expect(hub.markets.list().length).toBe(0)
  })

  it('matcherMatches：超长 matcher 按字面比较（ReDoS 缓解），短正则不受影响', () => {
    expect(matcherMatches('', 'Bash'), '空 matcher 匹配全部').toBe(true)
    expect(matcherMatches('*', 'Bash')).toBe(true)
    expect(matcherMatches('Bash', 'Bash')).toBe(true)
    expect(matcherMatches('^Ba', 'Bash'), '短正则仍按正则求值').toBe(true)

    const bomb = `(a+)+$${'a'.repeat(300)}`
    expect(bomb.length > 256).toBe(true)
    expect(matcherMatches(bomb, bomb), '超长 matcher 字面相等时匹配').toBe(true)
    expect(matcherMatches(bomb, 'Bash'), '超长 matcher 不再编译正则，只做字面比较').toBe(false)
  })
})
