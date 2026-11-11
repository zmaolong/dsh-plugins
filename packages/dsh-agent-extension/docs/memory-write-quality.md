# 记忆写入质量与生命周期：第二阶段规划与实施记录（自 0.0.1-preview.22 起）

> 自包含实施规划：新上下文可直接按本文实施。延续 [`memory-roadmap.md`](./memory-roadmap.md)（v2，B0–B5 已完结）的批次编号与工作流约定。
> 决策来源：2026-11-11 会话与用户对齐（方向/版本/边界/生命周期/维护/消费侧已确认），写入闸门机制以 `.reference/` 七个开源项目的记忆系统实现为参照由 Agent 自行定夺（用户明确授权全自动执行）。
> 状态：进行中。术语已落 [`GLOSSARY.md`](../../GLOSSARY.md)（短期记忆 / 长期记忆 / 升级）。

## 背景与实证（2026-11-10 本机数据，真实使用一天）

| # | 缺口 | 证据 | 处置 |
|---|------|------|------|
| 1 | 写入/消费严重失衡 | 捕获 36 次写 82 条（dsh-plugins 一天 +70 条）；usage.json 仅 9 条被用过 1–2 次，多数会话 `injectedUsed: 0` | 本轮主攻：写入分层 + 闸门收紧 |
| 2 | 维护预筛对新鲜库失明 | 3 次 Run 全 `empty`、candidates 0；预筛门槛按陈旧库设计（久置 + 高相似） | 延迟评审 + 自动触发 |
| 3 | ~~迁移不幂等~~ | `.backup-v1-*` 有 7 个，时间戳与调试期新旧宿主交替重启吻合；现役库 100% `schema: 2`、10:59 后无新备份 | **撤销**：无现存 bug，系调试期历史现象 |
| 4 | `projects.json` 的 `entryCount` 恒 0 | `touchProject` 硬编码 0 落盘，读路径实时重算掩盖问题 | 已修（store.ts 一行 + store spec 用例） |

补充事实：v2 注入预算（每层 20 条 / 3,000 字符）实测生效，「一次注入 70 条」为旧版遗留数据，预算无 bug。

## 已定决策（用户确认）

1. **方向**：修实证缺口 + 避免无效记忆写入；候选功能（导入/团队共享等）不动。
2. **版本**：`0.0.1-preview.22` 起，每批一个 preview，沿既有质量门工作流。
3. **形态边界**：守住 v2 约定——五类型事实库、不做 embedding、零运行时依赖、不加 AGENTS.md 生成、不 skill 化。
4. **生命周期分层**：记忆条目分**短期 / 长期**两级（与五类型、active/stale/archived 状态机正交）。默认写入**短期记忆**；观察期内被消费（`memory_get`/`memory_search` 命中）或被强化则**升级**为长期记忆；闲置到期转 `stale`（待停用），再走既有两阶段研判最终删除。
5. **维护**：延迟评审 + 维护自动触发一起做（roadmap 候选①提前进本轮）。
6. **消费侧**：本轮轻改（注入文案引导 + 指标口径），写入侧修完看新数据再评估大改。
7. **写入闸门**：以 `.reference/`（OpenViking、ZCode、agentcairn、claude-mem、codex、deepseek-harness、hindsight）记忆系统实现为参照，Agent 自行设计并实施，全程不询问用户。

## 参考项目调查结论（2026-11-11，7 项目横向）

写入质量控制的共性套路：写入与主对话解耦（后台/hook 异步）；闸门内嵌在专用提炼 prompt（而非工具描述）；查重靠「先查后写」+ 确定性账本；淘汰靠使用信号。逐项映射到本插件：

