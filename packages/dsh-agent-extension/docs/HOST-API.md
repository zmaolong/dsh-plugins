# 智能体扩展 · 商店面板 Host API

本文件是 `dsh-agent-extension` 对插件商店面板（`client.js`）暴露的 **HTTP 数据契约**，
与 v0.3.0 的实现一一对应：路由表、请求/响应结构、错误码、并发语义与降级规则。

- 前缀：`/agent-plugin/api`（由 `lib/ui-routes.js` 以 `prefix` 命名路由挂载到宿主 `webServer`）
- 数据整形：`lib/ui-data.js`（`buildStoreSnapshot` / `buildDescribe` / `buildMarketSummary` /
  `resolveStoreIconFile`）；运维动作编排：`lib/hub.js`
- 客户端只读本文档定义的路由；v0.3.0 起**不再提供** `/state`、`/plugin`、`/markets`
  （客户端与 Host 同步升级，不保留旧字段兼容层）

## 1. 通用约定

### 1.1 信封

成功：

```json
{ "ok": true, "data": {} }
```

失败：

```json
{ "ok": false, "error": "中文可读文案", "code": "machine_code", "details": { "operation": {} } }
```

- `error` 始终是中文、可操作文案；`code` 供客户端分支；`details` 仅在需要时出现
  （目前只有 `operation_in_progress` 附带 `details.operation`）。

### 1.2 状态码与错误码

| HTTP | code | 场景 |
|---|---|---|
| 400 | `bad_request` | 请求体非法/缺字段、未知能力种类、请求体过大 |
| 403 | `forbidden` | 非回环 Host、跨源 POST、非 JSON POST |
| 404 | `not_found` | 未知路由、市场/插件/图标不存在 |
| 405 | `method_not_allowed` | 路由存在但方法不支持 |
| 409 | `conflict` | 市场已存在、同版本已安装、跨市场重名 |
| 409 | `operation_in_progress` | 另一个写操作在途（见 §5） |
| 409 | `market_unavailable` / `source_unavailable` | 市场不可用 / 来源无法解析 |
| 422 | `version_invalid` | 版本号不合法或不可比较 |
| 502 | `network_error` / `git_error` | 网络/ git 失败 |
| 500 | `internal` | 未预期异常（兜底） |

### 1.3 访问控制

- `Host` 头必须是 `127.0.0.1` / `localhost` / `[::1]`（含端口），否则 403；
- 非 GET/HEAD 请求额外要求：`Origin` 缺省或等于 `http://<Host 头>`，且
  `Content-Type` 含 `application/json`（阻断跨站表单 CSRF）；
- 浏览器发送的 `sec-fetch-site: cross-site` 一律拒绝（GET/HEAD 除外）——跨站上下文
  发起的请求无论 Origin 如何都不放行（0.1.0 起新增）；
- JSON 请求体上限 256 KiB；
- 所有可能联网/写盘的动作只允许 POST；GET 一律只读。

### 1.4 标识符与入参

- 市场 id：`marketId`，形如 `local-<slug>-<hash8>`（由 `type + location` 推导，稳定）；
- 插件 key：`<marketId>/<pluginName>`，与安装记录的 `key` 一致；商店、详情、已安装三处
  用同一个 key；
- 写接口同时接受 `key`（推荐）与 `market + name`；已安装插件动作接受 `key` 或唯一 `name`；
- 时间字段为 ISO 8601 字符串；未知/未发生用 `null`（不使用空串）；
- 联网边界：`GET /store`、`GET /describe`、`GET /icon` 零网络；仅
  `POST /describe {fetch:true}` 允许刷新市场/克隆 git 源（用户点「重试/获取详情」时才用）。

## 2. 数据结构

### 2.1 StoreSnapshot（`GET /store`）

