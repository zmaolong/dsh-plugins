/**
 * 宿主集成测试（假 ctx）：技能 provider、插件命令注册、hooks 事件映射、
 * 命令处理、持久化恢复与状态损坏自检。
 */

import assert from 'node:assert/strict'
import { writeFileSync } from 'node:fs'
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