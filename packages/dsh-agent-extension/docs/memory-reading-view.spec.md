# 记忆详情面规格（宿主右侧栏原生双窗格）

> 实施级规格：下一上下文照此实施，不依赖历史会话。
> 基线版本：`dsh-agent-extension@0.0.1-preview.13`；宿主基线 DSH `0.2.2-rc.1`（commit `fcc0ad4`，本机副本 `.reference/deepseek-harness/`）。
> 决策依据：[`docs/adr/0003-memory-reading-view.md`](../../../docs/adr/0003-memory-reading-view.md)；术语见 [`GLOSSARY.md`](../../../GLOSSARY.md)。
> 宿主侧栏 API 为 pre-stable（`AGENTS.md:7`、`packages/README.md:90`），实施前必须完成 §10 的 Spike。

## 1. 一句话

点击记忆条目后退出插件主面板，宿主右侧栏自动展开并分成两窗格：**左窗格 = 插件注册的"记忆详情"页签**（展示并可有限调整元信息），**右窗格 = 宿主文件预览页签**（只读渲染记忆正文 Markdown）。窄宽度不足以分屏时，降级为同窗格页签切换。

## 2. 背景与现状（证据）

- 现状：编辑记忆弹窗是 `MemoryView.tsx` 内联的 wide 弹窗（`src/client/MemoryView.tsx:1065-1262`），内容区只有一个 `<textarea rows={8}>`（`src/client/MemoryView.tsx:1203-1209`），正文以 Markdown 源码呈现；全库无预览组件、无 preview CSS 类、无预览 locale key。
- 痛点：记忆以阅读为主（由智能体随会话自动维护），但唯一的查看路径是"进入可编辑表单看源码"。
- 宿主内置 Markdown 渲染件 `MarkdownText`/`DetailDocument`（`@deepseek-ai/dsh-client-ui-primitives`）没有给第三方的 ctx/slot 通道；直接 `import '@deepseek-ai/*'` 会被本仓库 purity 门禁拒绝（`tsdown.config.ts:107-121`）并违反 `AGENTS.md` 硬规则与 `docs/PLUGIN-DEV.md` §3.5。**不自造渲染器、不破门禁**是本规格的硬约束。
- 唯一合规的复用路径：宿主右侧栏的文件预览（`ui-sidebar-documentpreview` 对 `.md` 使用宿主 `MarkdownText`），只读；以及第三方自定义侧栏页签（`priority: 'extension'` + 键控槽 `sidebar.right.pane.tab`）。

## 3. 术语

- **记忆详情面**：参数页签 + 预览页签组成的阅读界面（见 GLOSSARY）。
- **参数页签**：插件注册在宿主右侧栏的自定义页签，展示记忆元信息并允许有限调整。
- **预览页签 / 预览文件**：宿主文件预览页签，渲染由宿主半生成的一次性「仅正文」Markdown 文件。
- **有限调整**：仅名称/描述/类型/标签/重要性/状态可改；正文只读。

## 4. 决策摘要

| 事项 | 决策 |
| --- | --- |
| 阅读面 | 宿主右侧栏文件预览（只读），不自造 Markdown 渲染器 |
| 参数面 | 插件自定义侧栏页签（自绘 React），不占用宿主侧栏现有能力 |
| 双列 | `openResource(..., { preferNewPane: true })` 原生分屏；不可分屏时同页签切换 |
| 预览数据 | 宿主半生成「仅正文」临时 `.md`，剥掉 frontmatter/YAML 头 |
| 正文人工编辑 | v1 不做（宿主预览只读，按用户规则"支持就沿用，不支持就不做"）；新建仍用现有弹窗写正文 |
| 元信息编辑 | 参数页签内直接改，`/memory/save`、`/memory/status` 提交 |
| 列表点击 | 打开详情面（不再打开编辑弹窗）；新建按钮仍开弹窗（仅创建） |
| 依赖 | 零运行时依赖；不新增第三方库；不改宿主侧栏现有行为 |

## 5. 交互与时序

