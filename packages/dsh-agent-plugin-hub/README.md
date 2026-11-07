# dsh-agent-plugin-hub

DSH 的 **Agent 插件**运行时与市场。

Agent 插件指跨 Harness 的插件资产包：`plugin.json` 加 `skills/`、`commands/`、`hooks/`、
`mcpServers` 等能力。已知格式包括 Claude Code、CodeBuddy、ZCode；它们不是 DSH 插件
（cordis bundle）。本包自己才是 DSH 插件，负责把 Agent 插件装进 DSH，并把能力注册成
DSH 的技能、命令、hooks 与 MCP。

> 版本 0.2.0：在 0.1.0（市场 → 安装 → skills/commands 注入、hooks 映射）之上新增
> 插件页「Agent 插件」Tab：可视化增删市场、安装/更新/回滚/卸载插件，并逐项启停
> 技能、命令、hooks 与 MCP 清单。MCP 仍受宿主接口限制，只解析展示并标注「未生效」
> （见下文与 [`docs/HOST-API.md`](docs/HOST-API.md)）。

## 快速开始

```text
/agent-plugin market add local  E:\my-agent-plugins\market
/agent-plugin install demo-plugin
/agent-plugin list
/agent-plugin info demo-plugin
```

`/agent-plugin` 是本包唯一的命令入口；已安装 Agent 插件自带的命令会注册成
`/<插件名>-<命令名>`。

## 插件页 UI：Agent 插件 Tab（0.2.0）

位置：**设置 → 插件 → Agent 插件**（与「全部」「市场」标签并列，order 50）。

- **市场**：添加 local / git / url 三种市场源，刷新、移除，浏览市场内插件并一键安装；
- **已安装**：插件总开关（启用/禁用）、查看详情、更新、回滚、卸载；
- **插件详情**：按技能 / 命令 / hooks / MCP 清单分组展示，每一项都有独立开关：
  - 技能：禁用后立即从 DSH 技能目录移除，启用后恢复；
  - 命令：禁用后对应 `/插件名-命令名` 立即从宿主注销；
  - hooks：按事件（PreToolUse/PostToolUse/Stop/…）启停，未映射到宿主的事件标注「未生效」；
  - MCP 清单：可启停，但宿主没有运行时挂载接口，条目固定标注「未生效」。

首次安装/升级后：**Host 端需要重启一次 DSH** 才会加载新版插件代码；浏览器端刷新页面即可
看到新增 Tab。若 Host API 不可用，Tab 内会显示原因。

数据通路：Host 端注册前缀路由 `/agent-plugin/api`（本机回环同源访问、POST 要求同源
Origin + JSON），Client 端通过 `dsh.client` 清单注册到 `settings.plugins.tab` 槽位。
受安全门限制，**远端 Web UI 访问时该 Tab 的 API 会返回 403**（只允许 127.0.0.1 /
localhost / [::1]），本地桌面端不受影响。

## 功能

### 市场源（market）

| 类型 | 用法 | 说明 |
|---|---|---|
| local | `/agent-plugin market add local <目录>` | 目录里有 `marketplace.json`（`.claude-plugin/`、`.codebuddy-plugin/`、`.zcode-plugin/` 或根级）；只有一个插件时直接把目录当市场 |
| git | `/agent-plugin market add git <仓库地址>` | 用系统 git **浅克隆**到 `cache/markets/<市场 id>/repo`；刷新时 `fetch + reset`，失败回退重新克隆 |
| url | `/agent-plugin market add url <marketplace.json 地址>` | HTTP(S) 拉取并快照；网络失败只记录 `refreshError`，不阻塞其它功能 |

`marketplace.json` 的 `source` 支持：

- `"./relative/path"`：相对 marketplace.json 所在目录解析，越界/绝对路径一律拒绝；
- `{"source":"github","repo":"owner/repo","commit"?,"path"?}`：系统 git 浅克隆；
- `{"source":"npm", ...}`：**MVP 暂不支持**，明确报错并保留扩展点。

### 格式探测

按 `claude > codebuddy > zcode` 优先级探测格式专属清单：

