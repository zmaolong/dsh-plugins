/**
 * 清单解析与格式探测单元测试（直接读 tests/fixtures，不写文件）。
 */

import path from 'node:path'

import { expect, it } from 'vitest'

import { isSafePluginName, toCommandName } from '../src/formats.ts'
import {
  detectMarketplaceFile,
  detectPluginManifest,
  parseMarketplace,
  readJsonFile,
  resolveRelativeSource,
  validatePluginManifest,
} from '../src/manifest.ts'
import { FIXTURES } from './helpers.ts'

it('探测 claude 格式插件', () => {
  const root = path.join(FIXTURES, 'claude-market', 'plugins', 'demo-claude')
  const detected = detectPluginManifest(root)
  expect(detected.format).toBe('claude')
  const meta = validatePluginManifest(detected.manifest, detected)
  expect(meta.name).toBe('demo-claude')
  expect(meta.version).toBe('0.1.0')
})

it('探测 codebuddy 格式插件', () => {
  const root = path.join(FIXTURES, 'codebuddy-market', 'plugins', 'demo-codebuddy')
  expect(detectPluginManifest(root).format).toBe('codebuddy')
})

it('探测 zcode 格式插件', () => {
  const root = path.join(FIXTURES, 'zcode-market', 'plugins', 'demo-zcode')
  expect(detectPluginManifest(root).format).toBe('zcode')
})

it('同一目录多格式清单按 claude > codebuddy > zcode 选择', () => {
  const root = path.join(FIXTURES, 'multi-format')
  const detected = detectPluginManifest(root)
  expect(detected.format).toBe('claude')
  expect(detected.manifest.name).toBe('multi-demo')
})

it('只有根级 plugin.json 时按提示格式兜底并给出 warning', () => {
  const root = path.join(FIXTURES, 'root-manifest-plugin')
  const detected = detectPluginManifest(root, { hintFormat: 'zcode' })
  expect(detected.format).toBe('zcode')
  expect(detected.warnings.length).toBeGreaterThan(0)
})

it('缺少 name 时报中文错误；version 缺省按 0.0.0（对齐 ZCode/Claude 生态）', () => {
  const fakeDetected = { format: 'claude', manifestPath: 'x/plugin.json' }
  expect(() => validatePluginManifest({ version: '1.0.0' }, fakeDetected)).toThrow(/缺少必填字段 name/)
  expect(() => validatePluginManifest({ name: '../evil', version: '1.0.0' }, fakeDetected)).toThrow(/name 不合法/)
  const versionless = validatePluginManifest({ name: 'ok' }, fakeDetected)
  expect(versionless.version).toBe('0.0.0')
  expect(versionless.warnings).toEqual([])
  expect(validatePluginManifest({ name: 'ok', version: ' 2.0.0 ' }, fakeDetected).version).toBe('2.0.0')
})

it('无 version 的 claude 插件夹具：探测与校验通过', () => {
  const root = path.join(FIXTURES, 'versionless-market', 'plugins', 'demo-versionless')
  const detected = detectPluginManifest(root)
  expect(detected.format).toBe('claude')
  const meta = validatePluginManifest(detected.manifest, detected)
  expect(meta.name).toBe('demo-versionless')
  expect(meta.version).toBe('0.0.0')
})

it('marketplace.json 解析：相对路径 / npm / 未知字段', () => {
  const file = path.join(FIXTURES, 'claude-market', '.claude-plugin', 'marketplace.json')
  const detected = detectMarketplaceFile(path.join(FIXTURES, 'claude-market'))
  expect(detected.format).toBe('claude')
  const parsed = parseMarketplace(readJsonFile(file), { format: 'claude', root: path.dirname(file) })
  expect(parsed.name).toBe('fixture-claude-market')
  expect(parsed.plugins.length).toBe(3)
  expect(parsed.plugins[0]?.source.kind).toBe('local')
  expect(parsed.plugins[2]?.source.kind).toBe('npm')
})

it('根级 marketplace.json 也能被探测到', () => {
  const detected = detectMarketplaceFile(path.join(FIXTURES, 'root-market'))
  expect(detected.format).toBe('claude')
  expect(detected.manifest.name).toBe('fixture-root-market')
})

