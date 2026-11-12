/**
 * 基于文件系统的记忆存储。
 *
 * 插件 home 下的目录布局（默认 `~/.dsh/agent-extension/memory`）：
 *
 * ```
 * memory/
 *   settings.json          用户可调的捕获 / 注入设置
 *   stats.json             捕获 / 召回计数与有界最近样本
 *   projects.json         已登记的项目身份
 *   global/<id>.md         一事实一文件（frontmatter + Markdown 正文）
 *   projects/<key>/...     同一布局，限定到一个项目身份
 *   .backup-v1-<time>/    首次加载时对 schema v1 文件与旧 MEMORY.md 的备份
 * ```
 *
 * Markdown 是唯一真源：一事实一文件；缓存按每个文件的 `mtime + size` 指纹
 * 失效（只做 stat，不做内容哈希），因此手改文件会立即生效。B0 起不再生成
 * 也不再读取 `MEMORY.md`，旧副本会在首次加载时移入迁移备份目录。
 *
 * @module dsh-agent-extension/memory/store
 */

import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, unlinkSync } from 'node:fs'
import path from 'node:path'

import { parseFrontmatter } from '../frontmatter.ts'
import type { LogFn } from '../log.ts'
import { CAPTURE_SIMILARITY_THRESHOLD, longEnoughForSimilarity, similarity } from '../shared/memory-similarity.ts'
import {
  MEMORY_INDEX_FILE,
  migrateMemoryTree,
  unknownFrontmatterLines,
  writeAtomicText,
  type MemoryMigrationReport,
  type ParsedMemoryDocument,
} from './migrate.ts'
import { previewRoot, removePreviewEntry, writePreviewFile, type PreviewFile } from './preview.ts'
import { assertNoSecrets } from './secrets.ts'
import {
  LIMITS,
  MEMORY_SCHEMA,
  RECALL_MAX_CHARS,
  RECALL_MAX_PER_LAYER,
  clampInt,
  defaultSettings,
  isMemoryStatus,
  isMemoryType,
  normalizeIds,
  normalizeSource,
  normalizeTags,
  normalizeTier,
  text,
  type CreatedRef,
  type MemoryEntry,
  type MemoryMeta,
  type MemoryScope,
  type MemorySettings,
  type MemorySource,
  type MemoryStats,
  type MemoryStatus,
  type MemoryTier,
  type MemoryType,
  type ProjectIdentity,
  type ProjectRecord,
  type RecentCapture,
  type RecentInjection,
  type RecentRetrieval,
  type SessionRecallStats,
} from './types.ts'

/** 一次创建/更新写入的输入。 */
export interface SaveMemoryInput {
  id?: string
  name: string
  description: string
  type: MemoryType
  scope: MemoryScope
  /** 解析后的项目 key；全局作用域忽略。 */
  project?: string
  content: string
  tags?: string[]
  importance?: number
  supersedes?: string[]
  originSessionId?: string
  /** 来源；缺省 `capture`（迁移条目与未标注写入统一取 capture）。 */
  source?: MemorySource
  /**
   * 保留层级；缺省按 `source` 推断——`user`（面板/命令）为 `long`，
   * `capture`/`tool`/`import` 为 `short`。
   */
  tier?: MemoryTier
  /** 0-100 置信度；缺省 50。 */
  confidence?: number
  /** 固定条目；缺省 false。 */
  pinned?: boolean
  /** 合并来源 id；缺省空数组。 */
  mergedFrom?: string[]
}

/** Store 构造参数。 */
export interface MemoryStoreOptions {
  /** 插件 home（`~/.dsh/agent-extension`）；记忆落在其下的 `memory/`。 */
  home: string
  log?: LogFn
  /** 预览文件根目录覆盖；默认 `os.tmpdir()/dsh-agent-extension-memory-preview`（测试传临时目录）。 */
  previewRoot?: string
}

/** `forget` 的结果。 */
export interface ForgetResult {
  entry: MemoryEntry
  archived: boolean
}

/**
 * 下推到 `search` 的可选过滤器。
 *
 * 旧的位置参数形式 `search(scope, project, query, limit)` 仍然支持；新调用方
 * 用 options 对象形式。
 */
export interface MemorySearchOptions {
  /** 自由文本查询；空值表示返回排名索引。 */
  query?: string
  /** 只返回该类型（在截断之前过滤）。 */
  type?: MemoryType
  /** 是否包含归档条目（默认 false）。 */
  includeArchived?: boolean
  /** 最大结果数（1-50，默认 10）。 */
  limit?: number
}

const SETTINGS_FILE = 'settings.json'
const STATS_FILE = 'stats.json'
const PROJECTS_FILE = 'projects.json'
/** JSON 文档仍各自带 schema；条目统一用 `MEMORY_SCHEMA`。 */
const SETTINGS_SCHEMA = 1
const STATS_SCHEMA = 2
const PROJECTS_SCHEMA = 1
/** 注入索引单行截断长度；详情留给一次工具调用。 */
const INDEX_LINE_CHARS = 120
/** 命中率读数保留的会话统计行数。 */
const SESSION_STATS_KEEP = LIMITS.statsSessions
/** stats.json 中有界的最近样本数组上限。 */
const RECENT_SAMPLE_KEEP = LIMITS.statsRecent
/** 一条检索样本保留的 id 数：诊断只看本次命中的前若干条。 */
const RETRIEVAL_IDS_KEEP = 10
/** stats.json 中保留的不同跳过原因上限。 */
const SKIP_REASON_KEEP = 50

/** 一个文件的缓存记录：条目 + 未知 frontmatter 行（写回时透传）。 */
interface CachedEntry {
  entry: MemoryEntry
  extras: string[]
}

/** 一个作用域的缓存：以全部 `.md` 文件的 `mtime+size` 指纹失效。 */
interface ScopeCache {
  stamp: string
  entries: CachedEntry[]
}

/** 转义一个单行 frontmatter 标量。 */
function scalar(value: string): string {
  const single = value.replace(/[\r\n]+/gu, ' ').replace(/\\/gu, '\\\\').replace(/"/gu, '\\"')
  return `"${single}"`
}

/**
 * 渲染一个条目文件（frontmatter + 正文）。
 *
 * `extras` 承载未知 frontmatter 原始行；它们追加在已知字段之后，保证手写
 * 元数据在每次重写后仍然存在。
 */
function renderEntry(entry: MemoryEntry, extras: readonly string[] = []): string {
  const lines = [
    '---',
    `schema: ${MEMORY_SCHEMA}`,
    `id: ${scalar(entry.id)}`,
    `name: ${scalar(entry.name)}`,
    `description: ${scalar(entry.description)}`,
    `type: ${entry.type}`,
    `scope: ${entry.scope}`,
    `project: ${scalar(entry.project)}`,
    `tags: [${entry.tags.map(scalar).join(', ')}]`,
    `importance: ${entry.importance}`,
    `confidence: ${entry.confidence}`,
    `status: ${entry.status}`,
    `tier: ${entry.tier}`,
    `reinforcement: ${entry.reinforcement}`,
    `obsoleteVotes: ${entry.obsoleteVotes}`,
    `pinned: ${entry.pinned ? 'true' : 'false'}`,
    `usedCount: ${entry.usedCount}`,
    ...(entry.lastUsedAt === undefined || entry.lastUsedAt === '' ? [] : [`lastUsedAt: ${scalar(entry.lastUsedAt)}`]),
    `supersedes: [${entry.supersedes.map(scalar).join(', ')}]`,
    `mergedFrom: [${entry.mergedFrom.map(scalar).join(', ')}]`,
    `source: ${entry.source}`,
    `originSessionId: ${scalar(entry.originSessionId)}`,
    `createdAt: ${scalar(entry.createdAt)}`,
    `updatedAt: ${scalar(entry.updatedAt)}`,
  ]
  for (const line of extras) {
    if (line.trim() === '---') continue
    lines.push(line)
  }
  lines.push('---', '', entry.content.trim(), '')
  return lines.join('\n')
}

/** 写入定级：用户显式途径直接长驻；模型/提炼/导入的写入先进短期观察。 */
function tierForSource(source: MemorySource): MemoryTier {
  return source === 'user' ? 'long' : 'short'
}

/** 归一化字符串，用于指纹与重复检测。 */
function normalizeForFingerprint(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/gu, ' ')
}