| 格式 | plugin.json | marketplace.json |
|---|---|---|
| Claude Code | `.claude-plugin/plugin.json` | `.claude-plugin/marketplace.json`、`marketplace.json` |
| CodeBuddy | `.codebuddy-plugin/plugin.json` | `.codebuddy-plugin/marketplace.json`、`marketplace.json` |
| ZCode | `.zcode-plugin/plugin.json` | `.zcode-plugin/marketplace.json`、`marketplace.json` |

没有格式专属清单时退回根级 `plugin.json`，格式按市场提示/默认 claude 记录并给出 warning。
`plugin.json` 必填 `name`、`version`，缺失即报错；能力字段兼容字符串/数组/对象。

### 安装、更新、回滚

- 安装：校验清单 → 复制到 `cache/<format>/<market>/<plugin>/<version>/`（先写 `tmp/` 再
  rename，同盘原子）→ 扫描能力 → 写 `state.json`；
- 不静默覆盖：同版本目录已存在时必须 `--force`；
- 更新：刷新市场 → 解析新版本 → 装新目录 → 切换 active → 保留上一版本供回滚；
- 回滚：切回 `previousVersions` 里最近的可用版本；
- 禁用：只改状态，文件保留；卸载：删安装副本与状态；
- 半装目录 / state 损坏：启动自检，损坏文件备份到 `logs/corrupt-*.json` 后重建，丢失目录的
  记录被剔除并记录告警。

### 能力注入

| 能力 | 宿主接口 | 说明 |
|---|---|---|
| skills | `ctx.skills.registerProvider` | 扫描 `skills/**/SKILL.md`，解析 frontmatter（name/description/allowed-tools/disable-model-invocation），content 原样，resourceBase 指向技能目录 |
| commands | `ctx.commands.register` | 注册为 `<plugin>-<command>`；渲染 Markdown 模板（`$ARGUMENTS`、`$1..$9`），冲突跳过并报告 |
| hooks | cordis 事件 + `ctx.subprocess` | PreToolUse→`tools/pre-execute`（可 deny）、PostToolUse→`tools/result`、UserPromptSubmit→`agent/inbox/inserted`、Stop→`agent/turn-stopping`、SessionStart→`session/created`、SessionEnd→`agent/disposed` |
| mcpServers | 无 | 宿主 `dsh-mcp-client` 只支持「一个插件行连一个 server」的静态配置，没有运行时挂载接口；本插件只解析/展示，`info` 标注「未生效」 |

hook 命令按 Claude Code 约定执行：工作目录为插件根，stdin 传 JSON，退出码 2 或
`hookSpecificOutput.permissionDecision: "deny"` 表示阻断（仅 PreToolUse 可阻断）。
宿主没有对应事件的 hooks（Notification / SubagentStop / PreCompact 等）只保留清单。

### 运维命令（与插件页 Tab 等价）

```text
/agent-plugin status                    总体状态
/agent-plugin list                      已安装插件
/agent-plugin info <插件名|key>          插件详情（含 hooks/MCP 是否生效）
/agent-plugin formats                   格式与清单路径
/agent-plugin path | version            存储根 / 版本
/agent-plugin market list
/agent-plugin market add <local|git|url> <地址> [--name 名称] [--format 格式]
/agent-plugin market refresh [市场id]
/agent-plugin market remove <市场id>
/agent-plugin install <插件名> [--force]
/agent-plugin install <市场id> <插件名> [--force]
/agent-plugin uninstall <插件名|key>
/agent-plugin enable|disable <插件名|key>
/agent-plugin update <插件名|key> [--force]
/agent-plugin rollback <插件名|key>
/agent-plugin help
```

逐项启停能力只在插件页 Tab 暴露（HTTP API 同样支持：`POST /agent-plugin/api/capability`）。

## 存储

home 解析：配置 `home` → `DSH_AGENT_PLUGIN_HUB_HOME` → `~/.dsh/agent-plugin-hub`。

```text
<home>/
├─ state.json            # schemaVersion + plugins[]（key/format/name/version/market/
│                        #   installedPath/enabled/installedAt/capabilities/previousVersions）
├─ marketplaces.json     # schemaVersion + markets[]
├─ cache/<format>/<market>/<plugin>/<version>/   # 安装副本（复制，不引用市场目录）
├─ cache/markets/<marketId>/                     # git 市场浅克隆 / url 快照 / github 源克隆
├─ logs/hub.log          # 运行日志；损坏文件备份也是 corrupt-*.json
└─ tmp/                  # 原子写临时文件与 hub.lock 进程锁
```

