/**
 * 记忆利用率采集：派生使用记录（usage store）。
 *
 * Markdown 仍是唯一真源；这里只记「某条记忆被检索/读取过几次、最后一次是
 * 什么时候」。读路径（工具命中）只改内存并标脏，由运行时在
 * `agent/turn-stopping`、`agent/disposed`、30 秒定时器与插件销毁时批量落盘
 * 到 `<home>/memory/usage.json`，避免每次命中都写盘。
 *
 * 文件是派生数据：可以随时删除重建，绝不把 `usedCount` / `lastUsedAt` 写回
 * 记忆 Markdown（那是维护批次的事）。
 *
 * ```
 * memory/
 *   usage.json   { schema: 1, entries: { [id]: { usedCount, lastUsedAt } } }
 * ```
 *
 * @module dsh-agent-extension/memory/usage
 */

import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'

import type { LogFn } from '../log.ts'
import { writeAtomicText } from './migrate.ts'

/** usage.json 的当前 schema 版本。 */
export const USAGE_SCHEMA = 1

/** 兜底落盘间隔：30 秒（轮末与会话结束之外的最后一道保险）。 */
export const USAGE_FLUSH_INTERVAL_MS = 30_000

/** 使用记录文件的文件名（位于记忆根目录）。 */
const USAGE_FILE = 'usage.json'

/** 最多保留的条目数；超出时丢弃最久未使用的记录。 */
const USAGE_MAX_ENTRIES = 2000

/** 单条记忆的最大 id 长度；超长视为损坏记录丢弃。 */
const USAGE_MAX_ID_CHARS = 200

/** `usedCount` 的合法上界；越界记录在读取时丢弃。 */
const USED_COUNT_MAX = 1_000_000

/** 一条记忆的派生使用记录。 */
export interface UsageRecord {
  usedCount: number
  lastUsedAt: string
}

/** UsageStore 构造参数。 */
export interface UsageStoreOptions {
  /** 记忆根目录（`MemoryStore.root`，即 `<home>/memory`）；文件落在其下的 `usage.json`。 */
  root: string
  log?: LogFn
}

/** 归一化一条使用记录；不可用（类型错误、越界、时间非法）返回 null。 */
function normalizeRecord(raw: unknown): UsageRecord | null {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return null
  const value = raw as Record<string, unknown>
  const usedCount = value.usedCount
  if (typeof usedCount !== 'number' || !Number.isFinite(usedCount)
    || usedCount < 0 || usedCount > USED_COUNT_MAX) return null
  const lastUsedAt = typeof value.lastUsedAt === 'string' ? value.lastUsedAt.trim() : ''
  const stamp = Date.parse(lastUsedAt)
  if (lastUsedAt === '' || Number.isNaN(stamp)) return null
  return { usedCount: Math.round(usedCount), lastUsedAt: new Date(stamp).toISOString() }
}

/** 读取并归一化 usage.json；任何不可用输入都退化为空记录。 */
function readUsage(file: string, log: LogFn): Map<string, UsageRecord> {
  const entries = new Map<string, UsageRecord>()
  let source = ''
  try {
    source = readFileSync(file, 'utf8')
  } catch {
    // 文件不存在是正常状态（首次使用）；存在但读不到才提示。
    if (existsSync(file)) log('warn', '读 memory/usage.json 失败，已按空记录处理')
    return entries
  }
  let raw: unknown
  try {
    raw = JSON.parse(source) as unknown
  } catch {
    log('warn', 'memory/usage.json 无法解析，已按空记录处理（下次落盘重建）')
    return entries
  }
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    log('warn', 'memory/usage.json 结构异常，已按空记录处理（下次落盘重建）')
    return entries
  }
  const document = raw as Record<string, unknown>
  if (document.schema !== USAGE_SCHEMA) {
    log('warn', `memory/usage.json schema=${String(document.schema)}（当前 ${USAGE_SCHEMA}），按容错读取`)
  }
  const stored = document.entries
  if (stored === null || typeof stored !== 'object' || Array.isArray(stored)) return entries
  const candidates: Array<{ id: string, record: UsageRecord }> = []
  for (const [rawId, rawRecord] of Object.entries(stored as Record<string, unknown>)) {
    const id = rawId.trim()
    if (id === '' || id.length > USAGE_MAX_ID_CHARS) continue
    const record = normalizeRecord(rawRecord)
    if (record !== null) candidates.push({ id, record })
  }
  // 有界：最近使用的先保留。
  candidates.sort((left, right) => right.record.lastUsedAt.localeCompare(left.record.lastUsedAt))
  for (const candidate of candidates.slice(0, USAGE_MAX_ENTRIES)) {
    entries.set(candidate.id, candidate.record)
  }
  return entries
}