/** 内容指纹：相同事实走强化而不是重复新增。 */
export function fingerprintOf(name: string, description: string, content: string): string {
  const normalized = `${normalizeForFingerprint(name)}\n${normalizeForFingerprint(description)}\n${normalizeForFingerprint(content)}`
  return createHash('sha256').update(normalized).digest('hex')
}

/** 生成一个看起来稳定、实际唯一的条目 id。 */
function newEntryId(): string {
  return `m-${Date.now().toString(36)}-${randomBytes(3).toString('hex')}`
}

/** 把未知 JSON 值收窄成普通对象。 */
function objectOf(raw: unknown): Record<string, unknown> {
  return raw !== null && typeof raw === 'object' && !Array.isArray(raw) ? raw as Record<string, unknown> : {}
}

/**
 * 把一份 Markdown 解析成规范化条目，并带回未知 frontmatter 行；不可用时返回 null。
 *
 * @param source - 原始 Markdown。
 * @param file - 文件路径（id 缺省时取文件名）。
 * @param scope - 文件所在目录的作用域。
 * @param project - 项目作用域的项目 key。
 */
function parseDocument(source: string, file: string, scope: MemoryScope, project: string): ParsedMemoryDocument | null {
  const normalized = source.replace(/^\uFEFF/u, '')
  const parsed = parseFrontmatter(normalized)
  const data = parsed.data
  const id = text(data.id) || path.basename(file, '.md')
  const name = text(data.name)
  const description = text(data.description)
  const type = isMemoryType(data.type) ? data.type : 'reference'
  const status = isMemoryStatus(data.status) ? data.status : 'active'
  const tier = normalizeTier(data.tier)
  const importance = clampInt(data.importance, 0, 100, 50)
  const confidence = clampInt(data.confidence, 0, 100, 50)
  const reinforcement = clampInt(data.reinforcement, 0, 100000, 0)
  const obsoleteVotes = clampInt(data.obsoleteVotes, 0, 100, 0)
  const pinned = data.pinned === true
  const usedCount = clampInt(data.usedCount, 0, 1000000, 0)
  const tags = normalizeTags(data.tags)
  const supersedes = normalizeIds(data.supersedes)
  const mergedFrom = normalizeIds(data.mergedFrom)
  const sourceValue = normalizeSource(data.source)
  const lastUsedAt = text(data.lastUsedAt)
  const createdAt = text(data.createdAt) || new Date().toISOString()
  const updatedAt = text(data.updatedAt) || createdAt
  const originSessionId = text(data.originSessionId)
  const content = parsed.body.trim()
  if (name === '') return null
  const entry: MemoryEntry = {
    id,
    name,
    description,
    type,
    scope,
    project,
    tags,
    importance,
    confidence,
    status,
    tier,
    reinforcement,
    obsoleteVotes,
    pinned,
    usedCount,
    supersedes,
    mergedFrom,
    source: sourceValue,
    originSessionId,
    createdAt,
    updatedAt,
    content,
    ...(lastUsedAt === '' ? {} : { lastUsedAt }),
  }
  return { entry, extras: unknownFrontmatterLines(normalized) }
}

/** 读取并解析一个记忆文件（IO/解析失败返回 null）。 */
function readDocument(file: string, scope: MemoryScope, project: string): ParsedMemoryDocument | null {
  let source = ''
  try {
    source = readFileSync(file, 'utf8')
  } catch {
    return null
  }
  return parseDocument(source, file, scope, project)
}

/** 读取 JSON 文件；任何失败返回 null。 */
function readJson(file: string): unknown {
  try {
    return JSON.parse(readFileSync(file, 'utf8')) as unknown
  } catch {
    return null
  }
}

/** 文档声明的 schema 版本；缺失/非法返回 0（读取端按容错处理，不阻断）。 */
function documentSchema(raw: unknown): number {
  const value = objectOf(raw).schema
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

/** 归一化一份可能非法的 settings 文档。 */
function normalizeSettings(raw: unknown): MemorySettings {
  const value = objectOf(raw)
  const fallback = defaultSettings()
  return {
    captureEnabled: typeof value.captureEnabled === 'boolean' ? value.captureEnabled : fallback.captureEnabled,
    captureSessionEnd: typeof value.captureSessionEnd === 'boolean' ? value.captureSessionEnd : fallback.captureSessionEnd,
    injectEnabled: typeof value.injectEnabled === 'boolean' ? value.injectEnabled : fallback.injectEnabled,
    turnRecall: typeof value.turnRecall === 'boolean' ? value.turnRecall : fallback.turnRecall,
    indexLimitGlobal: clampInt(value.indexLimitGlobal, 0, RECALL_MAX_PER_LAYER, fallback.indexLimitGlobal),
    indexLimitProject: clampInt(value.indexLimitProject, 0, RECALL_MAX_PER_LAYER, fallback.indexLimitProject),
    maxChars: clampInt(value.maxChars, 1000, RECALL_MAX_CHARS, fallback.maxChars),
    // 维护模型：空串 = 继承宿主默认模型；旧 settings.json 缺字段时同样为空。
    maintenanceProvider: text(value.maintenanceProvider).slice(0, LIMITS.maintenanceModel),
    maintenanceModel: text(value.maintenanceModel).slice(0, LIMITS.maintenanceModel),
    observationDays: clampInt(value.observationDays, 1, 365, fallback.observationDays),
    autoMaintenance: typeof value.autoMaintenance === 'boolean' ? value.autoMaintenance : fallback.autoMaintenance,
    autoMaintenanceThreshold: clampInt(value.autoMaintenanceThreshold, 5, 1000, fallback.autoMaintenanceThreshold),
    updatedAt: text(value.updatedAt) || fallback.updatedAt,
  }
}

/** 归一化一行会话召回统计。 */
function normalizeRecallRow(raw: unknown): SessionRecallStats | null {
  const value = objectOf(raw)
  const sessionId = text(value.sessionId)
  if (sessionId === '') return null
  const searched = clampInt(value.searched, 0, 1000000, 0)
  return {
    sessionId,
    injected: clampInt(value.injected, 0, 1000000, 0),
    injectedUsed: clampInt(value.injectedUsed, 0, 1000000, 0),
    overflow: clampInt(value.overflow, 0, 1000000, 0),
    // 旧 stats.json 没有这些字段：按 0 读，保证向后兼容。
    searched,
    searchUsed: Math.min(searched, clampInt(value.searchUsed, 0, 1000000, 0)),
    recalled: clampInt(value.recalled, 0, 1000000, 0),
    updatedAt: text(value.updatedAt) || new Date().toISOString(),
  }
}

/** 归一化持久化的跳过原因计数表（有界）。 */
function normalizeSkipReasons(raw: unknown): Record<string, number> {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const out: Record<string, number> = {}
  let count = 0
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (count >= SKIP_REASON_KEEP) break
    const reason = text(key).slice(0, 80)
    if (reason === '') continue
    out[reason] = clampInt(value, 0, 100000000, 0)
    count += 1
  }
  return out
}

/** 归一化一条注入样本。 */
function normalizeInjectionRow(raw: unknown): RecentInjection | null {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return null
  const value = raw as Record<string, unknown>
  return {
    sessionId: text(value.sessionId),
    at: text(value.at) || new Date().toISOString(),
    entries: clampInt(value.entries, 0, 100000, 0),
    chars: clampInt(value.chars, 0, 10000000, 0),
    truncated: value.truncated === true,
  }
}

/** 归一化捕获样本里「新增条目引用」列表；非法项丢弃、同 id+作用域去重。 */
function normalizeCreatedRefs(raw: unknown): CreatedRef[] {
  if (!Array.isArray(raw)) return []
  const out: CreatedRef[] = []
  for (const item of raw) {
    if (item === null || typeof item !== 'object' || Array.isArray(item)) continue
    const value = item as Record<string, unknown>
    const id = text(value.id).slice(0, 200)
    if (id === '') continue
    const scope: MemoryScope = value.scope === 'project' ? 'project' : 'global'
    const project = scope === 'global' ? '' : text(value.project)
    if (out.some(ref => ref.id === id && ref.scope === scope)) continue
    out.push({ id, scope, project })
  }
  return out
}

