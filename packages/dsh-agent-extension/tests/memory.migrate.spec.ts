/**
 * 记忆条目 schema 自动迁移（v1/v2 → 当前版本）：备份、幂等、坏数据容错与旧索引清理。
 *
 * 全部使用临时 home，不访问网络；fixture 直接手写旧版 frontmatter。
 */

import { afterEach, describe, expect, it } from 'vitest'
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'

import { MemoryStore } from '../src/memory/store.ts'
import { MEMORY_BACKUP_PREFIX, MEMORY_INDEX_FILE } from '../src/memory/migrate.ts'
import { removeDirs, tempHome } from './helpers.ts'

/** v1 条目的手写字段（有意不含 schema / v2 字段）。 */
interface V1Fields {
  id: string
  name?: string
  description?: string
  type?: string
  scope?: 'global' | 'project'
  project?: string
  importance?: number
  content?: string
  extra?: string[]
}

/** 生成一份 v1 记忆 Markdown（frontmatter 只含旧字段）。 */
function v1Document(fields: V1Fields): string {
  const lines = [
    '---',
    `id: "${fields.id}"`,
    `name: "${fields.name ?? '旧条目'}"`,
    `description: "${fields.description ?? '旧描述'}"`,
    `type: ${fields.type ?? 'preference'}`,
    `scope: ${fields.scope ?? 'global'}`,
    `project: "${fields.project ?? ''}"`,
    'tags: ["pnpm"]',
    `importance: ${fields.importance ?? 70}`,
    'status: active',
    'reinforcement: 0',
    'obsoleteVotes: 0',
    'supersedes: []',
    'originSessionId: "s-old"',
    'createdAt: "2026-01-01T00:00:00.000Z"',
    'updatedAt: "2026-01-02T00:00:00.000Z"',
    ...(fields.extra ?? []),
    '---',
    '',
    fields.content ?? '旧正文。',
    '',
  ]
  return lines.join('\n')
}

/** 备份目录列表（按文件名排序）。 */
function backupDirs(root: string): string[] {
  return readdirSync(root).filter(name => name.startsWith(MEMORY_BACKUP_PREFIX)).sort()
}