```ts
{
  version: string                        // hub 包版本
  home: string                           // 存储根绝对路径
  started: boolean
  ui: { active: boolean, reason: string, path: string }   // HTTP 路由挂载状态
  formats: Array<{ id, label, pluginManifests: string[], marketplaceFiles: string[] }>
  runtime: {
    skills:   { registered: boolean, skills: number, reason?: string }
    commands: { available: boolean, registered: object[], reason?: string }
    hooks:    { attached: boolean, enabled: boolean, reason: string, events: object[] }
    mcp:      { available: false, hasResources: boolean, reason: string }
  }
  migrationError: string | null          // 启动时 schema 迁移失败原因
  operations: Operation[]                // 在途写操作（通常 0 或 1 个）
  markets: MarketSummary[]
  items: CatalogItem[]                   // 所有可安装条目（含已安装的）
  installed: InstalledItem[]             // 已安装项（含孤立项；孤立项只出现在这里）
  stats: {
    markets: number, items: number, installable: number, installed: number,
    updatesAvailable: number, orphans: number, marketsWithError: number
  }
  warnings: string[]                     // hub 最近告警（最多 20 条）
}
```

> `/store` **不含** `cache`（`cacheStats` 会递归 stat 全部安装文件，只保留给 CLI `status`）。

### 2.2 MarketSummary

```ts
{
  id: string
  name: string                    // 用户别名（刷新不会被上游 name 覆盖）
  title: string                   // 上游 marketplace.json 的 name（缺失回退 name）
  type: 'local' | 'git' | 'url'
  format: 'claude' | 'codebuddy' | 'zcode'
  location: string
  lastRefreshed: string | null
  refreshError: string | null
  pluginCount: number
  display: { title: string, description: string | null, owner: Author | null }
  health: { status: 'ok' | 'stale' | 'missing' | 'error', message: string }
  refreshing: boolean
}
```

- `health.status`：`refreshError` 非空 → `error`；local 目录缺失 / git 克隆目录缺失 /
  url 无本地快照 → `missing`；未刷新或超过 24h → `stale`；否则 `ok`；
- `refreshing`：当前有 `market-refresh` 在途（或刷新全部）。

### 2.3 CatalogItem（`items[]`）

```ts
{
  key: string                     // marketId/name（= 安装后的 record.key）
  name: string
  version: string | null          // 市场声明版本（条目 version 字段）
  versionValid: boolean           // 是否符合安装器目标目录规范（x.y.z）；无 version 视为 true
  format: string                  // 取自 market.format
  market: MarketRef
  display: Display
  source: SourceInfo
  installable: boolean
  blockedReason: string | null
  installed: boolean
  installedVersion: string | null
  installedEnabled: boolean | null
  update: UpdateInfo
  warnings: string[]
}
```

`MarketRef = { id, name, title, type, format }`。

### 2.4 InstalledItem（`installed[]`）

```ts
{
  key: string
  name: string
  version: string                 // 安装副本的实际版本（以清单为准）
  format: string
  market: MarketRef | null        // 来源市场已移除时为 null
  marketId: string                // 记录里保留的原始市场 id（可能是已移除的市场）
  enabled: boolean
  installedAt: string
  installedPath: string
  capabilities: { skills: string[], commands: string[], hooks: string[], mcpServers: string[] }
  disabledCapabilities: { skills: string[], commands: string[], hooks: string[], mcpServers: string[] }
  previousVersions: Array<{ version: string, installedAt: string, available: boolean }>
  display: Display
  displaySource: 'market' | 'manifest' | 'record'
  update: UpdateInfo
  orphan: boolean                 // market === null 且安装记录指向已移除市场
  health: { installedDirExists: boolean }
}
```

- `previousVersions[].available` 用 `existsSync` 判定，客户端据此决定回滚按钮是否可点；
- 孤立项只出现在 `installed`，`orphan:true` + `market:null`，更新入口应隐藏
  （`update.state='unknown'`、`reason='来源市场已移除，无法检查更新'`）；
- 孤立项仍可：查看详情、启停、逐项能力启停、回滚（本地缓存）、卸载；
- 重新添加同一来源后（市场 id 稳定）按 key 自动恢复关联，`orphan` 变 `false`。

### 2.5 Display

