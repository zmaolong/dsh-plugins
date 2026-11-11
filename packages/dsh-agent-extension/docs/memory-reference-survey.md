# 记忆系统参考项目调研：七项目横向分析（2026-11-11）

> 事实源：`.reference/` 下七个开源项目的逐仓源码分析（2026-11-11，每项目由独立子代理全量检索后产出，本文为其浓缩与横向对照）。
> 用途：为 `dsh-agent-extension` 记忆子系统（规划见 [`memory-roadmap.md`](./memory-roadmap.md)、[`memory-write-quality.md`](./memory-write-quality.md)）的后续演进提供参照；本文是 memory-write-quality.md 中「参考项目调查结论」一节的展开。
> 时效：`.reference/` 是仓库内只读快照，文中行号以分析当日为准，快照升级后需复核。
> 只看结论可跳读 §9（横向总结与借鉴映射）。

## 0. 总对比表

| | 存储 | 写入触发 | 注入 | 检索 | 淘汰 | 定位 |
|---|---|---|---|---|---|---|
| codex | SQLite 调度 + Markdown 工作区（git 基线 diff） | 会话启动后台两阶段流水线 | summary 2500 tok 常驻 + 按需 grep | substring + 关键词 | usage 闭环（citation 回写 → 30 天修剪） | 专用记忆产品 |
| ZCode | 纯文件：事实文件 + MEMORY.md 索引 | 模型自主写 + turn 成功后后台 Extraction | 首步索引 200 行 / 25KB | selector 小模型（分支休眠中） | Dream 整理（已实现未接线） | prompt 驱动的文件协议 |
| claude-mem | SQLite 观察行 + Chroma 向量 | 每次工具调用后实时观察者 | SessionStart 10K 字符时间线 | FTS5 + 向量混合 | ACT-R 强化 + 标题归并 | 宿主 hook 最大利用者 |
| agentcairn | Markdown vault 唯一真源 + DuckDB 可重建索引 | SessionEnd / 定时 sweep 带外摄取 | 每条 prompt 召回 k=3 + SessionStart digest | BM25 + 向量 RRF | supersede 链 + 双时态 ×0.5 降权 | fail-safe 典范 |
| OpenViking | viking:// 文件系统 + 向量 sidecar，schema 模板化 | session commit 后台 ExtractLoop | 服务端 context assembler（分层预算 + 跨轮去重） | 语义检索 | hotness 半衰期 | 服务端收敛点 |
| hindsight | Postgres 单库三信号（向量 + BM25 + 图边表） | retain 流水线（5W 事实抽取 + 实体 + 建边） | recall 不调 LLM、每 turn 可注入 | 四臂并行 → RRF → cross-encoder → MMR | consolidation 冲突三策略 | 重型参考架构 |
| DSH 宿主 | 零内置 | — | `section provider + tool` 留给插件 | — | — | 官方定位 = 本插件的实现形态 |

---

## 1. codex（OpenAI Codex CLI，Rust）

核心代码：`codex-rs/memories/`（写入流水线）、`codex-rs/ext/memories/`（读路径扩展）、`codex-rs/state/`（SQLite）。总纲 `codex-rs/memories/README.md`。

### 1.1 怎么做的

一条「会话 rollout → 结构化记忆 → 文件工作区 → 上下文注入 / 按需检索」的后台流水线：

- **双层存储**：SQLite 存元数据与调度（`stage1_outputs` 表含 `usage_count/last_usage`；`jobs` 表是通用任务租约框架，claim/lease/heartbeat/backoff 在 `state/src/runtime/memories.rs`）；Markdown 工作区存模型实际读的记忆（`memory_summary.md` 常驻索引（首行必须是 `v1` 版本戳）、`MEMORY.md` 任务分组手册、`rollout_summaries/` 每会话摘要、`extensions/ad_hoc/notes/` 用户显式便签）。记忆根本身是专用 git 基线仓库，用 diff 判断「有无新工作」。v1/v2 双版本双 DB，`dual_write` 预热后按就绪度切换。
- **写入（会话启动触发，后台异步）**：
  - Phase 1（提取）：认领最多 2 个闲置 ≥6h、≤10 天的 rollout（租约 1h 防并发重复），脱敏后交模型结构化提取（strict JSON、effort Low）。v1 输出 `{raw_memory, rollout_summary, slug}` 双产物；v2 简化为只出忠实摘要，输入改用分层 token 预算证据（Human > Final > … > Tool，约窗口 49%）。
  - Phase 2（整合）：全局单例 job（成功后 6h 冷却），同步工作区后先做 **git diff 判定——无变更直接返回不花模型调用**；有变更则 spawn 沙箱化整合 sub-agent（无网络、无审批、仅限写记忆根、禁递归委托）重写索引层（v1 模板 880 行 / v2 模板 52 行）。
  - 遗忘三腿：DB 保留修剪（30 天未用）→ 按 `usage_count` 排序选 top-256 整合 → agent 依 diff 定向删除。
- **读取（渐进披露三层）**：每个新会话把 `memory_summary.md` 截断 2500 token 注入 developer 消息（含决策边界、≤4-6 步预算、citation 强制要求）；细节靠模型 grep `MEMORY.md` / `rollout_summaries/`，可选专用工具 `memories.list/read/search/add_ad_hoc_note`（substring 匹配，扩展工具面而非 MCP）；模型回复末尾输出 `<oai-mem-citation>` 引用块，core 剥离并回写 `usage_count+1`，反哺排序与淘汰。
- **交互面**：TUI `/memories` 三项设置（Use / Generate / Reset）；`Feature::MemoryTool` 默认关；`[memories]` 配置段约 15 个参数；隐藏 CLI `codex clear_memories`。用户「记住/忘记」走 ad_hoc note，下次整合合并。