/**
 * 一条记忆的利用率采集器；由运行时持有，读路径只改内存，显式 `flush` 才落盘。
 */
export class UsageStore {
  /** 使用记录文件（`<root>/usage.json`）。 */
  readonly file: string
  private readonly log: LogFn
  private entries = new Map<string, UsageRecord>()
  private loaded = false
  private dirty = false

  constructor(options: UsageStoreOptions) {
    this.file = path.join(options.root, USAGE_FILE)
    this.log = options.log ?? (() => {})
  }

  /** 已采集的条目数。 */
  get size(): number {
    return this.entries.size
  }

  /** 读取磁盘记录（幂等；运行时 start 时调用一次）。 */
  load(): void {
    if (this.loaded) return
    this.loaded = true
    this.entries = readUsage(this.file, this.log)
  }

  /**
   * 记录一批命中：内存累加 `usedCount`、刷新 `lastUsedAt`，并标脏。
   *
   * 同一次调用内重复的 id 只计一次（一次工具结果只算一次使用）。
   *
   * @param ids - 命中的记忆 id。
   * @param at - 命中时间；缺省当前时间（测试可注入）。
   */
  touch(ids: readonly string[], at: Date = new Date()): void {
    this.load()
    const stamp = Number.isFinite(at.getTime()) ? at.toISOString() : new Date().toISOString()
    const seen = new Set<string>()
    let changed = false
    for (const raw of ids) {
      const id = typeof raw === 'string' ? raw.trim() : ''
      if (id === '' || id.length > USAGE_MAX_ID_CHARS || seen.has(id)) continue
      seen.add(id)
      const previous = this.entries.get(id)
      this.entries.set(id, {
        usedCount: Math.min(USED_COUNT_MAX, (previous?.usedCount ?? 0) + 1),
        lastUsedAt: stamp,
      })
      changed = true
    }
    if (!changed) return
    this.dirty = true
    this.evict()
  }

  /** 写入磁盘（仅脏时；原子 tmp + rename，失败只记日志）。 */
  flush(): void {
    if (!this.dirty) return
    const content = `${JSON.stringify({
      schema: USAGE_SCHEMA,
      entries: this.snapshot(),
    }, null, 2)}\n`
    try {
      writeAtomicText(this.file, content)
      this.dirty = false
    } catch (error) {
      this.log('warn', `写 memory/usage.json 失败：${error instanceof Error ? error.message : String(error)}`)
    }
  }

  /** 内存快照（深拷贝，供测试与后续维护 Run 读取聚合值）。 */
  snapshot(): Record<string, UsageRecord> {
    const out: Record<string, UsageRecord> = {}
    for (const [id, record] of this.entries) out[id] = { ...record }
    return out
  }

  /** 容量有界：超出上限时丢弃最久未使用的记录。 */
  private evict(): void {
    if (this.entries.size <= USAGE_MAX_ENTRIES) return
    const ordered = [...this.entries].sort(
      (left, right) => right[1].lastUsedAt.localeCompare(left[1].lastUsedAt),
    )
    this.entries = new Map(ordered.slice(0, USAGE_MAX_ENTRIES))
  }
}