/** 归一化一条捕获样本。 */
function normalizeCaptureRow(raw: unknown): RecentCapture | null {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return null
  const value = raw as Record<string, unknown>
  const row: RecentCapture = {
    // 旧 stats.json 没有 id / created：按空串 / 空数组读，不阻断面板渲染。
    id: text(value.id).slice(0, 200),
    at: text(value.at) || new Date().toISOString(),
    sessionId: text(value.sessionId),
    written: clampInt(value.written, 0, 100000, 0),
    created: normalizeCreatedRefs(value.created),
  }
  const reason = text(value.skippedReason)
  if (reason !== '') row.skippedReason = reason
  const error = text(value.error)
  if (error !== '') row.error = error
  if (value.undone === true) row.undone = true
  return row
}

/** 归一化一条检索样本。 */
function normalizeRetrievalRow(raw: unknown): RecentRetrieval | null {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return null
  const value = raw as Record<string, unknown>
  const ids = normalizeIds(value.ids).slice(0, RETRIEVAL_IDS_KEEP)
  return {
    at: text(value.at) || new Date().toISOString(),
    sessionId: text(value.sessionId),
    query: text(value.query),
    // 旧行缺 results 时用收窄后的 id 数兜底，保证面板至少能显示条数。
    results: clampInt(value.results, 0, 100000000, ids.length),
    ids,
  }
}

/** 归一化持久化的 stats 文档（schema v1 的旧行补齐 v2 默认值）。 */
function normalizeStats(raw: unknown): MemoryStats {
  const value = objectOf(raw)
  const sessions = Array.isArray(value.sessions)
    ? value.sessions.map(normalizeRecallRow).filter((row): row is SessionRecallStats => row !== null)
    : []
  const recentInjections = Array.isArray(value.recentInjections)
    ? value.recentInjections.map(normalizeInjectionRow).filter((row): row is RecentInjection => row !== null)
    : []
  const recentCaptures = Array.isArray(value.recentCaptures)
    ? value.recentCaptures.map(normalizeCaptureRow).filter((row): row is RecentCapture => row !== null)
    : []
  const recentRetrievals = Array.isArray(value.recentRetrievals)
    ? value.recentRetrievals.map(normalizeRetrievalRow).filter((row): row is RecentRetrieval => row !== null)
    : []
  return {
    captureRuns: clampInt(value.captureRuns, 0, 100000000, 0),
    capturedEntries: clampInt(value.capturedEntries, 0, 100000000, 0),
    captureSkips: clampInt(value.captureSkips, 0, 100000000, 0),
    sessions: sessions.slice(0, SESSION_STATS_KEEP),
    skipReasons: normalizeSkipReasons(value.skipReasons),
    recentInjections: recentInjections.slice(0, RECENT_SAMPLE_KEEP),
    recentCaptures: recentCaptures.slice(0, RECENT_SAMPLE_KEEP),
    recentRetrievals: recentRetrievals.slice(0, RECENT_SAMPLE_KEEP),
  }
}

/** 归一化一条项目登记。 */
function normalizeProject(raw: unknown, entryCount: (key: string) => number): ProjectRecord | null {
  const value = objectOf(raw)
  const key = text(value.key)
  if (key === '') return null
  const source = value.source === 'git-remote' || value.source === 'git-common' || value.source === 'path'
    ? value.source
    : 'path'
  return {
    key,
    displayName: text(value.displayName) || key,
    source,
    identity: text(value.identity),
    roots: normalizeIds(value.roots),
    lastSeen: text(value.lastSeen) || new Date().toISOString(),
    entryCount: entryCount(key),
  }
}

/** 校验项目 key 能否直接用作目录名（否则做哈希）。 */
function safeProjectKey(key: string): string {
  const trimmed = text(key)
  if (/^[A-Za-z0-9_-]{1,80}$/u.test(trimmed)) return trimmed
  return `h_${createHash('sha256').update(trimmed).digest('hex').slice(0, 16)}`
}

/** 记忆存储；由插件运行时持有，工具与管理 API 共享同一实例。 */
export class MemoryStore {
  /** 记忆树根目录（`<home>/memory`）。 */
  readonly root: string
  /** 预览文件根目录（宿主右侧栏读取的临时 Markdown）。 */
  readonly previewDir: string
  /** 持久化项目登记文件。 */
  private readonly projectsFile: string
  private readonly settingsFile: string
  private readonly statsFile: string
  private readonly log: LogFn
  private settingsValue: MemorySettings | null = null
  private statsValue: MemoryStats | null = null
  private projectsValue: ProjectRecord[] | null = null
  private readonly cache = new Map<string, ScopeCache>()
  /**
   * 进程内写串行化队列：新增的异步写入口共享同一条 Promise 链，避免复合
   * 「读-改-写」交叉；同步入口本身是 JS 单线程上的原子同步段（不引入文件锁）。
   */
  private writeQueue: Promise<unknown> = Promise.resolve()

  constructor(options: MemoryStoreOptions) {
    this.root = path.join(options.home, 'memory')
    this.previewDir = options.previewRoot ?? previewRoot()
    this.settingsFile = path.join(this.root, SETTINGS_FILE)
    this.statsFile = path.join(this.root, STATS_FILE)
    this.projectsFile = path.join(this.root, PROJECTS_FILE)
    this.log = options.log ?? (() => {})
  }

  /** 确保记忆根目录存在、执行一次 v1 迁移，再归一化 JSON 文档。 */
  start(): void {
    mkdirSync(this.root, { recursive: true })
    mkdirSync(path.join(this.root, 'global'), { recursive: true })
    mkdirSync(path.join(this.root, 'projects'), { recursive: true })
    try {
      const report = this.migrate()
      if (report.backupDir !== null && (report.migrated > 0 || report.indexesRemoved > 0)) {
        this.log('info', `记忆 schema v2 迁移：升级 ${report.migrated} 个条目，移走 ${report.indexesRemoved} 个旧索引（备份 ${path.basename(report.backupDir)}）`)
      }
      if (report.failed > 0) this.log('warn', `记忆迁移有 ${report.failed} 个文件失败（原文件保持）`)
    } catch (error) {
      // 迁移失败绝不让宿主启动失败；原文件未动，下次加载重试。
      this.log('error', `记忆迁移失败（原文件保持）：${error instanceof Error ? error.message : String(error)}`)
    }
    // Normalize on first touch so invalid files are repaired once and logged.
    void this.settings()
    void this.stats()
    void this.projects()
  }

  /** 本安装的设置。 */
  settings(): MemorySettings {
    if (this.settingsValue !== null) return this.settingsValue
    const raw = readJson(this.settingsFile)
    if (raw !== null && (typeof raw !== 'object' || Array.isArray(raw))) {
      this.log('warn', 'memory/settings.json 结构异常，已按默认值修复')
    } else if (raw !== null && documentSchema(raw) !== SETTINGS_SCHEMA) {
      this.log('warn', `memory/settings.json schema=${documentSchema(raw)}（当前 ${SETTINGS_SCHEMA}），按容错读取`)
    }
    this.settingsValue = normalizeSettings(raw)
    if (raw === null && existsSync(this.settingsFile)) this.log('warn', 'memory/settings.json 无法解析，已按默认值修复')
    return this.settingsValue
  }

  /**
   * 合并一份部分设置补丁。
   *
   * @param patch - 要更新的字段。
   */
  updateSettings(patch: Partial<MemorySettings>): MemorySettings {
    const current = this.settings()
    const next = normalizeSettings({
      ...current,
      ...patch,
      updatedAt: new Date().toISOString(),
    })
    this.settingsValue = next
    this.writeSettings()
    return next
  }

  /** 捕获与召回计数（schema v2 形状；旧文件读取时补默认字段）。 */
  stats(): MemoryStats {
    if (this.statsValue !== null) return this.statsValue
    const raw = readJson(this.statsFile)
    if (raw !== null && (typeof raw !== 'object' || Array.isArray(raw))) {
      this.log('warn', 'memory/stats.json 结构异常，已按默认值修复')
    } else if (raw !== null && documentSchema(raw) !== STATS_SCHEMA) {
      this.log('warn', `memory/stats.json schema=${documentSchema(raw)}（当前 ${STATS_SCHEMA}），按容错读取`)
    }
    this.statsValue = normalizeStats(raw)
    if (raw === null && existsSync(this.statsFile)) this.log('warn', 'memory/stats.json 无法解析，已按默认值修复')
    return this.statsValue
  }

