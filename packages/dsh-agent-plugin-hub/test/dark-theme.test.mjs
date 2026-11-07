/**
 * 主题回归：面板按 ZCode ZaiLight / ZaiDark 调色板取色，按宿主暗色属性切换；
 * 按钮、开关、Toast、hover 不得硬编码亮色白字/白底，图标使用 ZCode 的 lucide 形状。
 */

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const PACKAGE_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const source = readFileSync(path.join(PACKAGE_DIR, 'client.js'), 'utf8')

test('ZCode 调色板：亮/暗两套 Zai token，且不再依赖宿主别名', () => {
  const light = source.match(/\.aph-root,\.aph-overlay-root\{[^}]+\}/u)?.[0] ?? ''
  assert.ok(light.includes('--aph-bg:#f8f8f8'), '亮色背景应取 ZaiLight #f8f8f8')
  assert.ok(light.includes('--aph-card:#ffffff'), '亮色卡片应取 #ffffff')
  assert.ok(light.includes('--aph-fg:#262626'), '亮色前景应取 neutral-800')
  assert.ok(light.includes('--aph-border:rgba(13,13,13,.1)'), '亮色边框应取 ZaiLight border')
  const dark = source.match(/body\[data-ds-dark-theme\] \.aph-root[^}]*\}/u)?.[0] ?? ''
  assert.ok(dark.includes('--aph-bg:#161616'), '暗色背景应取 ZaiDark #161616')
  assert.ok(dark.includes('--aph-card:#2b2b2b'), '暗色卡片应取 ZaiDark #2b2b2b')
  assert.ok(dark.includes('--aph-primary:#ffffff'), '暗色主色应取 #ffffff')
  assert.ok(dark.includes('--aph-primary-fg:#000000'), '暗色主色前景应取 #000000')
  assert.ok(dark.includes('--aph-fg:#d4d4d4'), '暗色前景应取 neutral-300')
  assert.ok(dark.includes('--aph-border:rgba(255,255,255,.1)'), '暗色边框应取白色 10%')
  assert.equal(source.includes('--dsw-alias-'), false, '样式不应再依赖宿主别名 token')
})

test('主色按钮：ZCode primary 语义，暗色白底黑字、亮色黑底白字', () => {
  const rule = source.match(/\.aph-btn\.primary\{[^}]+\}/u)?.[0] ?? ''
  assert.ok(rule.includes('background:var(--aph-primary)'), 'primary 背景必须取 --aph-primary')
  assert.ok(rule.includes('color:var(--aph-primary-fg)'), 'primary 文字必须取 --aph-primary-fg')
  assert.equal(rule.includes('#fff'), false, '主色按钮不得硬编码白色文字')
  const hover = source.match(/\.aph-btn\.primary:hover:not\(:disabled\)\{[^}]+\}/u)?.[0] ?? ''
  assert.ok(hover.includes('color-mix(in srgb,var(--aph-primary) 80%,transparent)'), 'primary hover 应取 primary/80')
})

test('开关：ZCode Switch（选中 primary、未选中 primary/30、滑块 primary-foreground）', () => {
  const track = source.match(/\.aph-switch\{[^}]+\}/u)?.[0] ?? ''
  assert.ok(track.includes('color-mix(in srgb,var(--aph-primary) 30%,transparent)'), '未选中滑轨应为 primary/30')
  const thumb = source.match(/\.aph-switch::after\{[^}]+\}/u)?.[0] ?? ''
  assert.ok(thumb.includes('background:var(--aph-primary-fg)'), '滑块应为 primary-foreground（暗色近黑）')
  const checked = source.match(/\.aph-switch\[aria-checked="true"\]\{[^}]+\}/u)?.[0] ?? ''
  assert.ok(checked.includes('background:var(--aph-primary)'), '选中滑轨应为 primary')
  assert.equal(/\.aph-switch\[aria-checked="true"\]::after\{[^}]*background:#fff/u.test(source), false, '开关滑块不得硬编码白色')
})

test('Toast / hover：使用 ZCode surface 与调色板变量', () => {
  const toast = source.match(/\.aph-toast\{[^}]+\}/u)?.[0] ?? ''
  assert.ok(toast.includes('background:var(--aph-toast-bg)'), 'Toast 背景取 --aph-toast-bg')
  assert.ok(toast.includes('color:var(--aph-toast-fg)'), 'Toast 文字取 --aph-toast-fg')
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
    assert.ok(source.slice(index, index + 160).includes('var(--aph-hover)'), `${selector} 应使用 --aph-hover`)
  }
})

test('弹窗阴影对齐 ZCode shadow-md，避免偏移的大黑影', () => {
  const dialog = source.match(/\.aph-dialog\{[^}]+\}/u)?.[0] ?? ''
  assert.ok(dialog.includes('box-shadow:0 4px 6px -1px rgba(0,0,0,.1)'), '弹窗应使用 ZCode shadow-md')
  assert.equal(dialog.includes('0 24px 64px'), false, '弹窗不应再使用 24px 偏移的大黑影')
  const menu = source.match(/\.aph-menu\{[^}]+\}/u)?.[0] ?? ''
  assert.equal(menu.includes('0 10px 30px'), false, '菜单不应再使用 10px 偏移的大黑影')
  assert.ok(source.includes("className: 'aph-overlay-root' } , dialog, toasts") || /h\('div', \{ className: 'aph-overlay-root' \}, dialog, toasts\)/u.test(source), '浮层应只渲染栈顶弹窗')
})

test('图标：使用 ZCode 的 lucide 形状（Store / Blocks / Puzzle / RotateCcw）', () => {
  assert.ok(source.includes("store: ['M2 7l4.41-4.41A2 2 0 0 1 7.83 2h8.34"), 'Store 应为 lucide 店铺图标')
  assert.equal(source.includes("'M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z'"), false, '不应再用购物袋图标')
  assert.ok(source.includes('blocks: [{ rect: [14, 3, 7, 7, 1] }'), 'Blocks 应为 lucide 三块拼图')
  assert.ok(source.includes('puzzle: ['), '侧栏图标应为 lucide Puzzle')
  assert.ok(source.includes('rotateCcw: ['), '回滚图标应为 lucide RotateCcw')
})