### 1.2 亮点

1. **citation→usage 协议化闭环**：「记忆有没有被真正用上」变成可度量的信号而非启发式，直接驱动淘汰。
2. **git diff 作为整合裁决**：watermark 只记账，工作区脏不脏决定是否花一次 agent 调用，天然把输入同步、用户手改、扩展资源删除统一成整合输入。
3. **并发安全完备**：per-thread claim + 全局单例 job + 文件锁 + 6h 冷却 + heartbeat + retry backoff。
4. **沙箱整合 agent**：无网络、无审批、仅本地写、禁递归、ephemeral，rollout 内容按「数据非指令」处理。
5. **版本化实验设计**（v1/v2 双目录双 DB、dual_write 预热、就绪度判断）为大改提供低风险迁移路径。

### 1.3 不足

1. 检索弱：纯 substring/grep + 关键词工程，无语义检索，措辞漂移时召回依赖整合层索引质量。
2. 质量保障靠 prompt 纪律 + 形状校验，内容质量（虚构偏好）无法程序化拦截。
3. 触发窄且滞后：只在会话启动跑一轮（≤2 rollouts），长会话内不更新记忆。
4. citation 依赖模型自觉，rollout_ids 由模型自报，畸形输入直接丢弃，闭环可能漏计。
5. 单机单用户，无跨设备同步。

### 1.4 可借鉴（映射本插件）

- **citation 剥离→usage 回写**：本插件 B10 已在注入抬头立「仅在真正依赖时引用 id」规约但无解析承接（且 id 为 `randomUUID()`，引用成本高）——协议化消费回写是明确方向（对应优化建议 P0-2：turn 末扫描文本引用 + 新条目改短 id）。
- 外部 agent 记忆导入通道（`external-agent-migration` 把外部 MEMORY.md 拷为 `extensions/external_agent_import/` 再整合）：对应导入桥设计。
- 「无变更不花模型调用」思想：任何 LLM 批次前先做确定性短路（维护 Run 已有 due 门槛，思路同源）。
- v1/v2 版本化 + 就绪度切换：与本项目 schema 迁移备份机制（`.backup-v<from>-*`）方法论一致，互证。

---

## 2. ZCode（TypeScript monorepo）

核心代码：`apps/zcode-cli/docs/design/v2/memory/`（941 行冻结规范）、`apps/zcode-cli/packages/core/src/memory/`、`packages/core/src/runtime/helpers/project-memory*.ts`。

### 2.1 怎么做的

纯文件、无 DB、无向量的「文件协议 + prompt 纪律」体系，五层结构（冻结规范 → 核心算法 → runtime 接线 → 服务/UI → fixture 验收）：

- **存储**：`<storage>/memories/projects/<slug>-<hash>/memory/` 下 MEMORY.md 短索引 + 一文件一事实。frontmatter 含 `name/description/metadata.type`（user/feedback/project/reference 四类）+ `originSessionId`——**origin 不靠模型，由 Write/Edit 写入边界代码级补写**（`memory/origin-session.ts`）。正文 `[[name]]` 互链，悬空允许。custom agent 另有 user/project/local 三 scope。
- **写入**：模型用标准 Write/Edit 自主写（root 内小写 `.md` 权限自动放行，显式 deny 优先，Plan mode 也可写）；turn 成功结束后 fire-and-forget 后台 Extraction——单 running + latest-pending coalescing、调度边界冻结消息快照（Rewind 不追溯）、cursor 出错不推进、资格判定（本段已写过记忆 → skip；无 ≥3 词真人消息 → skip）、复用 Main 单步内核、工具白名单收窄、最多 5 turns。headless 默认关提取。另有 Dream（定期全库整理，四阶段 50 turns）**代码完整但无产品触发入口**。
- **读取**：检索分支由内部常量互斥——`default-index`（激活）：system prompt 恒注入约 1.5KB 协议段 + session init 读一次 MEMORY.md（清洗后 200 行 / 25,000 字符上限），读取即 seed `readFileState`；`semantic-recall`（休眠但完整实现）：manifest 扫前 30 行 frontmatter（≤200 文件）→ 小模型 selector（max_tokens=256）→ 单文件 200 行/4KB、会话累计 61,440 字符预算，注入等价于一次 Read。
- **交互面**：刻意贫瘠——无 `/memory` 命令（显式非目标），用户操作面是自然语言「记住/忘记」；Desktop Settings 有开关 + 三级只读 viewer；三重开关叠加（CLI 两项 × Desktop memoryEnabled，桌面端默认 false）。

### 2.2 亮点

1. **「文本即合同」验收**：所有 provider-visible 文本（system 段、selector 请求体、attachment 文案）冻结成 golden fixture，Core 测试 / adapter wire 测试 / CLI E2E / Desktop WDIO 四层消费同一份，prompt 回归变成 CI 失败。
2. **双分支常量互斥**：休眠分支整链实现并由单一常量关死，避免半实现状态腐蚀主链路，保留灰度翻转可能。
3. **调度器工程纪律**：coalescing、快照冻结、cursor 语义、close 时先 abort 再有界 drain，每条规则有对应测试。
4. **readFileState 一致性贯穿**：把「记忆被注入」严格等价于「文件被 Read」，Edit freshness 检查不会因注入误判。
5. **纵深防御**：O_NOFOLLOW + 双 stat 快照、大小写别名防护、零宽字符与 Windows ADS 清洗。

