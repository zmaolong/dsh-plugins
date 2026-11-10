/**
 * Pure client-side rules of the memory health audit: stale candidates,
 * suspected duplicate pairs, and low-value entries, computed in the browser
 * over a full list fetch (no host round-trips per rule, no model embedding).
 *
 * Similarity is character-bigram Jaccard over the concatenated
 * name + description + content, which works for CJK and Latin text alike; the
 * pure rule lives in `shared/memory-similarity.ts` so the host-side maintenance
 * run can reuse it. Re-exported here to keep the historical import surface.
 *
 * @module dsh-agent-extension/client/audit
 */

import { DUPLICATE_THRESHOLD, similarity } from '../shared/memory-similarity.ts'

export { DUPLICATE_THRESHOLD, similarity }

/** Minimal entry shape the audit rules read (MemoryEntry satisfies it). */
export interface AuditEntry {
  id: string
  name: string
  description: string
  content: string
  type: string
  tags: string[]
  importance: number
  status: string
  reinforcement: number
  obsoleteVotes: number
  updatedAt: string
}

/** One suspected duplicate pair plus the entry suggested to keep. */
export interface DuplicatePair {
  left: AuditEntry
  right: AuditEntry
  keep: AuditEntry
}

/** Findings of one audit run, grouped by rule. */
export interface AuditResult {
  stale: AuditEntry[]
  duplicates: DuplicatePair[]
  lowValue: AuditEntry[]
}

/** An active entry untouched for this many days with no reinforcement is low-value. */
const LOW_VALUE_DAYS = 30

/** Full similarity text of one entry. */
function auditTextOf(entry: AuditEntry): string {
  return `${entry.name} ${entry.description} ${entry.content}`
}

/** Which of two entries to keep: more important, then more reinforced, then newer. */
function preferKeep(left: AuditEntry, right: AuditEntry): AuditEntry {
  if (left.importance !== right.importance) return left.importance > right.importance ? left : right
  if (left.reinforcement !== right.reinforcement) return left.reinforcement > right.reinforcement ? left : right
  return left.updatedAt >= right.updatedAt ? left : right
}

/** Entries carrying an obsolete vote or already deactivated (archived excluded). */
export function findStaleCandidates(entries: AuditEntry[]): AuditEntry[] {
  return entries.filter(entry => entry.status !== 'archived'
    && (entry.obsoleteVotes > 0 || entry.status === 'stale'))
}

/** Suspected duplicate pairs inside one scope (archived entries never pair). */
export function findDuplicatePairs(entries: AuditEntry[]): DuplicatePair[] {
  const live = entries.filter(entry => entry.status !== 'archived')
  const pairs: DuplicatePair[] = []
  for (let left = 0; left < live.length; left += 1) {
    for (let right = left + 1; right < live.length; right += 1) {
      const first = live[left]!
      const second = live[right]!
      if (similarity(auditTextOf(first), auditTextOf(second)) >= DUPLICATE_THRESHOLD) {
        pairs.push({ left: first, right: second, keep: preferKeep(first, second) })
      }
    }
  }
  return pairs
}

/** Active entries that were never reinforced and went untouched for 30+ days. */
export function findLowValueEntries(entries: AuditEntry[], now: number): AuditEntry[] {
  const floor = now - LOW_VALUE_DAYS * 24 * 60 * 60 * 1000
  return entries.filter(entry => entry.status === 'active'
    && entry.reinforcement <= 1
    && Number.isFinite(Date.parse(entry.updatedAt))
    && Date.parse(entry.updatedAt) < floor)
}

/** Run all rules over one full entry list (per scope / project). */
export function runAudit(entries: AuditEntry[], now: number): AuditResult {
  return {
    stale: findStaleCandidates(entries),
    duplicates: findDuplicatePairs(entries),
    lowValue: findLowValueEntries(entries, now),
  }
}
