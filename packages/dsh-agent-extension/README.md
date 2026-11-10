# dsh-agent-extension

> **试验性预览版（`0.0.1-preview.19`）**：仅供内部试验，接口与能力随时可能变化，不保证兼容，暂不对外推广。
> npm 上只发布 `preview` dist-tag（`latest` 暂不指向本版本）。
> 需要安装时请锁定精确版本：
> `dsh plugin --profile web add dsh-agent-extension@0.0.1-preview.19`。
> 版本说明：npm 公开线为 `0.0.1-preview.N`，首个正式版定为 `0.0.1`（预览线的稳定版）；
> 官方化工具链形态（TypeScript + JSX + CSS Modules + tsdown + vitest，对齐官方插件形态，
> 破坏性重构、不做旧版兼容）自 `dsh-agent-plugin-hub` 时代的 `0.0.1-preview.6` 延续；
> 更名为 `dsh-agent-extension` 后从 `0.0.1-preview.0` 重新起线，不继承旧版本号与旧数据
> （新数据目录 `~/.dsh/agent-extension`）。

DSH 的**智能体扩展**（Agent Extension）：管理智能体插件、技能、MCP 等扩展，带一个
**ZCode「插件市场」同构的商店面板**，并内置**跨会话记忆**（全局 + 项目双作用域）。

> 命名：本包托管的是 Claude Code / CodeBuddy / ZCode 等 Agent 的插件资产包。
> “Agent”直译为“代理”不准确，译为“助手”又容易和通用助手混淆；单叫“插件”会与
> DSH 自身的 cordis 插件混淆，因此文档里用**智能体插件**（英文 Agent Plugins）指代
> 这类资产包。本包定位是比智能体插件更大一层的外壳——未来还会纳管 skill、MCP 等
> 更多扩展，故包名与界面统一为**智能体扩展**（英文 Agent Extension）；Agent 插件
> 域层标识（`/agent-plugin` 命令与 `/agent-plugin/api` 数据面）保持不变。

智能体插件指跨 Harness 的插件资产包：`plugin.json` 加 `skills/`、`commands/`、`hooks/`、
`mcpServers` 等能力。已知格式包括 Claude Code、CodeBuddy、ZCode；它们不是 DSH 插件
（cordis bundle）。本包自己才是 DSH 插件，负责把智能体插件装进 DSH，并把能力注册成
DSH 的技能、命令、hooks 与 MCP。

## 0.0.1-preview.19 变更（记忆 v2 · B2 捕获）

- **最近捕获与撤销**：设置对话框新增「最近捕获」列表（最近 5 条，显示时间、写入条数、跳过原因/错误），
  对该次捕获新增的条目可一键撤销（`POST /agent-plugin/api/memory/undo-capture {id}`，归档而非删除，
  强化条目不回退）；
- **利用率采集**：`memory_search` / `memory_get` 命中只更新内存，`agent/turn-stopping`、会话结束、
  30 秒兜底定时器与插件销毁时批量落盘到派生 `memory/usage.json`（不写回记忆 Markdown，可重建）；
- **捕获样本**：`stats.recentCaptures` 条目新增 `id` 与 `created[]`（该次新增条目的 id/作用域/项目引用），
  旧 stats.json 读取容错；
- **已知限制**：宿主 `ctx.commands` 没有 locale 能力，`/remember`、`/forget`、`/memory` 的命令文案保持中文；
  面板 UI 文案仍由八语言 locale 覆盖；
- **测试**：全量 298 个离线用例（新增 usage store、撤销路由、组件撤销交互）。

## 0.0.1-preview.18 变更（记忆 v2 · B1 注入与索引）

- **刷新索引**：记忆面板工具条新增「刷新索引」按钮 → `POST /agent-plugin/api/memory/refresh-index`，
  让当前进程内已缓存的会话索引失效，下一次装配重新渲染；条目列表不重载；
- **指标口径重定义**：设置对话框统计区显示「注入利用率」（Σ 注入回读 / Σ 注入）与
  「检索命中率」（Σ 检索结果被 get 打开 / Σ 检索结果）；分母为 0 时显示 `—`；
- **默认值收口（ADR-0005）**：`indexLimitGlobal` / `indexLimitProject` 默认 20、`maxChars` 默认 3,000；
  服务端读取旧 settings.json 时按新上限归一化（旧值 50/50/12000 实际按 20/20/3000 生效并展示）；
- **统计数据面**：`SessionRecallStats` 新增 `searched` 与 `searchUsed`，运行时按会话累计并在轮末落盘；
- **测试**：全量 286 个离线用例（新增刷新索引路由/指标归一化/客户端按钮用例）。

## 0.0.1-preview.17 变更（记忆子系统 v2 · B0 地基）

> 决策依据：[ADR-0005](../../docs/adr/0005-memory-recall-v2.md) ~ [ADR-0008](../../docs/adr/0008-host-ui-primitives-channel.md)；实施规划见 [`docs/memory-roadmap.md`](docs/memory-roadmap.md)。

- **schema v2 + 自动迁移**：条目新增 `lastUsedAt/usedCount/confidence/pinned/mergedFrom/source`，
  frontmatter 写 `schema: 2`；首次加载先把 v1 文件备份到 `memory/.backup-v1-<时间>/` 再就地补齐，
  幂等；旧 `MEMORY.md` 索引移入备份并停止生成；