### 2.3 不足

1. 激活分支只有静态索引进上下文，事实文件除非命中否则永不进入会话；休眠分支长库（>200 文件截断）下召回覆盖骤降，selector 失败静默空选择、无兜底。
2. 写入全靠 prompt 自律，无事后校验；格式错误、PII、prompt injection（网页内容写入记忆后每会话注入）只有模型自觉一道防线。
3. Memory 与 compact 边界靠会话身份：Extraction 资格 miss 或失败的会话，信息只活在 transcript 里；Dream 又无触发——**当前没有任何自动跨 session 整理在运行**。
4. 用户操作面贫瘠 + 三重开关叠加，排障成本高；目录名含 hash 可发现性差。
5. 单 running slot 吞吐上限：连续成功 turn 中间轮的提取被静默合并丢弃。

### 2.4 可借鉴（映射本插件）

- **资格判定 skip 语义**：已借鉴（B7 `model-saved-directly` = 其「已直接写过 → skip」对位实现）。
- **originSessionId 代码级补写**：已借鉴（本插件 store.save 有 `originSessionId`/`source` 字段）。
- **prompt 文本 fixture 化**：可借鉴未做——把注入抬头、工具描述、提炼 prompt 冻成 golden 测试，防文案回归（中等成本，与「提炼 prompt 改造」批次同做最划算）。
- **索引超限精确 warning**（省略行数 + 起始行号 + 词边界预览）：本插件截断提示可照此增强。
- **反面教训**：selector 失败静默空选择不可学——本插件检索失败必须可见（与 agentcairn 的 degraded_reason 共同印证）。

---

## 3. claude-mem（TypeScript + Bun）

核心代码：`src/services/`（worker/sqlite/context/search）、`src/cli/`（hooks）、`plugin/hooks/hooks.json`；架构契约 `AGENTS.md` + `docs/architecture/observer-lifecycle.md`。

### 3.1 怎么做的

「观察者双代理」：主代理旁跑一个小模型，实时把每次工具调用压缩成结构化观察（observation），每轮 Stop 滚动合并总结（summary），下次会话注入紧凑时间线，细节走 MCP 按需拉取：

- **存储**：SQLite（`observations` 核心行：11 种 type / title / facts / narrative / concepts / files / content_hash / title_norm_key / occurrence_count / reinforcement_dates（ACT-R 强化史）；`session_summaries` 六段式；`tool_uses` **原始工具 I/O 原样留存**（64KB 截断）；FTS5 全文索引）+ Chroma 向量（embedding 全本地 ONNX MiniLM，零 API 费用）。
- **写入**：hooks 全家桶——PostToolUse（async，120s）每次工具调用后采集、Stop 总结、SessionStart 注入。hook 进程纪律：**永不阻塞宿主**（一切错误路径 no-op envelope + exit 0，历史事故注释详录）；磁盘 spool 恰好一次消费；worker 侧 RAM buffer 有界（每 session 128 条 / 每 worker 1024 条 / 未发送 5 分钟过期即丢）；压缩流水线（16K head/tail 截断 → 超大字段先做一次有界模型 condense 而非截断 → image/base64 全形状剥离）。去重四层：content_hash（命中转 ACT-R 强化）→ Tier-0 标题归一跨会话合并 → TF-IDF 近重复（opt-in）→ PaidSendBudget 每批最多 2 次付费发送。
- **读取**：SessionStart 注入 10K 字符时间线（resume 不注入保护 prompt cache，compact 后自动重注入）；UserPromptSubmit 每条 prompt 语义注入最多 20 条（15s 同步预算）；PreToolUse 做 File Read Gate（>32KB 整读 deny + 给 outline 提示）与文件相关历史注入。**预算控制是「测量式降级 fitter」**：渲染 → 实测超限 → 按「最便宜的损失优先」阶梯收缩（完整 narrative → 上一轮 summary → 上一条回复 → session 减半 → 观察数减半），整条丢弃从不对半切——针对 Claude Code「hook stdout 超 10K 即整体静默替换为 stub」的坑。检索路由：纯过滤 → SQLite FTS5；有 query → Chroma 语义 + 空类别 SQLite 回补。四层渐进披露：search（~50-100 tok/条）→ timeline → get_observations（500-1000 tok）→ get_tool_uses（原始 I/O，「95% 时间该跳过的层」）。
- **交互面**：约 25 个 MCP 工具、约 30 个 skills（mem-search 强制工作流、learn-codebase、handoff…）、CLI `doctor/prune/status`、Web viewer；`<private>` 标签内容永不存储 + redaction 管道。

### 3.2 亮点

1. **把 hook 用到机制边界**：deny 能力（File Read Gate）、双通道注入、compact 触发重注入，且全部遵守「永不阻塞宿主」。
2. **测量式降级 fitter**：预算不是数条数而是渲染后实测、按损失成本收缩——工程化修复了「超限即静默失败」。
3. **成本与故障治理成文契约**：PaidSendBudget ≤2、配额/auth 失败丢弃不回填（防故障后产生未请求的付费推理）、RAM buffer 有界、spool 恰好一次。
4. **全本地语义栈**：ONNX 本地 embedding + uvx Chroma，无 embedding API 依赖；FTS5/Chroma 互为回退。
5. **多层去重 + ACT-R 强化排序**：重复出现反而提升记忆排名（遗忘曲线的反向操作）。