### 5.1 打开详情（列表卡片点击 / Enter / Space）

```
controller.openMemoryDetail({ scope, project, id })
  ├─ ctx.layout.selectPanel(null)              // 退出插件主面板，让右侧栏挂载
  ├─ 等待 ctx.sidebarRight.mounted 有值（轮询，上限 1s）
  │    ├─ 超时 → toast(memoryDetailNoSession) + selectPanel(PANEL_ID) 回面板，中止
  ├─ ctx.sidebarRight.openTab('agent-extension-memory', { params })   // 自动展开栏并聚焦
  ├─ GET /memory/preview-file?id&scope&project → { path, name }
  │    └─ 正文为空 → 不打开预览；参数页签显示 memoryDetailEmptyContent
  ├─ address = sessionFileAddress(sessionId, path)                    // §7.4
  └─ ctx.sidebarRight.openResource(address, { preferNewPane: true })
       ├─ 宽度足够：右侧新窗格 = 宿主 md 预览（只读）
       └─ 不可分屏 / 达到窗格上限：同窗格追加预览页签，用户可切换
```

要点：

- 动作写在 controller/actions（插件 client 模块的 `apply` 生命周期内），**不写在面板组件里**：点击瞬间面板会被卸载，异步续体必须存活。
- `openTab` 同一 `kind` 在同一窗格去重；再次点击另一条记忆时页签复用，`navigation.revision` 自增，页签 body 据此重新取数（`useTabInfo().tab.navigation`）。
- 宿主侧栏无 `closePane`/`unsplit` API；撤销分屏 = 用户关掉该窗格的全部页签。v1 不提供"关闭预览窗格"按钮。
- 打开详情会离开「智能体扩展」主面板：这是宿主布局的硬约束（主面板激活时 `mounted === undefined`，整条右侧栏不渲染），规格接受该交互代价。

### 5.2 参数页签

状态：`loading → ready | error`（复用 `LoadingBlock` / `errorBox` + 重试）。

- 头部：记忆名称（16px/500，可换行）+ 类型徽章 + 状态徽章（active 不挂）。
- 页内出口：头部上方提供「返回」按钮（复用 `back` locale），`selectPanel(PANEL_ID)` 切回插件面板并落在记忆分区；宿主主面板与右侧栏互斥，这是离开详情面的页内路径。
- 可编辑字段：名称、描述（input）；类型（共享 `Select`）；重要性（range 0–100，沿用 `memory.module.css` 的 `.rangeInput` 约定：`--dsw-alias-brand-primary` 填充、`--dsw-alias-border-l3` 未填充轨道、16px 实心圆柄）；标签（chip 编辑，回车/逗号成 chip，× 删除）。
- 只读区：正文不在此页签展示，仅一行提示"正文在右侧预览中查看"。
- 动作区：`保存`（仅脏态可用，保存中显示 `Spinner`）；状态动作 `停用/恢复`、`归档`（ghost）；`删除`（danger，两步内联确认，复用现有 `.confirmArea` 样式）。
- 页签底部一行弱提示：`memoryDetailAutoMaintained`（"记忆由智能体随会话自动维护，正文只读"）。
- 保存后 toast `memorySaved`；状态变更后 toast `memoryStatusDone`；删除成功后 toast `memoryDeleted` 并调用页签自带的 `tab.actions.close()` 关闭自身。
- 切换记忆（navigation revision 变化）时若有未保存改动：直接丢弃并 toast `memoryDetailDirtyDiscarded`（v1 不做编辑器级冲突处理）。
- 记忆不存在/已删除（GET 404）：页签内显示 `memoryDetailMissing` 空态 + 关闭页签按钮。

### 5.3 预览页签

- 只读，样式由宿主负责；插件不注入任何预览样式。
- 页签标题来自文件名：预览文件命名为 `<清洗后的记忆名称>.md`，因此宿主标题≈记忆名称。
- 正文为空：不打开预览页签（见 5.1）。
- 记忆删除：删除预览临时文件（best effort）；宿主已打开的预览页签可能显示失效，属可接受降级，不在 v1 处理。
- 刷新：正文不可人工修改，因此无需刷新预览；页签 body 挂载时调用一次 `/memory/preview-file`（幂等覆写同一路径）即可修复被清理的临时文件。

