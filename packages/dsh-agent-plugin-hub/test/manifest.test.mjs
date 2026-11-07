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

test('parseMarketplace：市场级 display 与条目 meta 透传（schema v2）', () => {
  const manifest = {
    name: 'meta-market',
    owner: { name: 'owner-name', email: 'owner@example.com' },
    description: { en: 'Market desc', 'zh-cn': '市场描述' },
    featured: ['p-one'],
    plugins: [
      {
        name: 'p-one',
        version: '1.0.0',
        description: { en: 'Desc one', 'zh-cn': '描述一' },
        displayName: '插件一',
        category: 'tool',
        author: { name: '作者', url: 'https://author.example' },
        homepage: 'https://home.example',
        repository: 'https://repo.example',
        license: 'MIT',
        keywords: ['k1', 'k2', 'k1', ''],
        icon: 'assets/icon.png',
        featured: true,
        bogus: 'ignored',
        source: './p-one',
      },
      { name: 'p-two', version: '2.0.0', source: './p-two' },
    ],
  }
  const parsed = parseMarketplace(manifest, { format: 'claude', root: 'C:\\market' })
  assert.equal(parsed.name, 'meta-market')
  assert.equal(parsed.owner, 'owner-name')
  assert.deepEqual(parsed.display, {
    title: 'meta-market',
    description: 'Market desc',
    owner: { name: 'owner-name', email: 'owner@example.com' },
  })
  assert.deepEqual(parsed.featured, ['p-one'], 'featured 显式声明与条目 featured 合并去重')
  assert.equal(parsed.plugins.length, 2)

  const first = parsed.plugins[0]
  assert.equal(first.description, 'Desc one')
  assert.equal(first.meta.displayName, '插件一')
  assert.equal(first.meta.description, 'Desc one')
  assert.deepEqual(first.meta.descriptionI18n, { en: 'Desc one', 'zh-cn': '描述一' })
  assert.equal(first.meta.category, 'tool')
  assert.deepEqual(first.meta.author, { name: '作者', url: 'https://author.example' })
  assert.equal(first.meta.homepage, 'https://home.example')
  assert.equal(first.meta.repository, 'https://repo.example')
  assert.equal(first.meta.license, 'MIT')
  assert.deepEqual(first.meta.keywords, ['k1', 'k2'])
  assert.equal(first.meta.icon, 'assets/icon.png')
  assert.equal(Object.prototype.hasOwnProperty.call(first.meta, 'bogus'), false)
  assert.equal(Object.prototype.hasOwnProperty.call(first.meta, 'authorUrl'), false)

  assert.deepEqual(parsed.plugins[1].meta, {}, '没有可选字段时 meta 为空对象')
})

test('parseMarketplace：条目 displayName 用 title 兜底、多语言 key 小写', () => {
  const parsed = parseMarketplace({
    name: 'i18n-market',
    plugins: [{
      name: 'p-i18n',
      version: '1.0.0',
      title: { 'zh-CN': '中文名', EN: 'English name' },
      source: './p-i18n',
    }],
  }, { format: 'claude', root: 'C:\\market' })
  const meta = parsed.plugins[0].meta
  assert.equal(meta.displayName, 'English name', 'default 优先 en')
  assert.deepEqual(meta.displayNameI18n, { 'zh-cn': '中文名', en: 'English name' })
})

test('validatePluginManifest：额外返回清单展示字段', () => {
  const detected = detectPluginManifest(path.join(FIXTURES, 'claude-market', 'plugins', 'demo-claude'))
  const meta = validatePluginManifest(detected.manifest, detected)
  assert.equal(meta.name, 'demo-claude')
  assert.equal(meta.version, '0.1.0')
  assert.deepEqual(meta.author, { name: 'fixture' })
  assert.equal(meta.homepage, null)
  assert.equal(meta.repository, null)
  assert.equal(meta.license, null)
  assert.deepEqual(meta.keywords, [])
  assert.equal(meta.icon, null)
  assert.equal(meta.category, null)
})

test('validatePluginManifest：清单里的 author/homepage/keywords/icon/category 归一', () => {
  const meta = validatePluginManifest({
    name: 'full-plugin',
    version: '1.2.3',
    description: '描述',
    author: '作者字符串',
    homepage: 'https://home.example',
    repository: 'https://repo.example',
    license: 'Apache-2.0',
    keywords: ['a', 'b', 'a'],
    icon: 'assets/icon.png',
    category: 'tool',
  }, { format: 'claude', manifestPath: 'fake/plugin.json' })
  assert.deepEqual(meta.author, { name: '作者字符串' })
  assert.equal(meta.homepage, 'https://home.example')
  assert.equal(meta.repository, 'https://repo.example')
  assert.equal(meta.license, 'Apache-2.0')
  assert.deepEqual(meta.keywords, ['a', 'b'])
  assert.equal(meta.icon, 'assets/icon.png')
  assert.equal(meta.category, 'tool')
})