/**
 * Pure rules of the memory health audit: stale candidates, suspected
 * duplicate pairs (character-bigram Jaccard), and low-value entries.
 */
import { describe, expect, it } from 'vitest'

import {
  DUPLICATE_THRESHOLD,
  findDuplicatePairs,
  findLowValueEntries,
  findStaleCandidates,
  runAudit,
  similarity,
  type AuditEntry,
} from '../src/client/audit.ts'

const NOW = Date.parse('2026-11-10T00:00:00.000Z')

function entry(partial: Partial<AuditEntry> & { id: string }): AuditEntry {
  return {
    name: '条目',
    description: '',
    content: '',
    type: 'reference',
    tags: [],
    importance: 50,
    status: 'active',
    reinforcement: 0,
    obsoleteVotes: 0,
    updatedAt: '2026-11-01T00:00:00.000Z',
    ...partial,
  }
}

describe('similarity（字符 bigram Jaccard）', () => {
  it('相同文本为 1，无关文本低于阈值，中英文均可用', () => {
    expect(similarity('提交信息用中文 提交信息必须使用中文。', '提交信息用中文 提交信息必须使用中文。')).toBe(1)
    expect(similarity('committer name in Chinese', 'committer name in Chinese')).toBe(1)
    expect(similarity('提交信息规范', '数据库连接池配置')).toBeLessThan(DUPLICATE_THRESHOLD)
  })

  it('空白与大小写不影响相似度', () => {
    expect(similarity('Hello World', 'helloworld')).toBe(1)
  })
})

describe('findStaleCandidates', () => {
  it('失效投票或 stale 状态入选，归档条目排除', () => {
    const result = findStaleCandidates([
      entry({ id: 'a', obsoleteVotes: 1 }),
      entry({ id: 'b', status: 'stale' }),
      entry({ id: 'c', status: 'archived', obsoleteVotes: 5 }),
      entry({ id: 'd' }),
    ])
    expect(result.map(item => item.id)).toEqual(['a', 'b'])
  })
})

describe('findDuplicatePairs', () => {
  it('高相似条目成对输出，保留重要度更高的一方', () => {
    const pairs = findDuplicatePairs([
      entry({ id: 'keep', name: '提交信息用中文', description: '仓库约定', content: '提交信息必须使用中文。', importance: 80, reinforcement: 3 }),
      entry({ id: 'drop', name: '提交信息用中文 副本', description: '仓库约定', content: '提交信息必须使用中文。', importance: 40 }),
    ])
    expect(pairs.length).toBe(1)
    expect(pairs[0]?.keep.id).toBe('keep')
    expect(pairs[0]?.left.id).toBe('keep')
    expect(pairs[0]?.right.id).toBe('drop')
  })

  it('归档条目不参与配对，独立条目不成对', () => {
    const pairs = findDuplicatePairs([
      entry({ id: 'x', name: '配置 A', content: '使用 pnpm 管理依赖' }),
      entry({ id: 'y', name: '配置 A', content: '使用 pnpm 管理依赖', status: 'archived' }),
      entry({ id: 'z', name: '完全不同', content: '日志输出到 stdout' }),
    ])
    expect(pairs.length).toBe(0)
  })
})

describe('findLowValueEntries', () => {
  it('活跃、未强化且超过 30 天未更新才入选', () => {
    const result = findLowValueEntries([
      entry({ id: 'old', updatedAt: '2026-09-01T00:00:00.000Z' }),
      entry({ id: 'reinforced', updatedAt: '2026-09-01T00:00:00.000Z', reinforcement: 2 }),
      entry({ id: 'fresh', updatedAt: '2026-11-09T00:00:00.000Z' }),
      entry({ id: 'stale-status', updatedAt: '2026-09-01T00:00:00.000Z', status: 'stale' }),
      entry({ id: 'bad-time', updatedAt: 'not-a-date' }),
    ], NOW)
    expect(result.map(item => item.id)).toEqual(['old'])
  })
})

describe('runAudit', () => {
  it('三个规则一次性计算', () => {
    const result = runAudit([
      entry({ id: 's', name: '过时候选条目', obsoleteVotes: 1 }),
      entry({ id: 'low', name: '低价值条目', updatedAt: '2026-08-01T00:00:00.000Z' }),
      entry({ id: 'dup1', name: '重复条目', content: '重复条目正文内容' }),
      entry({ id: 'dup2', name: '重复条目', content: '重复条目正文内容' }),
    ], NOW)
    expect(result.stale.map(item => item.id)).toEqual(['s'])
    expect(result.lowValue.map(item => item.id)).toEqual(['low'])
    expect(result.duplicates.length).toBe(1)
  })
})