### 3.3 不足

1. 注入上限 10K 字符，深挖完全依赖模型遵循 mem-search skill——渐进披露的固有赌注。
2. 观察质量依赖小模型（默认 haiku）实时逐工具压缩，本质「便宜换全覆盖」。
3. 无持久重放：worker 停机、配额耗尽、5 分钟过期都造成永久记忆缺口（原始 transcript 在但不会自动补观察）——仓库事故轨迹表显示这条路线曾反复摇摆。
4. 安装面重：Node/Bun/uv/Python 多运行时，Windows 大量特判；worker 常驻带来端口/孤儿进程运维复杂度。

### 3.4 可借鉴（映射本插件）

- **隐私边界**：`<private>` 永不存储 + redaction 管道——与 hindsight memory-defense、agentcairn redact-first 共同印证写入侧 secrets 拦截的必要性（P0-1）。
- **「重复出现即强化」**：已借鉴（B7 相似吸收转 reinforcement）。
- **ACT-R 强化日期史**：候选池（schema v4），claude-mem 是三家中唯一完整落地的。
- **测量式降级的精确性**：B11 层间公平分配是同族思想；截断提示的精确措辞（省略多少、从哪开始）可再对齐。
- **不学**：逐工具实时观察（成本模型与「每会话 ≤1 次提炼」冲突）；worker 常驻架构；11 种观察类型分类学（本插件五类型已定且更贴合事实库形态）。

---

## 4. agentcairn（Python）

核心代码：`src/cairn/`（vault/index/search/ingest/native_memory）；设计文档 `docs/specs/2026-06-13-memory-consolidation-design.md`、`2026-06-21-hermes-memory-provider-design.md`。

### 4.1 怎么做的

local-first 跨编码代理记忆系统，铁律：**Markdown vault 是唯一事实源**，DuckDB 索引一次性可重建；daemonless——短生命周期 CLI 进程是唯一写者（持文件锁），MCP server 只读；捕获走带外 transcript 摄取 + agent 主动 `remember`，hook 只负责触发 sweep 和注入召回：

- **存储**：`<vault>/memories/*.md`，正文 observations 语法（`- [context] 蒸馏 #ingested` + `- [verbatim] 原话`）；frontmatter 双时态字段 `valid_from/valid_until/superseded_by` + 溯源（source/project/harness/importance）；DuckDB（notes/chunks/embeddings/links）；native-memory 导入有 vault 内 canonical 注册表（缓存丢了人工删除仍被尊重）。
- **写入**：sweep 管道（SessionEnd/PreCompact hook 后台 nohup，或定时任务）——**redact 最先**（先脱敏再 hash）→ 仅 AUTHORED_USER 轮次 → 精确 hash 台账 → judge 三层（LLM/embedding 原型余弦/启发式，degraded 判定绝不缓存）→ 启发式 gate → ExtractiveDistiller **非损失蒸馏**（只加 derived note 永不改源）→ consolidation → 写盘 reconcile。**consolidation 三级判决**：cosine 0.75 只做粗滤，所有过闸对交 LLM 裁决——DUPLICATE（跳过）/ SUPERSEDES（写新 + 旧笔记原地标 superseded_by + recall ×0.5 降权，不删除）/ DISTINCT；任何异常 fail-safe → DISTINCT（宁可多写不可错删）；会话摘要强制绕过防「大总结错杀用户记忆」。
- **读取**：BM25 + brute-force 余弦 RRF(k=60) 融合，叠加因子：wikilink 入链 ×1.2、双时态失效 ×0.5、当前项目 ×1.4；**降级阶梯永不静默死亡**（嵌入失败 → BM25-only + degraded_reason 进 diagnostics）；注入三通道：每条用户 prompt auto-recall k=3（<12 字符跳过、fail-open、**信任边界声明 + 每行 `>` 引用防笔记内容越权**）、SessionStart digest（最近 5 条标题 + 累计 token 节省）、MCP 按需 search → recall 渐进披露。
- **native_memory 导入桥**：Claude Code 原生记忆 → vault 单向只读导入，plan/apply 分离（默认只预览）、版本化幂等（先写新再降旧，崩溃最多留两份现行）、fail-closed 安全契约（symlink 拒绝、O_NOFOLLOW、2MB 上限、排除 CLAUDE.md——指令 ≠ 记忆）。

### 4.2 亮点

1. **fail-safe 一以贯之**：consolidation 错判 → DISTINCT、hook fail-open、judge 降级梯度、检索 BM25 降级阶梯——「宁可写多，不可错删」。
2. **redact-first 安全工程**：hash 之前脱敏、LLM 输出边界再脱敏、consolidator 调用前再脱敏。
3. **双时态有效性**：superseded/expired ×0.5 直接回答「哪个答案是现在的事实」。
4. **非损失构造**：distill 只增不改源、supersede 永不删除，用户可随时手工编辑 Markdown。
5. **崩溃安全与幂等**：导入「先写新再降旧 + 注册表 canonical + repaired 自愈」。

### 4.3 不足

1. brute-force 余弦规模上限（~50k chunks 前够用）；NeighborIndex 每次 sweep 全量重嵌入，大 vault 慢。
2. consolidation 全押 LLM tier（0.75 闸门自认粗滤，重建需对约一半候选调 LLM）。
3. native import 是手动命令，一次仅一个 source。
4. 提取式 distiller 无 key 时记忆质量即原文转录。
5. 无合并：DUPLICATE 只跳过不合并，冲突解决依赖 SUPERSEDES 单链。