  /**
   * 记录一次捕获尝试。
   *
   * @param entries - 写入或强化的条数。
   * @param skipped - 闸门拒绝了本轮。
   * @param detail - 可选的会话 id / 跳过原因 / 失败信息 / 该次**新增**的条目
   *   引用；带跳过原因时同时累加 `skipReasons`。样本 id 缺失时自动生成。
   */
  recordCapture(
    entries: number,
    skipped: boolean,
    detail: { sessionId?: string; skippedReason?: string; error?: string; created?: readonly CreatedRef[] } = {},
  ): void {
    const current = this.stats()
    const written = Math.max(0, entries)
    const reason = text(detail.skippedReason).slice(0, 80)
    const record: RecentCapture = {
      id: randomUUID(),
      at: new Date().toISOString(),
      sessionId: text(detail.sessionId),
      written,
      // 只收新增条目；强化条目不进入撤销集合（ADR-0006）。
      created: normalizeCreatedRefs(detail.created ?? []),
    }
    if (reason !== '') record.skippedReason = reason
    const errorText = text(detail.error)
    if (errorText !== '') record.error = errorText
    const skipReasons = { ...current.skipReasons }
    if (reason !== '') skipReasons[reason] = (skipReasons[reason] ?? 0) + 1
    this.statsValue = {
      ...current,
      captureRuns: skipped ? current.captureRuns : current.captureRuns + 1,
      capturedEntries: current.capturedEntries + written,
      captureSkips: skipped ? current.captureSkips + 1 : current.captureSkips,
      skipReasons: normalizeSkipReasons(skipReasons),
      recentCaptures: [record, ...current.recentCaptures].slice(0, RECENT_SAMPLE_KEEP),
    }
    this.writeStats()
  }

  /**
   * 撤销一次捕获：只归档该次捕获**新增**的条目（强化条目不回退），并把
   * 样本标记 `undone`。
   *
   * 逐条 `setStatus(..., 'archived')`；条目不存在或已是 archived 时跳过。
   * 重复撤销同一份样本是幂等的：第二次返回空数组并保持 `undone: true`。
   *
   * @param sampleId - 捕获样本 id（`stats.recentCaptures[].id`）。
   */
  undoCapture(sampleId: string): { archived: string[] } {
    const id = text(sampleId)
    if (id === '') throw new Error('缺少捕获样本 id')
    const current = this.stats()
    const sample = current.recentCaptures.find(row => row.id === id)
    if (sample === undefined) throw new Error(`捕获样本不存在：${id}`)
    const archived: string[] = []
    for (const ref of sample.created) {
      try {
        const entry = this.get(ref.scope, ref.project, ref.id)
        if (entry === undefined || entry.status === 'archived') continue
        this.setStatus(ref.scope, ref.project, ref.id, 'archived')
        archived.push(ref.id)
      } catch (error) {
        this.log('warn', `撤销捕获条目 ${ref.id} 失败：${error instanceof Error ? error.message : String(error)}`)
      }
    }
    this.statsValue = {
      ...current,
      recentCaptures: current.recentCaptures.map(row => row.id === id ? { ...row, undone: true } : row),
    }
    this.writeStats()
    return { archived }
  }

  /**
   * 只累加一次捕获闸门拒绝原因，不追加捕获样本。
   *
   * @param reason - 闸门原因 key。
   * @param count - 该原因发生次数（默认 1）。
   */
  recordSkip(reason: string, count = 1): void {
    const key = text(reason).slice(0, 80)
    if (key === '') return
    const current = this.stats()
    const skipReasons: Record<string, number> = {
      ...current.skipReasons,
      [key]: (current.skipReasons[key] ?? 0) + Math.max(1, Math.round(count)),
    }
    this.statsValue = { ...current, skipReasons: normalizeSkipReasons(skipReasons) }
    this.writeStats()
  }

  /**
   * 追加一条提示词装配样本（有界，只保留最新 50 条）。
   *
   * @param detail - 会话 id、注入条数、渲染字符数与截断标记。
   */
  recordInjection(detail: { sessionId?: string; entries: number; chars: number; truncated?: boolean }): void {
    const current = this.stats()
    const record: RecentInjection = {
      sessionId: text(detail.sessionId),
      at: new Date().toISOString(),
      entries: clampInt(detail.entries, 0, 100000, 0),
      chars: clampInt(detail.chars, 0, 10000000, 0),
      truncated: detail.truncated === true,
    }
    this.statsValue = {
      ...current,
      recentInjections: [record, ...current.recentInjections].slice(0, RECENT_SAMPLE_KEEP),
    }
    this.writeStats()
  }

  /**
   * 记录一次 `memory_search` 样本（有界，只保留最新 50 条）。
   *
   * `results` 是本次返回的条数（调用方传入的完整列表）；`ids` 只留前 10 个
   * 供诊断展示，避免 stats.json 被一次大检索撑大。
   *
   * @param detail - 会话 id、原始查询与本次返回的记忆 id。
   */
  recordRetrieval(detail: { sessionId: string, query: string, ids: readonly string[] }): void {
    const current = this.stats()
    const ids = normalizeIds(detail.ids)
    const record: RecentRetrieval = {
      at: new Date().toISOString(),
      sessionId: text(detail.sessionId),
      query: text(detail.query),
      results: ids.length,
      ids: ids.slice(0, RETRIEVAL_IDS_KEEP),
    }
    this.statsValue = {
      ...current,
      recentRetrievals: [record, ...current.recentRetrievals].slice(0, RECENT_SAMPLE_KEEP),
    }
    this.writeStats()
  }

  /**
   * 记录某个会话的召回计数（整行替换，运行时传入该会话的累计值）。
   *
   * @param sessionId - 收到索引注入的会话。
   * @param injectedIds - 注入到提示词里的索引 id。
   * @param usedIds - 模型通过记忆工具实际取过的 id。
   * @param overflow - 不在注入集合里的检索命中数。
   * @param metrics - 检索命中率口径：`searched` 为 `memory_search` 累计
   *   返回的结果条数，`searchUsed` 为其中后来被 `memory_get` 打开的条数；
   *   `recalled` 为轮级召回呈现过的去重条数（B18）。
   */
  recordRecall(
    sessionId: string,
    injectedIds: readonly string[],
    usedIds: readonly string[],
    overflow: number,
    metrics: { searched?: number, searchUsed?: number, recalled?: number } = {},
  ): void {
    if (sessionId === '') return
    const current = this.stats()
    const injectedSet = new Set(injectedIds)
    const hit = new Set(usedIds.filter(id => injectedSet.has(id)))
    const searched = clampInt(metrics.searched, 0, 1000000, 0)
    const searchUsed = Math.min(searched, clampInt(metrics.searchUsed, 0, 1000000, 0))
    const recalled = clampInt(metrics.recalled, 0, 1000000, 0)
    const sessions = current.sessions.filter(row => row.sessionId !== sessionId)
    sessions.unshift({
      sessionId,
      injected: injectedIds.length,
      injectedUsed: hit.size,
      overflow: Math.max(0, overflow),
      searched,
      searchUsed,
      // 轮级召回去重呈现数（B18 可观测性；旧数据路径按 0 补齐）。
      recalled,
      updatedAt: new Date().toISOString(),
    })
    this.statsValue = { ...current, sessions: sessions.slice(0, SESSION_STATS_KEEP) }
    this.writeStats()
  }

  /** 已知项目，最近出现的在前。 */
  listProjects(): ProjectRecord[] {
    const projects = this.projects()
    return [...projects]
      .map(project => ({ ...project, entryCount: this.countEntries('project', project.key) }))
      .sort((left, right) => right.lastSeen.localeCompare(left.lastSeen))
  }

  /**
   * 登记（或刷新）一个项目身份。
   *
   * @param identity - 会话工作目录解析出的身份。
   */
  touchProject(identity: ProjectIdentity): ProjectRecord {
    const projects = this.projects()
    const existing = projects.find(project => project.key === identity.projectKey)
    const roots = existing ? [...existing.roots] : []
    const root = path.resolve(identity.root)
    if (!roots.includes(root)) {
      roots.unshift(root)
      if (roots.length > 20) roots.length = 20
    }
    const record: ProjectRecord = {
      key: identity.projectKey,
      displayName: identity.displayName,
      source: identity.source,
      identity: identity.identity,
      roots,
      lastSeen: new Date().toISOString(),
      entryCount: this.countEntries('project', identity.projectKey),
    }
    const next = existing
      ? projects.map(project => project.key === record.key ? record : project)
      : [record, ...projects]
    this.projectsValue = next.slice(0, LIMITS.projects)
    this.writeProjects()
    return { ...record, entryCount: this.countEntries('project', record.key) }
  }

