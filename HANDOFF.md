# HANDOFF — dsh-agent-plugin-hub 0.3.0

> 状态：**0.3.0 已开发完成，安装进桌面端 desktop profile（link 指向运行时副本）并通过 Host API E2E**。
> 本文件随 `release-0.0.1` 分支提交；提交作者与提交者统一为 `zmaolong <203504243+zmaolong@users.noreply.github.com>`。
>
> **0.3.0 主题**：把「智能体插件」面板完全按 ZCode「插件市场」重做——只保留**个人插件**分段、
> 市场源**按输入路径自动识别**、商店列表 / 详情 / 管理 / 市场源 / 添加弹窗 / Toast 全部对齐
> ZCode 的结构、数值与交互；数据 schema 升到 v2，旧数据由独立迁移脚本一次性适配，主代码不再写兼容分支。

## 30 秒速览

- 安装形态：`dsh-agent-plugin-hub@0.3.0`，link 到 `E:\workspace\dsh-agent-plugin-hub-runtime\0.3.0`（运行时副本）。
  仓库源码：`E:\workspace\dsh-plugins\packages\dsh-agent-plugin-hub`。
- 左侧栏入口：**首页左侧栏「智能体插件」图标**（order 5，位于「插件」与「自动化任务」之间），
  点击后中央面板打开 ZCode 风格商店。
- 升级后需要 **刷新页面** 才载入新 Client；Host 端本次通过新运行时路径热加载（无需重启）。
- 会话命令仍是 `/agent-plugin`，子命令与以前一致。
- 自测：`cd packages\dsh-agent-plugin-hub; npm run check && npm test` → **137/137 通过，零网络**。

## 0.3.0 变更清单

### 面板（client.js 重写）

- **商店列表（默认视图）**：顶栏（刷新 / 市场源 / 添加 ▾ / 插件管理）、单个「个人」分段 + 搜索、
  按市场源分组（组间按最近刷新倒序）、组内双列卡片、>6 张折叠（「收起」/「查看 A、B，以及另外 N 个」）。
- **卡片**：40px 图标（失败/缺图回退首字母或拼图）、14/500 标题、13px 单行描述、可更新徽标、
  安装胶囊 / 更新胶囊 /「…」菜单 / 启停开关；整卡键盘可达。
- **详情**：返回、64px 图标、18/500 标题、动作顺序（更新 →「…」→ 安装）、MCP/技能/命令/Hooks
  分区（保留 hub 的逐项开关）、信息区（128px 标签列）、「高级信息」折叠（安装路径 / 可回滚版本 /
  告警 / hooks/MCP 来源 / 运行时状态）；未安装条目按需 describe，失败可重试、不编造能力。
- **插件管理**：已安装列表、全部/已启用/已禁用筛选、搜索、全部更新（串行、失败不中断、toast 汇总）、
  刷新、浏览市场、添加；底部显示全局运行状态。
- **市场源弹窗**：刷新/移除单市场、刷新失败行、空态；移除后已安装插件保留为「来源已移除」。
- **添加市场弹窗**：单地址输入 + 可选名称 + 风险勾选；Host 自动识别来源类型与格式。
- **overlay**：弹窗 / 确认框 / Toast 注册到 `shell.overlay`（框架级浮层），样式全部走
  `--dsw-alias-*` token；窄面板单列（容器查询）。

### Host 与数据

- **来源自动识别**：`detectSource` 依次判断本地目录（含 marketplace.json/plugin.json）、本地 git 目录、
  `git@`/`ssh://`/`file://`/`*.git`、`http(s)://`（先 15s 拉 JSON、失败再 120s 浅克隆）；格式仍按
  claude > codebuddy > zcode 自动探测。`/market/add` 只凭 `location` 即可添加。
- **展示元数据透传**：marketplace.json 的市场级 `description/owner/featured` 与条目级
  `displayName(_i18n)/description_i18n/icon/category/author/homepage/repository/license/keywords`
  解析后持久化到 `marketplaces.json`，`/store` 归一为 `display`；缺失按 ZCode 降级矩阵省略。
- **可更新检测**：声明级（条目 `version` vs 安装记录 `version`，`classifyUpdate`）；不可比较 →
  `unknown`，不误报。`/update` 仍是「刷新市场 → 读源清单 → 比较 → 安装」。
- **未安装详情**：`GET /describe` 只读、零网络；`POST /describe {fetch:true}` 才允许刷新/克隆。
- **图标**：`GET /icon` 只输出市场根/安装根内的 raster（≤256 KiB、nosniff、短缓存），禁止 SVG。
- **孤立插件**：移除市场不再要求先卸载；已安装插件保留，隐藏更新入口，重新添加同一来源后恢复。
- **单写互斥**：所有写操作经 `runOperation`，忙时 409 `operation_in_progress`；`/store` 返回在途 operations。
- **批量更新**：`POST /update-all` 按市场去重刷新一次 → 串行更新 → 单失败不中断 → 一次 save/sync。