```ts
{
  title: string
  titleI18n: Record<string, string> | null
  description: string | null
  descriptionI18n: Record<string, string> | null
  category: string | null
  categories: string[]
  author: { name: string, email: string | null, url: string | null } | null
  homepage: string | null
  repository: string | null
  license: string | null
  keywords: string[]
  icon: { kind: 'none' | 'route' | 'http' | 'data', url: string | null, mime: string | null }
  featured: boolean
}
```

解析顺序：**市场条目 `meta`（listing）→ 已安装清单 `plugin.json` → record/name**；
市场级 `display` 只提供标题/描述/作者的兜底。

- `title`：`meta.displayName` → `titleI18n` 默认值（`default`/`en`/`zh-cn`/`zh`）→ 插件名；
  多语言原对象原样放在 `titleI18n`，由客户端本地化；
- `description`：`meta.description` → `meta.descriptionI18n` 默认值 → 条目 description →
  清单 description → 市场 display；
- `icon.kind`：
  - `route`：市场根/安装根内的 raster 文件，`url` 指向
    `/agent-plugin/api/icon?key=<key>&v=<version>`；
  - `http`：条目里的 `https://` 地址，客户端直接加载（不代理）；
  - `data`：`data:image/(png|jpeg|webp|gif);base64,...`，解码后 ≤32 KiB；
  - `none`：缺省/越界/非白名单（SVG 一律不提供，避免同源脚本风险）。
- 条目里缺失的可选展示字段（`publisherType` / `requiresPaidPlan` / `hero` /
  `examplePrompts`）**不伪造**，当前直接不返回；客户端按「无值即隐藏」处理。

### 2.6 SourceInfo / UpdateInfo / Operation

```ts
SourceInfo = {
  kind: 'local' | 'github' | 'git' | 'npm' | 'unknown' | 'other' | 'installed'
  label: string                  // source 原文（相对路径/仓库地址）或安装路径
  resolved: boolean              // 是否已解析到本地目录
  cloneRequired: boolean         // 安装/详情前是否需要 git 克隆（允许联网后才解析）
  reason: string | null          // 不可解析的中文原因
}

UpdateInfo = {
  state: 'none' | 'available' | 'current' | 'installed-newer' | 'unknown'
  currentVersion: string | null  // 已安装版本（未安装为 null）
  latestVersion: string | null   // 市场声明版本
  checkedBy: 'declared' | 'none'
  reason: string | null
}

Operation = {
  id: string
  kind: 'market-add' | 'market-refresh' | 'market-remove' | 'install' | 'uninstall'
      | 'enable' | 'capability' | 'update' | 'update-all' | 'rollback' | 'describe'
  key: string | null
  marketId: string | null
  startedAt: string
  clientOpId: string | null
}
```

- `update` 是**声明级**检测：市场条目 `version` vs 安装记录 `version`（`classifyUpdate`）；
  缺 `version` 或不可比较 → `unknown`，**不得**当作可更新；
- 未安装条目 `update.state='none'`；孤立已安装项 `checkedBy='none'` + `unknown`。

### 2.7 DescribeResult（`GET|POST /describe`）

```ts
{
  key: string
  name: string
  version: string | null
  versionValid: boolean
  format: string
  market: MarketRef | null       // 孤立已安装项为 null
  orphan: boolean
  display: Display
  source: SourceInfo
  installable: boolean
  blockedReason: string | null
  installed: { installed: boolean, key: string | null, version: string | null, enabled: boolean | null }
  update: UpdateInfo
  manifest: {
    name, version, description,
    author: Author | null, homepage: string | null, repository: string | null,
    license: string | null, keywords: string[], category: string | null,
    icon: string | null,
    rawKeys: string[]
  } | null
  capabilities: {
    skills:     Array<{ name, description, enabled }>
    commands:   Array<{ name, rawName, hostName, description, argumentHint, enabled }>
    hooks:      Array<{ event, host: string|null, mode: string, canBlock: boolean,
                        entries: number, enabled: boolean, effective: boolean, reason: string }>
    mcpServers: Array<{ name, transport, command, args: string[], url: string,
                        enabled: boolean, effective: false, reason: string }>
  } | null                       // 来源无法解析时 null
  hooksSource: string            // hooks 配置来源（plugin.json#hooks / hooks/hooks.json / ''）
  mcpSource: string              // MCP 清单来源（plugin.json#mcpServers / .mcp.json / ''）
  counts: { skills, commands, hooks, mcpServers }
  warnings: string[]
}
```