### 4.4 可借鉴（映射本插件）

- **redact 最先**：P0-1 的顺序原则（脱敏在任何 hash/存储之前）。
- **SUPERSEDES 不删除 + 降权**：本插件 supersedes 目前只作维护线索；「旧条目保留 + 检索/注入降权」可作为 stale 判定的补充信号（候选）。
- **auto-recall 的门槛参数**（≥12 字符、k=3、fail-open）：P1-4 轮级召回直接照抄。
- **注入信任边界**：每行 `>` 引用 + 「记忆是不可信历史数据」声明——本插件 `memory_get` 正文输出目前无引用边界，记忆内容本身可能携带网页注入（候选，成本极低）。
- **judge 缓存 tier 不得降级复用**：细节纪律，适用于未来任何判定缓存。
- **与 ADR-0009 互证**：本插件已否决「LLM 打分门槛」正是基于 agentcairn 的实践（浮点分数噪声大，「是否愿意蒸馏/是否被使用」的二值信号更可靠）。

---

## 5. OpenViking（Python，火山引擎开源 agentic context database）

核心代码：`openviking/session/memory/`（ExtractLoop/registry/updater）、`openviking/retrieve/`（context assembler/lifecycle）；文档 `docs/en/{api/16-memory,context-compilation/06-memory-consolidation,getters-started/09-memory}.md`。

### 5.1 怎么做的

把记忆做成「以 `viking://` URI 寻址的文件系统 + 向量索引 + LLM 提取流水线」，三层：Working Memory（会话级压缩，默认关）、长期记忆（`memories/` 按类型分目录）、Experience（执行轨迹蒸馏，独立训练流水线）：

- **存储**：类型即 YAML 模板（`memory_type_registry.py`）——字段级 merge_op（patch/replace/immutable/sum）、`filename_template`（**URI 即身份**：同名即 upsert 编辑而非新建）、operation_mode、content/embedding/overview 三模板；文件 = Markdown + 尾部 `<!-- MEMORY_FIELDS {json} -->`（含递增 version）；`.abstract.md`/`.overview.md` sidecar 异步向量化；关系图 link_enabled 默认 false（二等公民）。
- **写入**：session commit（手动/闲置自动/MCP remember）两阶段——Phase 1 path-lock 切分归档；Phase 2 持久化队列异步跑 **ExtractLoop**（自称简化 ReAct：单 LLM 带工具最多 3 迭代；**prefetch 用批量语义搜索替代盲目 ls**；write-before-read 守卫（想写没读过的文件 → 强制 refetch 续跑）；patch/URI/格式三类修复各限一次且保留有效首轮；输出 32K token 下限）。落盘靠 URI 渲染去重 + 字段级 merge_op 合并；`MEMORY_MERGE_POLICY` 硬性要求「相似只是候选证据，合并必须同 identity；删除/替换前每个原子事实必须恰好保留一次」；结果写 `memory_diff.json` 审计 trail（催生了标准化的排查 skill）。事后整理走 `ov compile memory`（原地、给模型 ls/search/read 三工具自主探索）。
- **读取**：`search(mode="context")` 一次往返产出可注入块——查询扩展（≤3 条）→ 6 桶分 purpose 配额召回 → **四级 detail tier**（uri → abstract → overview → full，默认层按类别，resources 封顶防凭据泄漏）→ **广度优先预算规划**（所有候选先落默认层，剩余预算三轮 upgrade，per-entry cap = 2×平均份额；文件头写明动机：分数挤在窄带时全押 top1 是坏赌注）→ **RecallLedger 跨轮去重**（已送达 URI 冷却不再注入）→ 可选 LLM rewrite digest。冷热公式：`hotness = sigmoid(log1p(active_count)) × exp(-ln2·age/7天)`。
- **交互面**：MCP 全套、HTTP API、CLI `ov`、约 10 个配置项、Studio；检索纪律写进 skill（advisory 定位、limit 5-10、读 1-3 个 URI、失败最多一次追加检索）。

### 5.2 亮点

1. schema-as-code + URI 即身份：「同身份更新/异身份新建」由 URI 渲染自然解决，字段级 merge_op 让合并语义显式化。
2. agentic 提取工程化：prefetch 替代盲 ls、write-before-read 守卫、四类修复各限一次，且有正交双指标的 A/B benchmark。
3. 服务端统一 context assembly 是真正的架构收敛点：tier 预算模型把 token 经济学做成显式参数，每条 tier 决策有成本论证。
4. 保守合并 + 可审计：diff trail 全程，rename 冲突不覆盖。
5. Experience lineage：记录应用轨迹与 outcome 分布，经验质量可评估。

### 5.3 不足

1. 写路径成本高：ReAct 3+ 轮、输出上限 32K、大批量多批串行，eager_prefetch 默认开进一步放大。
2. 图能力二等公民；单文件类型（profile）易 oversized，靠维护提示与事后 consolidation 缓解。
3. 合并质量依赖模型纪律，复杂身份合并（别名/改名）需人工。
4. self/peer 双空间 + 隔离 handler 心智负担高；客户端无钩子，纪律全押 skill 自觉。

### 5.4 可借鉴（映射本插件）