## 6. 数据面改动

### 6.1 新增 GET 路由 `/memory/preview-file`

- 入参：`scope`、`project`（同现有 `projectOf` 规则）、`id`。
- 行为：读取条目 → 把 `entry.content.trim()` 写入临时文件 → 返回 `{ path, name }`（绝对路径、清洗后的文件名）。
- 路由注册：加入 `MEMORY_GET_ROUTES`（`src/memory-routes.ts:26`），dispatch 分支位于 `/memory/get` 之后。
- 存储实现：`MemoryStore` 新增 `previewFile(scope, project, id)`；纯函数放新模块 `src/memory/preview.ts`（便于单测）：
  - `previewRoot()` = `path.join(os.tmpdir(), 'dsh-agent-extension-memory-preview')`；
  - 每条目一个目录 `<root>/<id>/`，文件 `<root>/<id>/<fileName(entry.name, id)>.md`；
  - `fileName()`：去掉 `\ / : * ? " < > |` 与控制字符，折叠空白，裁剪到 60 字符，空则 `memory-<id>`；Windows 保留名（`CON`、`PRN` 等）追加下划线；
  - 写入前 `mkdirSync(..., { recursive: true })`，`writeFileSync` 覆写；内容只含正文（`trim() + '\n'`），**不含 frontmatter**；
  - 清理：写入时顺手删除 root 下 mtime 超过 7 天的条目目录（best effort，忽略错误）；`/memory/delete` 成功后删除该 id 目录（best effort）。
- 幂等：同一 id 的路径稳定，重复调用覆写同一文件；名称变化会导致路径变化（旧目录由 7 天清理兜底）。

### 6.2 为什么不直接预览记忆原文件

记忆文件是 frontmatter(YAML) + 正文（`src/memory/store.ts:98-123`），宿主的 `.md` 预览会把 YAML 头当正文渲染。规格要求阅读面只呈现正文与元信息，因此必须喂「仅正文」的派生文件。

### 6.3 客户端地址构造

新模块 `src/client/resource-address.ts`，逐字镜像宿主 `packages/util/workspace-path/src/file-address.ts:44-68` 的编码规则：

```ts
// 段编码：encodeURIComponent 后把 %3A 还原为 ':'（盘符字面量）
function encodeSegment(segment: string): string {
  return encodeURIComponent(segment).replace(/%3A/gi, ':')
}
// 路径整体：反斜杠归一为正斜杠、去掉前导 './'，逐段编码
export function sessionFileAddress(sessionId: string, path: string): string {
  const normalized = path.replace(/\\/gu, '/').replace(/^(?:\.\/)+/u, '')
  return `dsh-resource://file/session/${encodeSegment(sessionId)}/${normalized.split('/').map(encodeSegment).join('/')}`
}
```

单测必须覆盖：Windows 盘符（`: ` 保留）、空格、`#`、`?`、中文、UNC 不需要（临时目录不会是 UNC，但不得崩溃）。

## 7. 客户端接入

### 7.1 服务注入

- 客户端模块 `inject`：追加 `'layout'`、`'sidebarRight'`、`'sidebarRightTabs'`（现为 `['slots', 'locale']`，`src/client/index.ts:22`）。
- `package.json` 的 `dsh.client.inject` 追加 `@deepseek-ai/dsh-client-ui-sidebar-right`（对照官方 `client/ui-sidebar-files/package.json` 的声明格式；该字段是包级信息边，不是服务名）。
- `src/client/client-context.ts` 按现有"结构化声明"风格补三个接口（禁止 `import '@deepseek-ai/*'`，类型导入也不使用）：

