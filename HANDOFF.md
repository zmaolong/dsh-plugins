# HANDOFF — dsh-agent-plugin-hub 0.1.0

> 状态：**主功能可用，已发布 0.1.0**。本文件在 `release-0.1.0` 分支提交，记录次日接手所需的一切。
> 发布代码提交：`373d499`（`release: 0.1.0 版本号与 README 更新`）；HANDOFF 提交 `3380f4f`；
> 索引提交 `8844625`（`index.json` 指向 `3380f4f`，已验证线上 raw 可读）。

## 30 秒速览

- hub 已安装进 **桌面端当前 profile**（`~/.dsh/profiles/desktop`，以 `link` 方式指向
  `E:\workspace\dsh-plugins\packages\dsh-agent-plugin-hub`）并处于启用状态。
- 会话里用 `/agent-plugin`，常用三条：

```text
/agent-plugin status
/agent-plugin market add local  E:\my-agent-plugins\market
/agent-plugin install demo-plugin
```

- 装完插件后：技能出现在 DSH 技能目录；插件命令注册为 `/<插件名>-<命令名>`（结果需复制发送）；
  hooks 已映射到宿主真实事件；MCP 只解析展示（见「已知限制」）。
- 自测：`cd packages\dsh-agent-plugin-hub; npm test`（53 个用例，零依赖、不联网）。
- 索引源（DSH 插件页 → 发现 → 添加索引源）：

```text
https://raw.githubusercontent.com/zmaolong/dsh-plugins/release-0.1.0/index.json
```

## 功能清单与 DoD 对照

| DoD | 状态 | 证据 |
|---|---|---|
| 1. 市场源 local / git / url 的 add/list/refresh/remove；git 浅克隆；url 失败记 refreshError | ✅ | `test/market.test.mjs`、`test/installer.test.mjs`（本地 git 仓库、本地 HTTP 服务）；宿主内用 local 市场做过 E2E |
| 2. claude/codebuddy/zcode 的 plugin.json 与 marketplace.json 全支持；多格式按 claude > codebuddy > zcode | ✅ | `test/manifest.test.mjs`（含 `multi-format` 夹具、根级清单兜底） |
| 3. 安装/卸载/启用/禁用/更新/回滚；原子复制；打印来源与目标；不静默覆盖 | ✅ | `test/installer.test.mjs`；`/agent-plugin install` 输出含来源→目标路径 |
| 4. skills 注入 `ctx.skills.registerProvider` | ✅ | 单元测试 + **宿主 E2E**：装上夹具插件后，本会话技能目录实时出现 `greet` |
| 5. commands 注入 `ctx.commands.register`，模板渲染，冲突跳过并报告 | ✅（有命名限制） | `test/hub.test.mjs`；宿主命令名不允许 `:`，实际命名 `<plugin>-<command>`（README 已记录） |
| 6. hooks 映射宿主真实事件 | ✅ | 单元测试 + **宿主 E2E**：`tools/result` 每次工具调用触发 PostToolUse；把 PreToolUse hook 改成退出码 2 后，真实工具调用被阻断并返回「hook 以退出码 2 阻止该操作」 |
| 7. mcpServers 接入 dsh-mcp-client | ⚠️ 未生效（宿主无接口） | 按自动决策表：解析/展示清单，`info`/`status` 标注「未生效」，不自己 spawn 进程；依据见 `docs/HOST-API.md` |
| 8. `/agent-plugin` 全部子命令 + 中文可操作错误 | ✅ | `test/hub.test.mjs` 覆盖 status/list/info/formats/help/install 与错误分支 |
| 9. 持久化：重启后 state、启用项、能力注册恢复 | ✅（单测；宿主重启未实测） | `test/hub.test.mjs`「持久化：重启后状态、技能与命令恢复」；宿主加载已播种状态时日志显示「插件 1 个，市场 1 个」 |
| 10. 安全：名字/格式/路径白名单、拒绝穿越、缓存只读、包名冲突 | ✅ | `test/manifest.test.mjs`、`test/market.test.mjs`「路径穿越与绝对路径插件不能被安装」、`test/installer.test.mjs` 冲突/重名分支 |
| 11. `scripts.test`（node --test）与 `scripts.check` | ✅ | `npm run check` 通过（15 个文件 `node --check`）；`npm test` 53/53 |

MVP 未做（结构留扩展点）：Web 管理页、签名/审计、完整信任模型。