- 已安装项读**安装目录**；未安装项解析源目录（`resolvePluginSourceRoot`），
  解析不到时 `capabilities:null` + `manifest:null` + 可读 `source.reason`/`blockedReason`；
- 能力分区**剔除技能/命令正文**（只给 name/description/argumentHint）；
- `hooks.effective`：事件已映射宿主 + hooks 运行时已挂载 + subprocess 可用，三者同时满足；
  未映射事件给出宿主原因；`mcpServers.effective` 固定 `false` 并给宿主原因
  （DSH 当前无 MCP 运行时挂载接口）。

## 3. 路由表

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/store` | 商店整体快照（§2.1） |
| GET | `/describe?key=` 或 `?market=&name=` | 详情，**不联网** |
| POST | `/describe` | 详情；`{key?\|market?,name?,fetch?}`，`fetch:true` 才联网 |
| GET | `/icon?key=&v=` | 图标二进制（raster） |
| POST | `/market/add` | 添加市场（可自动识别来源类型） |
| POST | `/market/preview` | 预览市场清单（只读，不登记） |
| POST | `/market/refresh` | 刷新一个或全部市场 |
| POST | `/market/remove` | 移除市场（允许保留已安装插件） |
| POST | `/install` | 安装插件 |
| POST | `/uninstall` | 卸载插件 |
| POST | `/enable` | 启用/禁用插件 |
| POST | `/update` | 更新单个插件 |
| POST | `/update-all` | 全部更新 |
| POST | `/rollback` | 回滚到上一版本或指定历史版本 |
| POST | `/capability` | 逐项能力启停 |

已删除：`GET /state`、`GET /plugin`、`GET /markets`（客户端 v0.3.0 起只使用 `/store`）。

### 3.1 GET /store

无参数。返回 `{ok:true,data:StoreSnapshot}`。只读、零网络；已安装信息从内存 state 读取，
每个已安装项额外读一次安装副本的 `plugin.json` 以生成 display 兜底。

### 3.2 GET /describe · POST /describe

请求：

```json
{ "market": "local-market-8d6d84e8", "name": "demo-claude", "fetch": false }
```

- `key` 优先；`name` 全局唯一时可由 host 推导；
- `fetch:true`（仅 POST）：先刷新所属市场（按 id），再允许 git 源克隆；失败降级为
  `warnings`/`source.reason`，不 500；
- 该接口不安装、不写 `state.json`；`fetch:true` 最多写市场缓存（url 快照/git clone）。

### 3.3 GET /icon

- 只接受 `key`（`v` 仅用于缓存失效）；返回市场根或安装根内的 raster 文件；
- 响应头：`Content-Type`（png/jpeg/webp/gif）、`X-Content-Type-Options: nosniff`、
  `Cache-Control: public, max-age=300`；文件上限 256 KiB；
- 不存在/越界/符号链接/非 raster（含 SVG）→ `404 {ok:false,error:'未找到图标',code:'not_found'}`；
- 回环限制天然继承 §1.3。

### 3.4 POST /market/add

请求（`type` 可省略，省略时用 `detectSource` 自动识别）：

```json
{ "location": "E:\\my-market", "name": "可选别名", "format": "claude" }
```

响应：

```json
{
  "message": "市场已添加：fixture-claude-market",
  "market": { "...": "MarketSummary" },
  "detectedType": "local",
  "format": "claude",
  "pluginCount": 3,
  "refreshError": null
}
```

- 完全相同的 `type+location` → 409 `conflict`（文案「市场已存在：<id>」）；
- **等价来源查重**：同一来源的不同书写形式（裸仓库 URL vs `.git` 后缀 vs
  `raw.githubusercontent.com` 清单直链 vs 本地路径形式）→ 409 `market_exists`
  （文案「该市场已存在：<title>（<location>）。如需重新添加，请先移除原市场。」，
  判定用 `marketLocationKey` 规范化，见 `src/location-key.ts`；不改 id 派生）；
- 地址无法识别 → 400/404 + 中文原因；
- 首次刷新失败：url 市场保留记录 + `refreshError`；local/git 首次失败回滚记录并返回错误
  （与既有 CLI 行为一致，便于重试）。

### 3.5 POST /market/preview

只读预览：解析市场清单并返回插件条目，**不写 marketplaces.json / state.json**
（git 源仅在 `tmp/preview-<sha1>` 留一个克隆缓存，宿主启动时清理；`refresh:true`
丢弃缓存重取）。GitHub 仓库地址优先用
`raw.githubusercontent.com/<o>/<r>/<ref>/<清单路径>` 直取（按
FORMAT_PRIORITY × marketplaceFiles 顺序探测），无 clone；非 GitHub 或 raw 未命中
→ 浅克隆兜底。

请求：

```json
{ "location": "https://github.com/anthropics/claude-plugins-official", "refresh": false }
```

响应：

```json
{
  "type": "git",
  "via": "raw",
  "location": "https://github.com/anthropics/claude-plugins-official",
  "format": "claude",
  "name": "claude-plugins-official",
  "title": "…",
  "description": "…",
  "pluginCount": 317,
  "plugins": [ { "name": "…", "version": "…", "display": { "title": "…", "description": "…" }, "installable": true } ]
}
```

- 不进操作互斥锁（只读 tmp，长预览不阻塞安装）。

### 3.6 POST /market/refresh

请求 `{ "id": "可选；省略=全部" }`。响应：

```json
{
  "message": "已刷新 2 个市场，1 个失败",
  "refreshed": [ { "...": "MarketSummary" } ],
  "failures": [ { "id": "git-…", "error": "git fetch 失败（退出码 1）：…", "code": "git_error" } ],
  "stats": { "total": 3, "ok": 2, "failed": 1 }
}
```

- **部分失败仍 200**（含单 id 的失败：只看 `failures`）；未知 id → 404。

### 3.7 POST /market/remove

请求 `{ "id": "…" }`。响应：

```json
{ "message": "已移除市场：git-…", "orphaned": ["demo-claude"] }
```

- 允许移除仍有已安装插件的市场（ADR-0003）：安装副本、状态、启停与能力偏好全部保留，
  插件转为孤立项；`orphaned` 返回将被孤立的插件名，供客户端提示/确认；
- 不再返回「请先卸载」错误。

### 3.8 POST /install

请求（`key` 优先）：

```json
{ "market": "local-market-8d6d84e8", "name": "demo-claude", "force": false, "refresh": true }
```

响应：

```json
{
  "message": "安装完成：demo-claude@0.1.0",
  "installed": {
    "key": "local-market-8d6d84e8/demo-claude", "name": "demo-claude", "version": "0.1.0",
    "format": "claude", "market": "local-market-8d6d84e8", "enabled": true,
    "installedAt": "…", "installedPath": "…",
    "capabilities": { "skills": ["greet"], "commands": ["hello"], "hooks": [], "mcpServers": [] },
    "previousVersions": []
  },
  "replaced": false,
  "warnings": []
}
```

- `refresh:false` 跳过「安装前刷新市场」（catalog 刚刷新过时用）；
- 同版本已装且非 `force` → 409 `conflict`；清单 name 与条目不一致 → 409；
- 来源不可安装 → 409 `source_unavailable` / 422 `version_invalid`（文案沿用 CLI）。

### 3.9 POST /uninstall · /enable · /rollback · /capability

```json
// /uninstall  { "key": "…" | "name": "…" }
{ "message": "已卸载：demo-claude@0.1.0", "key": "local-market-8d6d84e8/demo-claude" }

