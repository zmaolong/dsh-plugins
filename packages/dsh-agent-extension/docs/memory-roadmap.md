# 记忆子系统 v2 路线图（自 0.0.1-preview.17 起）

> 自包含实施规划：新上下文可直接按本文实施，不需要历史会话。
> 决策依据：[ADR-0005](../../../docs/adr/0005-memory-recall-v2.md)（召回与注入）、[ADR-0006](../../../docs/adr/0006-memory-capture-and-maintenance.md)（捕获与维护）、[ADR-0007](../../../docs/adr/0007-memory-schema-v2.md)（数据模型与迁移）、[ADR-0008](../../../docs/adr/0008-host-ui-primitives-channel.md)（官方 UI 通道）；术语见 [`GLOSSARY.md`](../../../GLOSSARY.md)。
> 基线：`0.0.1-preview.16`。
> 进度：B0–B4 已完成（preview.17–preview.21）；B5 已完成：正式版 `0.0.1` 发布（2026-11-10）。

## 目标与边界

把记忆从「能存能查」推到「**自用可信**」：写入可信（不误记、成本可控）、召回可信（注入少而准、工具必用）、地基可信（可测、可迁移、可诊断）。

- 范围：召回（A）+ 捕获（B）+ 架构（D）。
- **形态不扩**：仍是五类型事实库，不加 AGENTS.md 生成、不加 skill 化、不做团队共享。
- 不做 embedding/向量；零运行时 npm 依赖（允许宿主 Node 内置模块）。
- 验收：自用标准；每批一个 preview；护栏 = console error 0、离线 `check/test/build` 全绿、真机 web profile 双主题回归。

## 已定决策速查

1. 注入：会话首步渲染一次并按会话缓存；宿主按内容差异去重，压缩后自动重注入；面板「刷新索引」手动失效。
2. 分层：全局 `preference`/`decision`，项目 `gotcha`/`project`，每层 10–20 条、总预算 ~3,000 字符；索引行 `id · 类型 · 名称 · 80 字描述 · 重要性`。
3. 工具：`memory_search` 返回摘要、过滤下推、query 可空；`memory_get` ≤3 条 / 4,000 字符并提示截断；`memory_forget` 不再诱导二次调用。
4. 捕获：模型主动写（严格模式：先查重，仅显式要求或稳定事实才写）+ 会话末一次补漏；取消轮末自动提炼；捕获可撤销。
5. 维护 v1：面板「优化记忆」手动触发；进面板达阈值（新增/强化 ≥30 或距上次 ≥7 天）弹窗提示；LLM 研判流水线（规则预筛 → 结构化计划 → 校验执行），非真子代理。
6. 维护范围：全局 + 一个项目（最久未维护轮转），≤200 条候选 / ≤40k token；独立维护模型设置。
7. 清理：两阶段研判（90 天未用且 importance<60 → stale；再 7 天 → 删除或恢复）；pinned / importance≥80 / 被 supersedes 引用不删；删除前 trash 备份 30 天；维护流水可撤销。
8. 数据：schema v2（lastUsedAt/usedCount/confidence/pinned/mergedFrom/source）+ 自动迁移与备份；Markdown 真源；内存派生索引按 mtime+size 失效；利用率采样落盘；删除只写不读的 MEMORY.md。
9. 指标：注入利用率 + 检索命中率，废弃单一「命中率」。
10. UI：打开官方 primitives 四件套（MarkdownText / Toast / Modal / react-virtual），面板内正文只读预览 + 系统打开保留；带 require 降级。

## 批次

### B0 地基（preview.17，用户不可见，仅 bug 修复）

- **数据层**（`src/memory/types.ts`、`src/memory/store.ts`、新增 `src/memory/migrate.ts`）：
  - schema v2 字段与默认值；frontmatter 写 `schema: 2`；读取缺省视为 v1。
  - 迁移：v1 文件先备份到 `memory/.backup-v1-<timestamp>/` 再补字段；幂等；旧 `MEMORY.md` 移入备份并停止生成；settings/stats/projects 读取校验版本。
  - 缓存：目录 mtime → 文件 `mtime+size` 失效（手改生效）。
  - 语义修复：`tags: []` 清空；update / 强化路径处理 `supersedes`；未知 frontmatter 字段透传。
  - `store.search` 增加 `type`/`includeArchived`/`limit` 下推；写操作进程内串行化。
  - 统计数据面：`skipReasons`、`recentInjections`（≤50）、`recentCaptures`（≤50）与对应 store 方法。
- **运行时层**（`src/memory-host.ts` → `src/memory/runtime/{prompt,tools,commands,capture-session,stats,index}.ts`，`capture.ts`、`recall.ts`）：
  - 拆分并保留 `MemoryRuntime`/`MEMORY_TOOL_NAMES`/`asMemoryType` 兼容导出。
  - 会话快照注入 + `invalidateRecall(sessionId?)`；provider 不得写盘（项目身份解析移出装配路径）。
  - force 关键词只看当前轮；`agent/turn-stopping` 只做缓冲，`agent/disposed` 跑一次补漏。
  - 工具契约与索引分层行按共识实施。
- **客户端**：抽出共享 wire 类型（`src/shared/memory-wire.ts`），`MemoryView.tsx` 不再重复声明；统一 `indexLimitProject` 默认值（服务端 50）。
- **测试**：`tests/memory.runtime.spec.ts`（fake ctx/llm）、`tests/memory.migrate.spec.ts`；补 store/capture 用例。
- **交付**：`npm run check && npm test && npm run build`；zdebug 真机回归；bump `0.0.1-preview.17`；`node scripts\build-index.mjs`；commit + push。