- **召回改为会话首步快照**：索引按会话渲染一次并缓存，宿主按内容去重、会话压缩后自动重注入；
  分层注入（全局只放 `preference`/`decision`，项目只放 `gotcha`/`project`，每层 ≤20 条、总预算 3,000 字符），
  索引行含 `id · 类型 · 名称 · 80 字描述 · 重要性`；
- **取消轮末自动捕获**：改为模型主动 `memory_save`（先 `memory_search` 查重，仅显式要求或稳定事实才写）
  + 会话结束一次补漏提炼，每会话最多一次额外模型请求；`force` 关键词只对当前轮生效；
- **工具契约收紧**：`memory_search` 返回摘要行并把类型过滤下推到存储层；`memory_get` 单次 ≤3 条 /
  4,000 字符并显式提示截断；`memory_forget` 不再诱导模型二次调用归档；
- **数据面修复**：手改 Markdown 立即生效（文件 mtime+size 指纹）；`tags: []` 能清空；`supersedes`
  在更新与强化路径生效；未知 frontmatter 字段透传保留；进程内写串行化；统计数据面新增
  跳过原因、最近注入与最近捕获样本；
- **客户端共享类型**：服务端/浏览器共用 `src/shared/memory-wire.ts`，去掉重复声明与
  `indexLimitProject` 默认值漂移（统一 50）。
- **测试**：全量 281 个离线用例（新增迁移、运行时 fake 宿主用例）。

## 0.0.1-preview.5 变更（新增「记忆」能力）

- **双层作用域**：`global` 记忆属于用户、跨项目可见；`project` 记忆属于一个项目。
  项目身份优先取 git `origin` 远程 URL（规范化），因此同一仓库的多个 worktree 与独立克隆
  共享记忆；无 origin 退回首个远程，无远程退回 git common dir，无 git 退回工作目录路径；
  项目内 `.dsh/agent-extension/memory/config.json` 可固定/覆盖身份，并自动加入本地
  `.git/info/exclude`；
- **存储**：记忆内容只写插件 home 的 `memory/`（`global/`、`projects/<key>/`），一条事实一个
  Markdown（frontmatter + 正文），每个作用域一个 `MEMORY.md` 索引；`settings.json` /
  `stats.json` / `projects.json` 存设置、统计与项目登记。项目目录只写身份文件，写内容；
- **自动捕获**：轮末 `agent/turn-stopping` 先过便宜闸门（子代理/空轮/过短轮跳过），命中后
  异步调一次低温度提炼（0–3 条结构化事实，输出上限 1k tokens），单运行 + 单排队；
  用户显式「记住/以后都/never」跳过闸门；`agent/disposed` 可补一次全量补漏；
- **召回**：`systemPrompt.context` 注入有界索引（全局/项目各默认 50 条、总 12k 字符），
  `systemPrompt.section` 提供使用指南；`memory_search` / `memory_get` / `memory_save` /
  `memory_forget` 四个工具按需取详情与维护，`/remember`、`/forget`、`/memory` 为人用入口；
- **生命周期**：指纹相同只强化不新增；`supersedes`/`memory_forget`/`/forget` 计票，
  一票 `stale`（不注入、仍可检索），两票 `archived`（默认不可见），界面可恢复或彻底删除；
- **管理面板**：记忆 tab 支持全局/项目切换、搜索、类型筛选、新建/编辑/停用/归档/删除、
  捕获与注入开关、索引条数与字符预算、捕获次数与注入命中率、导出 Markdown；
- **新测试**：记忆存储/身份/捕获/路由 23 个用例 + 客户端 9 个组件用例（全量 225 个离线用例）。

## 0.0.1-preview.6 变更（对齐 DeepSeek Harness 官方插件形态的全量重构）

- **工具链官方化**：TypeScript + JSX + CSS Modules + tsdown 构建 + vitest，全部进
  `devDependencies`（`dependencies` 保持为空，react 与宿主服务由宿主注入）；源码在
  `src/`（服务端 `*.ts` 函数插件形 + 客户端 `client/*.tsx` 组件），构建产物 `lib/`
  入库（`lib/index.js` ESM 宿主半 + `lib/client.js` CJS 浏览器工厂闭包，构建行为
  逐项对齐官方 `packages/client/tsdown.client.ts` 预设）；
- **客户端重写**：废弃 2300 行手写 `h = createElement` 单文件、内联 CSS 与内联字典，
  改为纯 props 组件 + `*.module.css`（只消费 `--dsw-alias-*` token，删除自带
  `--aph-*` 调色板；`:hover` 包 `@media (hover: hover)`；遮罩不加 blur；elevated
  面 `border:0` + `--dsw-elevation-*`；全圆形状全部配 `corner-shape: round`）；
  Switch 对齐官方 `ui-primitives`（36×20、关闭态滑块恒亮 token）；
- **词典补齐官方 8 语言**（zh/en/ja/es/fr/de/ru/pt，153 键同集），locale 注册包进
  `ctx.effect`；`locale/*.json` 只保留 `meta.title/description` 供市场索引；
- **错误处理**：`HubError` 保留，全部 throw 站点显式 `code`，废除中文猜码
  `guessCode`；未知异常统一归 `internal`；
