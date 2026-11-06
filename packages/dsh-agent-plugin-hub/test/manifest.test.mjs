/**
 * 清单解析与格式探测单元测试（直接读 test/fixtures，不写文件）。
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'
import path from 'node:path'

import { isSafePluginName, toCommandName } from '../lib/formats.js'
import {
  detectMarketplaceFile,
  detectPluginManifest,
  parseMarketplace,
  readJsonFile,
  resolveRelativeSource,
  validatePluginManifest,
} from '../lib/manifest.js'
import { FIXTURES } from './helpers.mjs'

test('探测 claude 格式插件', () => {
  const root = path.join(FIXTURES, 'claude-market', 'plugins', 'demo-claude')
  const detected = detectPluginManifest(root)
  assert.equal(detected.format, 'claude')
  const meta = validatePluginManifest(detected.manifest, detected)
  assert.equal(meta.name, 'demo-claude')
  assert.equal(meta.version, '0.1.0')
})

test('探测 codebuddy 格式插件', () => {
  const root = path.join(FIXTURES, 'codebuddy-market', 'plugins', 'demo-codebuddy')
  assert.equal(detectPluginManifest(root).format, 'codebuddy')
})

test('探测 zcode 格式插件', () => {
  const root = path.join(FIXTURES, 'zcode-market', 'plugins', 'demo-zcode')
  assert.equal(detectPluginManifest(root).format, 'zcode')
})

test('同一目录多格式清单按 claude > codebuddy > zcode 选择', () => {
  const root = path.join(FIXTURES, 'multi-format')
  const detected = detectPluginManifest(root)
  assert.equal(detected.format, 'claude')
  assert.equal(detected.manifest.name, 'multi-demo')
})

test('只有根级 plugin.json 时按提示格式兜底并给出 warning', () => {
  const root = path.join(FIXTURES, 'root-manifest-plugin')
  const detected = detectPluginManifest(root, { hintFormat: 'zcode' })
  assert.equal(detected.format, 'zcode')
  assert.ok(detected.warnings.length > 0)
})

test('缺少 name/version 时报中文错误', () => {
  const fakeDetected = { format: 'claude', manifestPath: 'x/plugin.json' }
  assert.throws(() => validatePluginManifest({ version: '1.0.0' }, fakeDetected), /缺少必填字段 name/)
  assert.throws(() => validatePluginManifest({ name: 'ok' }, fakeDetected), /缺少必填字段 version/)
  assert.throws(() => validatePluginManifest({ name: '../evil', version: '1.0.0' }, fakeDetected), /name 不合法/)
})

test('marketplace.json 解析：相对路径 / npm / 未知字段', () => {
  const file = path.join(FIXTURES, 'claude-market', '.claude-plugin', 'marketplace.json')
  const detected = detectMarketplaceFile(path.join(FIXTURES, 'claude-market'))
  assert.equal(detected.format, 'claude')
  const parsed = parseMarketplace(readJsonFile(file), { format: 'claude', root: path.dirname(file) })
  assert.equal(parsed.name, 'fixture-claude-market')
  assert.equal(parsed.plugins.length, 3)
  assert.equal(parsed.plugins[0].source.kind, 'local')
  assert.equal(parsed.plugins[2].source.kind, 'npm')
})

test('根级 marketplace.json 也能被探测到', () => {
  const detected = detectMarketplaceFile(path.join(FIXTURES, 'root-market'))
  assert.equal(detected.format, 'claude')
  assert.equal(detected.manifest.name, 'fixture-root-market')
})

test('resolveRelativeSource 拒绝越界与绝对路径', () => {
  const root = path.join(FIXTURES, 'claude-market')
  assert.ok(resolveRelativeSource(root, './plugins/demo-claude').startsWith(root))
  assert.throws(() => resolveRelativeSource(root, '../outside'), /越出市场根目录|不得包含/)
  assert.throws(() => resolveRelativeSource(root, 'C:\\Windows'), /绝对路径/)
  assert.throws(() => resolveRelativeSource(root, '/etc/passwd'), /绝对路径/)
})

test('插件名白名单与命令名规整', () => {
  assert.equal(isSafePluginName('demo-plugin'), true)
  assert.equal(isSafePluginName('..'), false)
  assert.equal(isSafePluginName('a/b'), false)
  assert.equal(isSafePluginName(''), false)
  assert.equal(toCommandName('Demo:Hello World'), 'demo-hello-world')
  assert.equal(toCommandName('123'), 'cmd-123')
  assert.equal(toCommandName('__'), 'cmd-__')
})