  /** 按 key 查一个已知项目。 */
  getProject(key: string): ProjectRecord | undefined {
    const found = this.projects().find(project => project.key === key)
    return found === undefined ? undefined : { ...found, entryCount: this.countEntries('project', key) }
  }

  /** 统计某个作用域存活（非归档）条目数。 */
  countEntries(scope: MemoryScope, project = ''): number {
    return this.load(scope, project).filter(entry => entry.status !== 'archived').length
  }

  /** 全库存活条目的层级计数（诊断视图的「记忆库构成」）。 */
  tierCounts(): { short: number; long: number } {
    const counts = { short: 0, long: 0 }
    const scopes: Array<{ scope: MemoryScope, project: string }> = [
      { scope: 'global', project: '' },
      ...this.projects().map(project => ({ scope: 'project' as const, project: project.key })),
    ]
    for (const { scope, project } of scopes) {
      for (const entry of this.load(scope, project)) {
        if (entry.status === 'archived') continue
        counts[entry.tier] += 1
      }
    }
    return counts
  }

  /**
   * 列出某个作用域的记忆。
   *
   * @param scope - 记忆作用域。
   * @param project - 项目作用域的项目 key。
   * @param options - 查询、类型过滤、是否含归档；`includeContent` 为 true 时
   *   保留 Markdown 正文（体检类消费者用）。
   */
  list(
    scope: MemoryScope,
    project = '',
    options: { query?: string, type?: MemoryType, includeArchived?: boolean, limit?: number, includeContent?: boolean } = {},
  ): MemoryMeta[] {
    const query = text(options.query)
    const entries = this.load(scope, project).filter(entry =>
      (options.includeArchived === true || entry.status !== 'archived')
      && (options.type === undefined || entry.type === options.type))
    const filtered = query === '' ? entries : this.score(entries, query)
    const sorted = query === '' ? filtered.sort(compareEntries) : filtered
    const limit = clampInt(options.limit, 1, LIMITS.entriesPerScope, LIMITS.entriesPerScope)
    const sliced = sorted.slice(0, limit)
    return options.includeContent === true ? sliced : sliced.map(toMeta)
  }

  /**
   * 列出一个作用域的全部条目（含归档、含正文，不做排序/截断）。
   *
   * 维护 Run 的预筛与校验需要正文和 supersedes 全量视图。
   *
   * @param scope - 记忆作用域。
   * @param project - 项目作用域的项目 key。
   */
  entries(scope: MemoryScope, project = ''): MemoryEntry[] {
    return [...this.load(scope, project)]
  }

  /** 列出全局与所有已登记项目的全部条目（含归档、含正文）。 */
  allEntries(): MemoryEntry[] {
    const out: MemoryEntry[] = [...this.load('global', '')]
    for (const project of this.projects()) out.push(...this.load('project', project.key))
    return out
  }

  /**
   * 把一个条目文件的原样内容快照到 `trashRoot` 下（保持记忆树的相对路径）。
   *
   * - 全局条目：`<trashRoot>/global/<id>.md`；
   * - 项目条目：`<trashRoot>/projects/<项目目录名>/<id>.md`。
   *
   * 目录按需创建；原子写。条目文件不存在时返回 null。
   *
   * @param scope - 记忆作用域。
   * @param project - 项目作用域的项目 key（全局忽略）。
   * @param id - 记忆 id。
   * @param trashRoot - 本次 Run 的 trash 根目录（`<memory>/trash/<runId>`）。
   */
  backupEntry(scope: MemoryScope, project: string, id: string, trashRoot: string): string | null {
    const source = this.entryFile(scope, project, id)
    const relative = scope === 'global'
      ? path.join('global', `${path.basename(source)}`)
      : path.join('projects', safeProjectKey(project), `${path.basename(source)}`)
    const target = path.join(trashRoot, relative)
    try {
      const content = readFileSync(source, 'utf8')
      writeAtomicText(target, content)
      return target
    } catch (error) {
      this.log('warn', `备份记忆 ${id} 失败：${error instanceof Error ? error.message : String(error)}`)
      return null
    }
  }

  /**
   * 用一份快照文件覆盖写回条目（撤销维护 Run 的最小操作）。
   *
   * @param scope - 记忆作用域。
   * @param project - 项目作用域的项目 key（全局忽略）。
   * @param id - 记忆 id（决定目标文件名）。
   * @param snapshotFile - 快照文件路径；不存在返回 false。
   */
  restoreEntrySnapshot(scope: MemoryScope, project: string, id: string, snapshotFile: string): boolean {
    try {
      const content = readFileSync(snapshotFile, 'utf8')
      writeAtomicText(this.entryFile(scope, project, id), content)
      // trash 目录名是 safeProjectKey 后的形式；项目 key 非目录安全时无法
      // 反推原名，因此整体清空缓存（撤销是低频操作）保证任何调用方重读。
      this.cache.clear()
      return true
    } catch (error) {
      this.log('warn', `从快照恢复记忆 ${id} 失败：${error instanceof Error ? error.message : String(error)}`)
      return false
    }
  }

  /**
   * 撤销一次维护 Run：把该 Run 的 trash 目录内全部快照覆盖写回。
   *
   * 快照按记忆树相对路径存放，因此删除条目的作用域/项目从目录名还原；
   * 文件不存在的项跳过。返回实际恢复的文件数。
   *
   * @param trashRoot - 本次 Run 的 trash 根目录。
   */
  restoreTrashRun(trashRoot: string): number {
    let restored = 0
    const restoreDir = (dir: string, scope: MemoryScope, project: string): void => {
      let names: string[] = []
      try {
        names = readdirSync(dir, { withFileTypes: true })
          .filter(item => item.isFile() && item.name.endsWith('.md'))
          .map(item => item.name)
      } catch {
        return
      }
      for (const name of names) {
        if (this.restoreEntrySnapshot(scope, project, path.basename(name, '.md'), path.join(dir, name))) {
          restored += 1
        }
      }
    }
    restoreDir(path.join(trashRoot, 'global'), 'global', '')
    let projectDirs: string[] = []
    try {
      projectDirs = readdirSync(path.join(trashRoot, 'projects'), { withFileTypes: true })
        .filter(item => item.isDirectory())
        .map(item => item.name)
    } catch {
      projectDirs = []
    }
    for (const projectKey of projectDirs) {
      restoreDir(path.join(trashRoot, 'projects', projectKey), 'project', projectKey)
    }
    return restored
  }

  /**
   * 检索一个作用域（`scope === 'all'` 时同时检索全局）。
   *
   * 接受两种调用形式：
   * - 旧形式：`search(scope, project, query, limit)`；
   * - 下推：`search(scope, project, { query, type, includeArchived, limit })`。
   *
   * 过滤在截断之前完成，因此类型过滤不会被其它类型的高排名条目挤掉。
   *
   * @param scope - `global`、`project` 或 `all`。
   * @param project - 项目作用域的项目 key。
   * @param request - 旧形式的自由文本查询，或 options 对象。
   * @param limit - 旧形式的最大结果数。
   * @param options - 旧形式附加的下推过滤器。
   */
  search(
    scope: MemoryScope | 'all',
    project: string,
    request: string | MemorySearchOptions = '',
    limit = 10,
    options: MemorySearchOptions = {},
  ): MemoryMeta[] {
    let query = ''
    let filters = options
    if (typeof request === 'string') {
      query = text(request)
    } else {
      filters = request
      query = text(request.query)
    }
    const pool: MemoryEntry[] = []
    if (scope !== 'project') pool.push(...this.load('global', ''))
    if (scope !== 'global' && project !== '') pool.push(...this.load('project', project))
    const candidates = pool.filter(entry =>
      (filters.includeArchived === true || entry.status !== 'archived')
      && (filters.type === undefined || entry.type === filters.type))
    const scored = query === '' ? candidates.sort(compareEntries) : this.score(candidates, query)
    return scored.slice(0, clampInt(filters.limit ?? limit, 1, 50, 10)).map(toMeta)
  }

  /** 读取一条记忆。 */
  get(scope: MemoryScope, project: string, id: string): MemoryEntry | undefined {
    return this.load(scope, project).find(entry => entry.id === id)
  }

