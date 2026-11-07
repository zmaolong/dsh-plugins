# 宿主 API 侦察记录（DSH 桌面端）

本文件记录 `dsh-agent-plugin-hub` 实现能力注入前对宿主接口的实测结论。所有结论都来自
当前运行中的 DSH 宿主（`0.2.2-rc.1`，desktop profile），不是猜测；实现只使用这些接口。

侦察方式：

1. `cordis_inspect_list` / `cordis_inspect_query`（Service / Event / Config 三个 Host Provider）
   读取精确方法签名与类型声明；
2. 只读查阅 `D:\Program Files\dsh\resources\app.asar` 内的 `@deepseek-ai/*` 包源码与类型
   （`read` 工具能直接读 asar 内路径；不修改安装目录）；
3. `plugin_manager list_plugins` 与 profile 文件观察（`%USERPROFILE%\.dsh\profiles\desktop`）。

## 结论速览

| 能力 | 宿主接口 | 是否可用 | 本插件做法 |
|---|---|---|---|
| commands | `ctx.commands.register(CommandDefinition)` | ✅ | 注册 `/agent-plugin`；插件命令注册为 `<plugin>-<command>` |
| skills | `ctx.skills.registerProvider(create)` | ✅ | 一个 provider 动态列出所有启用插件的技能 |
| hooks | cordis 事件 + `ctx.subprocess` | ✅（工具类依赖 `tools` 服务） | Pre/PostToolUse、UserPromptSubmit、Stop 等映射到真实事件 |
| MCP | `@deepseek-ai/dsh-mcp-client` 静态插件行 | ❌ 无运行时挂载接口 | 只解析/展示清单，标注「未生效」，不 spawn 进程 |

## commands 服务

注册定义（来自 `@deepseek-ai/dsh-commands` 的类型与源码）：

```ts
ctx.commands.register(definition: {
  name: string                      // 必须匹配 /^[a-z][a-z0-9_-]*$/（普通命令解析正则）
  description: string
  input?: { hint: string; attachments?: boolean }
  handler: (invocation: {
    commandId, agent, rawInput: string,
    attachments, signal: AbortSignal,
  }) => CommandResult | Promise<CommandResult>
}): () => void                     // 返回注销 disposer
```

`CommandResult` 只有两种：`{ kind: 'success', text?: string }` 与 `{ kind: 'error', text: string }`。

实测约束：

- **命令名只允许小写字母、数字、`_`、`-`**；冒号、点、大写都会解析失败。因此任务书里
  `agent-plugin:<plugin>:<command>` 与 `<plugin>:<command>` 在宿主上不可行，本实现退化为
  `<plugin>-<command>`（见 `plugin-commands.js` 注释与 README）。
- 同名命令在全局层注册会**同步抛错**（`command "x" is already registered`），所以注册必须
  try/catch，冲突跳过并记录。
- handler 返回值只是**一段文本**，没有把结果作为新用户消息注入会话的接口。命令实现渲染完整
  Markdown 并提示「复制发送」，不自造注入通道。
- `ctx.commands` 是 optional 服务：profile 未启用 `@deepseek-ai/dsh-commands` 时不可用
  （desktop profile 默认启用）。

## skills 服务

```ts
ctx.skills.registerProvider(create: (control: { signal, invalidate() }) => {
  name: string
  list(options: { cwd?, signal? }) => Promise<SkillCandidate[] | { candidates, complete }>
  get(candidate, options) => Promise<SkillDefinition | undefined>
}): () => void
```

- `SkillCandidate` = `{ name, description, whenToUse?, invocation: { modelInvocable, userInvocable },
  source, provider, rank, resourceBase?, path?, locator? }`
- `SkillDefinition` = candidate 基础字段 + `content: string`（完整 Markdown 正文）。
- `resourceBase` 支持 `{ kind: 'directory', path }`，本插件指向技能目录，让宿主能解析相对资源。
- 插件注册发生在 `apply` 期间（同步）；`apply` 时服务已就绪（由 `inject: ['commands']` 保证）。
- `control.invalidate()` 让宿主丢弃技能目录缓存；插件启停/安装后调用它。
- 重复技能名：同一层内按 `rank` 决胜；本插件在 provider 内先去重并记录 warning。

## hooks：宿主事件映射

`cordis_inspect_query(Event)` 列出的真实事件（与本插件相关的部分）：

| Claude hook | 宿主事件 | 模式 | 能力 |
|---|---|---|---|
| PreToolUse | `tools/pre-execute` | waterfall | 可 deny，阻断工具调用 |
| PostToolUse | `tools/result` | emit | 只观察，不能改写结果 |
| UserPromptSubmit | `agent/inbox/inserted` | emit | 只观察，不能改写入参 |
| Stop | `agent/turn-stopping` | serial | 可等待（有超时保护） |
| SessionStart | `session/created` | emit | 只观察 |
| SessionEnd | `agent/disposed` | emit | 只观察 |
| Notification / SubagentStop / PreCompact 等 | 无 | — | 标注「未生效」 |

监听方式（与宿主自带插件一致）：

