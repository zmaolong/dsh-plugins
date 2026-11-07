/**
 * 持久化 schema 迁移：把旧版 state.json / marketplaces.json 一次性升级到当前 schema。
 *
 * 约定：
 * - 主代码只按当前 schema 读取/写回，不写旧版兼容分支；
 * - 本模块在 hub 启动时由宿主调用（`runMigrations(store)`），不联网；
 * - 已有 v2 文件跳过；未知 schemaVersion 直接报错；
 * - 迁移前把原文件备份到 `logs/migrations/v<old>-<time>/`；
 * - 任一文件解析/备份失败时不写入任何文件，保留原文件并抛出含原因错误；
 * - 写文件复用 store 的原子写（tmp + rename），一次写入。
 *
 * @module dsh-agent-plugin-hub/migrate
 */

import { copyFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs'
import path from 'node:path'

import { normalizeAuthor, normalizeEntryMeta, normalizeMarketDisplay } from './manifest.js'
import { normalizeMarkets, normalizeState, STATE_SCHEMA } from './store.js'

/** 已知迁移步骤（主代码不写兼容分支，只此表驱动）。 */
export const MIGRATIONS = Object.freeze([
  Object.freeze({ from: 1, to: STATE_SCHEMA }),
])

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function timestampForDir(date = new Date()) {
  return date.toISOString().replace(/[:.]/gu, '-')
}

/** 严格读取并解析 JSON；失败直接抛出中文原因（不备份、不写入）。 */
function readJsonStrict(filePath) {
  let text
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

/** 把 v1 市场记录补齐到 v2 形态（title/display/owner/plugins[].meta），移除内存字段 root。 */
function migrateMarketRecord(market) {
  const name = typeof market.name === 'string' && market.name.trim() !== '' ? market.name.trim() : String(market.id ?? '')
  const title = typeof market.title === 'string' && market.title.trim() !== '' ? market.title.trim() : name
  const display = normalizeMarketDisplay(market.display ?? { title: name }, title)
  // display 必须含 description 字段（v2 结构固定），缺失时给空串。
  if (typeof display.description !== 'string') display.description = ''
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
  delete migrated.root
  return migrated
}

/**
 * 执行 schema 迁移。
 *
 * @param {import('./store.js').HubStore} store - 只需 paths / ensureDirs / atomicWriteJson。
 * @returns {{migrated: boolean, from: number, to: number, backup: string | null}}
 * @throws {Error} JSON 非法、schemaVersion 未知、备份或写入失败（原文件保留）。
 */
export function runMigrations(store) {
  store.ensureDirs()
  const warnings = []
  const targets = [
    { kind: 'state', file: store.paths.state },
    { kind: 'markets', file: store.paths.marketplaces },
  ].filter((target) => existsSync(target.file))

  if (targets.length === 0) {
    return { migrated: false, from: STATE_SCHEMA, to: STATE_SCHEMA, backup: null }
  }

  const pending = []
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

  // 先算好两个文件的新内容，全部成功后再动磁盘。
  const now = new Date().toISOString()
  let stateOutput = null
  let marketsOutput = null
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
      markets: markets.markets.map((market) => migrateMarketRecord(market)),
    }
  }

  const fromVersion = pending[0].version
  const backupDir = path.join(store.paths.logs, 'migrations', `v${String(fromVersion)}-${timestampForDir()}`)
  const backups = []
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
    // 写入失败：尽力把原文件恢复回去，保证"失败保留原文件"。
    for (const item of backups) {
      try {
        copyFileSync(item.backupFile, item.file)
      } catch {
        /* 恢复失败时保留备份目录，错误里提示用户 */
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