  /**
   * 把一条记忆的正文写成宿主可预览的临时 Markdown。
   *
   * 文件内容只含正文（剥离 frontmatter），同一 id 重复调用覆写同一路径。
   *
   * @param scope - 记忆作用域。
   * @param project - 项目级记忆的项目 key。
   * @param id - 记忆 id。
   */
  previewFile(scope: MemoryScope, project: string, id: string): PreviewFile {
    const entry = this.get(scope, project, id)
    if (entry === undefined) throw new Error(`记忆不存在：${id}`)
    return writePreviewFile(entry, this.previewDir)
  }

  /**
   * 创建或强化一条记忆。
   *
   * name/description/content 指纹与同一作用域的存活记忆相同时只强化原条目；
   * `supersedes` 在所有写入路径上都会把被取代条目标记为 stale。
   *
   * @param input - 完整写入。
   */
  save(input: SaveMemoryInput): MemoryEntry {
    const scope = input.scope
    const project = scope === 'global' ? '' : safeProjectKey(input.project ?? '')
    const entries = this.load(scope, project)
    const name = text(input.name).slice(0, LIMITS.name) || '未命名记忆'
    const description = text(input.description).slice(0, LIMITS.description)
    const content = text(input.content).slice(0, LIMITS.content)
    const type = input.type
    const importance = clampInt(input.importance, 0, 100, 50)
    const tags = normalizeTags(input.tags)
    const tagsProvided = input.tags !== undefined
    const supersedesInput = input.supersedes === undefined
      ? undefined
      : normalizeIds(input.supersedes).filter(id => id !== input.id)
    const confidence = clampInt(input.confidence, 0, 100, 50)
    const confidenceProvided = input.confidence !== undefined
    const pinned = input.pinned === true
    const pinnedProvided = input.pinned !== undefined
    const source = normalizeSource(input.source)
    const sourceProvided = input.source !== undefined
    const tier = normalizeTier(input.tier, tierForSource(source))
    const tierProvided = input.tier !== undefined
    const mergedFrom = normalizeIds(input.mergedFrom)
    const mergedProvided = input.mergedFrom !== undefined
    const now = new Date().toISOString()

    // 写入闸门：所有路径（工具/提炼/面板/命令/维护合并）共用同一确定性
    // secrets 检查，命中整条拒绝（不含归档重写/迁移等既有数据路径）。
    assertNoSecrets(`${name}\n${description}\n${content}\n${tags.join('\n')}`)

    const existingById = input.id === undefined ? undefined : entries.find(entry => entry.id === input.id)
    if (existingById !== undefined) {
      const updated: MemoryEntry = {
        ...existingById,
        name,
        description,
        content,
        type,
        importance,
        // 显式传 [] 必须清空标签；缺省才保留旧值。
        tags: tagsProvided ? tags : existingById.tags,
        // 空 supersedes 视为「未提供」，避免 UI 编辑时误清历史取代关系。
        supersedes: supersedesInput === undefined || supersedesInput.length === 0
          ? existingById.supersedes
          : supersedesInput,
        ...(confidenceProvided ? { confidence } : {}),
        ...(pinnedProvided ? { pinned } : {}),
        ...(sourceProvided ? { source } : {}),
        // 层级显式优先；未显式给层级时钉住视为长驻意图。
        ...(tierProvided ? { tier } : pinnedProvided && pinned ? { tier: 'long' as const } : {}),
        ...(mergedProvided && mergedFrom.length > 0
          ? { mergedFrom: [...new Set([...existingById.mergedFrom, ...mergedFrom])] }
          : {}),
        updatedAt: now,
      }
      this.writeEntry(scope, project, updated)
      this.applySupersedes(scope, project, supersedesInput ?? [], updated.id)
      return updated
    }

    const fingerprint = fingerprintOf(name, description, content)
    let duplicate = entries.find(entry => entry.status !== 'archived' && fingerprintOf(entry.name, entry.description, entry.content) === fingerprint)
    // 相似吸收：模型/提炼写入的措辞与既有条目几乎不可能逐字相同，指纹查重
    // 防不住同义重复；对短期写入用 bigram 相似度兜一道——与存活条目高度
    // 相似时不新建，转为对既有条目的一次强化（同义重复即再次确认）。
    // 用户显式写入（tier=long）代表人的直接判断，不做吸收；过短文本的
    // bigram 相似度虚高（模板化条目名会互相误伤），同样不参与比对。
    if (duplicate === undefined && tier === 'short') {
      const candidateText = `${name}\n${description}\n${content}`
      if (longEnoughForSimilarity(candidateText)) {
        let bestScore = 0
        for (const entry of entries) {
          if (entry.status === 'archived') continue
          const entryText = `${entry.name}\n${entry.description}\n${entry.content}`
          if (!longEnoughForSimilarity(entryText)) continue
          const score = similarity(candidateText, entryText)
          if (score >= CAPTURE_SIMILARITY_THRESHOLD && score > bestScore) {
            bestScore = score
            duplicate = entry
          }
        }
        if (duplicate !== undefined) {
          this.log('info', `记忆候选与 ${duplicate.id} 相似度 ${(bestScore * 100).toFixed(0)}%，已转为强化而非新增`)
        }
      }
    }
    if (duplicate !== undefined) {
      // 强化路径也要处理 supersedes：只对尚未记录的新 id 记一次票，保持幂等。
      const addedSupersedes = (supersedesInput ?? []).filter(id => !duplicate.supersedes.includes(id))
      const reinforced: MemoryEntry = {
        ...duplicate,
        description: duplicate.description !== '' ? duplicate.description : description,
        importance: Math.max(duplicate.importance, importance),
        tags: [...new Set([...duplicate.tags, ...tags])].slice(0, LIMITS.tags),
        reinforcement: duplicate.reinforcement + 1,
        // 事实被再次确认（指纹重复或相似吸收）即使用证明：短期条目升级为长期。
        tier: duplicate.tier === 'short' ? 'long' : duplicate.tier,
        supersedes: addedSupersedes.length === 0 ? duplicate.supersedes : [...duplicate.supersedes, ...addedSupersedes],
        ...(confidenceProvided ? { confidence } : {}),
        ...(pinnedProvided ? { pinned } : {}),
        ...(sourceProvided ? { source } : {}),
        ...(mergedProvided && mergedFrom.length > 0
          ? { mergedFrom: [...new Set([...duplicate.mergedFrom, ...mergedFrom])] }
          : {}),
        updatedAt: now,
      }
      this.writeEntry(scope, project, reinforced)
      this.applySupersedes(scope, project, addedSupersedes, reinforced.id)
      return reinforced
    }

    const entry: MemoryEntry = {
      id: newEntryId(),
      name,
      description,
      type,
      scope,
      project,
      tags,
      importance,
      confidence: confidenceProvided ? confidence : 50,
      status: 'active',
      tier,
      reinforcement: 0,
      obsoleteVotes: 0,
      pinned: pinnedProvided ? pinned : false,
      usedCount: 0,
      supersedes: supersedesInput ?? [],
      mergedFrom,
      source: sourceProvided ? source : 'capture',
      originSessionId: text(input.originSessionId),
      createdAt: now,
      updatedAt: now,
      content,
    }
    this.writeEntry(scope, project, entry)
    this.applySupersedes(scope, project, supersedesInput ?? [], entry.id)
    return entry
  }

  /** 修改一条记忆的生命周期状态。 */
  setStatus(scope: MemoryScope, project: string, id: string, status: MemoryStatus): MemoryEntry {
    const entry = this.get(scope, project, id)
    if (entry === undefined) throw new Error(`记忆不存在：${id}`)
    const updated: MemoryEntry = { ...entry, status, updatedAt: new Date().toISOString() }
    this.writeEntry(scope, project, updated)
    return updated
  }

  /**
   * 记录一次正文读取（`memory_get` 命中）：短期条目升级为长期并写回真源。
   *
   * 升级是一次性元数据变更，不刷新 `updatedAt`（不是内容修改）；已长期则不动。
   */
  promoteRead(scope: MemoryScope, project: string, id: string): void {
    const entry = this.get(scope, project, id)
    if (entry === undefined || entry.tier === 'long') return
    this.writeEntry(scope, project, { ...entry, tier: 'long' })
  }

