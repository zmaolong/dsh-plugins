/**
 * 暗色模式回归：按钮/开关/Toast/hover 必须使用宿主主题 token，
 * 不得把亮色下的白字/白底硬编码到主色按钮或开关滑块上。
 */

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const PACKAGE_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const source = readFileSync(path.join(PACKAGE_DIR, 'client.js'), 'utf8')

test('暗色适配：主色按钮使用 button-primary 与 label-primary-foreground token', () => {
  const rule = source.match(/\.aph-btn\.primary\{[^}]+\}/u)?.[0] ?? ''
  assert.ok(rule.includes('--dsw-alias-button-primary-fill'), 'primary fill 必须走 button-primary-fill')
  assert.ok(rule.includes('--aph-on-brand'), 'primary 文字必须走 --aph-on-brand（label-primary-foreground）')
  assert.equal(rule.includes('#fff'), false, '主色按钮不得硬编码白色文字')
  const hover = source.match(/\.aph-btn\.primary:hover:not\(:disabled\)\{[^}]+\}/u)?.[0] ?? ''
  assert.ok(hover.includes('--dsw-alias-button-primary-hover'), 'primary hover 必须走 button-primary-hover')
  const variables = source.match(/\.aph-root,\.aph-overlay-root\{[^}]+\}/u)?.[0] ?? ''
  assert.ok(variables.includes('--dsw-alias-label-primary-foreground'), '--aph-on-brand 必须映射 label-primary-foreground')
  assert.ok(variables.includes('--dsw-alias-interactive-bg-hover'), 'hover 必须映射 interactive-bg-hover')
  assert.ok(variables.includes('--dsw-alias-interactive-bg-active'), 'active/选中必须映射 interactive-bg-active')
})

test('暗色适配：开关滑块与 Toast 使用宿主 token，不硬编码白色', () => {
  assert.ok(source.includes('--dsw-alias-switch-thumb'), '开关滑块必须走 switch-thumb')
  assert.equal(/\.aph-switch\[aria-checked="true"\]::after\{[^}]*background:#fff/u.test(source), false, '开关滑块不得硬编码白色')
  assert.ok(source.includes('--dsw-alias-toast-bg'), 'Toast 背景必须走 toast-bg')
  assert.ok(source.includes('--dsw-alias-toast-label'), 'Toast 文字必须走 toast-label')
})

test('暗色适配：hover / 选中不再依赖自造 color-mix 混色', () => {
  const hoverSelectors = [
    '.aph-card:hover{',
    '.aph-menu-item:hover{',
    '.aph-collapse-row:hover{',
    '.aph-back:hover{',
    '.aph-source-row:hover{',
    '.aph-icon-btn:hover{',
  ]
  for (const selector of hoverSelectors) {
    const index = source.indexOf(selector)
    assert.ok(index >= 0, `缺少规则：${selector}`)
    const snippet = source.slice(index, index + 160)
    assert.ok(snippet.includes('var(--aph-hover)'), `${selector} 应使用 --aph-hover`)
  }
})