| 参考机制（来源） | 本插件现状 | 采纳 |
|----------------|-----------|------|
| LLM 前零成本结构闸门：无真人 prose / 已直接写过 → skip（ZCode） | capture 闸门已跳过子代理/空轮/过短轮 | B7 增强：补「会话内已有直接写入」skip |
| no-op 是一等输出 +「未来 agent 会因此做得更好吗」单问 + 负面清单（codex/agentcairn） | 提炼允许空数组但 prompt 未强调 no-op 优先、无负面清单 | B7：提炼 prompt 改造 |
| 提取时喂既有记忆 manifest，update 优先于 create（ZCode/OpenViking） | 提炼输入已含既有索引 | B7 强化指令措辞 |
| 「是否愿意蒸馏」比打分可靠（agentcairn） | — | 采纳为 prompt 设计原则（不引入打分） |
| 消费闭环反哺淘汰：usage_count/last_usage + max_unused_days（codex） | usage.json 已有 usedCount/lastUsedAt，但只用于维护预筛 | **核心采纳**：与用户已定的短期/长期分层合并成生命周期机制 |
| 相似 ≠ 合并：全等才自动合并，高分相似只进候选池（claude-mem） | 体检/维护本就是候选池式人工/LLM 裁决 | 已符合，不动 |
| chatter/restates 小模型前置分诊（hindsight） | — | 不采纳（无小模型通道；restates 已由指纹强化覆盖） |

## 批次计划

### B6 生命周期分层（preview.22）

- **schema v3**：条目新增 `tier: short | long`（`src/memory/types.ts`、`src/shared/memory-wire.ts`）；`MEMORY_SCHEMA = 3`；迁移 v2→v3（缺 `tier` 补 `long`——存量条目不再回炉观察，新写入才走分层；备份目录前缀带来源版本）。
- **写入定级**：`memory_save` 工具与会话末提炼 → `short`；用户显式途径（面板新建、`/remember`、`pinned`）→ `long`；`store.save` 缺省按 `source` 推断（tool/capture → short，user → long）。
- **升级**：`memory_get`/`memory_search` 命中（usage 记录时）或指纹强化时 `short → long`，写回 Markdown 真源（升级是元数据变更，不走可重建的 usage.json）。
- **注入收紧**：首步索引快照只注入 `long`（`recall.ts` 层过滤）；`short` 仍可被检索，检索命中即升级——形成「被用到才算数」闭环。
- **面板**：卡片与详情显示层级徽章，详情弹窗可手动升降级；locale 八语言。
- **ADR-0009**：分层生命周期与注入收紧的决策记录（难逆转：数据落盘 + 注入行为变化；真权衡：短期不注入 vs 全量注入）。

### B7 写入闸门与维护自动化（preview.23）

- **相似吸收（本批核心）**：`store.save` 对 `capture`/`tool` 来源的候选前置一道确定性查重——与同 scope/project 的 active 条目做 bigram Jaccard（复用 `src/shared/memory-similarity.ts`），≥ 阈值（0.75，比体检/维护的疑似重复 0.6 更保守）时不新建条目，改为对既有条目记一次强化（reinforcement+1 + 升级 + updatedAt）。动机：提炼器改写措辞后指纹几乎必然不同，「喂 existing 清单」从未真正防住重复；同义重复转为强化（hindsight 的 restates→evidence 思路，无 evidence 字段就以强化计数承载）。`user` 来源不吸收（用户显式写入不拦）。
- **提炼 prompt 改造**（`src/memory/capture.ts`）：no-op 为一等输出（「No-op is allowed and preferred」）；加「未来 agent 会因此做得更好吗」单问判据；负面清单显式化（一次性任务状态、进度汇报、可从仓库/会话历史推导的信息、临时指标、无后验的头脑风暴）；「若 existing 已覆盖则跳过，不要改写措辞再写一遍」。
- **闸门增强**（`gateCapture`）：本轮无真人 prose 且 digest.toolNames 已含 `memory_save` → skip（ZCode 双前置 skip 的对位实现，防双重写）。
- **延迟评审进维护**（`src/memory/maintenance.ts` 预筛）：新增规则——`tier: short` 且 active、`now - max(lastUsedAt, updatedAt) > observationDays`（设置项，默认 7 天）→ 维护候选（处置走既有 stale → 两阶段研判）。
- **维护自动触发**（roadmap 候选①）：捕获补漏完成后检查 due——`capturedEntries` 距上次维护增长 ≥ 阈值（默认 30）或距上次 ≥ 7 天 → 自动后台跑维护 Run。维护模型空串本就表示继承宿主默认模型（maintenance.json 的 `model: null` 是记录不是错误），无降级障碍。
- **设置面**：`observationDays`、`autoMaintenance`（开关）、`autoMaintenanceThreshold` 进 settings 与设置弹窗；locale 八语言。

