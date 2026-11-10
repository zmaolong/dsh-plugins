/**
 * 记忆的跨端词汇：宿主半与浏览器半共用的纯类型、常量与归一化助手。
 *
 * 这里只放无运行时依赖、无 node 内置模块的声明与纯函数，浏览器构建可以直接
 * 内联；服务端专属的 schema 版本、项目身份解析与 Markdown 归一化助手留在
 * `memory/types.ts`，由它转出本模块的公开面，历史导入路径保持不变。
 *
 * @module dsh-agent-extension/shared/memory-wire
 */

/** 一条记忆可以记录的事实类型。 */
export const MEMORY_TYPES = ['preference', 'decision', 'gotcha', 'project', 'reference'] as const

/** 一种记忆类型。 */
export type MemoryType = (typeof MEMORY_TYPES)[number]

/** 记忆的可见范围：全部会话，或仅一个项目。 */
export type MemoryScope = 'global' | 'project'

/**
 * 一条记忆的生命周期：`active` 注入且可检索；`stale` 不注入但仍可检索；
 * `archived` 默认不可见，仅留档。
 */
export type MemoryStatus = 'active' | 'stale' | 'archived'

/** 一条记忆的保留层级。 */
export const MEMORY_TIERS = ['short', 'long'] as const

/** 一种保留层级。 */
export type MemoryTier = (typeof MEMORY_TIERS)[number]

/** 项目身份的来源。 */
export type ProjectIdentitySource = 'git-remote' | 'git-common' | 'path'

/** 一条记忆的来源通道。 */
export const MEMORY_SOURCES = ['capture', 'tool', 'user', 'import'] as const

/** 一种记忆来源。 */
export type MemorySource = (typeof MEMORY_SOURCES)[number]

/** 一条记忆的 frontmatter 元数据；Markdown 正文跟在元数据之后。 */
export interface MemoryMeta {
  id: string
  name: string
  description: string
  type: MemoryType
  scope: MemoryScope
  /** 解析后的项目 key；全局记忆为空字符串。 */
  project: string
  tags: string[]
  /** 0-100，注入与检索的排序提示。 */
  importance: number
  status: MemoryStatus
  /**
   * 保留层级：`short` 为新写入的默认层级，不进首步注入索引，被
   * `memory_get` 读取或指纹强化后升级为 `long`；`long` 长驻注入。
   * 闲置淘汰只作用于 `short`。
   */
  tier: MemoryTier
  /** 同一事实被重复写入确认的次数。 */
  reinforcement: number
  /** 矛盾投票；旧口径下两票归档，现由维护 Run 研判处理。 */
  obsoleteVotes: number
  /** 本条记忆取代的旧记忆 id。 */
  supersedes: string[]
  /** 最近一次被检索/读取的时间（ISO）；从未使用则没有该字段。 */
  lastUsedAt?: string
  /** 被检索/读取的次数。 */
  usedCount: number
  /** 0-100 置信度；50 表示未经研判。 */
  confidence: number
  /** 用户钉住：豁免一切自动维护。 */
  pinned: boolean
  /** 合并进本条的来源记忆 id。 */
  mergedFrom: string[]
  /** 如何进入记忆库，迁移条目与缺省为 `capture`。 */
  source: MemorySource
  /** 首次产生该记忆的会话。 */
  originSessionId: string
  createdAt: string
  updatedAt: string
}

/** 一条完整记忆：元数据加 Markdown 正文。 */
export interface MemoryEntry extends MemoryMeta {
  content: string
}