验收：离线全绿；手改 md 生效；迁移在真实 home 上幂等；console error = 0；索引文案与工具描述断言存在。

### B1 注入与索引 v2（preview.18）

- 面板接「刷新索引」→ `invalidateRecall`。
- 指标重定义接线：注入利用率、检索命中率写入统计数据面。
- 真机验证：同会话只出现一份索引快照；压缩后自动重注入；索引行含 id 并能 `memory_get`。
- 验收：离线全绿；真机快照行为符合 ADR-0005；console error = 0。

### B2 捕获 v2（preview.19）

- 面板「最近捕获」列表 + 单条撤销（对应 `recentCaptures`，撤销只归档该次新增的条目）。
- 利用率采集：`memory_get`/`memory_search` 命中只更新内存，30 秒或会话结束批量落盘到派生 usage store（`memory/usage.json`，可重建）；维护 Run 用聚合值。
- 命令文案：宿主 `ctx.commands` 只有 `register(descriptor)`、没有 locale 能力，服务端命令文案保持中文；面板 UI 文案由八语言 locale 覆盖（已知限制，不在本批强行实现服务端多语言）。
- 验收：捕获成本为每会话 ≤1 次提炼；最近捕获可撤销；利用率数据在重启后仍在。

### B3 维护 Run v1（preview.20）

- 面板「优化记忆」按钮 + 达阈值提示弹窗（阈值常量可调）。
- 规则预筛（重复对 bigram/字段相似度、低利用率）+ LLM 研判（结构化计划）+ 校验执行。
- 两阶段研判、trash 备份（30 天）、维护流水与整次撤销、独立维护模型设置。
- 验收：离线 fake LLM 覆盖各类计划；真机跑一次小库维护，合并/停用/删除均可在流水中撤销；删除前 trash 可恢复。

### B4 诊断与 UI（preview.21）

- 诊断对话框（记忆 tab）：本会话注入快照、最近 50 次捕获、最近 50 次检索、维护流水与撤销。
- 官方 UI 通道：`tsdown.config.ts` purity 白名单放行 `@deepseek-ai/dsh-client-ui-primitives` 一个 specifier；`AGENTS.md` / `docs/PLUGIN-DEV.md` 记录受控例外。
- 实施取舍：本批只采用 `MarkdownText`（正文只读预览）；`Toast`/`Modal` 保留自绘、`react-virtual` 未采用（宿主组件 props 未公开，风险大于收益），见 ADR-0008 实施记录。
- 详情弹窗正文只读渲染（`MarkdownText`，require 失败降级为系统打开）；列表 `react-virtual`；Toast/Modal 替换自绘（保留降级）。
- 面板缺陷：卡片/详情显示并复制 id；归档默认隐藏；标签按钮 Enter 不冒泡；对话框焦点陷阱；命令文案八语言。
- 验收：console error = 0；暗/亮主题截图核对；宿主 require 失败分支有测试。

### B5 收尾（0.0.1）

- 同步 README / HOST-API / locale / ADR 状态；废弃过时 spec。
- 真机双主题全回归（含 B0–B4 全部能力）；版本 `0.0.1`；`build-index`；按 §8 发布并验证 dist-tag。

## 数据迁移与兼容

- 迁移只在插件加载时执行一次；必须先备份再写；失败要保留原文件并记录诊断。
- 新版读旧格式、旧版读新格式都不要求兼容（preview 期），但导出 Markdown 必须保持可读；迁移后导出仍含 frontmatter。
- 用户手改的未知字段必须保留；`name/description/type/scope/project/id` 等关键字段缺失时按容错默认并跳过条目级修复。

## 质量门与验收

1. 每批：包目录 `npm run check && npm test && npm run build`（tsc 双 program + vitest 离线 + tsdown 产物）。
2. 每批：`scripts\dev-debug.ps1` 装 zdebug 真机，浏览器 console error = 0，关键路径 snapshot/screenshot。
3. 涉及宿主契约（runtime-context 投影、module seed require、openWorkspacePath）的改动，升级宿主后必须回归。
4. 每批 bump 版本 → `node scripts\build-index.mjs` → commit + push（`release-0.0.1`）。

## 后续候选（未排期，勿顺手做）

- 维护自动触发（定时/写入阈值自动跑，不再弹窗）。
- Markdown / JSON / AGENTS.md 片段导入（与导出对称）。
- 项目记忆与团队共享（AGENTS.md 片段导出、共享目录）。
- 宿主未来若提供 embedding，再评估向量派生缓存（仍不作真源）。

## 实施环境备忘（本机实测踩坑）

- 桌面 CLI：`D:\Program Files\dsh\resources\runtime\cli\bin\dsh.cmd`（脚本找不到时设 `DSH_CLI` 指向它）。
- 调试：仓库根 `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\dev-debug.ps1 packages\dsh-agent-extension`（装进 zdebug 并启动；`-Profile desktop -NoBoot` 只装桌面）。
- **link 安装即时生效，但宿主缓存 client bundle**：改完 `npm run build` 后普通刷新可能拿旧产物，需重启调试宿主（taskkill 后重跑脚本）。
- 浏览器驱动：此宿主 webview 的 Playwright `click()` 经常超时，优先 `tab.playwright.evaluate` 里 `element.click()` 触发，坐标点击 `cua.click` 备用。
- 样式守卫测试：任何 `border-radius: 999px/50%/100%` 必须配对 `corner-shape: round`。
- locale 改动必须八语言同步（`Record<HubLocaleKey,…>` 缺 key 会编译失败）。
- 质量门三连：`npm run check && npm test && npm run build`（tsc 双程序 + vitest 离线 + tsdown 产物，`lib/` 必须随源码同提交）。