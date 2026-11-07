/**
 * 宿主集成测试（假 ctx）：技能 provider、插件命令注册、hooks 事件映射、
 * 命令处理、持久化恢复、schema v2 与状态损坏自检、单写互斥。
 */

import assert from 'node:assert/strict'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'

import { AgentPluginHub } from '../lib/hub.js'
import { registerHubCommand } from '../lib/commands.js'
import {
  cleanup,
  copyFixture,
  createFakeCtx,
  createFakeExecutor,
  listenerOf,
  tempHome,
} from './helpers.mjs'

async function setup(t, options = {}) {
  const work = tempHome('hub-ctx-')
  const marketDir = copyFixture('claude-market', work)
  cleanup(t, work)
  const ctx = options.ctx ?? createFakeCtx(options.services)
  const hub = new AgentPluginHub({
    home: path.join(work, 'hub-home'),
    ctx,
    config: options.config ?? {},
    hookExecutor: options.hookExecutor,
  })
  hub.start()
  registerHubCommand(ctx, hub)
  const market = await hub.marketAdd({ type: 'local', location: marketDir })
  return { work, marketDir, ctx, hub, market }
}

test('技能 provider：注册、列出候选、读取完整内容', async (t) => {
  const { ctx, hub, market } = await setup(t)
  assert.equal(hub.skills.registered, true)
  assert.equal(ctx.state.providers.length, 1)
  await hub.install({ name: 'demo-claude', market: market.id })
  const provider = ctx.state.providers[0]
  const candidates = await provider.list({})
  assert.equal(candidates.length, 1)
  assert.equal(candidates[0].name, 'greet')
  assert.equal(candidates[0].source, 'agent-plugin')
  assert.equal(candidates[0].resourceBase.kind, 'directory')
  assert.ok(candidates[0].resourceBase.path.endsWith(path.join('skills', 'greet')))
  const skill = await provider.get(candidates[0], {})
  assert.match(skill.content, /测试夹具技能/)
  assert.equal(skill.name, 'greet')
})

test('插件命令：注册为 <插件>-<命令>，渲染参数并提示复制发送', async (t) => {
  const { ctx, hub, market } = await setup(t)
  await hub.install({ name: 'demo-claude', market: market.id })
  const command = ctx.state.commands.get('demo-claude-hello')
  assert.ok(command, '应注册 demo-claude-hello')
  assert.match(command.description, /demo-claude/)
  const result = await command.handler({ rawInput: '张三' })
  assert.equal(result.kind, 'success')
  assert.match(result.text, /张三/)
  assert.match(result.text, /复制/)
})

test('插件命令冲突：跳过并记录，不影响其它命令', async (t) => {
  const ctx = createFakeCtx()
  // 预占一个会冲突的名字（宿主注册器会抛错）。
  ctx.state.commands.set('demo-claude-hello', {})
  const { hub, market } = await setup(t, { ctx })
  await hub.install({ name: 'demo-claude', market: market.id })
  const stats = hub.pluginCommands.stats()
  assert.ok(stats.conflicts.some((item) => item.name === 'demo-claude-hello'))
})