it('resolveRelativeSource 拒绝越界与绝对路径', () => {
  const root = path.join(FIXTURES, 'claude-market')
  expect(resolveRelativeSource(root, './plugins/demo-claude').startsWith(root)).toBe(true)
  expect(() => resolveRelativeSource(root, '../outside')).toThrow(/越出市场根目录|不得包含/)
  expect(() => resolveRelativeSource(root, 'C:\\Windows')).toThrow(/绝对路径/)
  expect(() => resolveRelativeSource(root, '/etc/passwd')).toThrow(/绝对路径/)
})

it('插件名白名单与命令名规整', () => {
  expect(isSafePluginName('demo-plugin')).toBe(true)
  expect(isSafePluginName('..')).toBe(false)
  expect(isSafePluginName('a/b')).toBe(false)
  expect(isSafePluginName('')).toBe(false)
  expect(toCommandName('Demo:Hello World')).toBe('demo-hello-world')
  expect(toCommandName('123')).toBe('cmd-123')
  expect(toCommandName('__')).toBe('cmd-__')
})

it('parseMarketplace：市场级 display 与条目 meta 透传（schema v2）', () => {
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
  expect(parsed.name).toBe('meta-market')
  expect(parsed.owner).toBe('owner-name')
  expect(parsed.display).toEqual({
    title: 'meta-market',
    description: 'Market desc',
    owner: { name: 'owner-name', email: 'owner@example.com' },
  })
  expect(parsed.featured, 'featured 显式声明与条目 featured 合并去重').toEqual(['p-one'])
  expect(parsed.plugins.length).toBe(2)

  const first = parsed.plugins[0]!
  expect(first.description).toBe('Desc one')
  expect(first.meta.displayName).toBe('插件一')
  expect(first.meta.description).toBe('Desc one')
  expect(first.meta.descriptionI18n).toEqual({ en: 'Desc one', 'zh-cn': '描述一' })
  expect(first.meta.category).toBe('tool')
  expect(first.meta.author).toEqual({ name: '作者', url: 'https://author.example' })
  expect(first.meta.homepage).toBe('https://home.example')
  expect(first.meta.repository).toBe('https://repo.example')
  expect(first.meta.license).toBe('MIT')
  expect(first.meta.keywords).toEqual(['k1', 'k2'])
  expect(first.meta.icon).toBe('assets/icon.png')
  expect(Object.prototype.hasOwnProperty.call(first.meta, 'bogus')).toBe(false)
  expect(Object.prototype.hasOwnProperty.call(first.meta, 'authorUrl')).toBe(false)

  expect(parsed.plugins[1]!.meta, '没有可选字段时 meta 为空对象').toEqual({})
})

it('parseMarketplace：条目 displayName 用 title 兜底、多语言 key 小写', () => {
  const parsed = parseMarketplace({
    name: 'i18n-market',
    plugins: [{
      name: 'p-i18n',
      version: '1.0.0',
      title: { 'zh-CN': '中文名', EN: 'English name' },
      source: './p-i18n',
    }],
  }, { format: 'claude', root: 'C:\\market' })
  const meta = parsed.plugins[0]!.meta
  expect(meta.displayName, 'default 优先 en').toBe('English name')
  expect(meta.displayNameI18n).toEqual({ 'zh-cn': '中文名', en: 'English name' })
})

it('validatePluginManifest：额外返回清单展示字段', () => {
  const detected = detectPluginManifest(path.join(FIXTURES, 'claude-market', 'plugins', 'demo-claude'))
  const meta = validatePluginManifest(detected.manifest, detected)
  expect(meta.name).toBe('demo-claude')
  expect(meta.version).toBe('0.1.0')
  expect(meta.author).toEqual({ name: 'fixture' })
  expect(meta.homepage).toBeNull()
  expect(meta.repository).toBeNull()
  expect(meta.license).toBeNull()
  expect(meta.keywords).toEqual([])
  expect(meta.icon).toBeNull()
  expect(meta.category).toBeNull()
})

it('validatePluginManifest：清单里的 author/homepage/keywords/icon/category 归一', () => {
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
  expect(meta.author).toEqual({ name: '作者字符串' })
  expect(meta.homepage).toBe('https://home.example')
  expect(meta.repository).toBe('https://repo.example')
  expect(meta.license).toBe('Apache-2.0')
  expect(meta.keywords).toEqual(['a', 'b'])
  expect(meta.icon).toBe('assets/icon.png')
  expect(meta.category).toBe('tool')
})