### B8 消费侧轻改与收尾（preview.24）

- 注入抬头与检索结果措辞强化「详情用 `memory_get` 按需获取」引导；`injectedUsed` 口径复查（索引行被引用/工具回读的统计是否准确）。
- 诊断视图补层级维度（短期/长期计数、升级率）。
- 文档同步：README、HOST-API、roadmap 状态、ADR-0009 定稿；真机双主题全回归。

## 实施记录

### 2026-11-11：地基收口（先行修复，随批 1 提交）

- `entryCount` 恒 0：`src/memory/store.ts` `touchProject` 落盘改用实时 `countEntries`；`tests/memory.store.spec.ts` 新增用例（2 条项目记忆 → touchProject → projects.json `entryCount === 2`），单测通过。
- 迁移幂等：确认无现存 bug，不动代码；7 个历史备份目录留在用户数据目录不动（属用户数据，不清理）。

### 2026-11-11：B6 生命周期分层实施完成

- **schema v3**（`MEMORY_SCHEMA = 3`）：`src/shared/memory-wire.ts` 加 `MEMORY_TIERS`/`MemoryTier`/`isMemoryTier`/`normalizeTier`（缺省回退 `long`）与 `MemoryMeta.tier`、`MemoryListRow.tier`；`src/memory/migrate.ts` `KNOWN_ENTRY_FIELDS` 加 `tier`，备份目录按来源版本命名（`.backup-v<from>-`，v1 缺失 schema 归一为 1 保持历史一致）。
- **store**（`src/memory/store.ts`）：parse/render 支持 tier；`tierForSource` 定级（user→long，其余→short）；强化分支升级 short→long；新增 `promoteRead`（get 命中升级、不动 updatedAt）与 `setTier`（对称 setStatus）。
- **注入收紧**（`src/memory/recall.ts`）：`layerEntries` 只取 `long`。
- **工具**（`src/memory/runtime/tools.ts`）：`memory_get` execute 命中循环挂 `promoteRead`；`memory_save` 描述说明短期/长期机制。
- **路由**（`src/memory-routes.ts`）：新增 `POST /memory/tier`；`/memory/save` 传 `source: 'user'`（顺带修复面板保存被记为 capture 的缺陷）。
- **面板**（`src/client/MemoryView.tsx` + `locales.ts`）：卡片「短期」徽章（仅 active+short）；详情弹窗层级徽章 + 手动升降级按钮；八语言新增 5 个 key（`memoryTierShort/Long/Promote/Demote/Done`）。
- **ADR-0009**：`docs/adr/0009-memory-tier-lifecycle.md`。
- **测试**：356 用例全绿（新增：写入定级、注入只放长期+升级闭环、迁移到 v3 补 long、fake store `promoted` 记账、tier 路由双向+校验、组件徽章+切换）；`/memory/save` 面板保存断言 source=user+tier=long。
- 待办：真机 zdebug 回归后 bump `0.0.1-preview.22` 提交。

### 2026-11-11：B6 真机回归通过并交付（preview.22，commit d5f640f）