- **日志**：诊断统一走 `ctx.logger`（`dsh-agent-extension: ` 前缀），`hub.log`
  落盘双写保留；
- **访问控制**：`isAdmitted` 补齐 `sec-fetch-site: cross-site` 拒绝（对齐官方
  fence；回环、同源 Origin、null 拒绝此前已具备）；
- **测试**：node:test 全量迁 vitest（150 个离线用例），客户端组件用
  `@vitest-environment jsdom` + @testing-library/react 按用户可见行为断言；
  旧 client.js vm 冒烟与 CSS 字符串探针的**意图**以新形态重写
  （corner-shape 配对回归、hover 门控、无 blur、无本地调色板、产物工厂闭包形态）；
- **破坏性变更**：`exports["./client"]` 改指 `lib/client.js`；HTTP API 契约与
  磁盘数据（state/marketplaces v2、安装 cache 布局）保持不变，旧数据自动可读。

## 0.3.10 变更（修复全圆形状被宿主 superellipse 压方）

- 宿主 ui-theme 对所有元素与伪元素全局套 `corner-shape: superellipse(1.5)`，
  其规范要求全圆形状（胶囊 999px / 圆 50%）在自己的规则里配 `corner-shape: round`
  退出；面板此前未退出，导致开关滑块被压成方圆、胶囊两端被削方（「不够圆」）；
- 为全部 7 处全圆形状补齐配对：开关轨道、开关滑块、胶囊按钮、分段 pill、
  徽标、可更新徽标、加载圈；
- 新增回归测试：逐条检查 CSS 规则，凡 `border-radius: 999px/50%` 必须配
  `corner-shape: round`；`npm test` 162/162。

## 0.3.9 变更（启停开关对齐宿主原生 Switch）

- 开关样式整体对齐宿主 `ui-primitives` Switch：轨道 36×20（原 32×18）、16px 滑块
  以 transform 位移；
- 新增开关专用 token `--aph-switch-track` / `--aph-switch-thumb`（取宿主
  `border-l3` 与 `switch-thumb` 同款值）：关闭态滑块在两种主题下**恒为亮色**
  （暗色 #adb2b8），修复此前暗色关闭态「亮轨道 + 黑色滑块」的怪异观感；
- 开启态滑块改读前景色（`--aph-primary-fg`），与品牌色轨道形成对比；
- dark-theme 测试同步更新并锁定两枚新 token 的明暗取值；`npm test` 161/161。

## 0.3.8 变更（图标与开关视觉修正）

- 修复 search / info / anchor 图标的圆环被画成实心圆点的问题：Icon 表新增描边
  circle 形态（`{ circle: [x, y, r] }`），放大镜等恢复 lucide 原版描边外观，
  more 省略号保持实心；
- 插件头像缺图 / 加载失败的兜底从「首字母」改为中性 Blocks 拼图图标（对齐 ZCode
  PluginIcon 的降级策略），与真实图标外层形态一致，不再出现装饰性字母；
- 启停开关滑块对齐 ZCode Switch 几何：16px 滑块、1px 内边距、选中右移 15px，
  视觉不再偏小发飘；
- 左侧栏面板图标按宿主下发的尺寸原样渲染（去掉 1.12 倍放大），与相邻面板图标一致；
- `npm test` 161/161。

## 0.3.7 变更（商店交互修复与可达性）

- 修复详情页兜底安装把展示标题当插件名导致 404：市场条目缺失时改为禁用按钮并提示来源缺失；
- 修复回滚交互：历史版本行可回滚到**所选版本**（Host `/rollback` 新增可选 `version` 字段），
  不再对任意行都回滚到最新可用版本；
- 详情描述失败不再停在加载块：错误态区分「联网获取详情」（`POST /describe {fetch:true}`）
  与「重试」，未缓存的 Git 市场条目可在线拉取详情；
- 陈旧详情响应不再覆盖用户已切换的详情（竞态守卫）；
- 错误 toast 按 Host 稳定错误码本地化（`not_found` / `conflict` / `operation_in_progress` 等），
  未映射错误码回退服务端原文；
- 插件管理页补错误条与刷新忙碌指示；首屏加载态显示「正在加载插件…」，与空态区分；
- 键盘可达性：菜单与弹窗支持 Escape 关闭、关闭后焦点还原到触发元素；弹窗遮罩改为
  click 关闭（拖拽选中文本不再误关）；「全部更新」失败列表只展示前 3 个；
- 服务端：覆盖安装改为「备份-换位-清理」原子替换，消除「先删后改名」窗口导致的插件丢失；
  回滚先校验目标版本与清单、全部成功后才交换记录，失败不丢历史版本；hooks matcher
  长度上限 256（超长按字面比较）缓解 ReDoS；API Origin 校验兼容 https 同源；
- 清理死 UI/死代码：移除占位「个人」分段 pill 与未引用文案 key；详情页 MCP 徽标按
  runtime 数据渲染；layout 测试对 CRLF 检出鲁棒；
- `npm test` 159/159（新增 12 个回归用例）。

## 0.3.6 变更（内容列居中，左右留空）