- **hotness 公式**：P0-3 时间衰减的直接来源（count 维度本插件已有 usedCount，age 用 lastUsedAt）。
- **分层预算 + per-entry cap + 广度优先**：B11 层间公平分配的同族思想（已借鉴）；「预算剩余时加深细节」的两档渲染在本插件真实库无剩余预算，不成立（B11 复核已撤销）。
- **RecallLedger 跨轮去重**：P1-4 轮级召回注入的必要组件（同 id 冷却不再注入），直接采纳。
- **memory_diff.json 审计 trail**：本插件维护流水 + 撤销已近似（已借鉴）；diff trail 的「排查 skill」思路对诊断视图有启发。
- **不学**：schema-as-code 模板化（多租户产品形态，单用户插件过度工程）；ReAct 式提取（成本模型不符）；peer 隔离（无此需求）。

---

## 6. hindsight（Python + TypeScript，vectorize-io 开源记忆 API）

核心代码：`hindsight-api-slim/hindsight_api/engine/`（memory_engine.py 2.4 万行中枢；retain/consolidation/search/memories/）；设计文章 `hindsight-docs/blog/2026-02-09-resolving-memory-conflicts.md`、`2026-03-12-spreading-activation-memory-graphs.md`。

### 6.1 怎么做的

独立部署记忆服务，三个动词：`retain`（写入）/ `recall`（检索）/ `reflect`（推理），主张「不是向量数据库」——原文重写为结构化事实、解析实体、构建因果/时间图，混合检索返回事实片段：

- **存储**：Postgres 单库三信号（向量 pgvector HNSW + BM25 tsvector + `memory_links` 图边表），不引入外部向量库/图库。`memory_units` 是核心事实单元：**5W（what/when/where/who/why）合成单句** + 本地 384 维嵌入 + **三时间戳**（`occurred_start/occurred_end/mentioned_at`，区间语义）+ fact_type（world/experience/observation）+ confidence/access_count/proof_count/tags。bank = recall 硬边界（「拼错 bank_id 静默得空库」），软分区靠 tags 严格匹配（`all_strict`）。
- **写入（retain 流水线）**：预检（嵌入可达，防 LLM 花费后才发现服务挂）→ 分块 → LLM 5W 抽取（**相对时间写入时解析为绝对日期、粗粒度日期展开为整段区间**、选择性抽取「六个月后还有用吗」、**momentary/lasting 二分**——寒暄/当下状态不入库）→ 批嵌入 → 实体解析（精确 LOWER → trigram 相似，「词序无关但数字必须匹配」防 John/Jane Smith 陷阱）→ 三类链接（temporal 时间邻近 / semantic 余弦 ≥0.7 / causal 由 LLM 抽取且**只能引用更早的 fact**防幻觉）→ content_hash delta retain（重存长文档只处理变化块）→ fold 合并积压。**consolidation 异步冲突解决**：复用 recall 系统查候选（tags all_strict 保证不跨安全域合并）→ LLM 四判定 `unrelated/repeats/changes/ends`（changes 保留旧值作历史叙事；ends 过去式+日期并级联终结派生事实）→ **时间比较由代码做**（observation 比 input 新则不覆盖，源自真实 issue）→ tags 求并集 → 每次变更 append `previous_text/reason/source_id` 历史（独立表）。
- **读取（recall 五阶段，全程不调 LLM）**：N fact_type × 4 检索臂并行（语义+BM25 合并一条 SQL、图臂实体自 join+kNN 边+causal 边、temporal spreading activation：窗口 8 桶选入口铺满时间轴、batch 20/每源 10/5 跳/causal boost 2.0×0.7 衰减）→ RRF 或 interleave 融合（**dedup 场景刻意用 interleave**——RRF 会把语义 #1 的孪生 observation 沉底导致 LLM 看不到而建重复）→ per-source cap 防单臂灌满 → 本地 cross-encoder 重排 → 组合评分（recency 半衰期/temporal/proof_count boost）→ MMR 多样性 → max_tokens 截断。三级预算（臂 cap → 图节点预算 → 返回 token）保证最坏成本有界。
- **分层知识金字塔**：raw facts → observations（后台 consolidation，带 proof_count 与 append-only 历史）→ mental models（自刷新持久摘要，有新证据才刷）。
- **交互面**：MCP（retain/sync_retain/recall/reflect/bank CRUD）、REST 全套、官方 skill 工作流（**recall first**；纠正错误的记忆而不是加一条矛盾的；bank=URL 隔离）、hindsight-embed 本地零部署形态、**memory-defense**（45 个正则：各厂 API key/连接串/JWT/信用卡/SSN，redact 或 block 两模式，命中 webhook + 审计）。

### 6.2 亮点

1. 单 Postgres 承载三信号：事务一致、外键级联（删记忆连带图边）、schema 级多租户。
2. 事实记录 schema 是范本：5W 单句 + 三时间戳 + fact_type + proof_count + text_signals（实体名 + 拼写出的日期富化检索）。
3. 冲突处理是「时间演化叙事」而非覆盖：四判定 + 代码比时间 + momentary/lasting + tags 并集安全边界——全仓库最有借鉴价值的设计之一。
4. recall 不调 LLM（本地嵌入 + 可选本地 rerank），读路径足够便宜才能每 turn 自动注入；reflect 才进 LLM。
5. 检索工程细节密度极高：每条优化有 issue 编号和测量依据（interleave 保 twin、语义行免费兼作 graph 种子、字节级写入预算、单 worker 时间解析线程池 1.3s→2.8ms）。

### 6.3 不足

