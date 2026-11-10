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
  /** 最近捕获/注入样本上限（stats.json 的有界数组）。 */
  statsRecent: 50,
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
  reinforcement: number
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