- 页面内容列对齐 ZCode Settings 的 `SETTINGS_FRAME_CONTENT_CLASSNAME`：
  `max-width: 896px`（`max-w-4xl`）+ `margin: 0 auto`，默认左右 16px、宽容器 32px 留白。
- 商店、插件管理、详情三页共用同一内容列，宽屏下不再铺满整个中间面板，左右留出空白。
- 新增 layout 测试断言内容列与左右留白；`npm test` 147/147。

## 0.3.5 变更（换行与截断优化）

- **组件行改为上下堆叠**：MCP / 技能 / 命令 / Hooks 行现在是「图标 + 名称 + 描述（单行截断）+ 右侧开关/徽标」，
  描述不再放在开关前挤成一行，修复长描述导致的换行错乱（与 ZCode 组件行结构一致）。
- **单行文本统一截断 + title 提示**：卡片标题/描述/副标题、来源名称与路径、组件名称/描述、
  信息值（含外链）、回滚版本行、弹窗标题、菜单项；截断元素都补了 `title`，悬停可看全文。
- **多行文本统一可换行**：详情描述（保留换行）、弹窗内容、Toast、错误/警告/风险条、占位文案、
  高级信息值；长 URL/路径用 `overflow-wrap:anywhere`，不再溢出容器。
- **窄宽度适配**：详情头部与按钮允许换行、信息行标签不换行、弹窗底部按钮可换行。
- 新增 `test/layout.test.mjs`（3 个用例）锁定单行截断/多行换行/组件行结构；`npm test` 146/146。

## 0.3.4 变更（弹窗重影修复）

- **只渲染栈顶弹窗**：`OverlayHost` 现在只渲染 `dialogs` 栈顶的弹窗。此前在「市场源」弹窗上再打开
  「确认移除」时，底层弹窗仍会渲染并透过遮罩显示，形成与当前弹窗不对齐的黑色重影；关闭确认弹窗后
  自动回到底层弹窗。
- **阴影对齐 ZCode `shadow-md`**：弹窗与菜单从 24/10px 偏移的大黑影改为 ZCode 的
  `0 4px 6px -1px rgba(0,0,0,.1), 0 2px 4px -2px rgba(0,0,0,.1)`；Toast 阴影改为 `0 4px 12px rgba(0,0,0,.15)`；
  模态遮罩按 ZCode 用 `rgba(0,0,0,.6)` + `blur(2px)`。
- 测试：新增「只渲染栈顶弹窗」与「弹窗/菜单使用 shadow-md」断言；`npm test` 143/143。

## 0.3.3 变更（暗色调色板与图标对齐 ZCode）

- **调色板改为 ZCode ZaiLight / ZaiDark**：不再借用宿主 `--dsw-alias-*` 语义色（暗色下偏灰），改为显式两套值，按 `body[data-ds-dark-theme]` 切换：
  背景 `#f8f8f8` / `#161616`，卡片与输入框 `#ffffff` / `#2b2b2b`，次级按钮 `#e6e6e6` / `#363636`，
  主色 `#000000` / `#ffffff`，前景 `neutral-800` / `neutral-300`，边框 10%、悬停 5%、选中 10%，
  success `#1e8a3e` / `#46bf72`，warning `#e07b00` / `#ff8a30`，danger `#e03131` / `#ff5c5c`，
  Toast 卡片 `#ffffff` / `#2b2b2b`。
- **按钮对齐 ZCode `Button`**：primary（主色底 + primary-foreground 字 + hover 80%）、secondary（secondary 底）、
  destructive（红底白字）、ghost；搜索框/输入框对齐 ZCode `Input`（input 底色 + border + 聚焦 border）。
- **开关对齐 ZCode `Switch`**：选中滑轨 `primary`、未选中 `primary` 30% 透明，滑块始终 `primary-foreground`。
- **图标对齐 ZCode lucide**：`Store`（店铺）、`Blocks`（无图标回退，三块拼图）、`Puzzle`（侧栏入口）、
  `RotateCcw`（回滚）；去掉安装按钮上多余的 Download（ZCode 安装按钮无图标）；图标统一 `stroke=2`。
- `test/dark-theme.test.mjs` 扩展到 5 个用例，覆盖两套调色板、按钮/开关/Toast/hover 与图标形状；`npm test` 142/142。

## 0.3.2 变更（启停开关对齐宿主 Switch）

- 启停开关按宿主 `Switch` 原语对齐：选中滑轨 `--dsw-alias-brand-primary`，**选中滑块
  `--dsw-alias-label-primary-foreground`（暗色近黑）**；未选中滑轨 `--dsw-alias-border-l3`、
  滑块 `--dsw-alias-switch-thumb`。修复暗色下「滑块偏灰、不够黑」的观感。
- `test/dark-theme.test.mjs` 增加断言：选中滑块必须走 `label-primary-foreground`，
  未选中滑块必须走 `switch-thumb`。

## 0.3.1 变更（0.3.0 + 暗色适配修复）

- **暗色按钮修复**：主色按钮文字改用宿主 `--dsw-alias-label-primary-foreground`（亮色近白、暗色近黑），
  背景/hover 改用 `--dsw-alias-button-primary-fill/-hover`；开关滑块改用 `--dsw-alias-switch-thumb`
  （暗色为中性灰、不再与近白主色混在一起）；Toast 改用 `--dsw-alias-toast-bg/-label`；卡片/菜单/
  分段等 hover 与选中态改用 `--dsw-alias-interactive-bg-hover/-active`，不再自造明暗两套混色。
  修复前暗色下「插件管理」「添加」提交等主色按钮是白底白字不可见。
