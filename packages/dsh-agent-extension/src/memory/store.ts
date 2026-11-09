/**
 * File-backed memory store.
 *
 * Layout under the plugin home (`~/.dsh/agent-extension/memory` by default):
 *
 * ```
 * memory/
 *   settings.json          user-tunable capture / injection settings
 *   stats.json             capture counters and per-session recall counters
 *   projects.json          known project identities
 *   global/MEMORY.md       global index (human + model readable)
 *   global/<id>.md         one fact per file (frontmatter + Markdown body)
 *   projects/<key>/...     same layout, scoped to one project identity
 * ```
 *
 * Markdown is authoritative; `MEMORY.md` is regenerated after every mutation
 * and the in-memory cache is invalidated by directory mtime, so hand edits and
 * our own writes stay consistent.
 *
 * @module dsh-agent-extension/memory/store
 */

import { createHash, randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import path from 'node:path'

import { parseFrontmatter } from '../frontmatter.ts'
import type { LogFn } from '../log.ts'
import {
  LIMITS,
  clampInt,
  defaultSettings,
  isMemoryStatus,
  isMemoryType,
  normalizeIds,
  normalizeTags,
  text,
  type MemoryEntry,
  type MemoryMeta,
  type MemoryScope,
  type MemorySettings,
  type MemoryStats,
  type MemoryStatus,
  type MemoryType,
  type ProjectIdentity,
  type ProjectRecord,
  type SessionRecallStats,
} from './types.ts'

/** Input of one create/update write. */
export interface SaveMemoryInput {
  id?: string
  name: string
  description: string
  type: MemoryType
  scope: MemoryScope
  /** Resolved project key; ignored for the global scope. */
  project?: string
  content: string
  tags?: string[]
  importance?: number
  supersedes?: string[]
  originSessionId?: string
}

/** Store constructor options. */
export interface MemoryStoreOptions {
  /** Plugin home (`~/.dsh/agent-extension`); memories live under `memory/`. */
  home: string
  log?: LogFn
}

/** Result of `forget`. */
export interface ForgetResult {
  entry: MemoryEntry
  archived: boolean
}

const INDEX_FILE = 'MEMORY.md'
const SETTINGS_FILE = 'settings.json'
const STATS_FILE = 'stats.json'
const PROJECTS_FILE = 'projects.json'
const INDEX_HEADER = '# MEMORY INDEX\n\n'
const SETTINGS_SCHEMA = 1
const STATS_SCHEMA = 1
const PROJECTS_SCHEMA = 1
/** Injected index line cap; details stay one tool call away. */
const INDEX_LINE_CHARS = 120
/** Stats rows retained for the hit-rate readout. */
const SESSION_STATS_KEEP = LIMITS.statsSessions

/** Escape one single-line frontmatter scalar. */
function scalar(value: string): string {
  const single = value.replace(/[\r\n]+/gu, ' ').replace(/\\/gu, '\\\\').replace(/"/gu, '\\"')
  return `"${single}"`
}

/** Render one entry file (frontmatter plus body). */
function renderEntry(entry: MemoryEntry): string {
  const lines = [
    '---',
    `id: ${scalar(entry.id)}`,
    `name: ${scalar(entry.name)}`,
    `description: ${scalar(entry.description)}`,
    `type: ${entry.type}`,
    `scope: ${entry.scope}`,
    `project: ${scalar(entry.project)}`,
    `tags: [${entry.tags.map(scalar).join(', ')}]`,
    `importance: ${entry.importance}`,
    `status: ${entry.status}`,
    `reinforcement: ${entry.reinforcement}`,
    `obsoleteVotes: ${entry.obsoleteVotes}`,
    `supersedes: [${entry.supersedes.map(scalar).join(', ')}]`,
    `originSessionId: ${scalar(entry.originSessionId)}`,
    `createdAt: ${scalar(entry.createdAt)}`,
    `updatedAt: ${scalar(entry.updatedAt)}`,
    '---',
    '',
    entry.content.trim(),
    '',
  ]
  return lines.join('\n')
}

/** Normalize a string for fingerprints and duplicate detection. */
function normalizeForFingerprint(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/gu, ' ')
}

/** Content fingerprint: identical facts reinforce instead of duplicating. */
export function fingerprintOf(name: string, description: string, content: string): string {
  const normalized = `${normalizeForFingerprint(name)}\n${normalizeForFingerprint(description)}\n${normalizeForFingerprint(content)}`
  return createHash('sha256').update(normalized).digest('hex')
}

/** Generate one stable-looking entry id. */
function newEntryId(): string {
  return `m-${Date.now().toString(36)}-${randomBytes(3).toString('hex')}`
}

/** Parse one loaded Markdown document into a normalized entry, or null when unusable. */
function parseEntry(file: string, scope: MemoryScope, project: string): MemoryEntry | null {
  let source = ''
  try {
    source = readFileSync(file, 'utf8')
  } catch {
    return null
  }
  const parsed = parseFrontmatter(source)
  const data = parsed.data
  const id = text(data.id) || path.basename(file, '.md')
  const name = text(data.name)
  const description = text(data.description)
  const type = isMemoryType(data.type) ? data.type : 'reference'
  const status = isMemoryStatus(data.status) ? data.status : 'active'
  const importance = clampInt(data.importance, 0, 100, 50)
  const reinforcement = clampInt(data.reinforcement, 0, 100000, 0)
  const obsoleteVotes = clampInt(data.obsoleteVotes, 0, 100, 0)
  const tags = normalizeTags(data.tags)
  const supersedes = normalizeIds(data.supersedes)
  const createdAt = text(data.createdAt) || new Date().toISOString()
  const updatedAt = text(data.updatedAt) || createdAt
  const originSessionId = text(data.originSessionId)
  const content = parsed.body.trim()
  if (name === '') return null
  return {
    id,
    name,
    description,
    type,
    scope,
    project,
    tags,
    importance,
    status,
    reinforcement,
    obsoleteVotes,
    supersedes,
    originSessionId,
    createdAt,
    updatedAt,
    content,
  }
}

/** Write one file atomically through a sibling temp file. */
function writeAtomic(file: string, content: string): void {
  mkdirSync(path.dirname(file), { recursive: true })
  const tmp = `${file}.tmp-${process.pid}-${randomBytes(2).toString('hex')}`
  writeFileSync(tmp, content, 'utf8')
  renameSync(tmp, file)
}

/** Read a JSON file, returning null on any failure. */
function readJson(file: string): unknown {
  try {
    return JSON.parse(readFileSync(file, 'utf8')) as unknown
  } catch {
    return null
  }
}

/** Normalize a possibly-invalid settings document. */
function normalizeSettings(raw: unknown): MemorySettings {
  const value = raw !== null && typeof raw === 'object' && !Array.isArray(raw) ? raw as Record<string, unknown> : {}
  const fallback = defaultSettings()
  return {
    captureEnabled: typeof value.captureEnabled === 'boolean' ? value.captureEnabled : fallback.captureEnabled,
    captureSessionEnd: typeof value.captureSessionEnd === 'boolean' ? value.captureSessionEnd : fallback.captureSessionEnd,
    injectEnabled: typeof value.injectEnabled === 'boolean' ? value.injectEnabled : fallback.injectEnabled,
    indexLimitGlobal: clampInt(value.indexLimitGlobal, 0, LIMITS.indexEntries, fallback.indexLimitGlobal),
    indexLimitProject: clampInt(value.indexLimitProject, 0, LIMITS.indexEntries, fallback.indexLimitProject),
    maxChars: clampInt(value.maxChars, 1000, LIMITS.maxChars, fallback.maxChars),
    updatedAt: text(value.updatedAt) || fallback.updatedAt,
  }
}

/** Normalize one stats session row. */
function normalizeRecallRow(raw: unknown): SessionRecallStats | null {
  const value = raw !== null && typeof raw === 'object' && !Array.isArray(raw) ? raw as Record<string, unknown> : {}
  const sessionId = text(value.sessionId)
  if (sessionId === '') return null
  return {
    sessionId,
    injected: clampInt(value.injected, 0, 1000000, 0),
    injectedUsed: clampInt(value.injectedUsed, 0, 1000000, 0),
    overflow: clampInt(value.overflow, 0, 1000000, 0),
    updatedAt: text(value.updatedAt) || new Date().toISOString(),
  }
}

/** Normalize the persisted stats document. */
function normalizeStats(raw: unknown): MemoryStats {
  const value = raw !== null && typeof raw === 'object' && !Array.isArray(raw) ? raw as Record<string, unknown> : {}
  const sessions = Array.isArray(value.sessions)
    ? value.sessions.map(normalizeRecallRow).filter((row): row is SessionRecallStats => row !== null)
    : []
  return {
    captureRuns: clampInt(value.captureRuns, 0, 100000000, 0),
    capturedEntries: clampInt(value.capturedEntries, 0, 100000000, 0),
    captureSkips: clampInt(value.captureSkips, 0, 100000000, 0),
    sessions: sessions.slice(0, SESSION_STATS_KEEP),
  }
}

/** Normalize one project record. */
function normalizeProject(raw: unknown, entryCount: (key: string) => number): ProjectRecord | null {
  const value = raw !== null && typeof raw === 'object' && !Array.isArray(raw) ? raw as Record<string, unknown> : {}
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

/** Validate a project key for path use (anything else is hashed). */
function safeProjectKey(key: string): string {
  const trimmed = text(key)
  if (/^[A-Za-z0-9_-]{1,80}$/u.test(trimmed)) return trimmed
  return `h_${createHash('sha256').update(trimmed).digest('hex').slice(0, 16)}`
}

/** The memory store; owned by the plugin runtime and shared by tools and the API. */
export class MemoryStore {
  /** Root of the memory tree (`<home>/memory`). */
  readonly root: string
  /** Persistent project registry file. */
  private readonly projectsFile: string
  private readonly settingsFile: string
  private readonly statsFile: string
  private readonly log: LogFn
  private settingsValue: MemorySettings | null = null
  private statsValue: MemoryStats | null = null
  private projectsValue: ProjectRecord[] | null = null
  private readonly cache = new Map<string, { mtimeMs: number, entries: MemoryEntry[] }>()

  constructor(options: MemoryStoreOptions) {
    this.root = path.join(options.home, 'memory')
    this.settingsFile = path.join(this.root, SETTINGS_FILE)
    this.statsFile = path.join(this.root, STATS_FILE)
    this.projectsFile = path.join(this.root, PROJECTS_FILE)
    this.log = options.log ?? (() => {})
  }

  /** Ensure the memory root exists. */
  start(): void {
    mkdirSync(this.root, { recursive: true })
    mkdirSync(path.join(this.root, 'global'), { recursive: true })
    mkdirSync(path.join(this.root, 'projects'), { recursive: true })
    // Normalize on first touch so invalid files are repaired once and logged.
    void this.settings()
    void this.stats()
    void this.projects()
  }

  /** Settings of this install. */
  settings(): MemorySettings {
    if (this.settingsValue !== null) return this.settingsValue
    const raw = readJson(this.settingsFile)
    if (raw !== null && (typeof raw !== 'object' || Array.isArray(raw))) this.log('warn', 'memory/settings.json 结构异常，已按默认值修复')
    this.settingsValue = normalizeSettings(raw)
    if (raw === null && existsSync(this.settingsFile)) this.log('warn', 'memory/settings.json 无法解析，已按默认值修复')
    return this.settingsValue
  }

  /**
   * Merge a partial settings patch.
   *
   * @param patch - fields to update.
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

  /** Capture and recall counters. */
  stats(): MemoryStats {
    if (this.statsValue !== null) return this.statsValue
    this.statsValue = normalizeStats(readJson(this.statsFile))
    return this.statsValue
  }

  /**
   * Record one capture attempt.
   *
   * @param entries - memories written or reinforced.
   * @param skipped - the gate rejected the turn.
   */
  recordCapture(entries: number, skipped: boolean): void {
    const current = this.stats()
    this.statsValue = {
      ...current,
      captureRuns: skipped ? current.captureRuns : current.captureRuns + 1,
      capturedEntries: current.capturedEntries + Math.max(0, entries),
      captureSkips: skipped ? current.captureSkips + 1 : current.captureSkips,
    }
    this.writeStats()
  }

  /**
   * Record what one session's assembly actually used.
   *
   * @param sessionId - session whose prompt received the index.
   * @param injectedIds - index ids injected into the prompt.
   * @param usedIds - ids the model fetched through the memory tools.
   * @param overflow - search hits outside the injected set.
   */
  recordRecall(sessionId: string, injectedIds: readonly string[], usedIds: readonly string[], overflow: number): void {
    if (sessionId === '') return
    const current = this.stats()
    const injectedSet = new Set(injectedIds)
    const hit = new Set(usedIds.filter(id => injectedSet.has(id)))
    const sessions = current.sessions.filter(row => row.sessionId !== sessionId)
    sessions.unshift({
      sessionId,
      injected: injectedIds.length,
      injectedUsed: hit.size,
      overflow: Math.max(0, overflow),
      updatedAt: new Date().toISOString(),
    })
    this.statsValue = { ...current, sessions: sessions.slice(0, SESSION_STATS_KEEP) }
    this.writeStats()
  }

  /** Known projects, most recently seen first. */
  listProjects(): ProjectRecord[] {
    const projects = this.projects()
    return [...projects]
      .map(project => ({ ...project, entryCount: this.countEntries('project', project.key) }))
      .sort((left, right) => right.lastSeen.localeCompare(left.lastSeen))
  }

  /**
   * Register (or refresh) one project identity.
   *
   * @param identity - resolved identity of the session's working directory.
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
      entryCount: 0,
    }
    const next = existing
      ? projects.map(project => project.key === record.key ? record : project)
      : [record, ...projects]
    this.projectsValue = next.slice(0, LIMITS.projects)
    this.writeProjects()
    return { ...record, entryCount: this.countEntries('project', record.key) }
  }

  /** Resolve one known project by key. */
  getProject(key: string): ProjectRecord | undefined {
    const found = this.projects().find(project => project.key === key)
    return found === undefined ? undefined : { ...found, entryCount: this.countEntries('project', key) }
  }

  /** Count live (non-archived) entries of one scope. */
  countEntries(scope: MemoryScope, project = ''): number {
    return this.load(scope, project).filter(entry => entry.status !== 'archived').length
  }

  /**
   * List memories of one scope.
   *
   * @param scope - memory scope.
   * @param project - project key for the project scope.
   * @param options - query, type filter, archived inclusion.
   */
  list(
    scope: MemoryScope,
    project = '',
    options: { query?: string, type?: MemoryType, includeArchived?: boolean, limit?: number } = {},
  ): MemoryMeta[] {
    const query = text(options.query)
    const entries = this.load(scope, project).filter(entry =>
      (options.includeArchived === true || entry.status !== 'archived')
      && (options.type === undefined || entry.type === options.type))
    const filtered = query === '' ? entries : this.score(entries, query)
    const sorted = query === '' ? filtered.sort(compareEntries) : filtered
    const limit = clampInt(options.limit, 1, LIMITS.entriesPerScope, LIMITS.entriesPerScope)
    return sorted.slice(0, limit).map(toMeta)
  }

  /**
   * Search one scope (and the global scope when `scope` is `'all'`).
   *
   * @param scope - `global`, `project`, or `all`.
   * @param project - project key for project-scope searches.
   * @param query - free-text query; empty returns the ranked index.
   * @param limit - maximum results.
   */
  search(scope: MemoryScope | 'all', project: string, query: string, limit = 10): MemoryMeta[] {
    const pool: MemoryEntry[] = []
    if (scope !== 'project') pool.push(...this.load('global', ''))
    if (scope !== 'global' && project !== '') pool.push(...this.load('project', project))
    const candidates = pool.filter(entry => entry.status !== 'archived')
    const scored = text(query) === '' ? candidates.sort(compareEntries) : this.score(candidates, text(query))
    return scored.slice(0, clampInt(limit, 1, 50, 10)).map(toMeta)
  }

  /** Read one memory. */
  get(scope: MemoryScope, project: string, id: string): MemoryEntry | undefined {
    return this.load(scope, project).find(entry => entry.id === id)
  }

  /**
   * Create or reinforce one memory.
   *
   * Writes whose name/description/content fingerprint matches a live memory of
   * the same scope only reinforce that memory; `supersedes` marks the replaced
   * memories stale.
   *
   * @param input - complete write.
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
    const supersedes = normalizeIds(input.supersedes).filter(id => id !== input.id)
    const now = new Date().toISOString()

    const existingById = input.id === undefined ? undefined : entries.find(entry => entry.id === input.id)
    if (existingById !== undefined) {
      const updated: MemoryEntry = {
        ...existingById,
        name,
        description,
        content,
        type,
        importance,
        tags: tags.length > 0 ? tags : existingById.tags,
        supersedes: supersedes.length > 0 ? supersedes : existingById.supersedes,
        updatedAt: now,
      }
      this.writeEntry(scope, project, updated)
      this.applySupersedes(scope, project, supersedes, updated.id)
      return updated
    }

    const fingerprint = fingerprintOf(name, description, content)
    const duplicate = entries.find(entry => entry.status !== 'archived' && fingerprintOf(entry.name, entry.description, entry.content) === fingerprint)
    if (duplicate !== undefined) {
      const reinforced: MemoryEntry = {
        ...duplicate,
        description: duplicate.description !== '' ? duplicate.description : description,
        importance: Math.max(duplicate.importance, importance),
        tags: [...new Set([...duplicate.tags, ...tags])].slice(0, LIMITS.tags),
        reinforcement: duplicate.reinforcement + 1,
        updatedAt: now,
      }
      this.writeEntry(scope, project, reinforced)
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
      status: 'active',
      reinforcement: 0,
      obsoleteVotes: 0,
      supersedes,
      originSessionId: text(input.originSessionId),
      createdAt: now,
      updatedAt: now,
      content,
    }
    this.writeEntry(scope, project, entry)
    this.applySupersedes(scope, project, supersedes, entry.id)
    return entry
  }

  /** Change the lifecycle status of one memory. */
  setStatus(scope: MemoryScope, project: string, id: string, status: MemoryStatus): MemoryEntry {
    const entry = this.get(scope, project, id)
    if (entry === undefined) throw new Error(`记忆不存在：${id}`)
    const updated: MemoryEntry = { ...entry, status, updatedAt: new Date().toISOString() }
    this.writeEntry(scope, project, updated)
    return updated
  }

  /**
   * Vote one memory obsolete. The first vote marks it stale (still searchable);
   * the second archives it so it leaves injection and default search.
   *
   * @param scope - memory scope.
   * @param project - project key for the project scope.
   * @param id - memory id.
   * @param reason - free-text reason kept in the log only.
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

  /** Delete one memory file permanently. */
  remove(scope: MemoryScope, project: string, id: string): boolean {
    const entry = this.get(scope, project, id)
    if (entry === undefined) return false
    try {
      unlinkSync(this.entryFile(scope, project, entry.id))
    } catch {
      return false
    }
    this.invalidate(scope, project)
    this.rewriteIndex(scope, project)
    return true
  }

  /**
   * Index lines injected into the system prompt, newest/highest importance first.
   *
   * @param scope - memory scope.
   * @param project - project key for the project scope.
   * @param limit - maximum entries.
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
   * Export one scope as one Markdown document.
   *
   * @param scope - memory scope.
   * @param project - project key for the project scope.
   */
  exportMarkdown(scope: MemoryScope, project = ''): { filename: string, content: string } {
    const entries = [...this.load(scope, project)].sort(compareEntries)
    const title = scope === 'global'
      ? '全局记忆'
      : `项目记忆（${this.getProject(project)?.displayName ?? project}）`
    const content = `# ${title}\n\n${entries.map(entry => renderEntry(entry).trimEnd()).join('\n\n---\n\n')}\n`
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

  private load(scope: MemoryScope, project: string): MemoryEntry[] {
    const dir = this.scopeDir(scope, project)
    let mtimeMs = 0
    try {
      mtimeMs = statSync(dir).mtimeMs
    } catch {
      return []
    }
    const cacheKey = `${scope}:${project}`
    const cached = this.cache.get(cacheKey)
    if (cached !== undefined && cached.mtimeMs === mtimeMs) return cached.entries
    let files: string[] = []
    try {
      files = readdirSync(dir).filter(name => name.endsWith('.md') && name !== INDEX_FILE)
    } catch {
      files = []
    }
    const entries: MemoryEntry[] = []
    for (const name of files) {
      const entry = parseEntry(path.join(dir, name), scope, project)
      if (entry !== null) entries.push(entry)
    }
    this.cache.set(cacheKey, { mtimeMs, entries })
    return entries
  }

  private invalidate(scope: MemoryScope, project: string): void {
    this.cache.delete(`${scope}:${project}`)
  }

  private writeEntry(scope: MemoryScope, project: string, entry: MemoryEntry): void {
    try {
      writeAtomic(this.entryFile(scope, project, entry.id), renderEntry(entry))
    } catch (error) {
      this.log('error', `写记忆失败 ${entry.id}：${error instanceof Error ? error.message : String(error)}`)
      throw error
    }
    this.invalidate(scope, project)
    this.rewriteIndex(scope, project)
  }

  private applySupersedes(scope: MemoryScope, project: string, ids: readonly string[], sourceId: string): void {
    for (const id of ids) {
      const entry = this.get(scope, project, id)
      if (entry === undefined || entry.id === sourceId) continue
      const updated: MemoryEntry = {
        ...entry,
        status: entry.status === 'archived' ? 'archived' : 'stale',
        obsoleteVotes: entry.obsoleteVotes + 1,
        updatedAt: new Date().toISOString(),
      }
      this.writeEntry(scope, project, updated)
    }
  }

  private rewriteIndex(scope: MemoryScope, project: string): void {
    const dir = this.scopeDir(scope, project)
    const entries = this.load(scope, project)
      .filter(entry => entry.status === 'active')
      .sort((left, right) => right.importance - left.importance || right.updatedAt.localeCompare(left.updatedAt))
    const lines = entries.map((entry) => {
      const head = `- [${entry.id}] (${entry.type}, ${entry.updatedAt.slice(0, 10)}) ${entry.name}`
      return entry.description === '' ? head : `${head} — ${entry.description}`
    })
    try {
      mkdirSync(dir, { recursive: true })
      writeAtomic(path.join(dir, INDEX_FILE), `${INDEX_HEADER}${lines.join('\n')}${lines.length === 0 ? '' : '\n'}`)
    } catch (error) {
      this.log('warn', `重写记忆索引失败：${error instanceof Error ? error.message : String(error)}`)
    }
  }

  private score(entries: MemoryEntry[], query: string): MemoryEntry[] {
    const terms = queryTerms(query)
    if (terms.length === 0) return entries.sort(compareEntries)
    const scored: Array<{ entry: MemoryEntry, score: number }> = []
    for (const entry of entries) {
      const haystack = [
        { text: entry.name, weight: 4 },
        { text: entry.tags.join(' '), weight: 3 },
        { text: entry.description, weight: 2 },
        { text: entry.content, weight: 1 },
      ]
      let score = 0
      for (const term of terms) {
        for (const field of haystack) {
          const target = field.text.toLowerCase()
          let index = target.indexOf(term)
          while (index !== -1 && score < 1000) {
            score += field.weight
            index = target.indexOf(term, index + term.length)
          }
        }
      }
      if (score > 0) scored.push({ entry, score: score + entry.importance / 100 })
    }
    return scored
      .sort((left, right) => right.score - left.score
        || right.entry.importance - left.entry.importance
        || right.entry.updatedAt.localeCompare(left.entry.updatedAt))
      .map(item => item.entry)
  }

  private writeSettings(): void {
    try {
      writeAtomic(this.settingsFile, `${JSON.stringify({ schema: SETTINGS_SCHEMA, ...this.settings() }, null, 2)}\n`)
    } catch (error) {
      this.log('warn', `写 settings.json 失败：${error instanceof Error ? error.message : String(error)}`)
    }
  }

  private writeStats(): void {
    try {
      writeAtomic(this.statsFile, `${JSON.stringify({ schema: STATS_SCHEMA, ...this.stats() }, null, 2)}\n`)
    } catch (error) {
      this.log('warn', `写 stats.json 失败：${error instanceof Error ? error.message : String(error)}`)
    }
  }

  private projects(): ProjectRecord[] {
    if (this.projectsValue !== null) return this.projectsValue
    const raw = readJson(this.projectsFile)
    const value = raw !== null && typeof raw === 'object' && !Array.isArray(raw) ? raw as Record<string, unknown> : {}
    const list = Array.isArray(value.projects) ? value.projects : []
    this.projectsValue = list
      .map(item => normalizeProject(item, key => this.countEntries('project', key)))
      .filter((item): item is ProjectRecord => item !== null)
    return this.projectsValue
  }

  private writeProjects(): void {
    try {
      writeAtomic(this.projectsFile, `${JSON.stringify({ schema: PROJECTS_SCHEMA, projects: this.projects() }, null, 2)}\n`)
    } catch (error) {
      this.log('warn', `写 projects.json 失败：${error instanceof Error ? error.message : String(error)}`)
    }
  }
}

/** Entry ordering used outside text search: importance, then freshness. */
function compareEntries(left: MemoryEntry, right: MemoryEntry): number {
  return right.importance - left.importance || right.updatedAt.localeCompare(left.updatedAt)
}

/** Project one entry to its list metadata (the body stays out of list payloads). */
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
    status: entry.status,
    reinforcement: entry.reinforcement,
    obsoleteVotes: entry.obsoleteVotes,
    supersedes: entry.supersedes,
    originSessionId: entry.originSessionId,
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt,
  }
}

/**
 * Query terms: whitespace words plus CJK bigrams, so Chinese queries match
 * without a tokenizer dependency.
 *
 * @param query - raw user query.
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

