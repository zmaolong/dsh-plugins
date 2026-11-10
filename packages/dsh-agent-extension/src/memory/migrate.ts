/**
 * 记忆条目 schema v1 → v2 的自动迁移，以及 frontmatter 的透传工具。
 *
 * 约定（ADR-0007）：
 * - Markdown 是唯一真源；迁移只补字段，不改正文、不改文件名；
 * - 迁移前先把旧文件复制到 `<home>/memory/.backup-v1-<timestamp>/`（保持相对路径），
 *   再就地原子写回；
 * - 幂等：v2 条目与已移走的 `MEMORY.md` 不会产生第二次备份；
 * - 失败不丢数据：复制失败的文件不写回；写回失败时原文件保持（tmp + rename）；
 * - 未知 frontmatter 字段原样透传，读取端不做 schema 之外的校验。
 *
 * @module dsh-agent-extension/memory/migrate
 */

import { randomBytes } from 'node:crypto'
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import path from 'node:path'

import { parseFrontmatter } from '../frontmatter.ts'
import type { LogFn } from '../log.ts'
import { MEMORY_SCHEMA, type MemoryEntry, type MemoryScope } from './types.ts'

/** 旧索引文件名：B0 起不再生成，首次加载时移入备份目录。 */
export const MEMORY_INDEX_FILE = 'MEMORY.md'

/** 迁移备份目录前缀。 */
export const MEMORY_BACKUP_PREFIX = '.backup-v1-'

/**
 * 由 store 负责渲染/维护的 frontmatter 字段；其余字段原样写回。
 *
 * 保持与 `renderEntry` 的字段集合一致（新增字段时两处同步）。
 */
export const KNOWN_ENTRY_FIELDS: ReadonlySet<string> = new Set([
  'schema',
  'id',
  'name',
  'description',
  'type',
  'scope',
  'project',
  'tags',
  'importance',
  'confidence',
  'status',
  'reinforcement',
  'obsoleteVotes',
  'pinned',
  'usedCount',
  'lastUsedAt',
  'supersedes',
  'mergedFrom',
  'source',
  'originSessionId',
  'createdAt',
  'updatedAt',
])

/** 一个 frontmatter 字段的原始行（key 为 null 表示无法归属到字段的杂行）。 */
export interface FrontmatterBlock {
  key: string | null
  lines: string[]
}

/** 去掉文件头 BOM；手改文件可能带。 */
function stripBom(source: string): string {
  return source.replace(/^\uFEFF/u, '')
}

/**
 * 按字段把 frontmatter 拆成原始行块（不做 YAML 解析）。
 *
 * 缩进行、列表项、空行与注释都归属上一个字段块；无法解析的顶层杂行单独成块。
 * 这样未知字段（含嵌套结构）可以原样写回，而不会被重新序列化破坏。
 *
 * @param source - 原始 Markdown。
 */
export function splitFrontmatterBlocks(source: string): FrontmatterBlock[] {
  const normalized = stripBom(source).replace(/\r\n/gu, '\n')
  if (!normalized.startsWith('---\n')) return []
  const end = normalized.indexOf('\n---', 4)
  if (end === -1) return []
  const header = normalized.slice(4, end)
  const blocks: FrontmatterBlock[] = []
  let current: FrontmatterBlock | null = null
  for (const line of header.split('\n')) {
    if (line.trim() === '') {
      if (current !== null) current.lines.push(line)
      continue
    }
    if (line.trimStart().startsWith('#')) {
      if (current !== null) current.lines.push(line)
      else blocks.push({ key: null, lines: [line] })
      continue
    }
    // 缩进行与列表项属于上一个字段；不能脱离字段单独写回。
    if (/^\s/u.test(line) || /^-\s+/u.test(line)) {
      if (current !== null) current.lines.push(line)
      else blocks.push({ key: null, lines: [line] })
      continue
    }
    // 顶层字段名尽量宽松（允许中文等非空白键），保证未知字段不因解析器不支持而丢失。
    const pair = /^([^\s:][^:]*?)\s*:\s*(.*)$/u.exec(line)
    if (pair === null) {
      blocks.push({ key: null, lines: [line] })
      current = null
      continue
    }
    current = { key: pair[1] as string, lines: [line] }
    blocks.push(current)
  }
  return blocks
}