test('hooks：PreToolUse 退出码 2 阻断、matcher 过滤、未映射事件标注未生效', async (t) => {
  const executor = createFakeExecutor((request) => {
    if (request.payload.hook_event_name === 'PreToolUse') {
      return { exitCode: 2, signal: null, stdout: '', stderr: '禁止执行', timedOut: false }
    }
    return { exitCode: 0, signal: null, stdout: '', stderr: '', timedOut: false }
  })
  const { ctx, hub, market } = await setup(t, { hookExecutor: executor })
  await hub.install({ name: 'demo-claude', market: market.id })
  const stats = hub.hooks.stats()
  assert.equal(stats.attached, true)
  const pre = stats.events.find((item) => item.event === 'PreToolUse')
  assert.equal(pre.effective, true)
  const notification = stats.events.find((item) => item.event === 'Notification')
  assert.equal(notification.effective, false)

  const [preListener] = listenerOf(ctx, 'tools/pre-execute')
  const denied = await preListener({ name: 'Bash', arguments: { command: 'ls' } }, async () => ({ kind: 'allow' }))
  assert.equal(denied.kind, 'deny')
  assert.match(denied.reason, /禁止执行/)
  assert.equal(executor.calls.length, 1)
  assert.equal(executor.calls[0].payload.tool_name, 'Bash')

  const [postListener] = listenerOf(ctx, 'tools/result')
  const allowed = await preListener({ name: 'Read', arguments: {} }, async () => ({ kind: 'allow' }))
  assert.equal(allowed.kind, 'allow')
  assert.equal(executor.calls.length, 1, 'matcher 不匹配时不应执行')

  await postListener({ name: 'Bash', arguments: {} }, { isError: false })
  assert.equal(executor.calls.length, 2)

  const [stopListener] = listenerOf(ctx, 'agent/turn-stopping')
  await stopListener({ agent: { id: 's1' } })
  assert.equal(executor.calls.at(-1).payload.hook_event_name, 'Stop')
})

test('hooks 关闭配置时不注册监听', async (t) => {
  const executor = createFakeExecutor()
  const { ctx, hub } = await setup(t, { hookExecutor: executor, config: { hooks: false } })
  assert.equal(hub.hooks.stats().attached, false)
  assert.equal(listenerOf(ctx, 'tools/pre-execute').length, 0)
})

test('禁用后技能与命令消失，重新启用后恢复', async (t) => {
  const { ctx, hub, market } = await setup(t)
  const { record } = await hub.install({ name: 'demo-claude', market: market.id })
  assert.equal((await ctx.state.providers[0].list({})).length, 1)
  assert.ok(ctx.state.commands.has('demo-claude-hello'))
  hub.setEnabled(record.key, false)
  assert.equal((await ctx.state.providers[0].list({})).length, 0)
  assert.equal(ctx.state.commands.has('demo-claude-hello'), false)
  hub.setEnabled(record.key, true)
  assert.equal((await ctx.state.providers[0].list({})).length, 1)
  assert.ok(ctx.state.commands.has('demo-claude-hello'))
})

test('持久化：重启后状态、技能与命令恢复', async (t) => {
  const { work, hub, market } = await setup(t)
  const home = path.join(work, 'hub-home')
  await hub.install({ name: 'demo-claude', market: market.id })

  const ctx = createFakeCtx()
  const restarted = new AgentPluginHub({ home, ctx })
  restarted.start()
  assert.equal(restarted.state.plugins.length, 1)
  assert.equal(restarted.state.plugins[0].enabled, true)
  assert.equal(ctx.state.providers.length, 1)
  const candidates = await ctx.state.providers[0].list({})
  assert.deepEqual(candidates.map((item) => item.name), ['greet'])
  assert.ok(ctx.state.commands.has('demo-claude-hello'))
})

test('state 损坏：启动自检并恢复为空状态，仍能正常工作', async (t) => {
  const work = tempHome('hub-ctx-')
  const marketDir = copyFixture('claude-market', work)
  cleanup(t, work)
  const home = path.join(work, 'hub-home')
  const first = new AgentPluginHub({ home })
  first.start()
  first.store.ensureDirs()
  writeFileSync(first.store.paths.state, '{ 坏掉的 JSON')
  const hub = new AgentPluginHub({ home, ctx: createFakeCtx() })
  hub.start()
  assert.equal(hub.state.plugins.length, 0)
  assert.ok(hub.warnings.some((item) => item.includes('损坏')))
  assert.equal(typeof hub.migrationError, 'string', '损坏文件导致迁移失败，应记录 migrationError 而不阻塞启动')
  const market = await hub.marketAdd({ type: 'local', location: marketDir })
  const result = await hub.install({ name: 'demo-claude', market: market.id })
  assert.equal(result.record.name, 'demo-claude')
})