1. 写入路径很重：每次 retain = 分块 + LLM 抽取 + 嵌入 + 实体 + 建边 + 后台 consolidation。
2. consolidation 依赖小模型 prompt 工程（规则为 gemma-4 从 29/40 调到 36-38/40），跨模型稳定性靠持续 evals 维护。
3. 图稀疏时 temporal spreading 退化为普通时间过滤。
4. 复杂度门槛：116 个 migration、2.4 万行 engine——重实现不现实，参考架构价值与风险并存。
5. bank 是硬边界，无跨 bank 查询。

### 6.4 可借鉴（映射本插件）

- **memory-defense 正则拦截**：P0-1 的模式清单来源（高置信窄匹配 + 拒绝式，不做自动改写）。
- **冲突三策略 + 时间由代码比**：P1-5 的直接来源（提炼 prompt/save 描述补 changes/ends 语义；维护研判「谁新谁旧」按 updatedAt/supersedes 链的证据而非模型猜测）。
- **momentary/lasting 写入二分**：本插件提炼负面清单已覆盖（已借鉴）。
- **相对时间写入时解析为绝对日期**：候选池（涉及 schema/正文约定，随 v4 评估）。
- **recall 不调 LLM 原则**：本插件 `memory_search` 本就是纯文本覆盖排序（P1-4 轮级召回的成本前提由此成立）。
- **append-only 变更历史**：本插件维护流水 + trash 30 天已近似（已借鉴）。
- **不学**：图结构/spreading activation（因果边要 LLM 抽取，89 条规模收益为零）；bank 硬隔离（单用户无此需求）；116-migration 级复杂度。

---

## 7. deepseek-harness（DSH 宿主官方仓库，本插件的运行环境）

分析视角：宿主为记忆类插件提供哪些能力/接口/官方推荐。核心依据：`docs/cookbook/extension-cookbook.md`、`docs/user/guide/mcp-memory.md`、`packages/core/system-prompt/src/index.ts`、`packages/core/agent/src/runtime-types.ts`、`docs/subsystems/{mcp,storage}.md`。

### 7.1 宿主的记忆立场

**零内置记忆，且明确拒绝内置**。官方 feature → mechanism map 只有一行：`Memory | section provider + tool`——记忆被官方定位为**由插件用 system prompt 段提供器 + 工具注册组合实现的能力**（`extension-cookbook.md:127`）。用户侧官方推荐接第三方 MCP memory server（三个 default-off 参考配置：Memorix / @modelcontextprotocol/server-memory / Engram），DSH 只负责 overlay 解析、进程启停、工具发现注册，账号/auth/模型/embedding/存储/迁移全部上游负责。宿主已有的「类记忆」能力：AGENTS.md 指令链（65,536 字节预算渐进发现）、session-search（工具式跨会话查询）、compaction（上下文压缩，非长期记忆）。

### 7.2 宿主提供的扩展点（插件侧调用方式）

| 扩展点 | 位置 | 记忆插件用途 |
|---|---|---|
| `ctx.systemPrompt.section/context/variable` | `system-prompt/src/index.ts:484-528` | 静态指南段 + 动态 runtime context（本插件已用） |
| `agent/created`（含 SessionStartSource: fresh/resume/clear/compaction） | `runtime-types.ts:290` | 等价 SessionStart：会话启动召回注入 |
| `agent.inject(message)` | `runtime-types.ts:262-270` | 排队模型可见上下文到下一 pre-step（**轮级注入的正确挂点，本插件未用**） |
| `agent/turn-stopping` / `agent/disposed` | `runtime-types.ts:417,299` | 本插件已用（缓冲 + 批量落盘） |
| `tools/result` | `tools/events.ts:49` | 只读观察工具结果（实时观察类插件的挂点，本插件成本模型不用） |
| `ctx.storageDomain` | `docs/subsystems/storage.md:95-149` | schema 校验 + 版本迁移 + `domain/changed` 变更通知 |
| `ctx.tools.register/restrict/guard` | `extension-cookbook.md:115-119` | 工具面精确控制 |
| `ConversationNodeDefinition` | `conversation.ts:213` | 对话流内渲染记忆事件卡片 |

### 7.3 对本插件的位置判断

1. 本插件就是官方 map（section + tool）的**完整实现形态**：section/context（注入）+ 四工具（面）+ capture（沉淀）+ 维护——官方 map 里没有预留 memory 槽位（`SECTION_ORDERS` 无 memory 项），这一层完全留给插件。
2. MCP 路径的三大缺口——自动召回注入、语义检索、沉淀管道——正是原生插件的补位空间；本插件已覆盖第一、三项，第二项受零依赖约束不做。
3. `agent.inject()` 未用：P1-4 轮级召回的宿主侧挂点，需真机验证呈现位置与去重行为。
4. 自管 Markdown 文件而非 `ctx.storageDomain`：**维持**——Markdown 真源（用户可手改、可导出可读）是核心设计，storageDomain 的收益（schema 校验/变更通知）不抵迁移成本。
5. 官方明确拒绝的方向（per-provider 插件、preset registry、npx 启动、通用记忆指令 patch persona 段）与本插件无冲突；本插件用自有命名 section 注入，不 patch 宿主 persona，符合官方责任边界精神。

---

## 8. 与本插件现状的对照基线

本插件（`dsh-agent-extension` preview.27，B0–B11 已交付）：Markdown 真源五类型事实库 + scope 全局/项目；schema v3（tier short/long）；会话首步快照注入（两层公平分配、只放 active+long、3000 字符）；`memory_search`（覆盖排序 + 高频降噪）/`memory_get`（≤3 条/4,000 字符）/`memory_save`（相似吸收 0.75）/`memory_forget`；会话末提炼（闸门 + no-op 优先 + 负面清单）；观察期生命周期（消费/强化升级、probation、两阶段研判、trash 30 天）；维护手动 + 自动触发；usage.json 派生消费账。

