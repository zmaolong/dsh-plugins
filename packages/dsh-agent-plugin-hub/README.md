# dsh-agent-plugin-hub

DSH 的 **Agent 插件**运行时与市场（骨架）。

Agent 插件指跨 Harness 的插件资产包：`plugin.json` 加 `skills/`、`commands/`、`hooks/`、`mcpServers` 等能力。已知格式包括 Claude Code、CodeBuddy、ZCode；它们不是 DSH 插件（cordis bundle）。本包自己才是 DSH 插件，负责把 Agent 插件装进 DSH，并把能力注册成 DSH 的技能、命令、hooks 与 MCP。

> 当前只是**骨架**：包能装、能加载、能用 `/agent-plugin` 查看状态；还不能真的安装或运行 Agent 插件。

## 现在有什么

- 标准 DSH 组合包：`package.json` 的 `dsh.bundle.patch` → `cordis.patch.yml`
- 入口 `lib/index.js`：导出 `name`、`inject`、`apply(ctx, config)`
- `/agent-plugin` 命令：`status`、`formats`、`path`、`version`
- 格式注册表：claude / codebuddy / zcode 的 manifest 与 marketplace 候选路径
- 存储根解析：配置 `home` → `DSH_AGENT_PLUGIN_HUB_HOME` → `~/.dsh/agent-plugin-hub`

## 结构

```text
dsh-agent-plugin-hub/
├─ package.json          # 组合包声明 + 市场展示元数据
├─ cordis.patch.yml      # 插入 agent-plugin-hub 行
├─ lib/
│  ├─ index.js           # Cordis 入口
│  ├─ hub.js             # 路径、格式表、状态
│  ├─ formats.js         # 各 Harness 格式的清单路径
│  └─ commands.js        # /agent-plugin 命令
└─ README.md
```

## 安装（开发期）

桌面端：设置 → 插件 → 安装，填包目录的绝对路径：

```text
E:\workspace\dsh-plugins\packages\dsh-agent-plugin-hub
```

CLI（`web` profile；`desktop` profile 由桌面应用独占管理）：

```powershell
dsh plugin --profile web add E:\workspace\dsh-plugins\packages\dsh-agent-plugin-hub
dsh --profile web
```

装好后在会话里执行 `/agent-plugin` 验证；`cordis.patch.yml` 的改动约 1 秒热重载，`lib/*.js` 的改动需要重启宿主。

## 配置

```yaml
- id: agent-plugin-hub
  config:
    home: ''   # 留空则用 DSH_AGENT_PLUGIN_HUB_HOME 或 ~/.dsh/agent-plugin-hub
```

## 下一步

- [ ] 存储与状态：`state.json`、`marketplaces.json`、`cache/<format>/<market>/<plugin>/<version>`、原子写与锁
- [ ] 格式探测：同一目录存在多套清单时按优先级选择，并记录 `format`
- [ ] 市场导入：本地目录、git、`marketplace.json` 直链
- [ ] 安装、卸载、更新、回滚
- [ ] 技能 provider（`ctx.skills.registerProvider`）
- [ ] 命令适配（把命令模板渲染成用户消息提交）
- [ ] hooks 事件映射（PreToolUse / PostToolUse / UserPromptSubmit / Stop）
- [ ] MCP 挂载（`dsh-mcp-client`）
- [ ] 信任、审批与审计
- [ ] Web 管理页

## 约定

- 不 import 任何 `@deepseek-ai/*` 包：profile 的 `autoInstallPeers` 是关闭的，第三方插件只依赖 Node 内置模块与 `ctx` 接口。
- 被托管的 Agent 插件不进入 DSH 插件树，不出现在 Plugins 页；管理入口是本包的 `/agent-plugin` 命令（后续加 Web 页）。
- 不读取、不依赖、不写入其他 Harness 的插件目录；扩展包只从用户显式添加的市场进入本包自己的 cache。

## 市场索引

新增包后先提交 Git，再重新生成聚合索引：

```powershell
cd E:\workspace\dsh-plugins
node scripts\build-index.mjs
```

索引条目取自 `package.json` 的 `dsh.market`；提交前生成会把旧 commit 写进索引，导致安装失败。

## 许可

MIT