test('/agent-plugin 命令：status / list / info / formats / help / install / update 文本', async (t) => {
  const { ctx, hub, market } = await setup(t)
  const command = ctx.state.commands.get('agent-plugin')
  assert.ok(command)
  const status = await command.handler({ rawInput: 'status' })
  assert.equal(status.kind, 'success')
  assert.match(status.text, /dsh-agent-plugin-hub/)
  const formats = await command.handler({ rawInput: 'formats' })
  assert.match(formats.text, /claude/)
  const help = await command.handler({ rawInput: 'help' })
  assert.match(help.text, /market add/)
  const installed = await command.handler({ rawInput: `install ${market.id} demo-claude` })
  assert.equal(installed.kind, 'success', installed.text)
  assert.match(installed.text, /安装完成/)
  const list = await command.handler({ rawInput: 'list' })
  assert.match(list.text, /demo-claude/)
  const info = await command.handler({ rawInput: 'info demo-claude' })
  assert.match(info.text, /hooks/)
  assert.match(info.text, /MCP 状态：未生效/)
  const unknown = await command.handler({ rawInput: 'bogus' })
  assert.equal(unknown.kind, 'error')
  assert.match(unknown.text, /未知子命令/)
  const badInstall = await command.handler({ rawInput: 'install not-exist-plugin' })
  assert.equal(badInstall.kind, 'error')
  assert.match(badInstall.text, /都没有插件/)
})

test('market remove 允许保留已安装插件（ADR-0003）：orphaned + 重新添加后恢复', async (t) => {
  const { ctx, hub, market } = await setup(t)
  const { record } = await hub.install({ name: 'demo-claude', market: market.id })
  const removed = hub.marketRemove(market.id)
  assert.equal(removed.id, market.id)
  assert.deepEqual(removed.orphaned, ['demo-claude'])
  assert.equal(removed.market.id, market.id)
  assert.equal(hub.markets.list().length, 0)
  assert.equal(hub.state.plugins.length, 1, '卸载前不允许删安装副本')
  assert.equal(hub.findRecord(record.key).version, '0.1.0')
  assert.equal(hub.markets.get(record.market), null)

  // 重新添加同一来源（id 稳定）→ 插件记录重新关联市场，不再孤立
  const readded = await hub.marketAdd({ type: 'local', location: removed.market.location })
  assert.equal(readded.id, record.market)
  assert.equal(hub.markets.get(record.market).id, record.market)
  assert.ok((await hub.describePlugin({ key: record.key })).market !== null)

  const command = ctx.state.commands.get('agent-plugin')
  const cliRemove = await command.handler({ rawInput: `market remove ${readded.id}` })
  assert.equal(cliRemove.kind, 'success', cliRemove.text)
  assert.match(cliRemove.text, /已移除市场/)
  assert.equal(hub.state.plugins.length, 1)
})

test('schema v2：state/marketplaces 结构、重启可读、无旧字段', async (t) => {
  const { ctx, hub, market } = await setup(t)
  await hub.install({ name: 'demo-claude', market: market.id })
  const stateRaw = JSON.parse(readFileSync(hub.store.paths.state, 'utf8'))
  assert.equal(stateRaw.schemaVersion, 2)
  assert.equal(stateRaw.plugins.length, 1)
  const marketsRaw = JSON.parse(readFileSync(hub.store.paths.marketplaces, 'utf8'))
  assert.equal(marketsRaw.schemaVersion, 2)
  const stored = marketsRaw.markets[0]
  assert.equal(stored.title, 'fixture-claude-market')
  assert.equal(stored.display.title, 'fixture-claude-market')
  assert.equal(typeof stored.display.description, 'string')
  assert.equal(stored.display.owner.name, 'dsh-agent-plugin-hub fixtures')
  assert.equal('root' in stored, false, 'schema v2 不再持久化 root')
  assert.equal('raw' in stored.plugins[0], false, '条目不存完整 raw')
  assert.match(stored.plugins[0].meta.description, /Claude Code/u)

  const restarted = new AgentPluginHub({ home: hub.home, ctx })
  restarted.start()
  assert.equal(restarted.migrationError, null)
  assert.equal(restarted.state.plugins.length, 1)
  assert.equal(restarted.markets.list()[0].title, 'fixture-claude-market')
  assert.match(restarted.markets.list()[0].plugins[0].meta.description, /Claude Code/u)
})