- zdebug 真机：迁移自动执行（89 条全部 schema v3，新备份 `.backup-v2-*` 单次生成，按来源版本命名）；详情弹窗「长期/短期」徽章与升降级按钮双向切换正常；卡片「短期」徽章渲染正确（琥珀 warn tone）；`POST /memory/tier` curl 三场景（降级/恢复/非法值 bad_request）全过；宿主 err.log 干净。

### 2026-11-11：B7 写入闸门与维护自动化实施完成

- **相似吸收**（`src/memory/store.ts` + `src/shared/memory-similarity.ts`）：`save` 对 `tier=short` 的写入在指纹未命中时做 bigram 比对（`CAPTURE_SIMILARITY_THRESHOLD = 0.75`），命中转强化（reinforcement+1 + 升级 + 日志）；`SIMILARITY_MIN_CHARS = 40` 长度门槛防短模板误伤（并发测试真实暴露后修复）；用户显式写入（long）不吸收。
- **提炼 prompt**（`src/memory/capture.ts`）：no-op 优先 +「未来 agent 会因此做得更好吗」+ 显式负面清单 +「existing 已覆盖则跳过，不要改写再写一遍」。
- **闸门增强**：`gateCapture` 加 `model-saved-directly`——本轮无真人 prose 且模型已调过 `memory_save` → skip。
- **延迟评审**（`src/memory/maintenance.ts`）：预筛新增 `probation` 候选（挂 firstStale 配额，处置同 first-stale）——short 条目闲置 `observationDays`（settings，默认 7）未被消费即候选；闲置按 `max(lastUsedAt, updatedAt)` 起算。
- **维护自动触发**：`computeMaintenanceDue` 支持设置覆盖阈值；`CaptureSessions.afterCapture` 回调（提炼任务完成后）→ `MemoryRuntime.autoMaintainIfNeeded`（autoMaintenance 开关 + due + maintenanceTask 互斥三重门）后台自动跑；面板 due 不再自动弹窗（删 `maintenancePrompt` 死代码分支与 `memoryMaintenanceDueTitle/Later` 两 key），维护弹窗改为纯手动入口并显示 due 读数。
- **设置面**：`observationDays`/`autoMaintenance`/`autoMaintenanceThreshold` 三设置项（wire + store 归一化 + 路由校验 + 设置弹窗 UI + 八语言 4 新 key）。
- **测试**：357 用例全绿（新增：相似吸收正反/短模板/用户写入、闸门 model-saved-directly、延迟评审 probation、due 不自动弹窗改写）。
- 待办：真机验证设置面后 bump `0.0.1-preview.23` 提交。

### 2026-11-11：B7 真机回归通过并交付（preview.23，commit 2774c7a）

- zdebug 真机：设置弹窗三个新控件正确渲染（自动维护开关默认开、观察期 7 天、阈值 30）；
  `POST /memory/settings` 三新字段 PATCH + settings.json 落盘验证通过；due 时面板不再自动弹窗；
  宿主 err.log 干净。自动触发链路（afterCapture → autoMaintainIfNeeded）由单测覆盖流水线、
  触发条件三重门代码简单，真机未现场触发（需 due 状态 + 会话结束，交由日常使用验证）。

### 2026-11-11：B8 实施完成并交付（preview.24）

- **注入抬头措辞**（`src/memory/recall.ts`）：RECALL_HEADER 说明「已证明有用的条目 + 短期条目检索可达」。
- **诊断视图**：`GET /memory/state` 新增 `tiers` 计数（`store.tierCounts()`，全库 active 按 tier）；
  诊断弹窗顶部显示「记忆库构成：长期 X 条 · 短期 Y 条」；八语言 1 新 key。
- **指标口径复查**：`injectedUsed` 记账逻辑确认无误（runtime/stats.ts：检索结果命中注入集合 →
  消费），低利用率是真实行为而非统计缺陷——由 B6/B7 的写入侧机制改善，不改代码。
- **文档同步**：README 三个版本变更段 + 头部第二阶段指引；roadmap 进度行引用第二阶段与 ADR-0009。
- **验证**：357 用例全绿；zdebug 真机诊断弹窗构成行渲染正确（长期 88 · 短期 0，与数据一致）。