`state.json`、`marketplaces.json` 使用 tmp + rename 原子写，变更期间持 `tmp/hub.lock`；
进程崩溃遗留的陈旧锁按 pid/时间戳抢占。

## 安全

- 插件名白名单：字母数字开头，只允许 `._-`，最长 64；拒绝 `..`；
- 格式白名单：只接受 `claude` / `codebuddy` / `zcode`；
- 路径白名单：市场相对 source 必须落在市场根内；安装目标必须在 hub cache 内；复制跳过符号链接；
- 缓存只读：安装副本是复制而非引用市场目录；卸载只删 cache 内目录；
- 包名冲突检测：市场条目名与插件清单 `name` 不一致时拒绝安装；命令/技能重名跳过并报告；
- hooks 命令通过宿主 `ctx.subprocess` 执行，超时/中止受宿主管理；未知事件不执行外部命令；
- 插件页 API 只允许本机回环同源访问（Host 白名单 + POST 同源 Origin + JSON），
  防止远端页面或跨站表单触发安装/卸载。

## 配置

```yaml
- id: agent-plugin-hub
  name: 'dsh-agent-plugin-hub'
  config:
    home: ''       # 留空则用 DSH_AGENT_PLUGIN_HUB_HOME 或 ~/.dsh/agent-plugin-hub
    hooks: true    # 设为 false 时只保留 hooks 清单，不执行外部命令
```

`cordis.patch.yml` 的改动约 1 秒热重载；`lib/*.js` 的改动需要重启宿主。

## 开发

```powershell
cd packages\dsh-agent-plugin-hub
npm run check   # node --check 全部 lib 文件与 client.js
npm test        # node --test：63 个用例，零运行时依赖，不访问网络
```

测试覆盖：三格式探测与优先级、marketplace 解析、市场添加/刷新/移除、安装/重装/禁用启用/
更新/回滚/卸载、重启恢复、state 损坏自检、路径穿越与非法名拒绝、技能 provider、插件命令、
hooks 事件映射与阻断决策、本地 git 市场、URL 市场失败降级；以及插件页 API 的结构化数据、
逐项启停（skills/commands/hooks/MCP）与访问控制（回环 Host、跨源、非法 JSON）。

宿主 API 侦察结论见 [`docs/HOST-API.md`](docs/HOST-API.md)。

## 已知限制

- **命令不注入会话**：宿主命令处理器只能返回文本，插件命令渲染后提示「复制发送」；
- **hooks 只覆盖宿主已有事件**：Notification/SubagentStop/PreCompact 等标注未生效；
  UserPromptSubmit 只能观察，不能阻断或改写入参；
- **MCP 未生效**：宿主没有第三方可用的运行时 MCP 挂载接口，不自己 spawn 进程；
- **npm 源不支持**：明确报错，留扩展点；
- **URL 市场的相对路径插件不能安装**：请改用 Git 市场或 github source；
- **插件页 Tab 需刷新页面**：Client 代码由浏览器加载，安装/升级插件后刷新一次页面即可；
  Host API 更新需重启 DSH；
- **远端 Web UI 下插件页 API 返回 403**：本机回环安全门限制，桌面端本地访问不受影响；
- 不做签名/审计与完整信任模型（结构已留扩展点）。

## 安装（开发期）

桌面端：设置 → 插件 → 安装，填包目录的绝对路径：

```text
E:\workspace\dsh-plugins\packages\dsh-agent-plugin-hub
```

装好后在会话里执行 `/agent-plugin status` 验证。

## 市场索引

发布分支：`release-0.0.1`（该分支承载当前全部代码，包版本 0.2.0）。在 DSH 插件页 → 发现 → 添加索引源：

```text
https://raw.githubusercontent.com/zmaolong/dsh-plugins/release-0.0.1/index.json
```

本包更新后先提交 Git，再重新生成聚合索引（见仓库根 README）。

## 许可

MIT