/** 持久化的记忆行为设置（每个插件安装一份）。 */
export interface MemorySettings {
  /** 自动捕获开关；v2 起只影响会话末补漏提炼。 */
  captureEnabled: boolean
  /** 会话结束时的最后一次补漏提炼。 */
  captureSessionEnd: boolean
  /** 是否把记忆索引注入提示词。 */
  injectEnabled: boolean
  /** 全局作用域注入的索引条数。 */
  indexLimitGlobal: number
  /** 项目作用域注入的索引条数。 */
  indexLimitProject: number
  /** 注入索引的字符预算。 */
  maxChars: number
  /** 维护 Run 使用的模型 provider；空串表示继承宿主默认模型（ADR-0006）。 */
  maintenanceProvider: string
  /** 维护 Run 使用的模型 id；空串表示继承宿主默认模型。 */
  maintenanceModel: string
  /** 短期条目的观察期天数：闲置超过该值未被消费即进维护候选。 */
  observationDays: number
  /** 维护达到阈值时是否自动后台执行维护 Run。 */
  autoMaintenance: boolean
  /** 自动维护的写入量阈值：距上次维护新增/强化达到该条数即触发。 */
  autoMaintenanceThreshold: number
  updatedAt: string
}

/** 默认设置：捕获与注入开启，各 20 条索引、总预算 3,000 字符（ADR-0005）。 */
export function defaultSettings(): MemorySettings {
  return {
    captureEnabled: true,
    captureSessionEnd: true,
    injectEnabled: true,
    indexLimitGlobal: 20,
    indexLimitProject: 20,
    maxChars: 3000,
    maintenanceProvider: '',
    maintenanceModel: '',
    observationDays: 7,
    autoMaintenance: true,
    autoMaintenanceThreshold: 30,
    updatedAt: new Date().toISOString(),
  }
}

/** 插件已知的一个项目。 */
export interface ProjectRecord {
  /** 项目身份的稳定哈希。 */
  key: string
  displayName: string
  source: ProjectIdentitySource
  /** 规范化后的远程 URL，或 git common dir / 普通路径。 */
  identity: string
  /** 见过的目录（worktree、克隆）。 */
  roots: string[]
  lastSeen: string
  /** 该项目作用域的实时条目数。 */
  entryCount: number
}

/** 一个会话的召回计数。 */
export interface SessionRecallStats {
  sessionId: string
  /** 提示词装配时注入的索引条数。 */
  injected: number
  /** 注入集合中被模型通过工具回读的条数。 */
  injectedUsed: number
  /** 检索命中但未注入的条数。 */
  overflow: number
  /**
   * 该会话 `memory_search` 累计返回的结果条数（重复命中按次计）。
   *
   * 旧 `stats.json` 没有这个字段时，store 读取时按 0 补齐；服务端写出的行
   * 始终带数字。
   */
  searched: number
  /**
   * `searched` 中后来被 `memory_get` 打开的条数（同一 id 只计一次）。
   *
   * 旧 `stats.json` 没有这个字段时，store 读取时按 0 补齐。
   */
  searchUsed: number
  updatedAt: string
}

/** 一次提示词装配样本：注入索引的实际内容。 */
export interface RecentInjection {
  sessionId: string
  at: string
  /** 注入的索引条数。 */
  entries: number
  /** 渲染出来的索引块字符数。 */
  chars: number
  /** 索引被预算截断。 */
  truncated: boolean
}

/** 一次捕获新增条目的引用；撤销捕获按此逐条归档。 */
export interface CreatedRef {
  id: string
  scope: MemoryScope
  /** 项目 key；全局条目为空字符串。 */
  project: string
}

/** 一次捕获尝试样本，供「最近捕获」列表展示与撤销。 */
export interface RecentCapture {
  /**
   * 捕获样本唯一 id（记录时生成）。
   *
   * 旧 `stats.json` 没有该字段时，store 读取归一化为空串（该样本不可撤销）。
   */
  id: string
  at: string
  sessionId: string
  /** 该次尝试写入或强化的条数。 */
  written: number
  /**
   * 该次捕获**新增**的条目引用（强化条目不在其中）。
   *
   * 旧 `stats.json` 没有该字段时，store 读取归一化为空数组。
   */
  created: CreatedRef[]
  /** 被跳过时的闸门原因。 */
  skippedReason?: string
  /** 失败时的错误文本。 */
  error?: string
  /** 该次捕获已被用户撤销；缺省 false。 */
  undone?: boolean
}