**第二阶段收尾状态**：B6–B8 全部交付。后续观察项（不排期，等数据）：新写入的短期占比与升级率
（诊断视图人工观察）；维护自动触发在真实会话末的首跑效果；相似吸收的拦截量（store 日志）。

### 2026-11-11：B9 体检与维护「实质性作用」改造（preview.25）

用户反馈体检与维护「没有实质性作用」。对本机 89 条实测诊断根因：**确定性规则能判的（逐字重复
≥0.6 仅 1 对、超期未用 0 条）不是这个库的病；库的真病是语义重复与一次性进度记录，只有 LLM 能判，
但维护 Run 被「规则预筛 0 候选」短路在 LLM 门外（532 行直接返回 empty）**；体检则空转且不解释。

- **维护 Run 全量研判**（`src/memory/maintenance.ts`）：预筛候选加入 `review` 类别——剩余全部
  active 非钉住条目进研判视野（低重要性排前，200 上限/40k token 预算不变）；重复对降级为提示信号
  不再作候选门槛；研判提示词从「确认预筛候选」改为「主动全库研判：语义重复→merge、价值耗尽的
  一次性记录→stale、硬证据候选照旧、no-op 优先」；stale 校验放宽为「候选内 active 非钉住」
  （delete 仍限二次研判、restore 仍限 stale），firstIds 死变量删除。
- **体检「从未被消费」第四组**（`src/client/audit.ts` + 路由）：`/memory/list` 融合派生 usage
  （新增 `MemoryRouteHooks.usageSnapshot`，memory-host 装配传 `usage.snapshot()`；Markdown 里的
  usedCount 只在维护批次写回，不融合则恒 0）；规则 = active + 非 reference + usedCount 0
  （reference 本就只靠检索，无消费是常态）——本机立刻产出 59 条确定性候选。
- **体检解释型反馈**：空态不再只说「状态良好」，新增引导文案说明规则只筛确定性信号、语义问题用
  「优化记忆」；有产出时底部同样提示语义问题走维护。
- **验证**：359 用例全绿；zdebug 真机体检「从未被消费 59」渲染正确；维护 Run 全量候选生效
  （candidates 17），模型正确继承宿主默认（deepseek-official/deepseek-flash），LLM 调用在
  zdebug 因无 API key 失败（MISSING_CREDENTIAL，错误文案清晰指引配置）——真实研判需在已配
  凭据的桌面 profile 验证，代码链路（候选/路由/失败处理）全部正确。

### 2026-11-11：B10 检索排序与注入消费信号（preview.26）

定时优化轮（无人值守）从 `.reference/` 七项目调研检索/注入机制（claude-mem/hindsight/agentcairn/
codex/OpenViking），选定两项零 schema 变更的改进落地：

- **`memory_search` 多词覆盖排序 + 高频词降噪**（`src/memory/store.ts` `score()` 重构，来源：
  claude-mem `SessionSearch` 的 AND→OR 放宽 + 稀有词选择）：排序键从「原始加权分 + importance/100」
  改为「命中查询词覆盖数 → 原始加权分 → importance → updatedAt」——同时命中更多词的条目必然
  排在只命中单词的条目前，修复「一条只含单个高频词的条目淹没同时命中多个词的条目」。高频词降噪：
  条目 ≥20 且查询词 ≥2 时，出现在 ≥30% 条目中的词（df 统计即时计算，无索引）从覆盖计分剔除
  （「有人命中」的词才进稀有词表，剔除后无人可命中则回退全词表）；小库不做降噪（词频统计不稳定）。