/** 提取未知字段的原始 frontmatter 行（写回时追加在已知字段之后）。 */
export function unknownFrontmatterLines(source: string): string[] {
  const lines: string[] = []
  for (const block of splitFrontmatterBlocks(source)) {
    if (block.key === null || KNOWN_ENTRY_FIELDS.has(block.key)) continue
    for (const line of block.lines) {
      // 兜底：`---` 会提前闭合 frontmatter，绝不写回。
      if (line.trim() === '---') continue
      lines.push(line)
    }
  }
  return lines
}

/**
 * 读取条目声明的 schema 版本；缺失或非法按 v1（0）处理，便于迁移。
 *
 * @param source - 原始 Markdown。
 */
export function entrySchemaOf(source: string): number {
  const parsed = parseFrontmatter(stripBom(source))
  const value = parsed.data.schema
  if (typeof value === 'number' && Number.isFinite(value)) return value
  return 0
}

/** 该文件是否需要 v1 → v2 迁移（schema 缺失/低于当前版本）。 */
export function needsEntryMigration(source: string): boolean {
  return entrySchemaOf(source) < MEMORY_SCHEMA
}

/** 原子写文本：同目录临时文件 + rename（与 store 的写盘约定一致）。 */
export function writeAtomicText(file: string, content: string): void {
  mkdirSync(path.dirname(file), { recursive: true })
  const tmp = `${file}.tmp-${process.pid}-${randomBytes(2).toString('hex')}`
  writeFileSync(tmp, content, 'utf8')
  renameSync(tmp, file)
}

/** 迁移解析结果：条目与未知 frontmatter 行。 */
export interface ParsedMemoryDocument {
  entry: MemoryEntry
  extras: string[]
}

/** 迁移需要的 store 回调（避免 store ↔ migrate 循环依赖）。 */
export interface MemoryMigrationOptions {
  /** 记忆根目录（`<home>/memory`）。 */
  root: string
  log: LogFn
  /** 按 store 的字段规范化规则解析一份文档。 */
  parse(source: string, scope: MemoryScope, project: string, file: string): ParsedMemoryDocument | null
  /** 按 store 的渲染规则生成 v2 文件内容（含未知字段透传）。 */
  render(entry: MemoryEntry, extras: readonly string[]): string
}

/** 一次迁移的结果（供 store 写日志/诊断）。 */
export interface MemoryMigrationReport {
  /** 成功写回的条目数。 */
  migrated: number
  /** 读取/解析/备份/写回失败的文件数（原文件保持）。 */
  failed: number
  /** 移入备份目录的旧索引文件数。 */
  indexesRemoved: number
  /** 本次备份目录；没有迁移动作时为 null。 */
  backupDir: string | null
}

/** 一个待迁移条目：文件路径、相对路径与解析结果。 */
interface MigrationCandidate {
  file: string
  relative: string
  scope: MemoryScope
  project: string
  entry: MemoryEntry
  extras: string[]
}

/** 扫描一个作用域目录，返回待迁移条目与旧索引文件。 */
function scanScopeDir(options: {
  dir: string
  root: string
  scope: MemoryScope
  project: string
  log: LogFn
  parse: MemoryMigrationOptions['parse']
  report: { failed: number }
}): { candidates: MigrationCandidate[]; indexes: Array<{ file: string, relative: string }> } {
  const { dir, root, scope, project, log, parse, report } = options
  let names: string[] = []
  try {
    names = readdirSync(dir).filter(name => name.endsWith('.md')).sort()
  } catch {
    return { candidates: [], indexes: [] }
  }
  const candidates: MigrationCandidate[] = []
  const indexes: Array<{ file: string, relative: string }> = []
  for (const name of names) {
    const file = path.join(dir, name)
    const relative = path.relative(root, file)
    if (name === MEMORY_INDEX_FILE) {
      indexes.push({ file, relative })
      continue
    }
    let source = ''
    try {
      source = readFileSync(file, 'utf8')
    } catch (error) {
      report.failed += 1
      log('warn', `记忆迁移跳过不可读文件 ${relative}：${error instanceof Error ? error.message : String(error)}`)
      continue
    }
    if (!needsEntryMigration(source)) continue
    const parsed = parse(source, scope, project, file)
    if (parsed === null) {
      report.failed += 1
      log('warn', `记忆迁移跳过无法解析的文件 ${relative}（原文件保持）`)
      continue
    }
    candidates.push({ file, relative, scope, project, entry: parsed.entry, extras: parsed.extras })
  }
  return { candidates, indexes }
}