/** 一次 `memory_search` 样本：诊断视图的「最近检索」列表。 */
export interface RecentRetrieval {
  at: string
  sessionId: string
  query: string
  /** 本次检索返回的条数；可能大于 `ids` 长度（id 只留前 10 个）。 */
  results: number
  /** 本次检索返回的记忆 id，最多 10 个。 */
  ids: string[]
}

/** 持久化的捕获与召回计数（schema v2）。 */
export interface MemoryStats {
  captureRuns: number
  capturedEntries: number
  captureSkips: number
  sessions: SessionRecallStats[]
  /** 每种闸门原因的触发次数。 */
  skipReasons: Record<string, number>
  /** 提示词装配样本，最新在前，最多 50 条。 */
  recentInjections: RecentInjection[]
  /** 捕获样本，最新在前，最多 50 条。 */
  recentCaptures: RecentCapture[]
  /**
   * 检索样本，最新在前，最多 50 条；`ids` 每行最多 10 个。
   *
   * 旧 `stats.json` 没有这个字段时，store 读取归一化为空数组。
   */
  recentRetrievals: RecentRetrieval[]
}

/** 空的 v2 计数形状。 */
export function emptyStats(): MemoryStats {
  return {
    captureRuns: 0,
    capturedEntries: 0,
    captureSkips: 0,
    sessions: [],
    skipReasons: {},
    recentInjections: [],
    recentCaptures: [],
    recentRetrievals: [],
  }
}

/** 召回索引的字符预算上限（ADR-0005）：设置只能调小，不能突破。 */
export const RECALL_MAX_CHARS = 3000

/** 每层最多注入的条目数。 */
export const RECALL_MAX_PER_LAYER = 20

/** 用户可调边界与存储硬上限。 */
export const LIMITS = {
  indexEntries: 200,
  maxChars: 40000,
  name: 120,
  description: 400,
  content: 8000,
  tags: 8,
  tag: 40,
  entriesPerScope: 2000,
  projects: 200,
  statsSessions: 100,
  /** 最近捕获/注入/检索样本上限（stats.json 的有界数组）。 */
  statsRecent: 50,
  /** 维护模型 provider / model 设置的最大字符数。 */
  maintenanceModel: 120,
} as const

/** 值是否是一种记忆来源。 */
export function isMemorySource(value: unknown): value is MemorySource {
  return typeof value === 'string' && (MEMORY_SOURCES as readonly string[]).includes(value)
}

/** 归一化来源值：缺失或未知时回退。 */
export function normalizeSource(value: unknown, fallback: MemorySource = 'capture'): MemorySource {
  return isMemorySource(value) ? value : fallback
}

/** 值是否是一种记忆类型。 */
export function isMemoryType(value: unknown): value is MemoryType {
  return typeof value === 'string' && (MEMORY_TYPES as readonly string[]).includes(value)
}

/** 值是否是一种记忆状态。 */
export function isMemoryStatus(value: unknown): value is MemoryStatus {
  return value === 'active' || value === 'stale' || value === 'archived'
}

/** 值是否是一种保留层级。 */
export function isMemoryTier(value: unknown): value is MemoryTier {
  return value === 'short' || value === 'long'
}

/**
 * 归一化层级值：缺失或未知时回退 `long`——旧文件/手改丢字段时保持长驻语义，
 * 不让存量条目因解析失败掉出注入。
 */
export function normalizeTier(value: unknown, fallback: MemoryTier = 'long'): MemoryTier {
  return isMemoryTier(value) ? value : fallback
}

/** 把整数夹到 `[min, max]`；非数字回退。 */
export function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const numeric = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : Number.NaN
  if (!Number.isFinite(numeric)) return fallback
  return Math.min(max, Math.max(min, Math.round(numeric)))
}

/** `/memory/state` 的返回形状。 */
export interface MemoryStateWire {
  settings: MemorySettings
  projects: ProjectRecord[]
  stats: MemoryStats
  /** 全库存活条目的层级计数（诊断视图「记忆库构成」）。 */
  tiers: { short: number; long: number }
}