describe('记忆 schema 迁移：备份、幂等与容错', () => {
  let tempDirs: string[] = []

  afterEach(() => {
    removeDirs(...tempDirs)
    tempDirs = []
  })

  function makeHome(): { home: string, root: string, globalDir: string, projectDir: string } {
    const home = tempHome('memory-migrate-')
    tempDirs.push(home)
    const root = path.join(home, 'memory')
    const globalDir = path.join(root, 'global')
    const projectDir = path.join(root, 'projects', 'p_demo')
    mkdirSync(globalDir, { recursive: true })
    mkdirSync(projectDir, { recursive: true })
    return { home, root, globalDir, projectDir }
  }

  it('首次加载备份 v1 文件、就地补字段、移走 MEMORY.md 并保留未知字段', () => {
    const { home, root, globalDir, projectDir } = makeHome()
    const globalV1 = v1Document({
      id: 'm-old-global',
      name: '旧全局条目',
      description: '旧描述',
      content: '旧全局正文。',
      extra: ['customField: "保留我"'],
    })
    const projectV1 = v1Document({
      id: 'm-old-project',
      name: '旧项目条目',
      type: 'project',
      scope: 'project',
      project: 'p_demo',
      content: '旧项目正文。',
    })
    writeFileSync(path.join(globalDir, 'm-old-global.md'), globalV1, 'utf8')
    writeFileSync(path.join(projectDir, 'm-old-project.md'), projectV1, 'utf8')
    writeFileSync(path.join(globalDir, MEMORY_INDEX_FILE), '# MEMORY INDEX\n\n- 旧全局索引\n', 'utf8')
    writeFileSync(path.join(projectDir, MEMORY_INDEX_FILE), '# MEMORY INDEX\n\n- 旧项目索引\n', 'utf8')
    writeFileSync(
      path.join(root, 'settings.json'),
      JSON.stringify({ schema: 1, captureEnabled: false, indexLimitGlobal: 7, updatedAt: '2026-01-01T00:00:00.000Z' }),
      'utf8',
    )

    const store = new MemoryStore({ home })
    store.start()

    const backups = backupDirs(root)
    expect(backups).toHaveLength(1)
    const backupDir = path.join(root, backups[0] as string)
    // 备份保持相对路径且是迁移前的原始内容。
    expect(readFileSync(path.join(backupDir, 'global', 'm-old-global.md'), 'utf8')).toBe(globalV1)
    expect(readFileSync(path.join(backupDir, 'projects', 'p_demo', 'm-old-project.md'), 'utf8')).toBe(projectV1)
    expect(existsSync(path.join(backupDir, 'global', MEMORY_INDEX_FILE))).toBe(true)
    expect(existsSync(path.join(backupDir, 'projects', 'p_demo', MEMORY_INDEX_FILE))).toBe(true)

    // 旧索引不再存在于真源目录。
    expect(existsSync(path.join(globalDir, MEMORY_INDEX_FILE))).toBe(false)
    expect(existsSync(path.join(projectDir, MEMORY_INDEX_FILE))).toBe(false)

    // 就地补字段：schema 3 + 当前默认值，存量条目定级长期，正文与未知字段保留。
    const migratedGlobal = readFileSync(path.join(globalDir, 'm-old-global.md'), 'utf8')
    expect(migratedGlobal).toContain('schema: 3')
    expect(migratedGlobal).toContain('tier: long')
    expect(migratedGlobal).toContain('usedCount: 0')
    expect(migratedGlobal).toContain('confidence: 50')
    expect(migratedGlobal).toContain('pinned: false')
    expect(migratedGlobal).toContain('mergedFrom: []')
    expect(migratedGlobal).toContain('source: capture')
    expect(migratedGlobal).not.toContain('lastUsedAt:')
    expect(migratedGlobal).toContain('customField: "保留我"')
    expect(migratedGlobal).toContain('旧全局正文。')

    const globalEntry = store.get('global', '', 'm-old-global')
    expect(globalEntry).toMatchObject({
      name: '旧全局条目',
      usedCount: 0,
      confidence: 50,
      pinned: false,
      mergedFrom: [],
      source: 'capture',
    })
    expect(globalEntry?.lastUsedAt).toBeUndefined()
    expect(store.list('global')).toHaveLength(1)
    expect(store.list('project', 'p_demo').map(entry => entry.id)).toEqual(['m-old-project'])
    expect(store.countEntries('project', 'p_demo')).toBe(1)
    // 非记忆文件（备份目录）不参与加载。
    expect(store.list('global').some(entry => entry.id.includes('backup'))).toBe(false)
    // settings.json 读取不受条目迁移影响。
    expect(store.settings().captureEnabled).toBe(false)
    expect(store.settings().indexLimitGlobal).toBe(7)
  })

  it('迁移幂等：再次加载不重复备份、不改写已迁移文件', () => {
    const { home, root, globalDir } = makeHome()
    writeFileSync(path.join(globalDir, 'm-old-global.md'), v1Document({ id: 'm-old-global' }), 'utf8')
    writeFileSync(path.join(globalDir, MEMORY_INDEX_FILE), '# MEMORY INDEX\n\n- 旧索引\n', 'utf8')

    const first = new MemoryStore({ home })
    first.start()
    const migrated = readFileSync(path.join(globalDir, 'm-old-global.md'), 'utf8')
    expect(backupDirs(root)).toHaveLength(1)

    const second = new MemoryStore({ home })
    second.start()
    expect(backupDirs(root)).toHaveLength(1)
    expect(readFileSync(path.join(globalDir, 'm-old-global.md'), 'utf8')).toBe(migrated)
    expect(existsSync(path.join(globalDir, MEMORY_INDEX_FILE))).toBe(false)
    expect(second.list('global')).toHaveLength(1)

    // 同一实例重复 start 也不产生额外备份。
    second.start()
    expect(backupDirs(root)).toHaveLength(1)
  })

  it('已是当前版本的文件不改写、不产生备份', () => {
    const { home, root, globalDir } = makeHome()
    const v3 = [
      '---',
      'schema: 3',
      'id: "m-v3"',
      'name: "已是当前版本"',
      'description: "无需迁移"',
      'type: reference',
      'scope: global',
      'project: ""',
      'tags: []',
      'importance: 50',
      'confidence: 60',
      'status: active',
      'tier: short',
      'reinforcement: 0',
      'obsoleteVotes: 0',
      'pinned: true',
      'usedCount: 4',
      'lastUsedAt: "2026-02-01T00:00:00.000Z"',
      'supersedes: []',
      'mergedFrom: []',
      'source: user',
      'originSessionId: "s-v3"',
      'createdAt: "2026-01-01T00:00:00.000Z"',
      'updatedAt: "2026-01-02T00:00:00.000Z"',
      '---',
      '',
      'v3 正文。',
      '',
    ].join('\n')
    writeFileSync(path.join(globalDir, 'm-v3.md'), v3, 'utf8')

    const store = new MemoryStore({ home })
    store.start()
    expect(backupDirs(root)).toHaveLength(0)
    expect(readFileSync(path.join(globalDir, 'm-v3.md'), 'utf8')).toBe(v3)
    expect(store.get('global', '', 'm-v3')).toMatchObject({
      confidence: 60,
      pinned: true,
      usedCount: 4,
      source: 'user',
      lastUsedAt: '2026-02-01T00:00:00.000Z',
      tier: 'short',
    })
  })

  it('坏数据容错：无法解析的 v1 文件保持原样，其它文件照常迁移', () => {
    const { home, root, globalDir } = makeHome()
    const garbage = '这不是合法 frontmatter，也没有 name 字段。\n'
    const garbageFile = path.join(globalDir, 'garbage.md')
    writeFileSync(garbageFile, garbage, 'utf8')
    const validFile = path.join(globalDir, 'm-valid.md')
    writeFileSync(validFile, v1Document({ id: 'm-valid', name: '可迁移条目' }), 'utf8')

    const store = new MemoryStore({ home })
    store.start()

    expect(readFileSync(garbageFile, 'utf8')).toBe(garbage)
    expect(readFileSync(validFile, 'utf8')).toContain('schema: 3')
    expect(store.get('global', '', 'm-valid')?.name).toBe('可迁移条目')
    const backups = backupDirs(root)
    expect(backups).toHaveLength(1)
    // 坏文件没有被复制进备份目录（也就没有被改写），原文件保持。
    expect(existsSync(path.join(root, backups[0] as string, 'global', 'garbage.md'))).toBe(false)

    // 再次加载同样不丢数据、不产生新备份。
    const again = new MemoryStore({ home })
    again.start()
    expect(readFileSync(garbageFile, 'utf8')).toBe(garbage)
    expect(backupDirs(root)).toHaveLength(1)
  })

  it('settings/stats/projects 读取校验版本并容错（缺失字段补默认、越界不崩）', () => {
    const { home, root } = makeHome()
    writeFileSync(
      path.join(root, 'settings.json'),
      JSON.stringify({ schema: 99, captureEnabled: false, indexLimitGlobal: 7 }),
      'utf8',
    )
    writeFileSync(
      path.join(root, 'stats.json'),
      JSON.stringify({
        schema: 1,
        captureRuns: 5,
        capturedEntries: 9,
        captureSkips: 2,
        sessions: [{ sessionId: 's-1', injected: 3, injectedUsed: 1, overflow: 2 }],
      }),
      'utf8',
    )
    writeFileSync(
      path.join(root, 'projects.json'),
      JSON.stringify({ schema: 0, projects: [{ key: 'p_x', displayName: '项目 X' }] }),
      'utf8',
    )

    const store = new MemoryStore({ home })
    store.start()
    expect(store.settings()).toMatchObject({ captureEnabled: false, indexLimitGlobal: 7 })
    expect(store.stats()).toMatchObject({
      captureRuns: 5,
      capturedEntries: 9,
      captureSkips: 2,
      skipReasons: {},
      recentInjections: [],
      recentCaptures: [],
    })
    expect(store.stats().sessions[0]).toMatchObject({ sessionId: 's-1', injected: 3, injectedUsed: 1, overflow: 2 })
    expect(store.listProjects().map(project => project.key)).toEqual(['p_x'])

    // 非法 JSON：解析失败按默认值修复，不抛错。
    writeFileSync(path.join(root, 'settings.json'), '{ 不是 JSON', 'utf8')
    writeFileSync(path.join(root, 'stats.json'), 'null', 'utf8')
    const repaired = new MemoryStore({ home })
    repaired.start()
    expect(repaired.settings().captureEnabled).toBe(true)
    expect(repaired.stats()).toMatchObject({ captureRuns: 0, skipReasons: {}, recentInjections: [], recentCaptures: [] })
  })
})