关键差距（对应下节建议）：

1. 写入路径无确定性 secrets 拦截（只有提炼 prompt 一句话）——codex/agentcairn/claude-mem/hindsight 四家共同实践。
2. B10 注入抬头立了引用规约但无解析承接，且 id 为 `randomUUID()` 引用成本高——codex 闭环悬空。
3. 注入排序无时间衰减——importance 是写入时预测，未按 OpenViking/hindsight 方式被「多新」修正。
4. 注入仅会话首步一次——长会话任务转向后偏离（agentcairn/hindsight/claude-mem 均有轮级通道）。
5. 冲突处理只有 supersedes 线索，缺 changes/ends 显式语义——hindsight 最强。

---

## 9. 横向总结与借鉴映射

### 9.1 七项目共性套路（全部或绝大多数项目遵守）

1. **写入与主对话解耦**：后台任务/hook/sweep，绝不阻塞前台（claude-mem 的「永不阻塞宿主」成文契约最严格）。
2. **闸门内嵌在专用提炼 prompt，而非工具描述**：no-op 是一等输出、负面清单显式化（codex/agentcairn/ZCode 共性）。
3. **查重 = 先查后写 + 确定性账本**：hash 台账（agentcairn）/URI 身份（OpenViking）/content_hash（claude-mem/hindsight）/指纹强化（本插件）。
4. **淘汰靠使用信号**：usage_count/last_used 半衰期（codex/OpenViking/hindsight）+ 强化史（claude-mem ACT-R）+ 两阶段人工兜底（本插件）。
5. **渐进披露**：索引 → 摘要 → 详情分层注入，细节按需读取（codex 三层 / claude-mem 四层 / 本插件索引行 + memory_get）。
6. **注入预算显式化且测量式**：字符/token 硬上限 + 截断必须可见（claude-mem fitter / OpenViking budget.py / ZCode 精确 warning）。
7. **fail-safe：宁可多写不可错删**：consolidation 错判 → DISTINCT（agentcairn）、冲突不覆盖（OpenViking）、时间比较由代码做（hindsight）。
8. **prompt 文本当合同**：fixture 冻结验收（ZCode）/ 持续 evals（hindsight）/ 形状校验（codex）——prompt 改动必须可回归。

### 9.2 关键分歧点（本插件的站队与理由）

| 分歧 | 一侧 | 另一侧 | 本插件站队 |
|---|---|---|---|
| 写入时机 | 逐工具实时观察（claude-mem） | 会话末批量/启动流水线（本插件/ZCode/codex） | 会话末 ≤1 次提炼——成本实测定的，维持 |
| 注入方式 | 静态索引快照（本插件/ZCode/codex） | 每条 prompt 主动召回（agentcairn/hindsight/claude-mem） | 快照为主，P1-4 补轻量轮级召回 |
| 整合执行 | LLM 全量研判（codex phase2/OpenViking/hindsight） | 规则预筛 + LLM 研判（本插件） | B9 已改全量研判 + 确定性短路，居中 |
| 检索 | 纯文本/关键词（本插件/codex/ZCode） | 向量（claude-mem/agentcairn/OpenViking/hindsight） | 纯文本——零运行时依赖硬约束，宿主提供 embedding 前不评估 |

### 9.3 借鉴优先级总表（承接 2026-11-11 优化建议）

| 优先级 | 建议 | 来源项目 | 状态 |
|---|---|---|---|
| P0 | 写入路径 secrets 确定性拦截（高置信正则 + 整条拒绝） | hindsight memory-defense、agentcairn redact-first、claude-mem redaction | 候选 |
| P0 | 消费闭环补最后一环：assistant 文本引用回写 usage + 新条目短 id | codex citation 闭环 | 候选 |
| P0 | 注入排序纳入时间衰减（importance × recency 半衰期） | OpenViking hotness、hindsight recency boost | 候选（与「hotness stale 判定」共用实现） |
| P1 | 轮级轻量召回注入（≥12 字门槛、k≤5、已注入冷却、fail-open） | agentcairn auto-recall、OpenViking RecallLedger | 候选（宿主 `agent.inject()` 需真机验证） |
| P1 | 冲突处理显式化（changes/ends 语义 + 时间由代码比） | hindsight consolidation | 候选 |
| P1 | 外部记忆导入桥（plan/apply 分离、幂等） | agentcairn native_memory、codex external_agent_import | roadmap 候选②提前 |
| P2 | prompt 文本 fixture 化验收 | ZCode 黄金文本 | 候选 |
| P2 | `memory_get` 正文信任边界（引用块 + 数据非指令声明） | agentcairn、codex | 候选 |
| P2 | ACT-R 强化日期史（schema v4） | claude-mem reinforcement_dates | 既列候选，P0-3 落地后可降级 |
| 不做 | embedding/向量、逐工具实时观察、图结构、LLM 打分门槛、schema 模板化、团队共享 | — | 边界既定（见 §9.2 与 ADR-0009） |

### 9.4 使用说明

- 本文只记录事实与映射，不排期；批次规划进 `memory-write-quality.md` 或后续规划文档。
- 行号会漂移，引用时以文件为准；`.reference/` 快照升级后按 §10 方法复核各项目版本。
- 各家「不足」一节同样重要：多数设计分歧（如 selector 静默失败、无持久重放）是负面教材，避免照搬。