/** `/memory/list` 的返回形状。 */
export interface MemoryListWire {
  scope: MemoryScope
  project: string
  total: number
  entries: MemoryMeta[]
}

/** `/memory/get` 的返回形状。 */
export interface MemoryGetWire {
  entry: MemoryEntry
}

/** `/memory/preview-file` 的返回形状。 */
export interface MemoryPreviewFileWire {
  path: string
  name: string
  /** 正文为空；客户端据此不打开系统应用。 */
  empty: boolean
}

/** 面板项目下拉需要的项目字段；`source` 在客户端只做展示，保持宽松字符串。 */
export interface MemoryProjectWire {
  key: string
  displayName: string
  source: string
  identity: string
  lastSeen: string
  entryCount: number
}

/** 列表行：客户端只保留展示需要的字段。 */
export interface MemoryListRow {
  id: string
  name: string
  description: string
  type: string
  tags: string[]
  importance: number
  status: string
  /** 保留层级（short/long）；服务端 v3 起必有。 */
  tier: string
  reinforcement: number
  /** 累计被消费次数（Markdown 元数据与派生 usage 融合后的值）。 */
  usedCount: number
  createdAt: string
  updatedAt: string
}

/** 详情行：列表行加正文与生命周期字段。 */
export interface MemoryDetailRow extends MemoryListRow {
  content: string
  originSessionId: string
  supersedes: string[]
  obsoleteVotes: number
}

/** 维护 Run 的一次执行动作：合并、停用、恢复或删除。 */
export type MaintenanceActionKind = 'merge' | 'stale' | 'restore' | 'delete'

/** 维护 Run 的一条动作流水；`ids` 是被该动作影响的记忆 id。 */
export interface MaintenanceAction {
  kind: MaintenanceActionKind
  ids: string[]
  /** 可读说明（保留在流水里，供面板展示与诊断）。 */
  detail: string
}

/** 维护 Run 的计数（候选与各类动作的实际条数）。 */
export interface MaintenanceCounts {
  candidates: number
  merges: number
  staled: number
  restored: number
  deleted: number
}

/** 维护 Run 使用的模型；null 表示尚未解析出模型（如空库提前结束）。 */
export interface MaintenanceModelRef {
  provider: string
  model: string
}

/** 维护 Run 的终态：completed 有动作；empty 无候选/无可执行动作；failed 出错。 */
export type MaintenanceRunStatus = 'completed' | 'failed' | 'empty'

/** 一条维护流水（`maintenance.json` 的 `runs[]` 元素）。 */
export interface MaintenanceRun {
  id: string
  at: string
  /** 本 Run 是否包含一个项目（global 表示只处理全局）。 */
  scope: MemoryScope
  /** 项目 key；scope 为 global 时为空串。 */
  project: string
  model: MaintenanceModelRef | null
  status: MaintenanceRunStatus
  counts: MaintenanceCounts
  actions: MaintenanceAction[]
  error: string
  undone: boolean
}

/** 维护状态文件的磁盘形状（schema 1）。 */
export interface MaintenanceState {
  schema: 1
  /** 最近一次**成功**维护的时间；从未成功为 null。 */
  lastRunAt: string | null
  /** 最近一次成功维护时的 `stats.capturedEntries` 快照。 */
  capturedEntriesAtLastRun: number
  /** 项目 key → 最近一次成功维护时间。 */
  projectRuns: Record<string, string>
  /** 最近 20 条流水，最新在前。 */
  runs: MaintenanceRun[]
}

/** `/memory/maintenance` 的返回形状。 */
export interface MaintenanceStatusWire {
  due: boolean
  /** due 原因：never / writes / days / none / unavailable。 */
  reason: string
  /** 上次成功维护以来的新增/强化条数。 */
  writesSince: number
  /** 距上次成功维护的天数；从未维护为 -1。 */
  daysSince: number
  lastRunAt: string | null
  recentRuns: MaintenanceRun[]
}