- **注入排序纳入消费信号**（`src/memory/recall.ts` + `memory-host.ts` 接线，来源：hindsight
  proof_norm 的消费闭环思路、codex 消费反哺）：`layerEntries` 排序键从「importance → updatedAt」
  改为「importance → usedCount → lastUsedAt → updatedAt」，usage 快照由 memory-host 传入
  （`usage.load()` 幂等预载 + `snapshot()`），无记录退回条目自身 usedCount（维护批次同步值）。
  「被消费才升级长期」的分层语义由此贯通到注入排序——同重要度下被用过的条目先曝光。
- **注入抬头补引用规约**（来源：codex `read_path_v2.md`、agentcairn trust boundary）：header
  加一句 "Cite a memory's id only when you actually rely on it."——引用纪律同时让 `injectedUsed`
  的记账口径（靠 id 引用/回读）更可靠。
- **不采纳**（本轮评估过）：ACT-R 强化日期史（claude-mem `strength.ts`，需 schema v4 迁移 +
  全链字段改造，留后续批次）；stale 条目 ×0.5 降权注入（agentcairn validity penalty，与 v3
  「注入收紧只放 active+long」的既定边界冲突）；多路召回 RRF（单路召回暂无融合需求）。
- **验证**：363 用例全绿（新增 4：多词覆盖排序、高频词降噪、全高频回退、注入消费信号排序）。
  纯服务端改动，未涉客户端 slots/UI/宿主契约，按 AGENTS.md 跳过真机自测。

### 2026-11-11：B11 注入层间预算公平分配（preview.27）

定时优化轮第二项。用本机真实库（89 条）模拟当前注入渲染，发现**层间饥饿**：全局层 22 条候选
（索引行 2,382 字符）超过全部预算 2,316 字符，「全局先填、项目吃剩余」的顺序填充下**项目层
0/20 条注入**——23 条项目 gotcha（对当前仓库行动价值最高的记忆）一条都进不了会话上下文。
上轮调研的 OpenViking `budget.py`（分层预算填充）/claude-mem `ContextBudget`（渐进降级）思路
的对位问题不是「预算剩余升档」而是层间公平。

- **保底配额**（`src/memory/recall.ts` fitting 重写）：每层按配置条数占比先分预算
  （默认 20/20 → 各半），层内自上而下填行，放不下的行进 pending；
- **回流补位**：单层用不完的保底合并后按层轮流给 pending 行补位（放不下跳过），广度优先；
  只有单层时等价于整体顺序填充（回归安全）；
- 补位后恢复层内原始排序（回流行可能比配额内短行排名高）；截断提示按最终未注入行数判定。
- **真实库效果**：全局 9/20 + 项目 10/20（旧算法 18-19/0）；索引仍 ≤3,000 字符。
- **验证**：365 用例全绿（新增 2：层间公平分配、单层回归）。纯服务端，免真机。
- **上轮候选复核**：两档升档渲染（预算剩余时给 top 条目更多细节）在真实库无剩余预算，
  不成立，撤销；ACT-R 强化日期史（schema v4）与 hotness stale 判定仍列为后续候选。

### 2026-11-12：B12 写入 secrets 拦截 + 注入 recency 半衰期（preview.28）

定时优化轮从 survey §9.3 优先级总表落地两项 P0（均零 schema 变更）：

- **写入路径 secrets 确定性拦截**（`src/memory/secrets.ts` + `store.save()` 入口单点接线，
  来源：hindsight memory-defense、agentcairn redact-first、claude-mem redaction、codex 写入闸门）：
  十类高置信窄匹配正则（私钥块、sk-/gh?_/AKIA/xox/AIza/JWT、连接串内嵌凭据、Bearer 头、
  键值对 24+ 字符密钥赋值）命中即**整条拒绝**，不做自动改写（改写可能损坏事实，交回写入方
  改成占位说明）。单点放 `save()` 开头覆盖全部五条写入路径（工具/提炼/面板/命令/维护合并），
  归档重写与迁移等既有数据路径不拦。调用方适配：`memory_save` 工具 catch 后返回「未保存：…」
  让模型可改写重试；面板 `/memory/save` 转 bad_request；`/remember` 命令转 error outcome；
  维护合并与提炼已有 catch 兜底。错误信息只报类别不回显命中内容。宁漏勿误：只收高置信模式
  （随机密钥串/私钥块/内嵌凭据），语义级「该不该记」仍由提炼 prompt 负面清单承担。