```ts
export interface ClientSidebarRight {
  mounted?: { get?(): string | undefined; value?: string }        // ObservableSnapshot<SessionId|undefined>
  openTab(kind: string, options?: { paneId?: string; preferNewPane?: boolean; params?: Record<string, unknown> }): void
  openResource(address: string, options?: { paneId?: string; preferNewPane?: boolean }): void
  split(paneId?: string): string | undefined
}
export interface ClientSidebarRightTabs {
  register(definition: Record<string, unknown>): unknown
}
export interface ClientLayout {
  selectPanel(id: string | null): void
}
```

`mounted` 的取值形态在 Spike 中按 `ObservableSnapshot` 实际接口确认，适配成本模块内一个 `readMounted()` 函数，不外泄。

### 7.2 页签注册（`src/client/index.ts`）

```ts
const MEMORY_DETAIL_TAB = 'agent-extension-memory'

ctx.effect(() => ctx.sidebarRightTabs.register({
  id: MEMORY_DETAIL_TAB,
  kind: MEMORY_DETAIL_TAB,          // 页面型页签，无 patterns；title 与 body 的 key 都必须是 id
  multiple: false,
  keepMounted: true,                // 侧栏收起时保留未保存的表单状态
  title: () => t('memoryDetailTabTitle'),
}), 'dsh-agent-extension: memory detail tab')

ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register({
  name: 'sidebar.right.pane.tab',
  key: MEMORY_DETAIL_TAB,
  locale: NS,
  inject: () => ({ hooks: { hub: controller.store }, actions: controller.actions }),
}, MemoryDetailTab))
```

注意：id/kind 与槽 key 不一致会落入宿主的 `tab.unavailable` 兜底；不注册 `guide`（否则页签可能不可关）；`title` 一律 thunk。

### 7.3 页签 body

- 新文件 `src/client/memory-detail.tsx`（组件）+ `memory-detail.module.css`；组件保持纯 props（`t`、`sessionId`、`useTabInfo` 等宿主标准 props + 本插件 inject 面 `{ hooks, actions }`），不直接碰 ctx。
- 参数读取：优先 `useTabInfo()?.tab?.navigation?.params`（`{ scope, project, id }`，打开页签时快照、持久化后可还原）；缺失时回退 controller store 里的最近目标。
- 取数：`GET /memory/get`；保存：`POST /memory/save`（带 `id`）；状态：`POST /memory/status`；删除：`POST /memory/delete`。
- 宿主侧栏无内置标题栏：页内自绘头部（名称 + 徽章）与动作区；body 外层 `height:100%`、`overflow:hidden` 由宿主提供 → 组件根节点必须自管纵向滚动（`overflow-y:auto`，`overscroll-behavior: contain`）。
- 宽度自适应：侧栏分屏后单窗格约 20%–80% 宽，用容器查询（`@container`）在窄于 ~360px 时把两列表单降为单列。

### 7.4 视图侧改动（`src/client/MemoryView.tsx`）

- 卡片点击（`MemoryView.tsx:863-875`）改为 `actions.openMemoryDetail({ scope, project, id })`；保留 Enter/Space 可达。
- 删除详情编辑路径：`openEntry`（`:492-520`）、编辑态保存分支、弹窗内的状态/归档/删除动作（`:1211-1255`）从弹窗迁到详情面；弹窗只保留**新建**（`creating === true`）分支。
- 新建保存成功后刷新列表，不自动打开详情（避免打断连续录入）。
- `saveEntry` 拆成 `createEntry`（面板内）与 `saveDetailMeta`（详情页签）两个动作，避免共享表单状态。

## 8. UI 规格（参数页签）

只消费 `--dsw-alias-*` token 与既有共享控件（`controls.tsx` 的 `Button`/`IconButton`/`Select`/`Badge`/`Spinner`/`EmptyBlock`/`LoadingBlock`）。

