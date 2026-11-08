/**
 * Persistence schema migration: upgrade old state.json / marketplaces.json
 * files to the current schema in one step.
 *
 * Conventions:
 * - Main code only reads/writes the current schema and carries no legacy
 *   branches;
 * - The hub calls `runMigrations(store)` at startup; no network access;
 * - Files already at v2 are skipped; an unknown schemaVersion is an error;
 * - Before migrating, the original files back up under `logs/migrations/v<old>-<time>/`;
 * - Any parse or backup failure writes nothing: the original files stay and an
 *   error carrying the reason is thrown;
 * - Writes reuse the store's atomic write (tmp + rename), once per file.
 *
 * @module dsh-agent-plugin-hub/migrate
 */

import { copyFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs'
import path from 'node:path'

import { normalizeAuthor, normalizeEntryMeta, normalizeMarketDisplay } from './manifest.ts'
import type { MarketRecord } from './store.ts'
import { normalizeMarkets, normalizeState, STATE_SCHEMA, type MarketsFile, type StateFile } from './store.ts'

/** Known migration steps (main code carries no legacy branches; this table drives them). */
export const MIGRATIONS = Object.freeze([
  Object.freeze({ from: 1, to: STATE_SCHEMA }),
])

/** Migration result. */
export interface MigrationResult {
  migrated: boolean
  from: number
  to: number
  backup: string | null
}

/** Minimal store face runMigrations needs. */
export interface MigrationStore {
  paths: { state: string, marketplaces: string, logs: string }
  ensureDirs(): void
  atomicWriteJson(filePath: string, value: unknown): void
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function timestampForDir(date: Date = new Date()): string {
  return date.toISOString().replace(/[:.]/gu, '-')
}

/** Strict JSON read; failures throw an actionable Chinese reason (no backup, no write). */
function readJsonStrict(filePath: string): unknown {
  let text: string
  try {
    text = readFileSync(filePath, 'utf8')
  } catch (error) {
    throw new Error(`无法迁移 ${path.basename(filePath)}：${error instanceof Error ? error.message : String(error)}`)
  }
  try {
    return JSON.parse(text.replace(/^\uFEFF/u, ''))
  } catch (error) {
    throw new Error(
      `无法迁移 ${path.basename(filePath)}：不是合法 JSON：${error instanceof Error ? error.message : String(error)}`,
    )
  }
}

/** Upgrade one v1 market record to the v2 shape (title/display/owner/plugins[].meta), dropping the in-memory `root` field. */
function migrateMarketRecord(market: MarketRecord): MarketRecord {
  const name = typeof market.name === 'string' && market.name.trim() !== '' ? market.name.trim() : String(market.id ?? '')
  const title = typeof market.title === 'string' && market.title.trim() !== '' ? market.title.trim() : name
  const display = normalizeMarketDisplay(market.display ?? { title: name }, title)
  const owner = normalizeAuthor(market.owner) ?? display.owner ?? { name: '' }
  display.owner = owner
  const plugins = (Array.isArray(market.plugins) ? market.plugins : []).map((entry) => {
    if (!isObject(entry)) return entry
    const source = isObject(entry.meta) ? entry.meta : null
    const description = typeof entry.description === 'string' ? entry.description : ''
    const meta = normalizeEntryMeta({
      ...(source ?? {}),
      ...(description !== '' ? { description } : {}),
    })
    return { ...entry, meta }
  })
  const migrated = { ...market, title, display, owner, plugins }
  delete (migrated as Record<string, unknown>).root
  return migrated as MarketRecord
}

/**
 * Run the schema migration.
 *
 * @param store - only paths / ensureDirs / atomicWriteJson are needed.
 * @throws {Error} on illegal JSON, an unknown schemaVersion, or a backup/write
 *   failure (original files preserved).
 */
export function runMigrations(store: MigrationStore): MigrationResult {
  store.ensureDirs()
  const warnings: string[] = []
  const targets = [
    { kind: 'state', file: store.paths.state },
    { kind: 'markets', file: store.paths.marketplaces },
  ].filter(target => existsSync(target.file))

  if (targets.length === 0) {
    return { migrated: false, from: STATE_SCHEMA, to: STATE_SCHEMA, backup: null }
  }

  const pending: Array<{ kind: string, file: string, raw: Record<string, unknown>, version: number }> = []
  for (const target of targets) {
    const raw = readJsonStrict(target.file)
    if (!isObject(raw)) throw new Error(`无法迁移 ${path.basename(target.file)}：顶层必须是 JSON 对象`)
    const version = raw.schemaVersion
    if (version === STATE_SCHEMA) continue
    if (version === 1) {
      pending.push({ ...target, raw, version })
      continue
    }
    throw new Error(
      `无法迁移 ${path.basename(target.file)}：不支持的 schemaVersion=${String(version)}（仅支持 1→${STATE_SCHEMA}）`,
    )
  }

  if (pending.length === 0) {
    return { migrated: false, from: STATE_SCHEMA, to: STATE_SCHEMA, backup: null }
  }

  // Compute both files' new content first; touch disk only after everything succeeds.
  const now = new Date().toISOString()
  let stateOutput: StateFile | null = null
  let marketsOutput: MarketsFile | null = null
  for (const item of pending) {
    if (item.kind === 'state') {
      const state = normalizeState(item.raw, warnings)
      stateOutput = { schemaVersion: STATE_SCHEMA, updatedAt: now, plugins: state.plugins }
      continue
    }
    const markets = normalizeMarkets(item.raw, warnings)
    marketsOutput = {
      schemaVersion: STATE_SCHEMA,
      updatedAt: now,
      markets: markets.markets.map(market => migrateMarketRecord(market)),
    }
  }

  const fromVersion = pending[0]?.version ?? 1
  const backupDir = path.join(store.paths.logs, 'migrations', `v${String(fromVersion)}-${timestampForDir()}`)
  const backups: Array<{ file: string, backupFile: string }> = []
  try {
    mkdirSync(backupDir, { recursive: true })
    for (const target of targets) {
      const backupFile = path.join(backupDir, path.basename(target.file))
      copyFileSync(target.file, backupFile)
      backups.push({ file: target.file, backupFile })
    }
  } catch (error) {
    throw new Error(`迁移备份失败，原文件未改动：${error instanceof Error ? error.message : String(error)}`)
  }

  try {
    if (stateOutput !== null) store.atomicWriteJson(store.paths.state, stateOutput)
    if (marketsOutput !== null) store.atomicWriteJson(store.paths.marketplaces, marketsOutput)
  } catch (error) {
    // Write failure: restore the originals best-effort so "failure preserves the files".
    for (const item of backups) {
      try {
        copyFileSync(item.backupFile, item.file)
      } catch {
        /* restore failure keeps the backup dir; the error tells the user */
      }
    }
    throw new Error(`迁移写入失败，已尝试恢复原文件（备份在 ${backupDir}）：${error instanceof Error ? error.message : String(error)}`)
  }

  return {
    migrated: true,
    from: fromVersion,
    to: STATE_SCHEMA,
    backup: backupDir,
  }
}