## 验证证据

### 单元测试（2026-11-06）

```text
$ cd packages\dsh-agent-plugin-hub; npm test
ℹ tests 53
ℹ pass 53
ℹ fail 0
ℹ duration_ms ~1.3s
```

覆盖：三格式探测与优先级、frontmatter/模板渲染、marketplace 解析、state 原子写与损坏自检、
进程锁、市场 add/refresh/remove（local / url 成功与失败）、本地 git 市场浅克隆、
安装/重装 `--force`/禁用启用/更新/回滚/卸载、重启恢复、路径穿越与非法名拒绝、
技能 provider、插件命令注册与冲突、hooks 事件映射与 deny 决策、命令处理器文本。

### 宿主冒烟（DSH 桌面端 0.2.2-rc.1，desktop profile）

1. `plugin_manager install_bundle` 安装本插件目录：`application: applied`、`enabled: true`、
   pnpm 退出码 0；profile `package.json` 出现 `"dsh-agent-plugin-hub": "link:E:/workspace/dsh-plugins/packages/dsh-agent-plugin-hub"`。
2. 预先在真实 hub home 播种夹具市场并安装 `demo-claude`，宿主加载 hub 后：
   - `~/.dsh/agent-plugin-hub/logs/hub.log`：
     `2026-11-06T15:21:46.027Z [info] hub 启动完成：home=C:\Users\QSKJ\.dsh\agent-plugin-hub，插件 1 个，市场 1 个`
   - **技能注入生效**：本会话可用技能列表里实时出现夹具技能 `greet`（描述「夹具技能：向用户打招呼」）。
   - **hooks 生效**：日志持续出现 `hook PostToolUse ... 退出码=0`（每次工具调用触发）；
     把 PreToolUse hook 命令改为退出码 2 后，一次真实 `pwsh` 调用被阻断，返回
     `Error: hook 以退出码 2 阻止该操作`；日志对应
     `2026-11-06T15:22:36.589Z [warn] hook PreToolUse ... 退出码=2 超时=false`。
3. 冒烟后已清理夹具：`卸载 .../demo-claude`、`市场 ... 已移除`（日志 15:22:59），
   真实 hub home 当前为 0 插件 / 0 市场；临时夹具目录已删除。**hub 保持已安装+启用**。
4. 未伪装通过的点：
   - 斜杠命令的 **UI 调用**无法由 Agent 自动执行（宿主没有给 Agent 的命令执行接口），
     `/agent-plugin` 与插件命令的注册由代码路径 + 无注册错误日志 + 单测证明；
   - **宿主重启后的现场恢复**未实测（单测覆盖）；下次启动会自动读取 `state.json` 并重建注入；
   - hooks 的 MCP/Notification 等未映射事件、MCP 挂载均按决策表标注「未生效」；
   - 当前宿主进程里仍按安装时的 0.0.1 元数据运行（代码走 link 指向工作区），重启后显示 0.1.0。

## 分支 / 提交 / 索引

| 项目 | 值 |
|---|---|
| 发布分支 | `release-0.1.0`（代码 + 脚本 + index.json + HANDOFF.md） |
| 发布代码提交 | `373d499`（版本号 0.1.0 + README） |
| HANDOFF 提交 | `3380f4f` |
| 索引提交 | `8844625`（`index.json` 指向 `3380f4f`，source commit 已核对） |
| 功能提交 | `0a4cb85`（市场、安装器、能力注入）、`9127546`（`/hub` → `/agent-plugin`） |
| 索引 URL | `https://raw.githubusercontent.com/zmaolong/dsh-plugins/release-0.1.0/index.json` |
| 主分支 | `main` 只保留 `README.md`（文档分支，不放代码） |
| 旧分支 | `release-0.0.1` 保留 0.0.1 骨架历史 |

线上索引验证（推送后立即执行，带 `?nocache=` 绕过缓存）：

```text
HTTP 200
format=1  plugin=dsh-agent-plugin-hub  version=0.1.0
commit=3380f4f493d95851dd8a5a98a6211e2d7603f577
path=packages/dsh-agent-plugin-hub
title_zh=Agent 插件中心
```

远端分支确认：`git ls-remote origin` 含 `refs/heads/release-0.1.0 -> 884462511937019398c0020ec651cc5733c1cc0e`。