| 元素 | 规格 |
| --- | --- |
| 根容器 | `padding: 16px; display:flex; flex-direction:column; gap:12px; overflow-y:auto; overscroll-behavior:contain; font-size:14px; color: var(--dsw-alias-label-primary)` |
| 名称 | 16px / 500 / `label-primary`；`overflow-wrap:anywhere` |
| 徽章行 | `gap:6px`，复用 `Badge`（类型 plain、状态 tone） |
| 字段标签 | 12px / 500 / `label-secondary`（与 `memory.module.css:416-420` 一致） |
| 输入框 | 高 32–36px、`0.5px solid var(--dsw-alias-border-l3)`、`var(--dsw-radius-sm)`、背景 `var(--dsw-alias-bg-layer-2)`（比侧栏底高一层；实施时以宿主 files 面板输入框为对照核对双主题对比度） |
| 聚焦 | `outline: var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color, var(--dsw-alias-state-business-primary))` |
| 说明/提示 | 11px / `label-tertiary` |
| 分隔 | `0.5px` / `border-l2`（分区之间） |
| 危险确认条 | 复用 `memory.module.css` 的 `.confirmArea`（error 10% 底 + 35% 边框） |
| hover | 一律包在 `@media (hover: hover)` |
| 圆角 | 全圆元素必须配 `corner-shape: round`（仓库样式守卫） |

表单整体规则：不新增自造强调色；原生 `<select>`/`<input type=range>` 不得裸用（跨主题失效），分别走共享 `Select` 与既有自绘 range 样式。

## 9. locale

`locales.ts` 以 `zh` 为键集权威，8 语言（zh/en/ja/es/fr/de/ru/pt）同步新增，缺 key 会编译失败。新增键：

| key | zh | en |
| --- | --- | --- |
| `memoryDetailTabTitle` | 记忆详情 | Memory detail |
| `memoryDetailAutoMaintained` | 记忆由智能体随会话自动维护，正文只读。 | Memories are maintained by the agent; content is read-only. |
| `memoryDetailPreviewHint` | 正文在右侧预览中查看 | Content is shown in the preview pane |
| `memoryDetailNoSession` | 预览不可用：请先打开一个会话 | Preview unavailable: open a conversation first |
| `memoryDetailPreviewFailed` | 预览打开失败：{message} | Could not open the preview: {message} |
| `memoryDetailEmptyContent` | 暂无正文 | No content yet |
| `memoryDetailMissing` | 记忆不存在或已删除 | This memory no longer exists |
| `memoryDetailDirtyDiscarded` | 未保存的修改已丢弃 | Unsaved changes were discarded |
| `memoryDetailReadError` | 无法读取记忆：{message} | Could not load this memory: {message} |

其余文案复用既有键（`memorySave`、`memorySaved`、`memoryLoading`、`memoryRetry`、`memoryDeactivate`、`memoryRestore`、`memoryArchive`、`memoryDelete`、`memoryDeleteConfirm`、`memoryDeleteDescription`、`memoryDeleted`、`memoryStatusDone`、`memoryField*`、`memoryImportanceHint`、`memoryTagsHint`、`cancel`、`close`）。

## 10. 实施步骤

0. **Spike（先做，真机）**：在 `zdebug` 宿主用临时最小代码验证四件事——① 第三方页签注册后能在右侧栏渲染自定义 React；② `openTab` 携带自定义 params，body 能从 `useTabInfo().tab.navigation.params` 读到；③ 主面板执行 `selectPanel(null)` 后 `mounted` 何时有值、`openTab` 是否成功；④ `openResource` + `preferNewPane` 能把临时 `.md` 绝对路径渲染成 Markdown 分屏。Spike 代码不入库；任一失败先回到 ADR 重新选型。
1. 数据面：`src/memory/preview.ts` + `MemoryStore.previewFile` + `/memory/preview-file` 路由 + 单测（正文剥离、命名清洗、路径稳定、幂等覆写、删除清理）。
2. 客户端接入：`client-context.ts` 接口、`inject`、页签注册、`resource-address.ts` + 单测、controller 新增 `openMemoryDetail` 与时序编排（mounted 轮询、超时回退）。
3. 详情面 UI：`memory-detail.tsx` + `memory-detail.module.css` + 组件测试（见 §11）。
4. 视图改造：列表点击接线；弹窗只留创建；移除详情编辑相关 state/handlers；更新既有组件测试。
5. locale ×8。
6. `npm run check && npm test && npm run build`。
7. 真机验证（§11.3）。
8. 版本 `0.0.1-preview.14`、`node scripts\build-index.mjs`、commit + push（禁止 Co-Authored-By）。
9. 文档同步：`docs/HOST-API.md` 补 `/memory/preview-file`；`docs/memory-roadmap.md` 记录本阶段；包 README 若提及编辑弹窗则同步。