- **注入排序纳入 recency 半衰期**（`src/memory/recall.ts` `layerEntries`，来源：OpenViking
  hotness、hindsight recency boost）：层内排序键从「importance → usedCount → lastUsedAt →
  updatedAt」改为「importance × 0.5^(ageDays/30) → usedCount → updatedAt」——importance 是
  写入时预测，需按「多新」修正（B10 排序键的本质缺陷：一个 90 重要度 100 天前的条目永远压住
  今天写入的 60 重要度条目）。活跃时间取消费时间（usage 派生账优先）与更新时间的较大者；
  钉住条目豁免衰减（用户显式意图）；分数在排序前一次性算好（comparator 内取 Date.now()
  破坏一致性）。
- **真实库模拟**（B11 方法论）：全局 5 + 项目 6/46 候选均在配额内，新旧排序注入集合零差异、
  全渲染冒烟正常——衰减在当前库不引起扰动，只在候选超配额时让新近条目替换陈旧条目；机制
  正确性由单测保证（3 用例：衰减修正 importance、钉住豁免、消费刷新活跃时间 + usedCount
  次级键）。
- **验证**：372 用例全绿（新增 7：secrets 模式覆盖/误伤放行、save 整条拒绝 + 更新路径、
  错误信息不回显、工具层 catch、面板 4xx、recency 3 用例）。纯服务端，免真机。
- **后续候选**（survey §9.3 递补）：P0-2 消费闭环补环（assistant 文本引用回写 usage +
  新条目短 id，涉及 id 格式与存量迁移，单独成批）；P1 轮级轻量召回注入、冲突显式化
  （changes/ends）、导入桥。

### 2026-11-12：B13 消费闭环补环——assistant 文本引用回写 usage（preview.29）

survey §9.3 P0-2 的消费侧闭环（codex citation 闭环对位）。B10 注入抬头立了「依赖时引用 id」
的规约，但模型不经 `memory_get`、直接依据注入索引行动时，消费信号无通路捕捉——引用规约
一直是空文。本轮补上承接（**短 id 降引用成本**仍为独立候选，不阻塞闭环）：

- **轮末引用回写**（`src/memory/runtime/capture-session.ts` `flushCitedUsage` + `stats.ts`
  `citedMemoryIds`）：`onTurnStopping` 时按轮增量提取 assistant 文本（复用提炼的
  `digestOf` 通道），正则收集记忆 id 候选（`m-<时间戳>-<hex>` 短格式与迁移条目 UUID 形式），
  与「本会话暴露过的 id 集合」（注入索引 injected ∪ 工具结果 searched）取交集后
  `usage.touch` 计数——正文里偶然出现的同形字符串不会误计；游标 `lastCitedTurn` 保证
  重复轮不重复计，跨轮引用按轮累加（反复依赖即反复确认，与强化语义一致）。
- **接线**：`CaptureSessionsOptions.touchUsage`（可省略）由 memory-host 传入，与工具命中
  共用同一条 usage 通道（`usage.touch` 同调用去重）；`buffer.used` 同步登记。
- **既有语义不动**：search 命中即计一次消费是 B10 之前的设计，维持——引用回写是额外的
  消费证据通路，两者可叠加。
- **验证**：374 用例全绿（新增 2：暴露交集过滤 + 轮增量扫描/同轮去重/无引用轮不计）。
  纯服务端，免真机。
- **后续候选**：P0-2 剩余的短 id（新条目 id 缩短降引用成本，涉及 id 生成与引用解析一致性，
  单独成批）；P1 轮级轻量召回注入、冲突显式化（changes/ends）、导入桥。