- 新增 `test/dark-theme.test.mjs` 回归：禁止主色按钮硬编码白字、开关滑块硬编码白底、hover 自造混色。

## 0.3.0 变更

- **商店式面板**：首页左侧栏「智能体插件」入口打开 ZCode 风格商店：顶栏（刷新 / 市场源 /
  添加 / 插件管理）、首页双 tab（**我的市场** = 个人分段 + 搜索 + 按市场源分组的双列卡片 +
  >6 张折叠；**推荐** = 内置精选市场源清单，点击进入市场详情页看全部插件（GitHub 源 raw 直取、
  支持刷新；已添加市场与「我的市场」同款卡片，可直接安装），插件卡片可再点开描述）、详情页（64px
  图标、MCP/技能/命令/Hooks 分区、信息区、高级信息与回滚）；已安装管理视图（启停筛选、
  全部更新、开关/更新/卸载）；市场源弹窗与添加弹窗。
- **只提供个人插件**：不展示「应用插件」专区、公开/社区分段（hub 无官方目录与 UI surface 数据）。
- **市场源自动识别**：添加弹窗只有一个地址输入，Host 自动判定本地目录 / Git 仓库 /
  marketplace.json 直链，并自动探测 Claude/CodeBuddy/ZCode 格式；`/agent-plugin market add`
  仍保留显式类型参数。
- **数据 schema v2 + 迁移**：主代码只处理当前 schema；升级后宿主启动时由
  `lib/migrate.js` 一次性把 v1 的 `state.json` / `marketplaces.json` 迁移到 v2，迁移前备份到
  `logs/migrations/v1-<时间>/`；失败保留原文件并在面板展示原因。
- **修复**：git 市场重启后 `refresh/install/update` 抛 Node TypeError（`market.root` 未持久化）；
  版本比较的预发布排序错误（`beta.10` 曾小于 `beta.2`）与非法版本兜底误判。
- **接口精简**：UI 只认 `GET /agent-plugin/api/store`、`GET|POST /describe`、`GET /icon`
  与写接口；不保留旧路由/旧字段兼容层（Client 与 Host 同版本发布）。

## 快速开始

```text
/agent-plugin market add local  E:\my-agent-plugins\market
/agent-plugin install demo-plugin
/agent-plugin list
/agent-plugin info demo-plugin
```

`/agent-plugin` 是本包唯一的命令入口；已安装智能体插件自带的命令会注册成
`/<插件名>-<命令名>`。

## 首页左侧栏：智能体扩展（0.3.6）

位置：**首页左侧栏**，顺序为 **插件(0) → 智能体扩展(5) → 自动化任务(10) → 上下文洞察(20)**。
面板由 `src/client/index.ts`（构建产物 `lib/client.js`）注册到 `sidebar.panellist`、
`main`（key `agent-extension`）与 `shell.overlay`（弹窗 / Toast 框架级浮层）。

- **分区子 tab**：面板顶栏左侧是标题、右侧是「插件 / 记忆 / 技能」三个子 tab；原有商店、
  详情与插件管理全部收进「插件」分区，原顶栏操作按钮（刷新 / 市场源 / 添加 / 插件管理）
  下移到商店工具行右侧；「记忆」「技能」当前为占位页，只展示即将上线提示。
- **搜索**：「我的市场」和「插件管理」的搜索改为与刷新按钮同尺寸的图标按钮，点击后在其下方
  浮出输入框；浮层内可直接清空，输入即筛选，关闭后查询保留、图标高亮提示当前有筛选。

- **商店列表**：来源分段只有「个人」；按市场源分组（组间按最近刷新倒序）、组内双列卡片；
  >6 张显示「收起」/「查看 A、B，以及另外 N 个」；搜索按名称/显示名/描述/分类/作者/
  关键词/市场名做不区分大小写子串匹配（首版不含拼音）。
- **添加市场源**：输入本地目录、Git 地址或 marketplace.json 直链；自动识别类型与格式；
  需要勾选风险提示。
- **详情**：安装/更新/回滚/卸载、逐项启停能力；未安装条目按需 describe（只读、失败可重试）；
  「高级信息」折叠展示安装路径、可回滚版本、告警与运行时状态。
- **插件管理**：已安装列表、全部/已启用/已禁用筛选、全部更新（串行、单失败不中断）、
  启停开关、卸载；底部显示全局运行状态。
- **市场源弹窗**：刷新/移除单个来源；移除后已安装插件保留但变为「来源已移除」，不再提供
  更新，重新添加同一来源后恢复。
- 视觉数值参照 ZCode：标题 18/600、卡片 40px 图标 + 14/500 标题 + 13px 单行描述、按钮 28/32、
  圆角 8/12/16、Toast / 弹窗挂 `shell.overlay`，明暗主题全部走宿主 `--dsw-alias-*` token。

首次安装/升级后：**Host 端需要重启一次 DSH** 才会加载新版插件代码；浏览器端如未出现左侧栏
图标，刷新一次页面即可（Client 代码由模块表加载）。若 Host API 不可用，面板内会显示原因。

