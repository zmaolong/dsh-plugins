# 记忆面板下一阶段规划（自 0.0.1-preview.9 起）

> 本文档是自包含的实施规划：下一个上下文可直接按此实施，不依赖历史会话。
> 现状基线：`0.0.1-preview.9`（commit `e76b086`）。

## 本阶段：记忆详情面（preview.14，已完成）

把记忆的阅读路径从「编辑弹窗内看 Markdown 源码」改为宿主右侧栏原生双窗格；正文只读、元信息有限调整。
方案与取舍见 [ADR-0003](../../../docs/adr/0003-memory-reading-view.md)，实施级规格见
[`memory-reading-view.spec.md`](memory-reading-view.spec.md)。

- **交互**：点击列表卡片 → 退出插件主面板（`ctx.layout.selectPanel(null)`）→ 宿主侧栏展开
  「记忆详情」自定义页签 + 原生文件预览页签（`openResource(..., { preferNewPane: true })`）；
  宽度不足或已达 2 窗格上限时降级为同窗格页签切换。无前台 Session 时 toast 提示并回退插件面板。
- **数据面**：`GET /memory/preview-file` → `MemoryStore.previewFile`；`src/memory/preview.ts`
  生成只含正文的临时 `.md`（按 id 目录、幂等覆写、7 天清理、删除记忆时清理）。
- **参数页签**：`src/client/memory-detail.tsx`（名称/描述/类型/标签/重要性 + 保存、停用/恢复、
  归档、两步删除；切换记忆时丢弃未保存修改并提示）；页签 id/kind/槽 key 均为 `agent-extension-memory`。
- **列表改造**：点击卡片调用 `actions.openMemoryDetail`，弹窗只保留「新建」（写正文）。
- **依赖**：零新增运行时依赖；宿主侧栏 API 为 pre-stable，升级宿主后须回归
  [`memory-reading-view.spec.md`](memory-reading-view.spec.md) §5 全链路。
- **验收**：离线 `check/test/build` 全绿；zdebug 真机双主题、宽屏双窗格 + 窄屏降级、
  console error = 0；`GET /memory/preview-file` 返回路径存在且内容无 frontmatter。

## 背景：已完成（preview.5 → 9）

- 单行工具条：作用域切换 + 项目下拉（无计数后缀）+ 搜索框（右端类型筛选下拉，单选 radio）+ 新建 + 导出/设置/刷新图标组。
- 首页为全宽卡片网格（`entryGrid`，`auto-fill minmax(320px,1fr)`）；卡片含标题、重要度徽标（≥80 琥珀 pill）、描述（2 行截断）、类型/状态徽章（active 不挂状态徽章）、标签 chips（≤2 + `+N`）、时间戳（右下角，`margin-left:auto`）。
- 详情/编辑在 640px 宽对话框（`DialogShell` 新增 `wide` 档位）；新建与编辑共用；关闭方式：取消/X/Esc/点遮罩。
- 设置 + 统计在齿轮对话框；开关即时保存、数字输入防抖 500ms 保存、失败 toast 回滚（`patchSettings`/`persistSettings` + `savedSettingsRef`）。
- 八语言 locale 同步（zh/en/ja/es/fr/de/ru/pt）。

## 批次一：UI 收尾三件（小，半天内）

1. **空态加新建按钮**：`memoryListEmpty` 空态用 `EmptyBlock` 的 `action` 插槽挂「新建记忆」主按钮（点击 `startCreate`）。
2. **筛选状态 chip**：`typeFilter !== ''` 时在搜索框左侧显示一枚 chip（当前类型名 + ×），点击清除筛选；漏斗圆点保留。
3. **编辑弹窗表单升级**：
   - 重要性：数字输入 → range 滑块（0–100，右侧实时数值）；
   - 标签：逗号文本框 → chip 输入（回车/逗号成 chip、× 删除；`form.tags` 改 `string[]`，提交时不再 `parseTags`）。
   - 同步更新 `components.memory.spec.tsx` 中标签/重要性的 `fireEvent.change` 交互。

## 批次二：记忆体检（大件，本档主线）

### 目标

把记忆库从「能存」推向「可持续维护」：一个入口找出 **过时候选 / 疑似重复对 / 低价值条目**，支持勾选批量处理。

### 已确认的数据事实（勿再调研）

- 客户端类型见 `src/client/MemoryView.tsx`：`MemoryEntrySummary { id,name,description,type,tags[],importance,status,reinforcement,createdAt,updatedAt }`、`MemoryEntry` 另有 `content,originSessionId,supersedes[],obsoleteVotes`。
- 路由薄层 `src/memory-routes.ts`：GET `/memory/state|list|get`，POST `/memory/save|status|delete|settings|export`；`/memory/list` 服务端强制 `limit: LIMITS.entriesPerScope`（`memory-host.ts`），**无全量模式**。
- store 实现集中在 `src/memory-host.ts`（858 行），含 `store.list(scope, project, { query, type, includeArchived, limit })`。
- 批量处理复用现有 `/memory/status`（停用/归档/恢复）与 `/memory/delete`，无需新写端点。