// /enable     { "key": "…", "enabled": true }
{ "message": "demo-claude 已启用", "key": "…", "enabled": true }

// /rollback   { "key": "…" }          省略 version：回滚到最新可用历史版本
// /rollback   { "key": "…", "version": "0.1.0" }   指定目标历史版本（必须在 previousVersions 中）
{ "message": "已回滚 demo-claude：0.2.0 → 0.1.0", "key": "…", "version": "0.1.0", "previousVersion": "0.2.0" }

// /capability { "key": "…", "kind": "skills|commands|hooks|mcpServers", "capability": "…", "enabled": false }
{ "message": "禁用 greet", "key": "…", "plugin": "…", "disabledCapabilities": {
    "skills": ["greet"], "commands": [], "hooks": [], "mcpServers": [] } }
```

### 3.10 POST /update

请求 `{ "key": "…", "force": false, "refresh": true }`。响应：

```json
{
  "message": "已更新 demo-claude：0.1.0 → 0.2.0",
  "changed": true,
  "key": "local-market-8d6d84e8/demo-claude",
  "previousVersion": "0.1.0",
  "record": { "...": "同 install.installed" },
  "warnings": []
}
```

- 市场缺失 → 404/409「来源市场已不存在」；源不可解析 → 409；
- 版本不高于当前且非 force → 200 `changed:false` + 中文文案；
- `unknown` 不可比较时不得报「已是最新」，返回可读说明。

### 3.11 POST /update-all

请求 `{ "force": false, "keys": [] }`（`keys` 省略 = 全部已安装项）。服务端行为：

1. 单写操作内执行（其它写请求 409）；
2. 按插件所属市场**去重刷新一次**；
3. 只对声明级 `update.state === 'available'` 的插件串行执行更新（`refresh:false` 复用刷新结果）；
4. 单个失败不中断，聚合结果；
5. 结束后**一次** `saveState` + `syncRuntimes`。

响应：

```json
{
  "message": "全部更新完成：更新 1 个，跳过 1 个，失败 1 个",
  "succeeded": [ { "key": "…/a", "changed": true, "message": "已更新 a：0.1.0 → 0.2.0", "version": "0.2.0" } ],
  "failed":    [ { "key": "…/c", "error": "插件目录不存在：…", "code": "not_found" } ],
  "aborted": false,
  "marketFailures": [ { "id": "…", "error": "…", "code": "git_error" } ],
  "summary": { "total": 3, "updated": 1, "skipped": 1, "failed": 1, "markets": 2 }
}
```

孤立插件（来源市场已移除）不进入候选，计入 `skipped`。

## 4. 并发与操作态

- **全局单写**：同一时刻只允许一个写操作；重复提交返回 `409`：

```json
{
  "ok": false,
  "code": "operation_in_progress",
  "error": "另一个操作正在进行（update），请稍候重试",
  "details": { "operation": { "id": "op-…", "kind": "update", "key": "…", "startedAt": "…" } }
}
```

- 读接口（`/store`、`/describe` 非 fetch 分支、`/icon`）不加锁，看到的是上一次已提交状态；
- `POST /describe {fetch:true}` 会登记 `describe` 操作（可能刷新市场/克隆源），期间其它写请求 409；
- 在途操作通过 `StoreSnapshot.operations` 暴露，客户端可据此恢复 per-plugin loading；
- 不提供取消：目录复制与 `spawnSync` git 无中断点，MVP 只给「进行中」提示与重试。

## 5. 降级矩阵（实现约定）

| 情况 | 表现 |
|---|---|
| 市场条目缺 `version` | `update.state='unknown'` + reason；不显示可更新 |
| 版本不可比较（非 semver/带 v 前缀） | `versionValid` 相应为 false / `unknown`，不显示可更新 |
| local 源目录缺失 | `source.resolved=false` + reason；`installable=false` + `blockedReason` |
| github/git 源未缓存 | `source.cloneRequired=true`（describe `fetch:true` 才克隆） |
| url 市场相对路径源 | `resolved=false`；describe `capabilities:null`；不可安装 |
| 来源市场被移除（孤立） | `installed[].orphan=true`、`market=null`；隐藏更新入口；卸载/启停/回滚可用 |
| 图标缺失/越界/非 raster/SVG | `icon.kind='none'` 或 `/icon` 404；客户端用占位块 |
| `https://` 图标 | `icon.kind='http'`，客户端直接加载，失败回退占位 |
| 未映射的 hooks 事件 | `effective=false` + 宿主原因 |
| MCP | 清单展示但 `effective=false` + 「宿主无运行时挂载接口」 |
| 迁移失败 | `/store.migrationError` 返回原因，读取继续（旧文件保留） |