test('单写互斥：busy 时写操作抛 operation_in_progress，读快照可用', async (t) => {
  const { hub } = await setup(t)
  let release = null
  const pending = hub.runOperation('update', { key: 'k/n' }, () => new Promise((resolve) => {
    release = resolve
  }))
  assert.equal(hub.busy, true)
  assert.equal(hub.operationsList()[0].kind, 'update')
  assert.equal(hub.operationsList()[0].key, 'k/n')
  await assert.rejects(
    async () => { await hub.setEnabled('demo-claude', false) },
    (error) => error.code === 'operation_in_progress' && error.status === 409,
  )
  await assert.rejects(
    async () => { await hub.marketRefresh() },
    (error) => error.code === 'operation_in_progress',
  )
  const snapshot = hub.snapshot()
  assert.equal(snapshot.busy, true)
  assert.equal(snapshot.operations.length, 1)
  release({})
  await pending
  assert.equal(hub.busy, false)
  assert.deepEqual(hub.operationsList(), [])
})

test('迁移失败不阻塞启动与 CLI：migrationError 可查', async (t) => {
  const work = tempHome('hub-ctx-migrate-')
  cleanup(t, work)
  const marketDir = copyFixture('claude-market', work)
  const home = path.join(work, 'hub-home')
  mkdirSync(home, { recursive: true })
  writeFileSync(
    path.join(home, 'marketplaces.json'),
    `${JSON.stringify({ schemaVersion: 99, markets: [] }, null, 2)}\n`,
  )
  const ctx = createFakeCtx()
  const hub = new AgentPluginHub({ home, ctx })
  hub.start()
  assert.match(hub.migrationError, /schemaVersion/u)
  registerHubCommand(ctx, hub)
  const command = ctx.state.commands.get('agent-plugin')
  const status = await command.handler({ rawInput: 'status' })
  assert.equal(status.kind, 'success')
  assert.match(status.text, /dsh-agent-plugin-hub/)
  const market = await hub.marketAdd({ type: 'local', location: marketDir })
  assert.equal(market.type, 'local')
})

test('/agent-plugin market 命令文案不回归：add/list/refresh/remove', async (t) => {
  const { ctx, hub, market } = await setup(t)
  const command = ctx.state.commands.get('agent-plugin')
  const list = await command.handler({ rawInput: 'market list' })
  assert.equal(list.kind, 'success')
  assert.match(list.text, /已添加市场/)
  assert.ok(list.text.includes(market.id))
  const refresh = await command.handler({ rawInput: `market refresh ${market.id}` })
  assert.equal(refresh.kind, 'success')
  assert.match(refresh.text, /已刷新/)
  const duplicate = await command.handler({ rawInput: `market add local ${market.location.replace(/\\/gu, '/')}` })
  assert.equal(duplicate.kind, 'error')
  assert.match(duplicate.text, /市场已存在/)
  const removed = await command.handler({ rawInput: `market remove ${market.id}` })
  assert.equal(removed.kind, 'success')
  assert.match(removed.text, /已移除市场/)
  const empty = await command.handler({ rawInput: 'market list' })
  assert.match(empty.text, /还没有添加市场/)
  assert.equal(hub.markets.list().length, 0)
})