> 启动顺序：宿主按「服务可用性」驱动插件激活，本插件只硬依赖 `commands`；
> `skills` / `webServer` / `subprocess` 可能在本插件 apply 之后才注册。因此技能 provider 与
> `/agent-plugin/api` 路由通过 `ctx.inject(deps, ...)` 延迟注册，hooks 的执行器改为事件时懒探测。

## 功能

### 市场源（market）

| 类型 | 用法 | 说明 |
|---|---|---|
| local | `/agent-plugin market add local <目录>` | 目录里有 `marketplace.json`（`.claude-plugin/`、`.codebuddy-plugin/`、`.zcode-plugin/` 或根级）；只有一个插件时直接把目录当市场 |
| git | `/agent-plugin market add git <仓库地址>` | 用系统 git **浅克隆**到 `cache/markets/<市场 id>/repo`；刷新时 `fetch + reset`，失败回退重新克隆 |
| url | `/agent-plugin market add url <marketplace.json 地址>` | HTTP(S) 拉取并快照；网络失败只记录 `refreshError`，不阻塞其它功能 |

首页面板的「添加插件市场」不需要选类型：Host 依次判断本地目录、Git 地址、HTTP(S)
（先按 JSON 拉取、失败再浅克隆），并自动探测插件格式。

`marketplace.json` 的 `source` 支持：

- `"./relative/path"`：相对 marketplace.json 所在目录解析，越界/绝对路径一律拒绝；
- `{"source":"github","repo":"owner/repo","commit"?,"path"?}`：系统 git 浅克隆；
- `{"source":"npm", ...}`：**MVP 暂不支持**，明确报错并保留扩展点。

展示元数据（可选）：市场级 `description` / `owner` / `featured`；条目级
`displayName(_i18n)` / `description_i18n` / `category` / `author` / `homepage` /
`repository` / `license` / `keywords` / `icon`。缺失时按 ZCode 的降级矩阵省略，不编造。

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
- 更新：刷新市场 → 解析新版本 → 装新目录 → 切换 active → 保留上一版本供回滚；版本不可比较
  时明确提示（不会误报「已是最新」或误升级）；
- 回滚：切回 `previousVersions` 里最近的可用版本；
- 禁用：只改状态，文件保留；卸载：删安装副本与状态；
- 来源删除后已安装插件保留（孤立），可继续启停/回滚/卸载/查看能力，但隐藏更新入口；
- 半装目录 / state 损坏：启动自检，损坏文件备份到 `logs/corrupt-*.json` 后重建，丢失目录的
  记录被剔除并记录告警。

### 能力注入

| 能力 | 宿主接口 | 说明 |
|---|---|---|
| skills | `ctx.skills.registerProvider` | 扫描 `skills/**/SKILL.md`，解析 frontmatter（name/description/allowed-tools/disable-model-invocation），content 原样，resourceBase 指向技能目录 |
| commands | `ctx.commands.register` | 注册为 `<plugin>-<command>`；渲染 Markdown 模板（`$ARGUMENTS`、`$1..$9`），冲突跳过并报告 |
| hooks | cordis 事件 + `ctx.subprocess` | PreToolUse→`tools/pre-execute`（可 deny）、PostToolUse→`tools/result`、UserPromptSubmit→`agent/inbox/inserted`、Stop→`agent/turn-stopping`、SessionStart→`session/created`、SessionEnd→`agent/disposed` |
| mcpServers | 无 | 宿主 `dsh-mcp-client` 只支持「一个插件行连一个 server」的静态配置，没有运行时挂载接口；本插件只解析/展示，详情页标注「未生效」 |

hook 命令按 Claude Code 约定执行：工作目录为插件根，stdin 传 JSON，退出码 2 或
`hookSpecificOutput.permissionDecision: "deny"` 表示阻断（仅 PreToolUse 可阻断）。
宿主没有对应事件的 hooks（Notification / SubagentStop / PreCompact 等）只保留清单。

### 记忆（memory）

跨会话保留智能体经验：自动捕获 + 显式写入两条通道，开场召回 + 按需检索两种用法。

| 概念 | 说明 |
|---|---|
| 作用域 | `global`（用户级、跨项目）/ `project`（单项目，worktree 与克隆共享） |
| 类型 | `preference` / `decision` / `gotcha` / `project` / `reference` |
| 捕获 | 模型主动 `memory_save`（先查重；仅显式要求或稳定偏好/决策/坑/项目事实才写）+ 会话结束一次补漏提炼；每会话最多一次额外模型请求 |
| 显式写入 | 模型工具 `memory_save`；用户命令 `/remember [global] <内容>` |
| 召回 | 会话首步注入分层索引快照（全局 `preference`/`decision`，项目 `gotcha`/`project`；每层 ≤20 条、预算 3,000 字符），`memory_search` 出摘要、`memory_get` 按需取全文（单次 ≤3 条 / 4,000 字符）；面板可显式刷新索引 |
| 过时 | 一票 `stale`（不注入、仍可搜），归档由维护 Run 或用户在面板确认 |
| 数据模型 | 条目 schema v2：`lastUsedAt/usedCount/confidence/pinned/mergedFrom/source`；首次加载自动迁移并备份 |
| 管理面板 | 记忆 tab：作用域切换、搜索、类型筛选、新建、开关、索引预算、统计、导出、记忆体检；详情弹窗可调元信息，「用系统应用打开」把仅正文的临时 Markdown 交给关联应用 |