```js
ctx.on('tools/pre-execute', async (exec, next) => {
  // exec = { name, arguments, agent?, signal, ... }
  // 返回 { kind: 'allow' | 'deny' | 'cancel' | 'ask' }
  return next()
})
```

`PreToolDecision` 的 `deny` 含 `{ kind: 'deny', reason: string }`。

命令执行通道：`ctx.subprocess`（optional，desktop profile 默认加载
`@deepseek-ai/dsh-subprocess-local`）：

```ts
ctx.subprocess.spawn({
  argv: readonly string[], cwd: string,
  stdio: { stdin: 'ignore' | 'pipe' | { data }, stdout: 'pipe'|'ignore'|{maxBytes}, stderr: ... },
  graceMs: number, env?: ProcessEnv, signal?,
}): {
  stdin, stdout, stderr, collected: { stdout: { readFrom(offset) }, stderr: ... },
  done: Promise<{ exitCode, signal }>, terminate(), waitForExit()
}
```

`terminalEnvironment()` 给出 `{ platform: 'windows'|'posix', defaultShell }`；
`resolveExecutable(name, env?, signal?)` 解析可执行文件。hook 命令按平台用
`cmd /d /s /c <command>` 或 `sh -c <command>` 执行，stdin 传 JSON，stdout/stderr 收集
（各 64 KiB 上限），超时后 `terminate()`。未知事件不执行任何外部命令。

## MCP：为什么只展示不挂载

- 宿主安装目录里存在 `@deepseek-ai/dsh-mcp-client`（0.2.2-rc.1），但**当前 desktop profile
  的组合里没有它的插件行**；`Config.listConfigs` 的 212 个 live 条目中没有 mcp-client。
- 当前活跃的只有 `@deepseek-ai/dsh-mcp-resources`，服务是 `ctx.mcpResources.register(server,
  provider)`——这是**资源读取**注册，不是「连接 MCP server」。
- `dsh-mcp-client` 的实现是**一个插件行连一个 server**：`apply` 读插件配置里的
  `transport/command/args/env`（stdio）或 `url/headers`（streamable-http），在 `ctx.tools`
  上注册 `mcp__<server>__<tool>`。它没有运行时「新增 server」的服务方法。
- 第三方 bundle 无法在运行时插入 Loader 插件行：`ctx.configEditor.edit()` 只能改既有 entry 的
  overrides；`plugin_manager` 面向 DSH 插件/bundle 安装，不是 MCP server 注册。
- 结论：按自动决策表，`mcpServers` 只解析、展示清单，`/agent-plugin info` 与 `status` 标注
  「未生效」，并说明需要用户在 profile 中配置独立 MCP 插件行。**不自己 spawn 进程**。

## 其它运行事实

- 宿主插件入口：插件行 `name` 解析到包名，包 `package.json` 必须有
  `dsh.bundle.patch` 指向 `cordis.patch.yml`，否则安装报 `not-a-bundle`。
- 配置从 `cordis.patch.yml` 的 `config` 原样传入 `apply(ctx, config)`；本插件不导出 schemastery
  Config，因此新增字段（`hooks`）对旧配置向后兼容。
- `ctx.get(name)` 用于探测 optional 服务（commands/skills/subprocess/tools）；硬依赖只保留
  `inject: ['commands']`，避免其他 profile 缺少服务时插件加载失败。
- `ctx.effect?.(() => () => dispose())` 可用于注销技能 provider、命令与事件监听；宿主不支持时
  降级为进程退出回收。
- `@deepseek-ai/*` 是 peer 依赖且 profile 关闭 `autoInstallPeers`：第三方插件 import 这些包
  会解析失败，因此本插件只用 Node 内置模块。

## 未验证 / 限制

- 命令结果注入会话：宿主无公开接口，未验证「自动发送」路径，按文本渲染处理。
- hooks 在真实会话中的端到端行为：单元测试用假执行器覆盖了映射与决策；宿主冒烟只验证监听注册，
  未在真实工具调用中触发 hook 命令（见 HANDOFF.md 证据与限制）。
- Windows 下 `cmd /d /s /c` 的引号转义按 Claude Code 约定处理；复杂跨平台命令按宿主 shell 为准。

## 插件页 Web UI（0.2.0 侦察补充）

### 槽位

`settings.plugins.tab`（Client Slots 目录）：`kind: list`，注册选项
`{ id, order?, label?: string | (() => string) }`，由 Plugins 设置段落拥有；现有占用者
`all`（order 10，宿主插件管理页）与 `dsh-market`（order 60，第三方市场插件）。
贡献物以 React 组件形式挂载在对应 Tab 面板中。

注册方式（浏览器端 `ctx.slots`）：

```js
ctx.slots.inject('settings.plugins.tab', () => ctx.slots.register({
  name: 'settings.plugins.tab',
  id: 'agent-plugin',
  order: 50,
  label: () => t('tab'),
}, Component))
```

### Client 模块清单

`package.json`：

