/**
 * 换行 / 截断回归：单行文本必须 ellipsis + title 提示，多行文本必须可换行，
 * 组件行名称与描述必须堆叠在同一个 body 内（不再嵌套 flex 容器）。
 */

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const PACKAGE_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const source = readFileSync(path.join(PACKAGE_DIR, 'client.js'), 'utf8')

test('截断：单行文本有 ellipsis，可截断元素带 title 提示', () => {
  const singleLineRules = [
    ['.aph-card-desc', 'overflow:hidden;text-overflow:ellipsis;white-space:nowrap'],
    ['.aph-card-sub', 'overflow:hidden;text-overflow:ellipsis;white-space:nowrap'],
    ['.aph-comp-name', 'overflow:hidden;text-overflow:ellipsis;white-space:nowrap'],
    ['.aph-comp-desc', 'overflow:hidden;text-overflow:ellipsis;white-space:nowrap'],
    ['.aph-info-value', 'overflow:hidden;text-overflow:ellipsis;white-space:nowrap'],
    ['.aph-dialog-title', 'overflow:hidden;text-overflow:ellipsis;white-space:nowrap'],
    ['.aph-source-name', 'overflow:hidden;text-overflow:ellipsis;white-space:nowrap'],
    ['.aph-source-sub', 'overflow:hidden;text-overflow:ellipsis;white-space:nowrap'],
    ['.aph-list-row-main', 'overflow:hidden;text-overflow:ellipsis;white-space:nowrap'],
  ]
  for (const [selector, snippet] of singleLineRules) {
    const index = source.indexOf(selector)
    assert.ok(index >= 0, `缺少规则：${selector}`)
    const rest = source.slice(index, index + 240)
    assert.ok(rest.includes(snippet), `${selector} 应单行截断`)
  }
  for (const marker of [
    "className: 'aph-card-desc', title:",
    "className: 'aph-card-sub', title:",
    "className: 'aph-source-name', title:",
    "className: 'aph-source-sub', title:",
    "className: 'aph-list-row-main', title:",
    "className: 'aph-comp-desc', title:",
  ]) {
    assert.ok(source.includes(marker), `可截断文本应带 title 提示：${marker}`)
  }
})

test('换行：多行文本允许断行且不溢出', () => {
  const wraps = [
    ['.aph-detail-desc', 'white-space:pre-line;overflow-wrap:anywhere'],
    ['.aph-dialog-body', 'overflow-wrap:anywhere'],
    ['.aph-toast-body', 'white-space:pre-wrap'],
    ['.aph-error', 'white-space:pre-wrap;word-break:break-word'],
    ['.aph-source-error', 'white-space:pre-wrap'],
    ['.aph-warning', 'word-break:break-word'],
    ['.aph-risk', 'word-break:break-word'],
    ['.aph-placeholder', 'overflow-wrap:anywhere'],
  ]
  for (const [selector, snippet] of wraps) {
    const index = source.indexOf(selector)
    assert.ok(index >= 0, `缺少规则：${selector}`)
    assert.ok(source.slice(index, index + 420).includes(snippet), `${selector} 应允许换行`)
  }
  assert.ok(source.includes('.aph-info-value a>span{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}'), '外链值内部也要截断')
})

test('页面内容列：与 ZCode Settings 一致，max-w-4xl 居中且左右留空', () => {
  const page = source.match(/\.aph-page\{[^}]+\}/u)?.[0] ?? ''
  assert.ok(page.includes('max-width:896px'), '内容列应与 ZCode max-w-4xl（896px）一致')
  assert.ok(page.includes('margin:0 auto'), '内容列应水平居中，左右留空')
  assert.ok(page.includes('padding:20px 16px 32px'), '默认左右留白 16px')
  assert.ok(
    source.includes('@container (min-width:1024px){.aph-page{padding-left:32px;padding-right:32px}}'),
    '宽容器左右留白应提升到 32px（ZCode lg:px-8）',
  )
})

test('组件行：名称与描述堆叠在同一 comp-body，不再嵌套 comp-body', () => {
  assert.equal(source.includes("h('div', { className: 'aph-comp-body' }, body)"), false, '组件行不应再嵌套 body')
  assert.ok(source.includes("h('div', { className: 'aph-comp-body' },\n            h('span', { className: 'aph-comp-name'"), '名称与描述应同处 body')
  assert.ok(source.includes("description ? h('span', { className: 'aph-comp-desc'"), '描述应渲染在名称下方')
})