### 数据迁移（主代码不背兼容）

- `STATE_SCHEMA = 2`。宿主启动时 `runMigrations(store)` 自动把 v1 的 `state.json` /
  `marketplaces.json` 迁移到 v2：补 `title/display/owner/featured`、`plugins[].meta`、删旧 `root`。
- 迁移前备份到 `logs/migrations/v1-<时间>/`；失败保留原文件、不写盘，`/store.migrationError` 显示原因；
  已是 v2 跳过；未知 schemaVersion 报错。

### P0 修复

1. **git 市场重启失效**：`market.root` 原本只在内存，重启后 refresh/install/update 抛
   `The "path" argument must be of type string`。改为 `marketRoot(market, store)` 从 `cache/markets/<id>/repo`
   推导，不再持久化冗余路径。
2. **版本比较错误**：旧实现把 `1.0.0-beta.10` 判为小于 `1.0.0-beta.2`，且非 SemVer 兜底 0.0.0。
   新增 `lib/version.js`（`parseVersion` / `compareVersions(null)` / `classifyUpdate` /
   `isInstallableVersion`），installer 更新改用新判定，unknown 不误报。

### 接口精简（不做旧路由兼容）

当前 UI 只使用：`GET /store`、`GET|POST /describe`、`GET /icon`、`POST /market/add|refresh|remove`、
`POST /install|uninstall|enable|update|update-all|rollback|capability`。旧 `/state`、`/plugin`、`/markets`
已删除；Client 与 Host 同版本发布。

## 验证证据（2026-11-08）

### 1. 单元 / 集成测试

```text
$ cd packages/dsh-agent-plugin-hub
$ npm run check     # 全部 lib + client.js 语法通过
$ npm test
ℹ tests 137
ℹ pass 137
ℹ fail 0
```

覆盖：三格式探测与优先级、listing 元数据解析、来源自动识别各分支、市场添加/刷新/移除（含移除后孤立）、
git 市场重启回归、安装/重装/启用禁用/更新/回滚/卸载、状态自检与损坏恢复、路径穿越与非法名拒绝、
版本比较与更新判定、v1→v2 迁移（备份/幂等/失败保留原文件）、技能 provider、插件命令、hooks 阻断、
MCP 清单、`/store` / `/describe` / `/icon` 数据与访问控制、单写 409、update-all 去重与失败聚合、
Client 模块注册 / 纯函数 / store / 组件冒烟（32 个 client 用例）。

### 2. 真实宿主 API E2E（安装后、运行中的 desktop profile）

环境：`http://127.0.0.1:1367/agent-plugin/api`，临时本地市场（自动识别）→ 安装 → describe → 升级 →
回滚 → 逐项启停 → 全部更新 → 卸载 → 移除市场，全部通过；结束后临时市场与插件清理干净，
仅保留用户原有 `mattpocock` git 市场。

同时验证：

- `GET /store` 返回 `version=0.3.0`、`ui.active=true`。
- 真实 git 市场（重启前 `refreshError` 为旧的 path TypeError）刷新成功：
  `mattpocock` 插件条目出现，市场 `display.owner/description` 解析正确——P0 修复现场确认。
- 迁移日志：`存储 schema 已迁移：v1 → v2`；真实 home 的 `state.json` / `marketplaces.json` 均升为 v2。
- 重复添加市场返回 409；写操作单写互斥、读接口不阻塞。

### 3. Client 槽位注册（cordis_inspect_query client Slots）

在已连接的桌面页面中确认：

- `sidebar.panellist`：id `agent-plugin`，order 5，`active: true`；
- `main`：key `agent-plugin`，`active: true`；
- `shell.overlay`：id `agent-plugin-overlay`，order 60，`active: true`（旧版没有该注册，说明新 Client 已生效）。

### 4. 视觉验证的限制（如实记录）

- 无头 Edge 直接访问 `http://127.0.0.1:1367` 只能拿到 **401**（桌面端会话鉴权），无法在外部浏览器
  完成截图与 DOM 断言；因此**未对已鉴权 GUI 做自动截图验收**。
- 组件/样式规格由 32 个 client 测试（React 替身）与 ZCode 规格数值对照覆盖；请在桌面端刷新页面后
  人工看一眼：「智能体插件」入口 → 商店列表 → 点卡片进详情 → 插件管理 → 市场源/添加弹窗。

## 当前安装状态与手工步骤

1. 运行中的 Host 已加载 0.3.0：`plugin_manager install_bundle` 的结果为 `application: applied`，
   profile `package.json` 依赖为 `"dsh-agent-plugin-hub": "link:E:/workspace/dsh-agent-plugin-hub-runtime/0.3.0"`。
