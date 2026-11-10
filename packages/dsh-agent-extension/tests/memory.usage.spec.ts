/**
 * 派生使用记录：touch 累加与同批去重、脏时原子落盘、重读恢复、坏 JSON /
 * 越界记录容错。
 *
 * 全部离线，只读写临时目录。
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { UsageStore } from '../src/memory/usage.ts'
import { removeDirs, tempHome } from './helpers.ts'

describe('记忆使用记录：UsageStore', () => {
  let tempDirs: string[] = []

  afterEach(() => {
    removeDirs(...tempDirs)
    tempDirs = []
  })

  function makeUsage(): { usage: UsageStore, root: string, file: string } {
    const home = tempHome('memory-usage-')
    tempDirs.push(home)
    const root = path.join(home, 'memory')
    return { usage: new UsageStore({ root }), root, file: path.join(root, 'usage.json') }
  }

  it('touch 累加 usedCount 与 lastUsedAt，同一次调用内重复 id 只计一次', () => {
    const { usage } = makeUsage()
    usage.load()
    const first = new Date('2026-01-01T00:00:00.000Z')
    const second = new Date('2026-01-02T03:04:05.000Z')

    usage.touch(['m-a', 'm-a', 'm-b'], first)
    usage.touch(['m-a', '  '], second)

    expect(usage.size).toBe(2)
    expect(usage.snapshot()).toEqual({
      'm-a': { usedCount: 2, lastUsedAt: second.toISOString() },
      'm-b': { usedCount: 1, lastUsedAt: first.toISOString() },
    })
  })

  it('flush 仅脏时落盘；重读后恢复全部计数', () => {
    const { usage, root, file } = makeUsage()
    usage.load()
    usage.flush()
    // 未 touch 不算脏：不产生空文件。
    expect(existsSync(file)).toBe(false)

    const at = new Date('2026-02-03T04:05:06.000Z')
    usage.touch(['m-a', 'm-b'], at)
    usage.touch(['m-a'], new Date('2026-02-04T00:00:00.000Z'))
    usage.flush()

    const raw = JSON.parse(readFileSync(file, 'utf8')) as {
      schema: number
      entries: Record<string, { usedCount: number, lastUsedAt: string }>
    }
    expect(raw.schema).toBe(1)
    expect(raw.entries['m-a']).toEqual({ usedCount: 2, lastUsedAt: '2026-02-04T00:00:00.000Z' })

    const reloaded = new UsageStore({ root })
    reloaded.load()
    expect(reloaded.size).toBe(2)
    expect(reloaded.snapshot()).toEqual(usage.snapshot())
  })

  it('坏 JSON 与结构异常按空记录处理，下一次 touch/flush 重建文件', () => {
    const { usage, root, file } = makeUsage()
    mkdirSync(root, { recursive: true })
    writeFileSync(file, '{ 这不是 JSON', 'utf8')
    const logs: string[] = []
    const tolerant = new UsageStore({ root, log: (level, message) => logs.push(`${level}:${message}`) })
    tolerant.load()
    expect(tolerant.size).toBe(0)
    expect(logs.some(line => line.includes('usage.json'))).toBe(true)

    tolerant.touch(['m-rebuilt'])
    tolerant.flush()
    const raw = JSON.parse(readFileSync(file, 'utf8')) as { schema: number, entries: Record<string, unknown> }
    expect(raw.schema).toBe(1)
    expect(Object.keys(raw.entries)).toEqual(['m-rebuilt'])
    // 原实例仅是读取了坏文件；这里只验证重建路径。
    expect(usage.size).toBe(0)
  })

  it('读取时丢弃越界/非法记录，只保留合法条目', () => {
    const { usage, root, file } = makeUsage()
    mkdirSync(root, { recursive: true })
    writeFileSync(file, JSON.stringify({
      schema: 1,
      entries: {
        good: { usedCount: 3, lastUsedAt: '2026-01-01T00:00:00.000Z' },
        negative: { usedCount: -1, lastUsedAt: '2026-01-01T00:00:00.000Z' },
        huge: { usedCount: 1_000_001, lastUsedAt: '2026-01-01T00:00:00.000Z' },
        badDate: { usedCount: 1, lastUsedAt: 'not-a-date' },
        noDate: { usedCount: 1 },
        junk: 42,
      },
    }), 'utf8')

    usage.load()
    expect(usage.size).toBe(1)
    expect(usage.snapshot()).toEqual({
      good: { usedCount: 3, lastUsedAt: '2026-01-01T00:00:00.000Z' },
    })
  })
})