## 11. 测试矩阵

### 11.1 离线

- `tests/memory.preview-file.spec.ts`：剥离 frontmatter、内容 trim、文件名清洗（非法字符/空名/保留名）、同 id 路径稳定、重复调用覆写、删除清理（用临时目录，测试后清理）。
- `tests/resource-address.spec.ts`：段编码规则（空格/`#`/`?`/中文/盘符冒号保留）、反斜杠归一、前导 `./` 去除。
- `tests/components.memory-detail.spec.tsx`：loading→ready；渲染名称/徽章/hint；改类型/重要性/标签/描述后保存命中 `/memory/save` 且带 `id`；状态动作命中 `/memory/status`；删除两步确认后才发 `/memory/delete`，成功后调用伪造的 `tab.actions.close`；无 params 时有兜底；错误态可重试；`memoryDetailNoSession` 指示。
- `tests/components.memory.spec.tsx`：点击卡片调用 `openMemoryDetail`（不再打开弹窗）；新建弹窗仍能保存并刷新列表；删除旧的详情编辑断言。
- 样式守卫（现有 spec）：只用 token、全圆配 `corner-shape: round`、0.5px 边框、hover 包裹。

### 11.2 真机（真实宿主，必做）

- 双主题（桌面 dark + zdebug light）、双宽度（宽屏双窗格 / 窄屏单页签回退）。
- 检查项：点击卡片 → 插件面板退出、右侧栏展开两窗格；左页签可编辑并保存（刷新列表可见）；右窗格渲染 Markdown 且**看不到 frontmatter**；类型/重要性/标签修改持久化；停用/归档/删除生效且页签关闭；无会话时给出明确提示且能回到面板；console error = 0；`curl` 复核 `/memory/preview-file` 返回路径存在。

## 12. 验收标准

1. 点击条目打开详情面：宽窗两窗格（左参数、右预览），窄窗降级同窗格页签切换。
2. 预览为宿主渲染的 Markdown，正文前不出现 YAML/frontmatter。
3. 参数页签可改名称/描述/类型/标签/重要性/状态并持久化；正文只读；新建仍可写正文。
4. 无前台会话或宿主侧栏不可用时：不崩溃、提示明确、可回插件面板。
5. 不新增第三方依赖、不改 purity 门禁、构建可过；离线 `check/test/build` 全绿。
6. 真机双主题实测通过，console error = 0。

## 13. 风险与回退

- **宿主 API pre-stable**：`sidebarRight`/`sidebarRightTabs`/`split`/`preferNewPane` 无兼容承诺；升级宿主后必须回归本规格 §5 全链路。Spike 失败的回退：保留现弹窗（无预览）并在 `memory-roadmap.md` 记录阻塞，不硬上。
- **主面板与右侧栏互斥**：这是产品级交互代价（点击条目会离开插件面板），已由 ADR 承接；若后续宿主提供主面板内嵌渲染件，可平移阅读面而不改数据面。
- **窄宽度**：`split()`/`preferNewPane` 受 room rule 限制，分屏可能失败；降级路径必须实现并测试。
- **临时文件**：系统 temp 目录权限异常时预览失败；路由需返回结构化错误，页签以 toast 提示，不阻塞参数编辑。
- **持久化页签**：侧栏布局按 session 持久化（localStorage），重载后预览页签可能指向已被清理的临时文件；页签 body 挂载时重新调用 `/memory/preview-file` 覆写修复。