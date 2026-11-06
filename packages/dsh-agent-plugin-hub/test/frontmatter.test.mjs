/**
 * frontmatter / 模板渲染单元测试。
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  parseFrontmatter,
  renderCommandTemplate,
  splitArguments,
} from '../lib/frontmatter.js'

test('解析标准 frontmatter：标量、引号、内联数组、列表', () => {
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
  assert.equal(result.hasFrontmatter, true)
  assert.equal(result.data.name, 'greet')
  assert.equal(result.data.description, '带引号的描述')
  assert.deepEqual(result.data['allowed-tools'], ['Read', 'Write'])
  assert.deepEqual(result.data.tags, ['a', 'b'])
  assert.equal(result.data.enabled, true)
  assert.equal(result.data.count, 3)
  assert.equal(result.body, '# 正文\n第二行')
})

test('无 frontmatter 时正文原样返回', () => {
  const result = parseFrontmatter('只是正文\n$ARGUMENTS')
  assert.equal(result.hasFrontmatter, false)
  assert.equal(result.body, '只是正文\n$ARGUMENTS')
  assert.deepEqual(result.data, {})
})

test('未闭合 frontmatter 不抛错，按正文处理', () => {
  const result = parseFrontmatter('---\nname: x\n没有结束标记')
  assert.equal(result.hasFrontmatter, false)
  assert.ok(result.warnings.length > 0)
})

test('splitArguments 处理引号与空格', () => {
  assert.deepEqual(splitArguments('hello world "a b" c\\ d'), ['hello', 'world', 'a b', 'c d'])
  assert.deepEqual(splitArguments(''), [])
})

test('renderCommandTemplate 替换 $ARGUMENTS 与 $1..$9', () => {
  const rendered = renderCommandTemplate('向 $1 和 $2 问好；全部：$ARGUMENTS', '张三 李四')
  assert.equal(rendered, '向 张三 和 李四 问好；全部：张三 李四')
})

test('无占位符时追加用户输入', () => {
  const rendered = renderCommandTemplate('固定内容', '额外参数')
  assert.match(rendered, /固定内容/)
  assert.match(rendered, /用户输入：额外参数/)
})