/** 生成唯一的备份目录（同一时刻重复迁移也不会覆盖旧备份）。 */
function uniqueBackupDir(root: string): string {
  const stamp = new Date().toISOString().replace(/[:.]/gu, '-').replace(/Z$/u, '')
  let candidate = path.join(root, `${MEMORY_BACKUP_PREFIX}${stamp}`)
  let suffix = 2
  while (existsSync(candidate)) {
    candidate = path.join(root, `${MEMORY_BACKUP_PREFIX}${stamp}-${suffix}`)
    suffix += 1
  }
  return candidate
}

/** 把文件按相对路径复制进备份目录；失败返回 false（调用方不写回）。 */
function backupFile(backupDir: string, file: string, relative: string, log: LogFn): boolean {
  const target = path.join(backupDir, relative)
  try {
    mkdirSync(path.dirname(target), { recursive: true })
    copyFileSync(file, target)
    return true
  } catch (error) {
    log('error', `记忆迁移备份失败 ${relative}（原文件保持）：${error instanceof Error ? error.message : String(error)}`)
    return false
  }
}

/**
 * 扫描并迁移整个记忆树。
 *
 * @param options - 根目录、日志与 store 的解析/渲染回调。
 * @returns 迁移计数与备份目录；没有任何 v1 条目时 backupDir 为 null。
 */
export function migrateMemoryTree(options: MemoryMigrationOptions): MemoryMigrationReport {
  const report: MemoryMigrationReport = { migrated: 0, failed: 0, indexesRemoved: 0, backupDir: null }
  const scopes: Array<{ dir: string, scope: MemoryScope, project: string }> = [
    { dir: path.join(options.root, 'global'), scope: 'global', project: '' },
  ]
  let projectKeys: string[] = []
  try {
    projectKeys = readdirSync(path.join(options.root, 'projects'), { withFileTypes: true })
      .filter(entry => entry.isDirectory())
      .map(entry => entry.name)
      .sort()
  } catch {
    projectKeys = []
  }
  for (const key of projectKeys) {
    scopes.push({ dir: path.join(options.root, 'projects', key), scope: 'project', project: key })
  }

  const candidates: MigrationCandidate[] = []
  const indexes: Array<{ file: string, relative: string }> = []
  for (const scope of scopes) {
    const scanned = scanScopeDir({
      ...scope,
      root: options.root,
      log: options.log,
      parse: options.parse,
      report,
    })
    candidates.push(...scanned.candidates)
    indexes.push(...scanned.indexes)
  }
  if (candidates.length === 0 && indexes.length === 0) return report

  const backupDir = uniqueBackupDir(options.root)
  try {
    mkdirSync(backupDir, { recursive: true })
  } catch (error) {
    options.log('error', `记忆迁移无法创建备份目录（本次不写回）：${error instanceof Error ? error.message : String(error)}`)
    report.failed += candidates.length + indexes.length
    return report
  }
  report.backupDir = backupDir

  // 阶段一：先备份全部旧文件；备份失败的文件不参与后续写回。
  const backedUp: MigrationCandidate[] = []
  for (const candidate of candidates) {
    if (backupFile(backupDir, candidate.file, candidate.relative, options.log)) backedUp.push(candidate)
    else report.failed += 1
  }
  const backedIndexes = indexes.filter((item) => {
    if (backupFile(backupDir, item.file, item.relative, options.log)) return true
    report.failed += 1
    return false
  })

  // 阶段二：就地补字段写回（原子写，失败时原文件保持）。
  for (const candidate of backedUp) {
    try {
      writeAtomicText(candidate.file, options.render(candidate.entry, candidate.extras))
      report.migrated += 1
    } catch (error) {
      report.failed += 1
      options.log('error', `记忆迁移写回失败 ${candidate.relative}（原文件保持）：${error instanceof Error ? error.message : String(error)}`)
    }
  }

  // 阶段三：旧索引已备份，移走原件，之后不再生成。
  for (const index of backedIndexes) {
    try {
      unlinkSync(index.file)
      report.indexesRemoved += 1
    } catch (error) {
      report.failed += 1
      options.log('warn', `记忆迁移移除旧索引失败 ${index.relative}：${error instanceof Error ? error.message : String(error)}`)
    }
  }

  return report
}