## 6. 存储 schema v2

`state.json` 与 `marketplaces.json` 的 `schemaVersion` 均为 `2`。启动时
`lib/migrate.js` 的 `runMigrations(store)` 在读取之前执行 1→2 迁移：

- 迁移前把原文件备份到 `<home>/logs/migrations/v1-<time>/`；
- 市场记录补齐 `title`（上游 name）、`display{title,description,owner}`，条目补齐 `meta`，
  移除旧内存字段 `root`；
- 已是 v2 跳过；未知 schemaVersion 抛错，由 hub 捕获为 `migrationError`（原文件不动）；
- 不联网。

`marketplaces.json` 的市场记录字段：`id/name/title/type/location/format/addedAt/
lastRefreshed/display/owner/featured/plugins[]/refreshError/warnings`；
`plugins[]` 字段：`name/version/description/source/installable/meta/warning?/origin?`。

## 7. 宿主能力前提（实现依赖）

| 能力 | 宿主接口 | 本插件用法 |
|---|---|---|
| commands | `ctx.commands.register` | `/agent-plugin` 运维命令 + 插件命令 `<plugin>-<command>` |
| skills | `ctx.skills.registerProvider` | 动态列出启用插件的技能（`invalidate()` 刷新缓存） |
| hooks | cordis 事件 + `ctx.subprocess` | Claude hooks 映射到 `tools/pre-execute` 等宿主事件 |
| MCP | 无运行时挂载接口 | 只解析/展示清单并标注「未生效」，不 spawn 进程 |