2. **请刷新一次桌面端页面**：Client 代码由浏览器模块表加载，刷新后商店面板与 `shell.overlay` 生效。
3. 打开「智能体插件」后应看到：
   - 标题「智能体插件」+ 刷新/市场源/添加/插件管理；「个人」分段；搜索；
   - 市场分组（当前真实环境有 1 个：`mattpocock`，1 个插件；如需更多可添加本地目录/Git/URL）；
   - 点卡片进详情；「插件管理」里安装项与开关；右上「添加」打开自动识别弹窗。
4. 若面板没出现：先刷新页面；仍无则重启 DSH（Host 已热加载，但浏览器模块表可能需要刷新）。

## 设计决策与刻意不做

| 项 | 决策 |
|---|---|
| 分段 | 首版只有「个人」；不做公开/社区、不做「应用插件（UI 插件）」专区（hub 无官方目录与 UI surface 数据） |
| 市场源识别 | UI 不选类型/格式，Host 自动识别；CLI `/agent-plugin market add` 仍保留显式类型参数 |
| 搜索 | 子串匹配（名称/显示名/描述/分类/作者/关键词/市场名）；**不含拼音**（零依赖/无构建链，后续可加） |
| 刷新 | 顶栏刷新 = 真网络刷新全部市场并 toast 可更新数；管理视图刷新 = 本地重载；不做 10 分钟自动刷新 |
| 安装取消 | 不提供（底层同步复制/git 不可中断） |
| MCP | 仍无运行时挂载接口，仅展示并标「未生效」 |
| 图标 | https / 受限 data raster / 本机 `/icon` raster；SVG 不提供（同源脚本风险） |
| 回滚 | 保留在详情「高级信息」内（ZCode 无此入口，属 hub 既有能力） |
| 逐项能力开关 | 保留在详情组件行（ZCode 无此能力，属 hub 既有能力） |
| 兼容层 | 不保留旧 HTTP 路由/旧数据分支；旧数据只通过迁移脚本处理 |

## 已知限制

- 远端 Web UI 下 `/agent-plugin/api` 仍只允许回环访问（403）；桌面本地不受影响。
- URL 市场的相对路径 source 不能安装/describe（与之前一致，改用 Git 市场或 github source）。
- npm source 仍不支持。
- 命令结果仍只返回文本（需复制发送）；hooks 仅映射宿主已有事件。
- 迁移不联网：旧条目的展示元数据（displayName/category/icon 等）需下一次「刷新市场」才会补齐。
- Client 与 Host 同版本；不要只升级一侧（旧 Client 的 `/state` 已不存在）。

## 文件索引

| 路径 | 作用 |
|---|---|
| `client.js` | 商店面板：侧栏入口 / 主面板 / shell.overlay；内联样式 + 内联 SVG |
| `lib/index.js` | Cordis 入口（`name` / `inject` / `apply`，延迟等待 skills/webServer） |
| `lib/hub.js` | 迁移触发、单写互斥、市场/插件编排、describe、update-all、孤立处理 |
| `lib/ui-data.js` | `/store` 快照、`/describe` 统一详情、图标文件解析 |
| `lib/ui-routes.js` | `/agent-plugin/api` 路由表、回环+同源门禁、错误码、图标二进制 |
| `lib/store.js` | schema v2 原子读写、自检修复、进程锁 |
| `lib/migrate.js` | v1→v2 独立迁移（备份、幂等、失败保留原文件） |
| `lib/version.js` | 零依赖版本解析/比较/更新判定 |
| `lib/market.js` | 市场源自动识别、git/url/local 刷新、来源目录解析、图标文件 |
| `lib/manifest.js` | plugin.json / marketplace.json 探测与 listing 元数据解析 |
| `lib/installer.js` | 安装/更新/回滚/卸载与版本目录管理 |
| `lib/capabilities.js` / `skills.js` / `plugin-commands.js` / `hooks.js` / `mcp.js` | 能力扫描与注入 |
| `lib/commands.js` / `report.js` | `/agent-plugin` 命令与文本渲染 |
| `docs/HOST-API.md` | 当前 HTTP API、数据结构、错误码与并发语义 |
| `test/` | `node --test`：137 个用例（含迁移、来源识别、/store、Client） |

## 分支 / 提交 / 索引

| 项目 | 值 |
|---|---|
| 发布分支 | `release-0.0.1` |
| 包版本 | `0.3.0` |
| 索引 URL | `https://raw.githubusercontent.com/zmaolong/dsh-plugins/release-0.0.1/index.json` |
| 索引重新生成 | 代码提交后执行 `node scripts\build-index.mjs`，再提交 `index.json`（使其 commit 指向代码提交） |
| 提交作者 | `zmaolong <203504243+zmaolong@users.noreply.github.com>`（无 Co-Authored-By） |