写入即去重：名称/描述/正文指纹相同只强化原条目，不重复新增。记忆中不含项目内容：
项目目录只写 `.dsh/agent-extension/memory/config.json`（身份文件，已自动 exclude）。

### 运维命令（与面板等价）

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

逐项启停能力只在面板暴露（HTTP API 同样支持：`POST /agent-plugin/api/capability`）。

## Host API（当前版本唯一形态）

所有响应 `{ok:true,data}` / `{ok:false,error,code?}`；GET 只读，联网/写盘必须 POST；
只允许本机回环请求（Host 头 127.0.0.1 / localhost / [::1]），POST 还要求同源 Origin + JSON。

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/agent-plugin/api/store` | 面板唯一快照：markets / items / installed / runtime / ui / operations / migrationError |
| GET | `/agent-plugin/api/describe` | 单个插件详情（key 或 market+name；不联网） |
| POST | `/agent-plugin/api/describe` | 同上；`fetch:true` 才允许刷新市场/克隆来源 |
| GET | `/agent-plugin/api/icon` | 市场/安装副本内的 raster 图标（png/jpg/jpeg/webp/gif，≤256KiB） |
| POST | `/agent-plugin/api/market/add` | 仅凭 `location` 自动识别来源；返回 detectedType / format / pluginCount |
| POST | `/agent-plugin/api/market/refresh` | 省略 id 刷新全部；部分失败 200 + failures |
| POST | `/agent-plugin/api/market/remove` | 允许保留已安装插件，返回 orphaned |
| POST | `/agent-plugin/api/install`、`/uninstall`、`/enable`、`/update`、`/update-all`、`/rollback`、`/capability` | 插件动作 |

单写互斥：同一时刻只允许一个写操作，忙时返回 409 `operation_in_progress`。
数据结构与错误码见 [`docs/HOST-API.md`](docs/HOST-API.md)。

记忆数据面（同一前缀，同一信封与访问控制）：

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/agent-plugin/api/memory/state` | 设置 + 已知项目（含条目数）+ 统计（捕获计数、跳过原因、最近注入/捕获样本） |
| GET | `/agent-plugin/api/memory/list` | `scope=global|project`、`project=<key>`、`query`、`type`、`includeArchived`、`content=1` |
| GET | `/agent-plugin/api/memory/get` | 单条详情（`id`） |
| GET | `/agent-plugin/api/memory/preview-file` | 生成仅正文的预览 Markdown，返回 `{path, name, empty}` |
| POST | `/agent-plugin/api/memory/save` | 新建/更新（写）；同指纹只强化 |
| POST | `/agent-plugin/api/memory/status` | `active` / `stale` / `archived` |
| POST | `/agent-plugin/api/memory/delete` | 永久删除单条 |
| POST | `/agent-plugin/api/memory/settings` | 自动捕获、注入开关、索引条数、字符预算 |
| POST | `/agent-plugin/api/memory/export` | 导出单作用域 Markdown |

## 存储（schema v2）

home 解析：配置 `home` → `DSH_AGENT_EXTENSION_HOME` → `~/.dsh/agent-extension`。

```text
<home>/
├─ state.json            # schemaVersion=2 + plugins[]
├─ marketplaces.json     # schemaVersion=2 + markets[]（含 title/display/owner/featured/plugins[].meta）
├─ logs/migrations/      # 迁移前备份（v1-<时间>/state.json、marketplaces.json）
├─ cache/<format>/<market>/<plugin>/<version>/   # 安装副本
├─ cache/markets/<marketId>/                     # git 市场浅克隆 / url 快照 / 来源克隆
├─ logs/hub.log          # 运行日志；损坏文件备份也是 corrupt-*.json
├─ tmp/                  # 原子写临时文件与 hub.lock 进程锁
└─ memory/               # 记忆（条目 schema v2）
   ├─ settings.json      # 捕获/注入开关、索引条数、字符预算
   ├─ stats.json         # schema 2：捕获计数、跳过原因、最近注入/捕获样本、会话注入统计
   ├─ projects.json      # 已知项目身份登记（含已见目录）
   ├─ usage.json         # 派生利用率记录（usedCount/lastUsedAt，可删除重建）
   ├─ .backup-v1-<时间>/ # 首次迁移时的 v1 条目与旧 MEMORY.md 备份
   ├─ global/            # 一条事实一个 Markdown（frontmatter 含 schema: 2）
   └─ projects/<key>/    # 同上，按项目身份分目录
```

升级说明：主代码只处理 schema v2。宿主启动时若检测到 v1 文件，会自动迁移并保留原文件备份；
迁移失败时原文件不动，面板顶部显示 `migrationError`。迁移不联网，旧条目的展示元数据等
下一次「刷新市场」再补齐。

## 安全

