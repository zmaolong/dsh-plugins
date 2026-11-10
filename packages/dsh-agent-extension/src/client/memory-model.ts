/**
 * Domain types and pure view helpers of the memory panel, shared by the panel
 * list and the right-Sidebar detail page: wire normalization, type/status copy,
 * and the editable metadata form.
 *
 * @module dsh-agent-extension/client/memory-model
 */

/** Scope of a memory query: the shared global store or one project store. */
export type MemoryScope = 'global' | 'project'

/** Fixed memory types understood by the host. */
export type MemoryType = 'preference' | 'decision' | 'gotcha' | 'project' | 'reference'

/** Lifecycle status of one memory entry. */
export type MemoryStatus = 'active' | 'stale' | 'archived'

/** One list row of the memory store. */
export interface MemoryEntrySummary {
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

/** Full entry returned by get / save / status. */
export interface MemoryEntry extends MemoryEntrySummary {
  content: string
  originSessionId: string
  supersedes: string[]
  obsoleteVotes: number
}

/** Editable form of one memory's metadata (the body stays read-only in the detail page). */
export interface MemoryForm {
  name: string
  description: string
  type: MemoryType
  tags: string[]
  importance: number
  content: string
}

/** Fixed type values, in panel order. */
export const TYPE_VALUES: readonly MemoryType[] = ['preference', 'decision', 'gotcha', 'project', 'reference']

/** Locale keys of one type label. */
export const TYPE_LABEL_KEYS: Record<MemoryType, string> = {
  preference: 'memoryTypePreference',
  decision: 'memoryTypeDecision',
  gotcha: 'memoryTypeGotcha',
  project: 'memoryTypeProject',
  reference: 'memoryTypeReference',
}

/** Locale keys of one status label. */
export const STATUS_LABEL_KEYS: Record<MemoryStatus, string> = {
  active: 'memoryStatusActive',
  stale: 'memoryStatusStale',
  archived: 'memoryStatusArchived',
}

/** Loose JSON object guard. */
export function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

/** Coerce to a trimmed string; missing values become the fallback. */
export function text(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : typeof value === 'number' ? String(value) : fallback
}

/** Coerce to a clamped integer; NaN falls back. */
export function integer(value: unknown, min: number, max: number, fallback: number): number {
  const parsed = typeof value === 'number'
    ? value
    : typeof value === 'string' && value.trim() !== '' ? Number(value) : Number.NaN
  if (!Number.isFinite(parsed)) return fallback
  return Math.min(max, Math.max(min, Math.round(parsed)))
}

/** Normalize one list row. */
export function normalizeSummary(raw: unknown): MemoryEntrySummary {
  const item = record(raw)
  return {
    id: text(item.id),
    name: text(item.name),
    description: text(item.description),
    type: text(item.type),
    tags: Array.isArray(item.tags) ? item.tags.filter((tag): tag is string => typeof tag === 'string') : [],
    importance: integer(item.importance, 0, 100, 50),
    status: text(item.status),
    reinforcement: integer(item.reinforcement, 0, Number.MAX_SAFE_INTEGER, 0),
    createdAt: text(item.createdAt),
    updatedAt: text(item.updatedAt),
  }
}

/** Normalize one full entry. */
export function normalizeEntry(raw: unknown): MemoryEntry {
  const item = record(raw)
  return {
    ...normalizeSummary(item),
    content: text(item.content),
    originSessionId: text(item.originSessionId),
    supersedes: Array.isArray(item.supersedes) ? item.supersedes.filter((id): id is string => typeof id === 'string') : [],
    obsoleteVotes: integer(item.obsoleteVotes, 0, Number.MAX_SAFE_INTEGER, 0),
  }
}

/** Form values of one loaded entry. */
export function formOf(entry: MemoryEntry): MemoryForm {
  const type = TYPE_VALUES.find(value => value === entry.type) ?? 'preference'
  return {
    name: entry.name,
    description: entry.description,
    type,
    tags: [...entry.tags],
    importance: entry.importance,
    content: entry.content,
  }
}

/** Localized type label; unknown values fall back to the raw server text. */
export function typeLabel(value: string, t: (key: string) => string): string {
  const type = TYPE_VALUES.find(entry => entry === value)
  return type ? t(TYPE_LABEL_KEYS[type]) : value
}

/** Localized status label; unknown values fall back to the raw server text. */
export function statusLabel(value: string, t: (key: string) => string): string {
  const status = value === 'active' || value === 'stale' || value === 'archived' ? value : null
  return status ? t(STATUS_LABEL_KEYS[status]) : value
}

/** Badge tone of one status. */
export function statusTone(value: string): 'success' | 'warn' | 'plain' {
  return value === 'active' ? 'success' : value === 'stale' ? 'warn' : 'plain'
}

/** Whether two editable forms carry the same metadata (the body never changes here). */
export function sameForm(left: MemoryForm, right: MemoryForm): boolean {
  return left.name === right.name
    && left.description === right.description
    && left.type === right.type
    && left.importance === right.importance
    && left.tags.length === right.tags.length
    && left.tags.every((tag, index) => tag === right.tags[index])
}
