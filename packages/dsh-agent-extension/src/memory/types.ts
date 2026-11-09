/**
 * Memory domain vocabulary and its wire shapes.
 *
 * A memory is one durable fact captured from a session (or written by the model
 * / user) and injected into later sessions as historical experience. Two scopes
 * exist: `global` facts follow the user across projects, `project` facts belong
 * to one git repository (worktrees and clones share it through the resolved
 * project identity).
 *
 * @module dsh-agent-extension/memory/types
 */

/** Kinds of durable fact a memory can record. */
export const MEMORY_TYPES = ['preference', 'decision', 'gotcha', 'project', 'reference'] as const

/** One memory kind. */
export type MemoryType = (typeof MEMORY_TYPES)[number]

/** Where a memory is visible: every session, or one project only. */
export type MemoryScope = 'global' | 'project'

/**
 * Lifecycle of one memory: `active` is injected and searchable; `stale` is
 * excluded from injection but searchable; `archived` is retained for audit only.
 */
export type MemoryStatus = 'active' | 'stale' | 'archived'

/** Where a project identity came from. */
export type ProjectIdentitySource = 'git-remote' | 'git-common' | 'path'

/** Frontmatter metadata of one memory; the Markdown body follows the header. */
export interface MemoryMeta {
  id: string
  name: string
  description: string
  type: MemoryType
  scope: MemoryScope
  /** Resolved project key; empty for global memories. */
  project: string
  tags: string[]
  /** 0-100; ranking hint for injection and search. */
  importance: number
  status: MemoryStatus
  /** How many times a duplicate write confirmed this fact. */
  reinforcement: number
  /** Contradiction votes; reaching two archives the memory. */
  obsoleteVotes: number
  /** Memories this one replaces. */
  supersedes: string[]
  /** Session that first produced the memory. */
  originSessionId: string
  createdAt: string
  updatedAt: string
}

/** One complete memory: metadata plus its Markdown body. */
export interface MemoryEntry extends MemoryMeta {
  content: string
}

/** Persisted memory behaviour settings (per plugin install). */
export interface MemorySettings {
  /** Automatic per-turn capture is on. */
  captureEnabled: boolean
  /** One final capture pass when a session ends. */
  captureSessionEnd: boolean
  /** Inject the memory index into prompts. */
  injectEnabled: boolean
  /** Index entries injected for the global scope. */
  indexLimitGlobal: number
  /** Index entries injected for the project scope. */
  indexLimitProject: number
  /** Character budget of the injected index. */
  maxChars: number
  updatedAt: string
}

/** Default settings: capture and injection on, 50/50 index entries, 12k chars. */
export function defaultSettings(): MemorySettings {
  return {
    captureEnabled: true,
    captureSessionEnd: true,
    injectEnabled: true,
    indexLimitGlobal: 50,
    indexLimitProject: 50,
    maxChars: 12000,
    updatedAt: new Date().toISOString(),
  }
}

/** One project known to the plugin. */
export interface ProjectRecord {
  /** Stable hash of the project identity. */
  key: string
  displayName: string
  source: ProjectIdentitySource
  /** Normalized remote URL, or the git common dir / plain path. */
  identity: string
  /** Directories seen for this project (worktrees, clones). */
  roots: string[]
  lastSeen: string
  /** Live entry count for the project scope. */
  entryCount: number
}

/** Recall counters of one session, used for the injection hit rate. */
export interface SessionRecallStats {
  sessionId: string
  /** Index entry ids injected at prompt assembly. */
  injected: number
  /** Injected ids the model actually fetched through memory_search/memory_get. */
  injectedUsed: number
  /** Search hits outside the injected set. */
  overflow: number
  updatedAt: string
}

/** Persisted capture and recall counters. */
export interface MemoryStats {
  captureRuns: number
  capturedEntries: number
  captureSkips: number
  sessions: SessionRecallStats[]
}

/** Empty counters. */
export function emptyStats(): MemoryStats {
  return { captureRuns: 0, capturedEntries: 0, captureSkips: 0, sessions: [] }
}

/** A resolved project identity. */
export interface ProjectIdentity {
  projectKey: string
  identity: string
  source: ProjectIdentitySource
  displayName: string
  /** Repository root, or the working directory for non-git projects. */
  root: string
}

/** Largest accepted values for user-tunable bounds. */
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
} as const

/** Whether a value is one of the memory kinds. */
export function isMemoryType(value: unknown): value is MemoryType {
  return typeof value === 'string' && (MEMORY_TYPES as readonly string[]).includes(value)
}

/** Whether a value is one of the memory statuses. */
export function isMemoryStatus(value: unknown): value is MemoryStatus {
  return value === 'active' || value === 'stale' || value === 'archived'
}

/** Clamp an integer into `[min, max]`, falling back for non-numbers. */
export function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const numeric = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : Number.NaN
  if (!Number.isFinite(numeric)) return fallback
  return Math.min(max, Math.max(min, Math.round(numeric)))
}

/** Trim to a non-empty string, or the empty string. */
export function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

/** Normalize a tag list: trim, drop empties/commas, dedupe, cap length and count. */
export function normalizeTags(value: unknown): string[] {
  const raw = Array.isArray(value)
    ? value
    : typeof value === 'string' ? value.split(',') : []
  const out: string[] = []
  for (const item of raw) {
    const tag = text(item).replace(/[,\n]/gu, ' ').trim()
    if (tag === '' || out.includes(tag)) continue
    out.push(tag.slice(0, LIMITS.tag))
    if (out.length >= LIMITS.tags) break
  }
  return out
}

/** Normalize an id list. */
export function normalizeIds(value: unknown): string[] {
  const raw = Array.isArray(value) ? value : []
  const out: string[] = []
  for (const item of raw) {
    const id = text(item)
    if (id !== '' && !out.includes(id)) out.push(id)
  }
  return out
}