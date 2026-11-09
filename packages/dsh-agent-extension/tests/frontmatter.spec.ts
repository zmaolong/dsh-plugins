/**
 * Frontmatter / template rendering specs, ported from test/frontmatter.test.mjs
 * (node:test → vitest). Pure in-memory: no files, no cleanup needed.
 */

import { expect, it } from 'vitest'

import {
  parseFrontmatter,
  renderCommandTemplate,
  splitArguments,
} from '../src/frontmatter.ts'

it('解析标准 frontmatter：标量、引号、内联数组、列表', () => {
  const result = parseFrontmatter([
    '---',
    'name: greet',
    'description: "带引号的描述"',
    'allowed-tools: [Read, Write]',
    'tags:',
    '  - a',
    '  - b',
    'enabled: true',
    'count: 3',
    '---',
    '# 正文',
    '第二行',
  ].join('\n'))
  expect(result.hasFrontmatter).toBe(true)
  expect(result.data.name).toBe('greet')
  expect(result.data.description).toBe('带引号的描述')
  expect(result.data['allowed-tools']).toEqual(['Read', 'Write'])
  expect(result.data.tags).toEqual(['a', 'b'])
  expect(result.data.enabled).toBe(true)
  expect(result.data.count).toBe(3)
  expect(result.body).toBe('# 正文\n第二行')
})

it('无 frontmatter 时正文原样返回', () => {
  const result = parseFrontmatter('只是正文\n$ARGUMENTS')
  expect(result.hasFrontmatter).toBe(false)
  expect(result.body).toBe('只是正文\n$ARGUMENTS')
  expect(result.data).toEqual({})
})

it('未闭合 frontmatter 不抛错，按正文处理', () => {
  const result = parseFrontmatter('---\nname: x\n没有结束标记')
  expect(result.hasFrontmatter).toBe(false)
  expect(result.warnings.length > 0).toBe(true)
})

it('splitArguments 处理引号与空格', () => {
  expect(splitArguments('hello world "a b" c\\ d')).toEqual(['hello', 'world', 'a b', 'c d'])
  expect(splitArguments('')).toEqual([])
})

it('renderCommandTemplate 替换 $ARGUMENTS 与 $1..$9', () => {
  const rendered = renderCommandTemplate('向 $1 和 $2 问好；全部：$ARGUMENTS', '张三 李四')
  expect(rendered).toBe('向 张三 和 李四 问好；全部：张三 李四')
})

it('无占位符时追加用户输入', () => {
  const rendered = renderCommandTemplate('固定内容', '额外参数')
  expect(rendered).toMatch(/固定内容/)
  expect(rendered).toMatch(/用户输入：额外参数/)
})