  /** 修改一条记忆的保留层级（面板手动升降级）。 */
  setTier(scope: MemoryScope, project: string, id: string, tier: MemoryTier): MemoryEntry {
    const entry = this.get(scope, project, id)
    if (entry === undefined) throw new Error(`记忆不存在：${id}`)
    const updated: MemoryEntry = { ...entry, tier, updatedAt: new Date().toISOString() }
    this.writeEntry(scope, project, updated)
    return updated
  }

  /**
   * 给一条记忆投过时票：第一票标记 stale（仍可检索），第二票归档，使其
   * 不再注入、默认检索也看不到。
   *
   * @param scope - 记忆作用域。
   * @param project - 项目作用域的项目 key。
   * @param id - 记忆 id。
   * @param reason - 自由文本原因，只写日志。
   */
  forget(scope: MemoryScope, project: string, id: string, reason = ''): ForgetResult {
    const entry = this.get(scope, project, id)
    if (entry === undefined) throw new Error(`记忆不存在：${id}`)
    const votes = entry.obsoleteVotes + 1
    const status: MemoryStatus = votes >= 2 ? 'archived' : 'stale'
    const updated: MemoryEntry = { ...entry, obsoleteVotes: votes, status, updatedAt: new Date().toISOString() }
    this.writeEntry(scope, project, updated)
    if (reason !== '') this.log('info', `记忆 ${id} 被标记过时：${reason}`)
    return { entry: updated, archived: status === 'archived' }
  }

  /** 永久删除一条记忆文件。 */
  remove(scope: MemoryScope, project: string, id: string): boolean {
    const entry = this.get(scope, project, id)
    if (entry === undefined) return false
    try {
      unlinkSync(this.entryFile(scope, project, entry.id))
    } catch {
      return false
    }
    this.invalidate(scope, project)
    return true
  }

  /**
   * 删除一条记忆的预览目录（best effort，供 `/memory/delete` 调用）。
   *
   * @param id - 记忆 id。
   */
  removePreview(id: string): void {
    removePreviewEntry(id, this.previewDir)
  }

  /**
   * 异步串行版 `save`：并发写场景共用进程内写队列（同步 `save` 保留给现有调用方）。
   *
   * @param input - 完整写入。
   */
  saveAsync(input: SaveMemoryInput): Promise<MemoryEntry> {
    return this.enqueueWrite(() => this.save(input))
  }

  /** 异步串行版 `setStatus`。 */
  setStatusAsync(scope: MemoryScope, project: string, id: string, status: MemoryStatus): Promise<MemoryEntry> {
    return this.enqueueWrite(() => this.setStatus(scope, project, id, status))
  }

  /** 异步串行版 `forget`。 */
  forgetAsync(scope: MemoryScope, project: string, id: string, reason = ''): Promise<ForgetResult> {
    return this.enqueueWrite(() => this.forget(scope, project, id, reason))
  }

  /** 异步串行版 `remove`。 */
  removeAsync(scope: MemoryScope, project: string, id: string): Promise<boolean> {
    return this.enqueueWrite(() => this.remove(scope, project, id))
  }

  /** 等待当前已排队的写操作全部完成（测试与销毁时用）。 */
  async flushWrites(): Promise<void> {
    await this.writeQueue
  }

  /**
   * 注入到系统提示词的索引行，按重要度/新鲜度排序。
   *
   * @param scope - 记忆作用域。
   * @param project - 项目作用域的项目 key。
   * @param limit - 最大条目数。
   */
  indexLines(scope: MemoryScope, project: string, limit: number): { lines: string[], ids: string[] } {
    const entries = this.load(scope, project)
      .filter(entry => entry.status === 'active')
      .sort((left, right) => right.importance - left.importance || right.updatedAt.localeCompare(left.updatedAt))
      .slice(0, clampInt(limit, 0, LIMITS.indexEntries, 0))
    const lines = entries.map((entry) => {
      const head = `- [${entry.id}] (${entry.type}, ${entry.updatedAt.slice(0, 10)}) ${entry.name}`
      const line = entry.description === '' ? head : `${head} — ${entry.description}`
      return line.length <= INDEX_LINE_CHARS ? line : `${line.slice(0, INDEX_LINE_CHARS - 1)}…`
    })
    return { lines, ids: entries.map(entry => entry.id) }
  }

  /**
   * 把一个作用域导出成单个 Markdown 文档（未知 frontmatter 字段一并保留）。
   *
   * @param scope - 记忆作用域。
   * @param project - 项目作用域的项目 key。
   */
  exportMarkdown(scope: MemoryScope, project = ''): { filename: string, content: string } {
    const records = [...this.loadRecords(scope, project)].sort((left, right) => compareEntries(left.entry, right.entry))
    const title = scope === 'global'
      ? '全局记忆'
      : `项目记忆（${this.getProject(project)?.displayName ?? project}）`
    const content = `# ${title}\n\n${records.map(record => renderEntry(record.entry, record.extras).trimEnd()).join('\n\n---\n\n')}\n`
    const date = new Date().toISOString().slice(0, 10)
    const filename = scope === 'global' ? `memory-global-${date}.md` : `memory-project-${safeProjectKey(project)}-${date}.md`
    return { filename, content }
  }

  private scopeDir(scope: MemoryScope, project: string): string {
    return scope === 'global' ? path.join(this.root, 'global') : path.join(this.root, 'projects', safeProjectKey(project))
  }

  private entryFile(scope: MemoryScope, project: string, id: string): string {
    return path.join(this.scopeDir(scope, project), `${id}.md`)
  }

  /** 扫描一个作用域并返回缓存记录；文件 `mtime+size` 变化即整目录重读。 */
  private loadRecords(scope: MemoryScope, project: string): CachedEntry[] {
    const dir = this.scopeDir(scope, project)
    let names: string[] = []
    try {
      names = readdirSync(dir).filter(name => name.endsWith('.md') && name !== MEMORY_INDEX_FILE).sort()
    } catch {
      this.cache.delete(`${scope}:${project}`)
      return []
    }
    const stamps: string[] = []
    for (const name of names) {
      const file = path.join(dir, name)
      try {
        const info = statSync(file)
        stamps.push(`${name}:${info.mtimeMs}:${info.size}`)
      } catch {
        stamps.push(`${name}:missing`)
      }
    }
    const stamp = stamps.join('|')
    const cacheKey = `${scope}:${project}`
    const cached = this.cache.get(cacheKey)
    if (cached !== undefined && cached.stamp === stamp) return cached.entries
    const records: CachedEntry[] = []
    for (const name of names) {
      const parsed = readDocument(path.join(dir, name), scope, project)
      if (parsed !== null) records.push({ entry: parsed.entry, extras: parsed.extras })
    }
    this.cache.set(cacheKey, { stamp, entries: records })
    return records
  }

  private load(scope: MemoryScope, project: string): MemoryEntry[] {
    return this.loadRecords(scope, project).map(record => record.entry)
  }

  /** 读取某条已知记录的未知 frontmatter 行（新条目不查盘）。 */
  private extrasOf(scope: MemoryScope, project: string, id: string): string[] {
    const found = this.loadRecords(scope, project).find(record => record.entry.id === id)
    return found?.extras ?? []
  }

  private invalidate(scope: MemoryScope, project: string): void {
    this.cache.delete(`${scope}:${project}`)
  }

  /**
   * 写一条记忆：原子写（tmp + rename），并保留该文件原有的未知 frontmatter 字段。
   */
  private writeEntry(scope: MemoryScope, project: string, entry: MemoryEntry, extras?: readonly string[]): void {
    const preserved = extras ?? this.extrasOf(scope, project, entry.id)
    try {
      writeAtomicText(this.entryFile(scope, project, entry.id), renderEntry(entry, preserved))
    } catch (error) {
      this.log('error', `写记忆失败 ${entry.id}：${error instanceof Error ? error.message : String(error)}`)
      throw error
    }
    this.invalidate(scope, project)
  }

  /**
   * 标记被取代的条目为 stale；已 stale/archived 的不重复计票（幂等）。
   *
   * 冲突裁决由代码执行（hindsight「时间比较由代码做」的对位）：目标通常与
   * 新条目同作用域，但「项目事实推翻全局偏好」合法——同作用域找不到时回退
   * 全局查找，写回按目标自身位置。仍找不到（模型幻觉 id）记警告并丢弃该票，
   * 绝不静默吞掉。
   */
  private applySupersedes(scope: MemoryScope, project: string, ids: readonly string[], sourceId: string): void {
    for (const id of ids) {
      if (id === sourceId) continue
      const entry = this.get(scope, project, id) ?? this.get('global', '', id)
      if (entry === undefined) {
        this.log('warn', `取代目标不存在，已丢弃该票：${id}`)
        continue
      }
      if (entry.status === 'archived') continue
      // 已由别的条目计过票：不重复累加，避免反复 save 把条目误归档。
      if (entry.status === 'stale' && entry.obsoleteVotes > 0) continue
      const updated: MemoryEntry = {
        ...entry,
        status: 'stale',
        obsoleteVotes: entry.obsoleteVotes + 1,
        updatedAt: new Date().toISOString(),
      }
      this.writeEntry(entry.scope, entry.project, updated)
    }
  }