### 设计决策（已定，勿重开辩论）

1. **体检计算放客户端**：拿到全量条目后在浏览器内做规则筛选与文本相似度（字符 bigram Jaccard）。200 条两两对比毫秒级，UI 迭代零 host 成本；host 端只需补「全量获取」能力。
2. **全量获取**：`/memory/list` 增加 `limit` query 参数，客户端显式传 `500`，服务端 `clampInt(…, 1, 500, LIMITS.entriesPerScope)`——一行改动，不新增端点。
3. **注入使用不参与体检**：`injectedUsed` 是会话级汇总，无 per-entry 记录，「僵尸条目」判定第一版砍掉，不猜数据。
4. **相似度**：`name + description + content` 拼接后取字符 bigram 集合，Jaccard ≥ 0.6 判疑似重复（阈值写成常量可调）；同 scope 同 project 内比较，排除归档条目互配。
5. **不做语义嵌入**：不引入模型依赖，保持零运行时依赖纪律。

### 体检规则（第一版）

| 类别 | 规则（纯客户端，基于 list 全量） |
|---|---|
| 过时候选 | `obsoleteVotes > 0` 或 `status === 'stale'` |
| 疑似重复 | 两两 bigram-Jaccard ≥ 0.6（排除 archived），输出条目对 |
| 低价值 | `status === 'active' && reinforcement <= 1 && 距 updatedAt > 30 天` |

### UI 设计

- 工具条新增「体检」图标按钮（icons.tsx 新增 lucide `clipboard-check` 路径），点开 `DialogShell wide` 体检对话框。
- 对话框内三组：每组标题 + 条目数；条目行 = 勾选框 + 卡片摘要（复用 `entryTitleRow`/`entryMeta` 样式）+ 建议动作文案；重复组展示成对并标注「保留哪条」的建议（保留 `importance` 高 / `reinforcement` 多者）。
- 底部批量操作栏：随选中数变化的「归档 / 停用 / 删除」（删除保留两步确认，`confirmDelete` 模式照搬编辑弹窗）。批量 = 循环调现有端点（条目规模小，无需批量端点），完成后 toast + 关闭 + 刷新列表。
- 全空结果展示「未发现问题」空态。

### 实施步骤

1. `memory-routes.ts`：`/memory/list` 接受 `limit` 参数并 clamp（改 `LIMITS` 用法处一行）。
2. `MemoryView.tsx`：新增 `auditOpen` 状态 + `openAudit()`（拉全量 list `limit=500&includeArchived=1`，逐 scope/project 计算）；抽 `audit.ts`（或并入 presentation.ts）放规则函数与纯函数测试。
3. `memory.module.css`：体检对话框样式（组标题、行勾选、批量栏），全部消费 `--dsw-alias-*` token。
4. `icons.tsx` 加 `clipboard-check`；八语言加 `memoryAudit*` 文案 key。
5. 测试：audit 规则纯函数单测（新 `tests/memory.audit.spec.ts`）；组件测试补体检对话框打开/勾选/批量归档调用 `/memory/status` 的断言。
6. `npm run check && npm test && npm run build` → 真机验证 → bump 版本 → `node scripts\build-index.mjs` → commit + push。

### 验收标准

- 离线全绿；真机 console error = 0。
- 三类规则各至少一条由测试覆盖；重复对阈值可被常量调整。
- 批量归档/删除只调用现有端点；删除有两步确认；操作后列表与统计即时刷新。
- 体检入口在全局/项目两种作用域下均可用（按当前 scope/project 计算）。

## 后续候选（未排期，勿顺手做）

- Markdown 导入（与导出对称，迁移外部记忆资产）。
- 「本次会话注入明细」视图（依赖 host 端 per-session 数据的进一步暴露）。
- 正式版 `0.0.1` 发布验收（preview 序列收敛后走真机完整回归 + dist-tag latest）。

## 实施环境备忘（本机实测踩坑）

- 桌面 CLI：`D:\Program Files\dsh\resources\runtime\cli\bin\dsh.cmd`（脚本找不到时设 `DSH_CLI` 指向它）。
- 调试：仓库根 `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\dev-debug.ps1 packages\dsh-agent-extension`（装进 zdebug 并启动；`-Profile desktop -NoBoot` 只装桌面）。
- **link 安装即时生效，但宿主缓存 client bundle**：改完 `npm run build` 后普通刷新可能拿旧产物，需重启调试宿主（taskkill 后重跑脚本）。
- 浏览器驱动：此宿主 webview 的 Playwright `click()` 经常超时，优先 `tab.playwright.evaluate` 里 `element.click()` 触发，坐标点击 `cua.click` 备用。
- 样式守卫测试：任何 `border-radius: 999px/50%/100%` 必须配对 `corner-shape: round`。
- locale 改动必须八语言同步（`Record<HubLocaleKey,…>` 缺 key 会编译失败）。
- 质量门三连：`npm run check && npm test && npm run build`（tsc 双程序 + vitest 离线 + tsdown 产物，`lib/` 必须随源码同提交）。