- 插件名白名单：字母数字开头，只允许 `._-`，最长 64；拒绝 `..`；
- 格式白名单：只接受 `claude` / `codebuddy` / `zcode`；
- 路径白名单：市场相对 source 必须落在市场根内；安装目标必须在 hub cache 内；复制跳过符号链接；
- 缓存只读：安装副本是复制而非引用市场目录；卸载只删 cache 内目录；
- 包名冲突检测：市场条目名与插件清单 `name` 不一致时拒绝安装；命令/技能重名跳过并报告；
- hooks 命令通过宿主 `ctx.subprocess` 执行，超时/中止受宿主管理；未知事件不执行外部命令；
- 面板 API 只允许本机回环同源访问（Host 白名单 + POST 同源 Origin + JSON），防止远端页面或
  跨站表单触发安装/卸载；
- 图标只读取市场根/安装根内的 raster 文件，带 `nosniff` 与缓存头，不提供 SVG（避免同源脚本）；
- 不执行任何上游插件代码（describe 只读文件）。

## 配置

```yaml
- id: agent-extension
  name: 'dsh-agent-extension'
  config:
    home: ''       # 留空则用 DSH_AGENT_EXTENSION_HOME 或 ~/.dsh/agent-extension
    hooks: true    # 设为 false 时只保留 hooks 清单，不执行外部命令
```

`cordis.patch.yml` 的改动约 1 秒热重载；`lib/` 构建产物的改动需要重启宿主（改源码后先 `npm run build`）。

记忆没有额外的 cordis 配置项：自动捕获、注入、索引条数与字符预算都在面板（或
`POST /agent-plugin/api/memory/settings`）里调整，落 `memory/settings.json`。`home` 配到哪，
记忆就在哪。

## 开发

```powershell
cd packages\dsh-agent-extension
npm run check   # tsc --noEmit（node + client 双 tsconfig）
npm test        # vitest run：225 个离线用例，零运行时依赖，不访问网络
npm run build   # tsdown：lib/index.js（ESM 宿主半）+ lib/client.js（CJS 浏览器工厂，产物入库）
```

测试覆盖：三格式探测与优先级、marketplace 解析（含 listing 元数据）、市场自动识别各分支、
市场添加/刷新/移除（含移除后孤立）、安装/重装/禁用启用/更新/回滚/卸载、重启恢复、state
损坏自检、路径穿越与非法名拒绝、git 市场重启回归、版本比较与更新判定、schema v1→v2 迁移、
技能 provider、插件命令、hooks 事件映射与阻断、MCP 清单、`/store` / `/describe` / `/icon`
与访问控制（含 `sec-fetch-site` fence）、单写互斥与批量更新；记忆侧覆盖存储（索引/指纹去重/
过时投票/检索/注入预算/导出）、项目身份（路径/远程/worktree/config 覆盖/exclude）、捕获闸门
与提炼 JSON、记忆路由契约；客户端侧 presentation 纯函数、
控制器（加载/竞态守卫/串行队列/Toast/弹窗）、Switch/Menu/弹窗/卡片/面板/浮层组件行为
（jsdom）、样式回归守卫（corner-shape 配对、hover 门控、无 blur、无本地调色板）与构建产物
工厂闭包形态。

Host API 契约与数据结构见 [`docs/HOST-API.md`](docs/HOST-API.md)。

## 已知限制

- **命令不注入会话**：宿主命令处理器只能返回文本，插件命令渲染后提示「复制发送」；
- **hooks 只覆盖宿主已有事件**：Notification/SubagentStop/PreCompact 等标注未生效；
  UserPromptSubmit 只能观察，不能阻断或改写入参；
- **MCP 未生效**：宿主没有第三方可用的运行时 MCP 挂载接口，不自己 spawn 进程；
- **npm 源不支持**：明确报错，留扩展点；
- **URL 市场的相对路径插件不能安装/describe**：请改用 Git 市场或 github source；
- **首版只有个人插件分段**：不做公开/社区、应用插件（UI 插件）专区；不做 Hero/示例提示词、
  付费徽标、项目 scope、安装取消、10 分钟自动刷新、拼音搜索；
- **面板需刷新页面**：Client 代码由浏览器加载，安装/升级插件后刷新一次页面即可；
  Host API 更新需重启 DSH；
- **远端 Web UI 下插件 API 返回 403**：本机回环安全门限制，桌面端本地访问不受影响；
- **记忆不做向量检索**：宿主 LLM 只有 chat/stream、没有 embedding，首版用关键词 + 重要性
  排序；语义召回留作后续；
- **自动捕获依赖宿主 llm 服务**：服务缺失时只保留显式写入（工具/命令），不阻塞对话；
- **项目记忆不随仓库迁移**：内容只存用户目录；交接用导出，团队共享写 `AGENTS.md`；
- 不做签名/审计与完整信任模型（结构已留扩展点）。

## 安装（开发期）

桌面端：设置 → 插件 → 安装，填包目录的绝对路径：

```text
E:\workspace\dsh-plugins\packages\dsh-agent-extension
```

装好后在会话里执行 `/agent-plugin status` 验证。

## 市场索引

发布分支：`release-0.0.1`（该分支承载当前全部代码，包版本 `0.0.1-preview.5`）。在 DSH 插件页 → 发现 → 添加索引源：

```text
https://raw.githubusercontent.com/zmaolong/dsh-plugins/release-0.0.1/index.json
```

本包更新后先提交 Git，再重新生成聚合索引（见仓库根 README）。

## 许可

MIT