宿主服务是否就绪会反映在 `/store.runtime`；`StoreSnapshot.warnings` 保留最近错误。
## 8. 记忆数据面（memory，schema v1）

与商店面板共用 `/agent-plugin/api` 前缀、信封、回环同源校验与单写语义；数据目录为
`<home>/memory/`，与 `state.json` 等商店数据互不依赖。

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/memory/state` | `{settings, projects[], stats}`；projects 含 `entryCount`，stats 含最近会话注入/命中率 |
| GET | `/memory/list` | 查询参数 `scope=global|project`、`project`、`query`、`type`、`includeArchived=0|1` |
| GET | `/memory/get` | 查询参数 `scope`、`project`、`id` |
| POST | `/memory/save` | `{scope, project?, id?, name, description, type, content, tags?, importance?, supersedes?}`；同指纹只强化 |
| POST | `/memory/status` | `{scope, project?, id, status: active|stale|archived}` |
| POST | `/memory/delete` | `{scope, project?, id}` |
| POST | `/memory/settings` | 部分字段：`captureEnabled`/`captureSessionEnd`/`injectEnabled`/`indexLimitGlobal`/`indexLimitProject`/`maxChars` |
| POST | `/memory/export` | `{scope, project?}` → `{filename, content}` |

条目字段：`id/name/description/type/scope/project/tags/importance/status/reinforcement/
obsoleteVotes/supersedes/originSessionId/createdAt/updatedAt/content`。类型为
`preference|decision|gotcha|project|reference`；`stale` 不注入但仍可检索，`archived` 默认不可见。

模型侧同源能力：`memory_search` / `memory_get` / `memory_save` / `memory_forget` 工具、
`/remember`、`/forget`、`/memory` 命令，以及 `systemPrompt.context` 注入的有界索引。

项目身份文件：项目内 `.dsh/agent-extension/memory/config.json`（只含 `projectKey/identity/source`），
自动加入 `<git common dir>/info/exclude`。