索引由 `node scripts\build-index.mjs` 生成（先删除旧 `index.json` 以免合并 0.0.1 条目）；
条目 commit 指向发布代码提交，版本 `0.1.0`，source 为 `git+https://github.com/zmaolong/dsh-plugins#<commit>&path:packages/dsh-agent-plugin-hub`。

## 已知限制与自动决策记录

| 情形 | 决策 | 说明 |
|---|---|---|
| 宿主命令名不允许 `:` | 退化为 `<plugin>-<command>` | 任务书首选 `agent-plugin:<plugin>:<command>`，但宿主 `parseCommand` 只接受 `/^[a-z][a-z0-9_-]*$/`；README 已记录 |
| 命令无法注入会话消息 | 返回渲染后的完整文本 + 「复制发送」提示 | 宿主 `CommandResult` 只有 text；不自造注入通道 |
| 宿主无 MCP 运行时挂载接口 | 只解析/展示 `mcpServers`，标注「未生效」 | `dsh-mcp-client` 是「一插件行连一 server」的静态配置，未在当前 profile 加载；第三方插件无运行时注册服务；不自己 spawn 进程 |
| hooks 无对应宿主事件 | 保留清单，`info` 标注「未生效」 | Notification / SubagentStop / PreCompact / PostCompact |
| UserPromptSubmit | 映射到 `agent/inbox/inserted`（只观察） | 该事件是 emit，不能阻断或改写用户输入 |
| npm 源 | 明确报「MVP 暂不支持 npm 源」 | 留扩展点 |
| url 市场网络失败 | 记录 `refreshError`，其余功能继续 | 单测覆盖服务关闭场景 |
| url 市场的相对路径插件 | 明确报错，建议改用 Git 市场或 github source | 无法安全地按 URL 相对路径复制整包 |
| GitHub 推送失败 | 重试 + 代理，仍失败则写手推命令 | 本次推送成功（见分支表） |

其它限制：

- 安装副本跳过 `node_modules/`、`.git/`（体积与可重复性考虑），需要依赖安装的 Agent 插件需自带
  或在使用侧处理；
- hooks 命令按 Claude Code 约定用平台 shell 执行，复杂引号行为以宿主 shell 为准；
- skills/commands 的解析基于 Claude Code 公开格式，CodeBuddy/ZCode 采用最小兼容字段并宽松处理。

## 次日手动收尾（只有确实需要时才做）

1. **重启 DSH 桌面端**后 `/agent-plugin` 才会加载 0.1.0 的最终代码（当前宿主进程里加载的是安装时
   的 0.0.1 版本标记，代码走 link 指向工作区，但仍建议重启一次以获得干净状态）。
2. 重启后执行 `/agent-plugin status`，应看到：版本 `0.1.0`、0 插件 / 0 市场、技能 provider 已注册、
   commands 已注册、hooks 已挂载、MCP 未生效（带原因）。
3. 若当前会话技能目录里还能看到夹具技能 `greet`，那是清理前的缓存；重启后消失。
4. 可选：在插件页「发现 → 添加索引源」填入上面的 `release-0.1.0` 索引 URL，即可一键安装本插件后续版本。
5. 想立即试用真实 Agent 插件：

```text
/agent-plugin market add git https://github.com/<owner>/<claude-plugin-market>.git
/agent-plugin market refresh
/agent-plugin install <插件名>
/agent-plugin info <插件名>
```

## 文件索引

| 路径 | 作用 |
|---|---|
| `packages/dsh-agent-plugin-hub/lib/index.js` | Cordis 入口（`name` / `inject` / `apply`） |
| `lib/hub.js` | home 解析、启动自检、编排层 |
| `lib/store.js` | state/marketplaces 原子写、进程锁、损坏修复 |
| `lib/manifest.js` / `lib/formats.js` | 清单解析、格式探测、白名单 |
| `lib/capabilities.js` / `lib/frontmatter.js` | 能力扫描、frontmatter 与命令模板 |
| `lib/market.js` / `lib/installer.js` | 市场源、安装/更新/回滚 |
| `lib/skills.js` / `lib/plugin-commands.js` | 技能 provider、插件命令注册 |
| `lib/hooks.js` / `lib/mcp.js` | hooks 事件映射与执行、MCP 清单 |
| `lib/report.js` / `lib/commands.js` | 文本渲染、`/agent-plugin` 命令 |
| `docs/HOST-API.md` | 宿主 API 侦察结论（命令/技能/事件/subprocess/MCP） |
| `test/` | `node --test` 用例与三格式夹具 |