  /** 执行一次 v1 → v2 迁移（幂等；无 v1 文件时不做任何事）。 */
  private migrate(): MemoryMigrationReport {
    return migrateMemoryTree({
      root: this.root,
      log: this.log,
      parse: (source, scope, project, file) => parseDocument(source, file, scope, project),
      render: (entry, extras) => renderEntry(entry, extras),
    })
  }

  /** 把写操作挂到进程内串行队列。 */
  private enqueueWrite<T>(operation: () => T | Promise<T>): Promise<T> {
    const run = this.writeQueue.then(() => operation())
    // 单次失败不阻断后续写操作。
    this.writeQueue = run.then(() => undefined, () => undefined)
    return run
  }

  /**
   * 文本检索评分：命中词覆盖数优先（近似 AND 语义，同时命中更多查询词的
   * 条目排前），其次词频加权分（name×4 / tags×3 / description×2 / content×1）。
   *
   * 高频词降噪（claude-mem SessionSearch 的放宽思路）：出现在近三分之一条目
   * 中的词对排序没有区分度，多词查询且条目足够多时把这类词从覆盖计分里剔除，
   * 避免「一条只含单个高频词的条目淹没同时命中多个稀有词的条目」；全部词都是
   * 高频词（剔除后无人可命中）时回退全词表。词频统计在小库上不稳定，条目
   * 不足 20 条时不启用。
   */
  private score(entries: MemoryEntry[], query: string): MemoryEntry[] {
    const terms = queryTerms(query)
    if (terms.length === 0) return entries.sort(compareEntries)
    const matchedTerms = new Map<string, Set<string>>()
    const rawScores = new Map<string, number>()
    const documentFrequency = new Map<string, number>()
    for (const entry of entries) {
      const haystack = [
        { text: entry.name, weight: 4 },
        { text: entry.tags.join(' '), weight: 3 },
        { text: entry.description, weight: 2 },
        { text: entry.content, weight: 1 },
      ]
      const matched = new Set<string>()
      let raw = 0
      for (const term of terms) {
        let termScore = 0
        for (const field of haystack) {
          const target = field.text.toLowerCase()
          let index = target.indexOf(term)
          while (index !== -1) {
            termScore += field.weight
            index = target.indexOf(term, index + term.length)
          }
        }
        if (termScore > 0) {
          matched.add(term)
          raw += termScore
        }
      }
      if (matched.size === 0) continue
      matchedTerms.set(entry.id, matched)
      rawScores.set(entry.id, Math.min(raw, 1000))
      for (const term of matched) {
        documentFrequency.set(term, (documentFrequency.get(term) ?? 0) + 1)
      }
    }
    // 降噪词表：只在「有人命中」的词里挑稀有词；没有稀有词就用全词表。
    let effective = terms
    if (entries.length >= 20 && terms.length >= 2) {
      const rare = terms.filter(term => {
        const frequency = documentFrequency.get(term) ?? 0
        return frequency > 0 && frequency < entries.length * 0.3
      })
      if (rare.length > 0) effective = rare
    }
    const scored: Array<{ entry: MemoryEntry, matchedCount: number, raw: number }> = []
    for (const entry of entries) {
      const matched = matchedTerms.get(entry.id)
      if (matched === undefined) continue
      const matchedCount = [...matched].filter(term => effective.includes(term)).length
      if (matchedCount === 0) continue
      scored.push({ entry, matchedCount, raw: rawScores.get(entry.id) ?? 0 })
    }
    return scored
      .sort((left, right) => right.matchedCount - left.matchedCount
        || right.raw - left.raw
        || statusRank(right.entry) - statusRank(left.entry)
        || right.entry.importance - left.entry.importance
        || right.entry.updatedAt.localeCompare(left.entry.updatedAt))
      .map(item => item.entry)
  }

  private writeSettings(): void {
    try {
      writeAtomicText(this.settingsFile, `${JSON.stringify({ schema: SETTINGS_SCHEMA, ...this.settings() }, null, 2)}\n`)
    } catch (error) {
      this.log('warn', `写 settings.json 失败：${error instanceof Error ? error.message : String(error)}`)
    }
  }

  private writeStats(): void {
    try {
      writeAtomicText(this.statsFile, `${JSON.stringify({ schema: STATS_SCHEMA, ...this.stats() }, null, 2)}\n`)
    } catch (error) {
      this.log('warn', `写 stats.json 失败：${error instanceof Error ? error.message : String(error)}`)
    }
  }

  private projects(): ProjectRecord[] {
    if (this.projectsValue !== null) return this.projectsValue
    const raw = readJson(this.projectsFile)
    if (raw !== null && (typeof raw !== 'object' || Array.isArray(raw))) {
      this.log('warn', 'memory/projects.json 结构异常，已按空登记修复')
    } else if (raw !== null && documentSchema(raw) !== PROJECTS_SCHEMA) {
      this.log('warn', `memory/projects.json schema=${documentSchema(raw)}（当前 ${PROJECTS_SCHEMA}），按容错读取`)
    }
    const stored = objectOf(raw)
    const list = Array.isArray(stored.projects) ? stored.projects : []
    this.projectsValue = list
      .map(item => normalizeProject(item, key => this.countEntries('project', key)))
      .filter((item): item is ProjectRecord => item !== null)
    return this.projectsValue
  }

  private writeProjects(): void {
    try {
      writeAtomicText(this.projectsFile, `${JSON.stringify({ schema: PROJECTS_SCHEMA, projects: this.projects() }, null, 2)}\n`)
    } catch (error) {
      this.log('warn', `写 projects.json 失败：${error instanceof Error ? error.message : String(error)}`)
    }
  }
}

/**
 * 文本检索之外的排序：活着的先于过时的（agentcairn validity penalty 的
 * 离散化对位——被取代转 stale 的旧事实在同等条件下沉底），重要度优先，
 * 其次更新时间。
 */
function compareEntries(left: MemoryEntry, right: MemoryEntry): number {
  return statusRank(right) - statusRank(left)
    || right.importance - left.importance
    || right.updatedAt.localeCompare(left.updatedAt)
}

/** 状态权重：active 为 1、其余为 0。 */
function statusRank(entry: MemoryEntry): number {
  return entry.status === 'active' ? 1 : 0
}

/** 把一个条目投影成列表元数据（正文不进入列表载荷）。 */
function toMeta(entry: MemoryEntry): MemoryMeta {
  return {
    id: entry.id,
    name: entry.name,
    description: entry.description,
    type: entry.type,
    scope: entry.scope,
    project: entry.project,
    tags: entry.tags,
    importance: entry.importance,
    tier: entry.tier,
    confidence: entry.confidence,
    status: entry.status,
    reinforcement: entry.reinforcement,
    obsoleteVotes: entry.obsoleteVotes,
    pinned: entry.pinned,
    usedCount: entry.usedCount,
    supersedes: entry.supersedes,
    mergedFrom: entry.mergedFrom,
    source: entry.source,
    originSessionId: entry.originSessionId,
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt,
    ...(entry.lastUsedAt === undefined ? {} : { lastUsedAt: entry.lastUsedAt }),
  }
}

/**
 * 查询词：空白分词 + 中文 bigram，因此中文查询无需分词依赖也能命中。
 *
 * @param query - 用户原始查询。
 */
export function queryTerms(query: string): string[] {
  const lowered = query.toLowerCase().trim()
  if (lowered === '') return []
  const terms = new Set<string>()
  for (const word of lowered.split(/\s+/u)) {
    if (word === '') continue
    terms.add(word)
    if (/[\u3400-\u9fff]/u.test(word) && word.length >= 2) {
      for (let index = 0; index < word.length - 1; index += 1) terms.add(word.slice(index, index + 2))
    }
  }
  return [...terms]
}