```json
{
  "exports": { "./client": "./client.js", "./locale/*.json": "./locale/*.json", "./icon": "./icon.svg" },
  "dsh": {
    "client": {
      "platform": "web",
      "immediately": true,
      "inject": ["@deepseek-ai/dsh-client-locale", "@deepseek-ai/dsh-client-ui-settings", "@deepseek-ai/dsh-client-ui-theme"]
    }
  }
}
```

`client.js` 在浏览器里向模块表自我注册（id 必须等于包名）：

```js
window.__ModuleLoader__.load({ id: 'dsh-agent-plugin-hub', factory(require) {
  const React = require('react')
  return { inject: ['slots', 'locale'], apply(ctx) { /* 注册槽位 */ } }
} })
```

只从模块表取 `react`（内置）。按宿主指引**不 import** 任何 `@deepseek-ai/dsh-client-*`；需要
控件样式时使用主题 Token（`--dsw-alias-*`）或拷贝宿主控件标记，而不是依赖客户端组件包。

### Host ↔ Client 数据面

宿主 `ctx.webServer.register({ kind: 'prefix', path: '/agent-plugin/api', handler })`：

- 命名路由按「exact → 最长 prefix → fallback」匹配，prefix 路由不会被 SPA fallback 吞掉；
- handler 拿到原生 `IncomingMessage/ServerResponse`，本插件自己解析 JSON 请求体并写 JSON 响应；
- 命名路由不经过 `/api` 的鉴权栅栏，因此本插件自行实现访问控制：
  - Host 头必须是 `127.0.0.1` / `localhost` / `[::1]`（本机回环）；
  - 变更类请求（POST）要求 `Origin` 等于 `http://<Host>`，且 `Content-Type` 含
    `application/json`（阻断跨站表单 CSRF 与浏览器预检之外的简单请求）；
  - 否则 403，错误信息中文。
- 远端 Web UI 访问时 Host 不是回环地址 → API 403（已知限制，见 README）。

未使用的替代方案：宿主生成的 `@Remote` 命名空间需要 `@deepseek-ai/*` 依赖（profile 关闭
`autoInstallPeers`，第三方插件不能 import），因此选择 webServer 前缀路由 + 原生 fetch。

### 启动顺序（0.2.3 修正）

宿主 Loader 按「服务可用性」激活插件：插件行在 `inject` 声明的服务出现后即 apply，但**不保证**
其它可选服务已经注册。实测一次冷启动中，本插件 apply 时 `ctx.get('webServer')` 返回 undefined，
导致 API 路由没有挂载（`/agent-plugin/api` 404），技能 provider 也没有注册。

修正：

- 硬依赖只保留 `inject: ['commands']`；
- `skills` 与 `webServer` 用 `ctx.inject(['skills'], cb)` / `ctx.inject(['webServer'], cb)`
  延迟注册——服务出现时 callback 才执行，并用 `scope.effect` 绑定注销；
- hooks 的事件监听不再依赖 `tools` 服务（监听不存在的宿主事件无害），`subprocess` 执行器
  改为事件发生时懒探测（`probeExecutor()`），服务晚到后 hooks 自动恢复可用。

结论：可选服务应当用 `ctx.inject` 等待而不是在 apply 里一次性 `ctx.get`；不要缓存「服务缺失」
这一结论。

### 左侧栏面板（0.2.4）

主面板（中央区域）与左侧栏入口是一对**同 id 的槽位注册**：

- `sidebar.panellist`（list）：`{ id, order?, label? }`，组件接收 ownerProps
  `{ size: number, active: boolean }`（只画图标）；本插件 `id: 'agent-plugin'`、`order: 5`。
- `main`（keyed）：`{ key }`，组件即面板内容；`key` 必须等于左侧栏入口的 `id`，
  宿主按左侧栏选中项把该 key 派发到中央区域（无需自己调 `layout.selectPanel`）。
- 实测占用者顺序：`plugins`(0) / `schedules`(10) / `dsh-context`(20)；登记 `order: 5`
  即落在「插件」与「自动化任务」之间。
- 参考实现：第三方插件 `dsh-context` 用同样的一对注册（`main` + `sidebar.panellist`），
  面板 id 相同即可加入左侧栏，不需要改宿主。
- 设置页 Tab（`settings.plugins.tab`）与左侧栏面板是两种不同位置；0.2.4 起改用左侧栏入口，
  旧设置页 Tab 注册已移除。

### Client locale 的语言 id（0.2.5 修正）

`ctx.locale.getLocale().active` 的实测值是 **`zh`**（不是 `zh-cn`；`dsh-context` 也用
`active === 'zh'` 判断中文）。只把字典注册到 `zh-cn` 时，`slot label` 会回退到英文
（本插件曾因此在左侧栏显示 `Agent Plugins`）。

正确做法：字典同时注册 `en` 与 `zh`（`zh-cn` 可一并注册），并在翻译函数里按
`getLocale().active` 前缀选字典；图标/标签等 thunk 在每次投影时重新求值，语言切换后自动跟随。
`locale/*.json` 展示元数据仍用 `zh.json`（与宿主自带包一致）。