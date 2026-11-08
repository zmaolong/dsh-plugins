/**
 * Client 模块测试：在没有浏览器的 Node 环境里用 `node:vm` 加载 client.js，
 * 验证模块装配、槽位注册、纯函数、UI store 行为与组件冒烟。
 *
 * 约束：
 * - 零网络：所有 HTTP 都走宿主沙箱里替换的全局 `fetch` 桩；
 * - 零 DOM：不提供 `document` / `window.setTimeout`，样式注入与 toast 定时自动失效；
 * - 组件测试用 React 替身，只记录 createElement 的调用结果，不做真实渲染；
 * - vm 上下文里的数组/对象原型与宿主不同，跨上下文比较统一用 JSON.stringify。
 */

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import vm from 'node:vm'
import { fileURLToPath } from 'node:url'

const PACKAGE_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const CLIENT_SOURCE = readFileSync(path.join(PACKAGE_DIR, 'client.js'), 'utf8')
const PACKAGE_JSON = JSON.parse(
  readFileSync(path.join(PACKAGE_DIR, 'package.json'), 'utf8').replace(/^\uFEFF/u, ''),
)

/** 序列化比较：抹平 vm 上下文与宿主之间的原型差异。 */
function json(value) {
  return JSON.stringify(value)
}

/** 递归遍历 React 替身生成的元素树（{type, args}），跳过普通 props 对象。 */
function walkElements(node, visit) {
  if (!node || typeof node !== 'object') return
  if (Array.isArray(node)) {
    for (const child of node) walkElements(child, visit)
    return
  }
  if ('type' in node && Array.isArray(node.args)) {
    visit(node)
    for (const child of node.args) walkElements(child, visit)
  }
}

/**
 * 最小 React 替身：组件函数里的 hooks 都返回惰性值，不执行副作用。
 * createElement 只记录参数，便于断言组件是否被调用/返回了元素。
 */
function createReactStub() {
  return {
    createElement(...args) {
      return { type: args[0], args }
    },
    cloneElement(element, props) {
      return { type: element && element.type, args: [element && element.type, props] }
    },
    useState(initial) {
      return [typeof initial === 'function' ? initial() : initial, () => {}]
    },
    useEffect() {},
    useCallback(fn) {
      return fn
    },
    useRef(value) {
      return { current: value }
    },
  }
}

/** 在 vm 上下文里执行 client.js，返回模块定义与可改写的全局沙箱。 */
function loadDefinition() {
  let definition = null
  let loadCalls = 0
  const sandbox = {
    window: {
      __ModuleLoader__: {
        load(value) {
          loadCalls += 1
          definition = value
        },
      },
    },
    console: { log() {}, warn() {}, error() {} },
  }
  vm.runInNewContext(CLIENT_SOURCE, sandbox, { filename: 'client.js' })
  return { definition, sandbox, loadCalls }
}

/** 模块级缓存：整个测试文件只加载/实例化一次，各测试共享纯函数与 React 替身。 */
let cached = null
function client() {
  if (cached) return cached
  const loaded = loadDefinition()
  assert.ok(loaded.definition, 'client.js 应调用 window.__ModuleLoader__.load')
  const required = []
  const react = createReactStub()
  const plugin = loaded.definition.factory((name) => {
    required.push(name)
    if (name === 'react') return react
    throw new Error(`unexpected require: ${name}`)
  })
  cached = { ...loaded, plugin, required, react }
  return cached
}

/** 直接取 __test 暴露面；缺失时立刻失败并给出可读信息。 */
function testApi() {
  const api = client().plugin.__test
  assert.ok(api, 'client.js 必须暴露 plugin.__test')
  return api
}

/** 假 locale：register 记录、bind 提供绑定函数、getLocale 读 active。 */
function createFakeLocale() {
  const locales = []
  let active = 'zh'
  return {
    locales,
    setActive(value) {
      active = value
    },
    service: {
      register(namespace, localeId, dict) {
        locales.push({ namespace, localeId, dict })
      },
      bind() {
        return (key) => `bound:${key}`
      },
      subscribe() {
        return () => {}
      },
      getLocale() {
        return { active }
      },
    },
  }
}

/** 假 ctx：slots.inject 立刻执行工厂，register 记录注册项；effect 记录清理函数。 */
function createFakeCtx(locale) {
  const injected = []
  const registrations = []
  const cleanups = []
  return {
    injected,
    registrations,
    cleanups,
    ctx: {
      locale: locale.service,
      slots: {
        inject(key, factory) {
          injected.push(key)
          factory()
        },
        register(options, component) {
          registrations.push({ options, component })
          return () => {}
        },
      },
      effect(fn) {
        cleanups.push(fn)
      },
    },
  }
}

/** 简易 t：无变量时返回 key 本身；有变量时把变量拼在 key 后面，便于断言渲染分支。 */
function makeT() {
  return (key, vars) => {
    if (!vars || typeof vars !== 'object') return key
    const parts = Object.keys(vars).map((name) => `${name}=${json(vars[name])}`)
    return `${key}(${parts.join(',')})`
  }
}

/** 全局 fetch 桩：记录请求，返回给定响应。 */
function stubFetch(sandbox, handler) {
  const calls = []
  sandbox.fetch = async (url, init) => {
    calls.push({ url, init })
    return handler(url, init)
  }
  return calls
}

function successResponse(data) {
  return {
    ok: true,
    status: 200,
    json: async () => ({ ok: true, data }),
  }
}

function errorResponse(error, status) {
  return {
    ok: false,
    status: status === undefined ? 400 : status,
    json: async () => ({ ok: false, error }),
  }
}

function fakeMarket(overrides = {}) {
  return {
    id: 'm1',
    name: 'M One',
    title: '市场一',
    pluginCount: 2,
    lastRefreshed: '2026-01-01T00:00:00',
    refreshError: '',
    ...overrides,
  }
}

function fakeInstalled(overrides = {}) {
  const market = fakeMarket()
  return {
    key: 'beta@m1',
    name: 'beta',
    market,
    display: {
      title: 'Beta',
      titleI18n: { 'zh-cn': '贝塔' },
      description: 'Beta plugin',
      descriptionI18n: { 'zh-cn': '贝塔插件' },
      category: 'productivity',
      author: { name: 'Acme' },
    },
    enabled: true,
    installedEnabled: true,
    orphan: false,
    update: { state: 'available' },
    version: '1.2.0',
    installedVersion: '1.2.0',
    installedPath: '/home/user/.dsh/plugins/beta',
    format: 'claude',
    capabilities: {
      skills: [{ name: 's1', description: 'skill 1', enabled: true }],
      commands: [{ name: 'c1', hostName: 'c-one', description: 'command 1', enabled: true }],
      hooks: [{ event: 'PostToolUse', effective: true, enabled: true }],
      mcpServers: [{ name: 'mcp1', command: 'node', args: ['server.js'], enabled: false }],
    },
    previousVersions: [{ version: '1.1.0', available: true }],
    ...overrides,
  }
}

/** 组件冒烟用的快照：1 个市场、2 个条目（1 已安装）、runtime 概要。 */
function fakeSnapshot() {
  const market = fakeMarket()
  return {
    markets: [market],
    items: [
      {
        key: 'alpha@m1',
        name: 'alpha',
        market,
        display: { title: 'Alpha', description: 'Alpha plugin', category: 'productivity' },
        installable: true,
        version: '1.0.0',
      },
      {
        key: 'beta@m1',
        name: 'beta',
        market,
        display: { title: 'Beta', description: 'Beta plugin' },
        installable: true,
        installed: true,
        enabled: true,
        installedEnabled: true,
        update: { state: 'available' },
        version: '1.2.0',
        installedVersion: '1.2.0',
      },
    ],
    installed: [fakeInstalled()],
    runtime: {
      skills: { registered: true, skills: 3 },
      commands: { available: true, registered: ['c-one'] },
      hooks: { attached: true },
      mcp: { available: false },
    },
  }
}

/** 详情冒烟用的 describe 数据。 */
function fakeDetail(overrides = {}) {
  return {
    key: 'beta@m1',
    name: 'beta',
    display: {
      title: 'Beta',
      titleI18n: { 'zh-cn': '贝塔' },
      description: 'Beta detail description',
      category: 'productivity',
      author: { name: 'Acme' },
      homepage: 'https://example.com/beta',
      repository: 'https://github.com/acme/beta',
      license: 'MIT',
    },
    market: fakeMarket(),
    version: '1.2.0',
    installed: { installed: true, enabled: true },
    orphan: false,
    update: { state: 'available' },
    capabilities: {
      skills: [{ name: 's1', description: 'skill 1', enabled: true }],
      commands: [{ name: 'c1', hostName: 'c-one', description: 'command 1', enabled: true }],
      hooks: [{ event: 'PostToolUse', effective: true, enabled: true }],
      mcpServers: [{ name: 'mcp1', command: 'node', args: ['server.js'], enabled: false }],
    },
    warnings: ['warning one'],
    format: 'claude',
    hooksSource: 'plugin:hooks/hooks.json',
    mcpSource: 'plugin:.mcp.json',
    ...overrides,
  }
}

/* -------------------------------------------------------------------------- *
 * 1. 模块装配
 * -------------------------------------------------------------------------- */

test('client.js：调用 __ModuleLoader__.load，模块 id 等于包名且只 require react', () => {
  const { definition, loadCalls } = loadDefinition()
  assert.equal(loadCalls, 1, '应且只调用一次 window.__ModuleLoader__.load')
  assert.ok(definition, '应捕获模块定义')
  assert.equal(definition.id, PACKAGE_JSON.name, '模块 id 必须等于 package.json 的 name')
  assert.equal(typeof definition.factory, 'function')

  const required = []
  const react = createReactStub()
  const plugin = definition.factory((name) => {
    required.push(name)
    if (name === 'react') return react
    throw new Error(`unexpected require: ${name}`)
  })
  assert.equal(json(required), json(['react']), 'factory 只允许 require("react")')
  assert.ok(!('external' in definition), '模块定义不应声明 external')

  assert.equal(typeof plugin.apply, 'function', 'plugin.apply 必须是函数')
  assert.equal(json(plugin.inject), json(['slots', 'locale']), 'plugin.inject 必须声明 slots 与 locale')
  assert.ok(plugin.__test, '必须暴露 plugin.__test 供测试使用')
  for (const name of [
    'canonicalTitle',
    'formatTime',
    'pickI18n',
    'matchQuery',
    'orderMarkets',
    'groupItemsByMarket',
    'updateAvailable',
    'displayOf',
    'iconSrc',
    'httpsUrl',
    'createStore',
    'components',
  ]) {
    assert.ok(plugin.__test[name], `__test 缺少 ${name}`)
  }
  for (const name of ['Panel', 'StoreView', 'ManageView', 'DetailView', 'OverlayHost', 'StoreCard']) {
    assert.equal(typeof plugin.__test.components[name], 'function', `__test.components 缺少 ${name}`)
  }
})

/* -------------------------------------------------------------------------- *
 * 2. 槽位注册与 locale 字典
 * -------------------------------------------------------------------------- */

test('apply：注册 sidebar.panellist / main / shell.overlay 三个槽位', () => {
  const { plugin } = client()
  const locale = createFakeLocale()
  const fake = createFakeCtx(locale)
  plugin.apply(fake.ctx)

  assert.equal(
    json([...fake.injected].sort()),
    json(['main', 'shell.overlay', 'sidebar.panellist']),
    '应注入三个槽位',
  )
  assert.equal(
    json(fake.registrations.map((entry) => entry.options.name)),
    json(['sidebar.panellist', 'main', 'shell.overlay']),
    '注册顺序：侧栏 → 主面板 → 浮层',
  )
  assert.equal(fake.cleanups.length >= 1, true, 'apply 应通过 ctx.effect 注册清理函数')
  for (const cleanup of fake.cleanups) assert.equal(typeof cleanup, 'function')
})

test('apply：sidebar.panellist 入口 id/order/label 与图标组件', () => {
  const { plugin } = client()
  const locale = createFakeLocale()
  const fake = createFakeCtx(locale)
  plugin.apply(fake.ctx)
  const sidebar = fake.registrations.find((entry) => entry.options.name === 'sidebar.panellist')
  assert.ok(sidebar, '应注册侧栏入口')

  assert.equal(sidebar.options.id, 'agent-plugin')
  assert.equal(sidebar.options.order, 5, 'order 应为 5（插件 0 → 智能体插件 5 → 自动化任务 10）')
  assert.equal(sidebar.options.locale, 'agentPluginHub')
  assert.equal(typeof sidebar.options.label, 'function')

  locale.setActive('zh')
  assert.equal(sidebar.options.label(), '智能体插件')
  locale.setActive('zh-cn')
  assert.equal(sidebar.options.label(), '智能体插件')
  locale.setActive('en')
  assert.equal(sidebar.options.label(), 'Agent Plugins')
  locale.setActive('')
  assert.equal(sidebar.options.label(), '智能体插件', 'locale 缺失时回退中文')

  const icon = sidebar.component({ size: 20, active: true })
  assert.ok(icon, '侧栏图标组件应返回元素')
  assert.equal(typeof icon.type, 'function', '侧栏图标组件应返回一个 React 组件元素（PanelIcon）')
  assert.equal(icon.args[1].size, 20, '侧栏图标组件应透传 ownerProps.data-size')
  assert.equal(icon.args[1].active, true)
})

test('apply：main 与 shell.overlay 注册项与组件工厂', () => {
  const { plugin } = client()
  const locale = createFakeLocale()
  const fake = createFakeCtx(locale)
  plugin.apply(fake.ctx)

  const main = fake.registrations.find((entry) => entry.options.name === 'main')
  assert.ok(main, '应注册主面板')
  assert.equal(main.options.key, 'agent-plugin')
  assert.equal(main.options.locale, 'agentPluginHub')
  const mainElement = main.component({})
  assert.ok(mainElement, '主面板组件应返回元素')
  assert.equal(mainElement.type, plugin.__test.components.Panel, 'main 槽位应渲染 Panel')

  const overlay = fake.registrations.find((entry) => entry.options.name === 'shell.overlay')
  assert.ok(overlay, '应注册框架级浮层')
  assert.equal(overlay.options.id, 'agent-plugin-overlay')
  assert.equal(overlay.options.order, 60)
  const overlayElement = overlay.component({})
  assert.ok(overlayElement, '浮层组件应返回元素')
  assert.equal(overlayElement.type, plugin.__test.components.OverlayHost)
})

test('apply：locale 字典注册 en / zh / zh-cn，namespace=agentPluginHub', () => {
  const { plugin } = client()
  const locale = createFakeLocale()
  plugin.apply(createFakeCtx(locale).ctx)

  const ids = locale.locales.map((entry) => entry.localeId).sort()
  assert.equal(json(ids), json(['en', 'zh', 'zh-cn']))
  for (const entry of locale.locales) {
    assert.equal(entry.namespace, 'agentPluginHub')
    assert.equal(typeof entry.dict.tab, 'string')
    assert.equal(typeof entry.dict.add, 'string')
  }
  const en = locale.locales.find((entry) => entry.localeId === 'en')
  const zh = locale.locales.find((entry) => entry.localeId === 'zh')
  const zhCn = locale.locales.find((entry) => entry.localeId === 'zh-cn')
  assert.equal(en.dict.tab, 'Agent Plugins')
  assert.equal(zh.dict.tab, '智能体插件')
  assert.equal(zhCn.dict.tab, '智能体插件')
  assert.equal(json(zh.dict), json(zhCn.dict), 'zh-cn 与 zh 使用同一字典')
})

/* -------------------------------------------------------------------------- *
 * 3. 纯函数
 * -------------------------------------------------------------------------- */

test('canonicalTitle：连字符/下划线/空白分词并首字母大写', () => {
  const { canonicalTitle } = testApi()
  assert.equal(canonicalTitle('demo-plugin'), 'Demo Plugin')
  assert.equal(canonicalTitle('hello_world'), 'Hello World')
  assert.equal(canonicalTitle('foo  bar'), 'Foo Bar')
  assert.equal(canonicalTitle('pdf-tools'), 'Pdf Tools')
  assert.equal(canonicalTitle('PDF'), 'PDF')
  assert.equal(canonicalTitle(''), '')
  assert.equal(canonicalTitle(undefined), '')
  assert.equal(canonicalTitle(123), '123')
})

test('formatTime：有效时间输出 YYYY-MM-DD HH:mm，非法值返回空串', () => {
  const { formatTime } = testApi()
  assert.equal(formatTime('2026-01-02T03:04:05'), '2026-01-02 03:04')
  assert.equal(formatTime('2026-01-02T03:04:05.678'), '2026-01-02 03:04')
  assert.equal(formatTime(''), '')
  assert.equal(formatTime('   '), '')
  assert.equal(formatTime('not-a-date'), '')
  assert.equal(formatTime(12345), '')
  assert.equal(formatTime(null), '')
  assert.equal(formatTime(undefined), '')
})

test('pickI18n：精确 / 前缀 / base 三段回退与空值处理', () => {
  const { pickI18n } = testApi()
  assert.equal(pickI18n('base', { 'zh-cn': '中文' }, 'zh-CN'), '中文', '大小写不敏感精确命中')
  assert.equal(pickI18n('base', { zh: '前缀中文' }, 'zh-CN'), '前缀中文', '无精确命中时按语言前缀')
  assert.equal(pickI18n('base', { en: 'english' }, 'zh-CN'), 'base', '前缀不匹配回退 base')
  assert.equal(pickI18n('base', {}, 'en'), 'base')
  assert.equal(pickI18n('base', null, 'en'), 'base')
  assert.equal(pickI18n('', { en: '' }, 'en'), '')
  assert.equal(pickI18n('base', { en: '  ' }, 'en'), 'base', '空白值不算命中')
})

test('httpsUrl：只放行 https 外链', () => {
  const { httpsUrl } = testApi()
  assert.equal(httpsUrl('https://example.com'), 'https://example.com')
  assert.equal(httpsUrl('HTTPS://example.com'), 'HTTPS://example.com', '协议大小写不敏感')
  assert.equal(httpsUrl('http://example.com'), '')
  assert.equal(httpsUrl(' https://example.com'), '')
  assert.equal(httpsUrl('javascript:alert(1)'), '')
  assert.equal(httpsUrl(''), '')
  assert.equal(httpsUrl(undefined), '')
  assert.equal(httpsUrl(123), '')
})

test('iconSrc：https / 同源 icon 路由 / 受限 data raster，其余拒绝', () => {
  const { iconSrc } = testApi()
  assert.equal(iconSrc({ kind: 'http', url: 'https://cdn.example.com/i.png' }), 'https://cdn.example.com/i.png')
  assert.equal(iconSrc({ kind: 'http', url: 'http://cdn.example.com/i.png' }), '')
  assert.equal(iconSrc({ kind: 'route', url: '/agent-plugin/api/icon/abc.png' }), '/agent-plugin/api/icon/abc.png')
  assert.equal(iconSrc({ kind: 'route', url: '/etc/passwd' }), '')
  for (const mime of ['png', 'jpeg', 'webp', 'gif']) {
    const value = `data:image/${mime};base64,AAAA`
    assert.equal(iconSrc({ kind: 'data', url: value }), value, `应放行 data:image/${mime}`)
  }
  assert.equal(iconSrc({ kind: 'data', url: 'data:image/svg+xml;base64,AAAA' }), '', '拒绝 SVG（可执行脚本）')
  assert.equal(iconSrc({ kind: 'data', url: 'data:text/html;base64,AAAA' }), '')
  assert.equal(iconSrc({ kind: 'none', url: null }), '')
  assert.equal(iconSrc(null), '')
  assert.equal(iconSrc({}), '')
})

test('matchQuery：名称/显示名/描述/分类/作者/关键词/市场名，大小写不敏感', () => {
  const { matchQuery } = testApi()
  const item = {
    key: 'demo@m1',
    name: 'Demo-Plugin',
    display: {
      title: '演示插件',
      description: 'Useful tool for demos',
      category: 'productivity',
      author: { name: 'Acme Studio' },
      keywords: ['alpha', 'beta'],
    },
    market: { id: 'm1', name: 'My Market', title: '我的市场' },
  }
  for (const query of ['', '   ', 'demo', 'DEMO-PLUGIN', '演示', 'useful', 'PRODUCTIVITY', 'acme', 'alpha', 'my market', '我的']) {
    assert.equal(matchQuery(item, query, 'zh'), true, `query "${query}" 应命中`)
  }
  assert.equal(matchQuery(item, 'zzz-not-found', 'zh'), false)
  assert.equal(matchQuery({ name: 'x' }, 'x', 'zh'), true, '缺少 display/market 时按 name 匹配')
})

test('orderMarkets：lastRefreshed 倒序、缺失/非法沉底、同刻按名称', () => {
  const { orderMarkets } = testApi()
  const markets = [
    { id: 'old', title: 'Old', lastRefreshed: '2026-01-01T00:00:00' },
    { id: 'new', title: 'New', lastRefreshed: '2026-03-01T00:00:00' },
    { id: 'missing', title: 'Missing' },
    { id: 'invalid', title: 'Invalid', lastRefreshed: 'not-a-date' },
    { id: 'b', title: 'Bravo', lastRefreshed: '2026-02-01T00:00:00' },
    { id: 'a', title: 'Alpha', lastRefreshed: '2026-02-01T00:00:00' },
  ]
  const before = json(markets.map((market) => market.id))
  const ordered = orderMarkets(markets)
  assert.equal(json(ordered.map((market) => market.id)), json(['new', 'a', 'b', 'old', 'invalid', 'missing']))
  assert.equal(json(markets.map((market) => market.id)), before, '不得原地修改入参')
  assert.equal(json(orderMarkets([])), json([]))
  assert.equal(json(orderMarkets(null)), json([]))
})

test('groupItemsByMarket：按市场分组并排序，未知市场兜底成组', () => {
  const { groupItemsByMarket } = testApi()
  const markets = [
    fakeMarket({ id: 'm-old', title: 'A 市场', lastRefreshed: '2026-01-01T00:00:00' }),
    fakeMarket({ id: 'm-new', title: 'B 市场', lastRefreshed: '2026-02-01T00:00:00' }),
    fakeMarket({ id: 'm-empty', title: 'C 空市场', lastRefreshed: '2026-03-01T00:00:00' }),
  ]
  const items = [
    { key: 'z@old', name: 'zeta', market: { id: 'm-old' } },
    { key: 'a@old', name: 'alpha', market: { id: 'm-old' } },
    { key: 'x@new', name: 'xray', market: { id: 'm-new' } },
    { key: 'orphan@unknown', name: 'orphan', market: { id: 'm-unknown', title: '未知市场' } },
  ]
  const groups = groupItemsByMarket(items, markets)
  assert.equal(
    json(groups.map((group) => ({ id: group.market.id, keys: group.items.map((item) => item.key) }))),
    json([
      { id: 'm-new', keys: ['x@new'] },
      { id: 'm-old', keys: ['a@old', 'z@old'] },
      { id: 'm-unknown', keys: ['orphan@unknown'] },
    ]),
    '市场按刷新时间倒序；空市场不出现；未知市场追加在末尾；组内按显示名排序',
  )
  assert.equal(
    json(groups[2].market),
    json({ id: 'm-unknown', title: '未知市场' }),
    '兜底组沿用条目上携带的市场信息',
  )
  assert.equal(json(groupItemsByMarket([], markets)), json([]))
})

test('updateAvailable：只认 available', () => {
  const { updateAvailable } = testApi()
  assert.equal(updateAvailable({ update: { state: 'available' } }), true)
  assert.equal(updateAvailable({ update: { state: 'unknown' } }), false)
  assert.equal(updateAvailable({ update: { state: 'none' } }), false)
  assert.equal(updateAvailable({ update: null }), false)
  assert.equal(updateAvailable({}), false)
  assert.equal(updateAvailable(null), false)
})

test('displayOf：归一 title/description/author/category/icon 与 i18n 回退', () => {
  const { displayOf } = testApi()
  const entity = {
    name: 'demo-plugin',
    display: {
      title: 'Base Title',
      titleI18n: { 'zh-cn': '中文标题' },
      description: 'Base description',
      descriptionI18n: { en: 'English description' },
      author: 'Acme',
      category: 'productivity',
      homepage: 'https://example.com',
      repository: 'https://github.com/acme/demo',
      license: 'MIT',
      keywords: ['alpha'],
      icon: { kind: 'http', url: 'https://cdn.example.com/i.png' },
    },
  }
  const zh = displayOf(entity, 'zh')
  assert.equal(zh.title, '中文标题', '前缀命中 zh-cn')
  assert.equal(zh.description, 'Base description', 'zh 无命中回退 base')
  assert.equal(json(zh.author), json({ name: 'Acme' }), '字符串作者归一成对象')
  assert.equal(zh.category, 'productivity')
  assert.equal(zh.homepage, 'https://example.com')
  assert.equal(zh.repository, 'https://github.com/acme/demo')
  assert.equal(zh.license, 'MIT')
  assert.equal(json(zh.keywords), json(['alpha']))
  assert.equal(json(zh.icon), json({ kind: 'http', url: 'https://cdn.example.com/i.png' }))

  const en = displayOf(entity, 'en')
  assert.equal(en.title, 'Base Title')
  assert.equal(en.description, 'English description')

  const minimal = displayOf({ name: 'demo-plugin' }, 'en')
  assert.equal(minimal.title, 'Demo Plugin', 'title 缺失时 canonicalTitle(name)')
  assert.equal(minimal.description, '')
  assert.equal(minimal.author, null)
  assert.equal(minimal.category, '')
  assert.equal(json(minimal.icon), json({ kind: 'none', url: null, mime: null }), 'icon 缺省 none')
  assert.equal(json(minimal.keywords), json([]))

  const objectAuthor = displayOf({ name: 'x', display: { author: { name: 'Team', url: 'https://x' } } }, 'en')
  assert.equal(json(objectAuthor.author), json({ name: 'Team', url: 'https://x' }), '对象作者原样透传')
})

/* -------------------------------------------------------------------------- *
 * 4. UI store 行为
 * -------------------------------------------------------------------------- */

test('store.load：GET /agent-plugin/api/store 成功后 snapshot 就绪', async () => {
  const { createStore } = testApi()
  const { sandbox } = client()
  const payload = { markets: [], items: [], installed: [] }
  const calls = stubFetch(sandbox, () => successResponse(payload))
  const store = createStore(makeT(), () => 'zh')

  assert.equal(store.state.status, 'loading')
  await store.load()

  assert.equal(calls.length, 1)
  assert.equal(calls[0].url, '/agent-plugin/api/store')
  assert.equal(calls[0].init.method, 'GET')
  assert.equal(calls[0].init.cache, 'no-store')
  assert.equal(json(store.state.snapshot), json(payload), 'snapshot 应为服务端 data')
  assert.equal(store.state.status, 'ready')
  assert.equal(store.state.error, '')
  assert.equal(store.started, false, 'load 不应隐式置 started（init 才置）')
})

test('store.load：业务信封 {ok:false,error} 时 error 取 error 字段', async () => {
  const { createStore } = testApi()
  const { sandbox } = client()
  stubFetch(sandbox, () => errorResponse('x', 400))
  const store = createStore(makeT(), () => 'zh')
  await store.load()
  assert.equal(store.state.status, 'error')
  assert.equal(store.state.error, 'x')
})

test('store.load：非 2xx 且无 error 字段时错误包含 HTTP 状态', async () => {
  const { createStore } = testApi()
  const { sandbox } = client()
  sandbox.fetch = async () => ({ ok: false, status: 503, json: async () => ({ ok: false }) })
  const store = createStore(makeT(), () => 'zh')
  await store.load()
  assert.equal(store.state.status, 'error')
  assert.equal(store.state.error, 'HTTP 503')
})

test('store.load：已有快照时失败保留列表并记录错误（降级不空白）', async () => {
  const { createStore } = testApi()
  const { sandbox } = client()
  const store = createStore(makeT(), () => 'zh')
  const previous = { markets: [], items: [], installed: [] }
  store.set({ snapshot: previous, status: 'ready' })
  stubFetch(sandbox, () => errorResponse('network down', 500))
  await store.load()
  assert.equal(store.state.status, 'ready')
  assert.equal(store.state.error, 'network down')
  assert.equal(json(store.state.snapshot), json(previous))
})

test('store.toast / dismissToast：追加一条并可移除', () => {
  const { createStore } = testApi()
  const store = createStore(makeT(), () => 'zh')
  store.toast('success', 'm')
  assert.equal(store.state.toasts.length, 1)
  assert.equal(store.state.toasts[0].kind, 'success')
  assert.equal(store.state.toasts[0].message, 'm')
  assert.equal(typeof store.state.toasts[0].id, 'number')
  store.dismissToast(store.state.toasts[0].id)
  assert.equal(store.state.toasts.length, 0)
  store.toast('warn', '')
  assert.equal(store.state.toasts.length, 0, '空消息不产生 toast')
})

test('store.dialog：add-source / sources / confirm 三类弹窗的打开与关闭', () => {
  const { createStore } = testApi()
  const store = createStore(makeT(), () => 'zh')
  store.openAddSource()
  store.openSources()
  const confirmId = store.openConfirm({ title: 'T', message: 'M' })
  assert.equal(json(store.state.dialogs.map((dialog) => dialog.kind)), json(['add-source', 'sources', 'confirm']))
  assert.equal(typeof confirmId, 'string')
  const confirm = store.state.dialogs.find((dialog) => dialog.kind === 'confirm')
  assert.equal(confirm.title, 'T')
  assert.equal(confirm.message, 'M')

  store.closeDialog(store.state.dialogs[0].id)
  assert.equal(json(store.state.dialogs.map((dialog) => dialog.kind)), json(['sources', 'confirm']))
  store.closeDialog()
  assert.equal(store.state.dialogs.length, 0, '无参数 closeDialog 清空全部')
})

test('store.busy：setBusy 设置/清除按插件的忙碌标签', () => {
  const { createStore } = testApi()
  const store = createStore(makeT(), () => 'zh')
  store.setBusy('k', 'install')
  assert.equal(store.state.busy.k, 'install')
  store.setBusy('k', '')
  assert.equal(store.state.busy.k, undefined)
  assert.equal(json(store.state.busy), json({}))
})

test('store.enqueue：任务串行执行，后一个能看到前一个已完成', async () => {
  const { createStore } = testApi()
  const store = createStore(makeT(), () => 'zh')
  const order = []
  const first = store.enqueue(async () => {
    await new Promise((resolve) => setTimeout(resolve, 5))
    order.push('first')
    store.setBusy('first', 'done')
  })
  const second = store.enqueue(async () => {
    order.push('second')
    order.push(store.state.busy.first === 'done' ? 'saw-first' : 'missed-first')
  })
  await Promise.all([first, second])
  assert.equal(json(order), json(['first', 'second', 'saw-first']))
})

test('store.enqueue：任务抛错转成 error toast，不中断队列', async () => {
  const { createStore } = testApi()
  const store = createStore(makeT(), () => 'zh')
  await store.enqueue(async () => {
    throw new Error('boom')
  })
  assert.equal(store.state.toasts.length, 1)
  assert.equal(store.state.toasts[0].kind, 'error')
  assert.equal(store.state.toasts[0].message, 'boom')

  let ranAfter = false
  await store.enqueue(async () => {
    ranAfter = true
  })
  assert.equal(ranAfter, true, '前一个任务抛错后队列仍继续')
})

/* -------------------------------------------------------------------------- *
 * 5. 组件冒烟（React 替身只记录 createElement，不做真实渲染）
 * -------------------------------------------------------------------------- */

test('components.StoreView：有市场/条目时渲染顶栏、分段、搜索与卡片分组', () => {
  const api = testApi()
  const store = api.createStore(makeT(), () => 'zh')
  store.set({ snapshot: fakeSnapshot(), status: 'ready' })
  const element = api.components.StoreView({ store, t: makeT(), localeId: 'zh' })
  assert.ok(element, 'StoreView 应返回元素')
  assert.equal(element.type, 'div')
  assert.equal(element.args[1].className, 'aph-page')
  const tree = json(element)
  assert.ok(tree.includes('aph-topbar'), '应渲染顶栏')
  assert.ok(tree.includes('aph-toolbar'), '应渲染分段/搜索行')
  assert.ok(tree.includes('aph-grid'), '应渲染卡片栅格')
  assert.ok(tree.includes('市场一'), '应渲染市场分组标题')
  assert.ok(tree.includes('Alpha'), '应渲染条目卡片')
})

test('components.StoreView：搜索态、空态与错误条分支', () => {
  const api = testApi()
  const store = api.createStore(makeT(), () => 'zh')
  // 用两个市场区分「分组态」与「搜索态」：分组态每个市场一个 section head，搜索态只有一个结果区。
  const snapshot = fakeSnapshot()
  const secondMarket = fakeMarket({ id: 'm2', title: '市场二', lastRefreshed: '2026-02-01T00:00:00' })
  snapshot.markets.push(secondMarket)
  snapshot.items.push({
    key: 'gamma@m2',
    name: 'gamma',
    market: secondMarket,
    display: { title: 'Gamma', description: 'Gamma plugin' },
    installable: true,
  })

  store.set({ snapshot, status: 'ready', query: '' })
  const grouped = json(api.components.StoreView({ store, t: makeT(), localeId: 'zh' }))
  assert.equal(grouped.split('aph-section-head').length - 1, 2, '分组态每个市场一个区头')
  assert.ok(grouped.includes('市场二'))

  store.set({ query: 'alpha' })
  const searching = json(api.components.StoreView({ store, t: makeT(), localeId: 'zh' }))
  assert.ok(searching.includes('searchResults'), '搜索态应渲染结果区标题')
  assert.ok(searching.includes('Alpha'))
  assert.equal(searching.split('aph-section-head').length - 1, 1, '搜索态只渲染一个结果区，不再渲染市场分组')

  store.set({ query: 'zzz' })
  const empty = json(api.components.StoreView({ store, t: makeT(), localeId: 'zh' }))
  assert.ok(empty.includes('searchEmpty'))

  store.set({ snapshot: { markets: [], items: [], installed: [] }, query: '', error: 'boom' })
  const errorTree = json(api.components.StoreView({ store, t: makeT(), localeId: 'zh' }))
  assert.ok(errorTree.includes('aph-error'))
  assert.ok(errorTree.includes('boom'))
  assert.ok(errorTree.includes('personalEmpty'), '无市场时显示个人来源空态')
})

test('components.ManageView：已安装行、状态筛选与全部更新入口', () => {
  const api = testApi()
  const store = api.createStore(makeT(), () => 'zh')
  store.set({ snapshot: fakeSnapshot(), status: 'ready' })
  const element = api.components.ManageView({ store, t: makeT(), localeId: 'zh' })
  assert.ok(element)
  assert.equal(element.args[1].className, 'aph-page')
  const tree = json(element)
  assert.ok(tree.includes('installedGroup'), '应渲染「已安装」分组标题')
  assert.ok(tree.includes('updateAll'), '存在可更新条目时应渲染「全部更新（N）」')
  assert.ok(tree.includes('filterAll') && tree.includes('filterEnabled') && tree.includes('filterDisabled'), '应渲染三档筛选')
  assert.ok(tree.includes('aph-grid single'), '管理行应为单列栅格')
  assert.ok(tree.includes('Beta'), '应渲染已安装条目')
  assert.ok(tree.includes('enabledCount'), '页脚应渲染统计')
})

test('components.DetailView：ready 态渲染头部、组件分区、信息区与高级折叠', () => {
  const api = testApi()
  const store = api.createStore(makeT(), () => 'zh')
  store.set({
    snapshot: fakeSnapshot(),
    status: 'ready',
    view: 'detail',
    detailKey: 'beta@m1',
    detail: fakeDetail(),
    detailStatus: 'ready',
  })
  const element = api.components.DetailView({ store, t: makeT(), localeId: 'zh' })
  assert.ok(element)
  const tree = json(element)
  assert.ok(tree.includes('aph-detail'), '详情页根节点带 aph-detail')
  assert.ok(tree.includes('aph-detail-head'), '应渲染 64px 图标头部')
  assert.ok(tree.includes('sectionMcp') && tree.includes('sectionSkills'), '应渲染组件分区')
  assert.ok(tree.includes('infoTitle'), '应渲染信息区')
  assert.ok(tree.includes('moreDetails'), '应渲染高级折叠')
  assert.equal(tree.includes('sourceMissing'), false, '非孤儿条目不应误报来源缺失')
})

test('components.DetailView：loading 与 error 降级分支', () => {
  const api = testApi()
  const store = api.createStore(makeT(), () => 'zh')
  store.set({
    snapshot: fakeSnapshot(),
    status: 'ready',
    view: 'detail',
    detailKey: 'beta@m1',
    detail: null,
    detailStatus: 'loading',
  })
  const loading = json(api.components.DetailView({ store, t: makeT(), localeId: 'zh' }))
  assert.ok(loading.includes('componentsLoading'), '加载态显示组件加载提示')

  store.set({ detail: fakeDetail(), detailStatus: 'error' })
  const failed = json(api.components.DetailView({ store, t: makeT(), localeId: 'zh' }))
  assert.ok(failed.includes('componentsError'), '错误态显示诚实降级提示')
  assert.ok(failed.includes('componentsRetry'), '错误态提供重试入口')
})

test('components.OverlayHost：只渲染栈顶弹窗（避免重影）+ toast', () => {
  const api = testApi()
  const store = api.createStore(makeT(), () => 'zh')
  store.set({
    dialogs: [
      { id: 'dialog-1', kind: 'add-source' },
      { id: 'dialog-2', kind: 'sources' },
      {
        id: 'dialog-3',
        kind: 'confirm',
        title: 'T',
        message: 'M',
        confirmLabel: 'OK',
        danger: true,
        onConfirm: async () => {},
      },
    ],
    toasts: [{ id: 1, kind: 'success', message: 'done' }],
  })
  const locale = { subscribe: () => () => {} }
  const element = api.components.OverlayHost({ store, t: makeT(), locale })
  assert.ok(element)
  assert.equal(element.args[1].className, 'aph-overlay-root')
  const topDialog = element.args[2]
  assert.ok(!Array.isArray(topDialog), '同一时刻只应渲染一个弹窗（避免叠影）')
  assert.ok(json(topDialog).includes('"kind":"confirm"'), '应渲染栈顶 confirm 弹窗')
  assert.ok(element.args[3], '应组装 toast 容器')
  store.closeDialog('dialog-3')
  const afterConfirm = api.components.OverlayHost({ store, t: makeT(), locale })
  assert.ok(json(afterConfirm.args[2]).includes('"kind":"sources"'), '关闭栈顶后应回落到 sources 弹窗')
  store.closeDialog('dialog-2')
  const afterSources = api.components.OverlayHost({ store, t: makeT(), locale })
  assert.ok(json(afterSources.args[2]).includes('"kind":"add-source"'), '再关闭后应回落到 add-source 弹窗')
  assert.equal(api.components.OverlayHost({ store: api.createStore(makeT(), () => 'zh'), t: makeT(), locale: null }), null, '无弹窗/toast 时返回 null')
})

test('components.Panel：就绪快照下按当前 view 分发并返回 aph-root', () => {
  const api = testApi()
  const store = api.createStore(makeT(), () => 'zh')
  store.set({ snapshot: fakeSnapshot(), status: 'ready', view: 'store' })
  const locale = { subscribe: () => () => {} }
  const storeView = api.components.Panel({ store, t: makeT(), locale, getLocaleId: () => 'zh' })
  assert.ok(storeView)
  assert.equal(storeView.args[1].className, 'aph-root')
  const body = storeView.args[2]
  assert.equal(body.args[3].type, api.components.StoreView, 'store 视图应分发到 StoreView')

  store.set({ view: 'manage' })
  const manageView = api.components.Panel({ store, t: makeT(), locale, getLocaleId: () => 'zh' })
  assert.equal(manageView.args[2].args[3].type, api.components.ManageView, 'manage 视图应分发到 ManageView')

  store.set({ view: 'detail', detailKey: 'beta@m1', detail: null, detailStatus: 'loading' })
  const detailView = api.components.Panel({ store, t: makeT(), locale, getLocaleId: () => 'zh' })
  assert.equal(detailView.args[2].args[3].type, api.components.DetailView, 'detail 视图应分发到 DetailView')

  store.set({ snapshot: null, status: 'error', error: 'api down' })
  const unavailable = json(api.components.Panel({ store, t: makeT(), locale, getLocaleId: () => 'zh' }))
  assert.ok(unavailable.includes('apiUnavailable'), '无快照时渲染 API 不可用占位')
})

test('components.StoreCard：未安装显示安装胶囊，已安装显示更新/菜单/开关', () => {
  const api = testApi()
  const store = api.createStore(makeT(), () => 'zh')
  const ctx = { store, t: makeT(), localeId: 'zh', openDetail() {} }
  const snapshot = fakeSnapshot()

  const collect = (element) => {
    const nodes = []
    walkElements(element, (node) => nodes.push(node))
    return nodes
  }
  // Switch 是组件元素：args[1] 是 props（带 checked/onChange；role="switch" 在组件内部才出现）。
  const isSwitch = (node) => Boolean(
    node.args[1] && node.args[1].checked !== undefined && typeof node.args[1].onChange === 'function',
  )

  const uninstalled = api.components.StoreCard({ item: snapshot.items[0], ctx, management: false })
  assert.ok(uninstalled)
  assert.equal(uninstalled.args[1].className, 'aph-card')
  const uninstalledNodes = collect(uninstalled)
  assert.equal(uninstalledNodes.some(isSwitch), false, '未安装卡片不渲染启停开关')
  assert.equal(json(uninstalled).includes('updateBadge'), false, '未安装卡片不渲染可更新角标')
  assert.ok(json(uninstalled).includes('"install"'), '未安装卡片应渲染安装按钮')

  const installedItem = Object.assign({}, snapshot.installed[0], { installed: true, installable: true })
  const installed = api.components.StoreCard({ item: installedItem, ctx, management: true })
  const installedNodes = collect(installed)
  const switches = installedNodes.filter(isSwitch)
  assert.equal(switches.length, 1, '已安装应渲染一个启停开关')
  assert.equal(switches[0].args[1].checked, true, '开关状态来自 installedEnabled')
  assert.equal(typeof switches[0].args[1].label, 'string')
  const menu = installedNodes.find((node) => node.args[1] && Array.isArray(node.args[1].items))
  assert.ok(menu, '已安装应渲染更多菜单')
  const menuLabels = json(menu.args[1].items.map((entry) => entry.label))
  assert.ok(menuLabels.includes('menuUninstall'), '已安装菜单应含卸载项')
  assert.ok(menuLabels.includes('menuDisable') || menuLabels.includes('menuEnable'), '已安装菜单应含启停项')
  assert.ok(json(installed).includes('updateBadge'), '已安装且可更新应渲染可更新角标')
  assert.ok(json(installed).includes('version 1.2.0'), '管理行第二行应显示版本')
})

/* -------------------------------------------------------------------------- *
 * 5. 本轮回归：错误文案按 code 本地化、详情兜底安装、管理页状态、竞态守卫
 * -------------------------------------------------------------------------- */

test('errorMessageFor：按 code 本地化，未映射 code / 无 code 回退原文', () => {
  const { errorMessageFor } = testApi()
  const t = (key) => ({
    errorNotFound: '目标不存在',
    operationBusy: '另一个操作正在进行，请稍后重试。',
    errorGit: 'Git 操作失败',
  }[key] ?? key)
  assert.equal(errorMessageFor({ code: 'not_found', message: '市场 m 里没有插件 x' }, t), '目标不存在')
  assert.equal(errorMessageFor({ code: 'operation_in_progress', message: 'x' }, t), '另一个操作正在进行，请稍后重试。')
  assert.equal(errorMessageFor({ code: 'git_error', message: 'git clone 失败' }, t), 'Git 操作失败')
  assert.equal(errorMessageFor({ code: 'bad_request', message: '请提供插件名' }, t), '请提供插件名', 'bad_request 未映射，保留原文细节')
  assert.equal(errorMessageFor({ message: 'no code here' }, t), 'no code here')
  assert.equal(errorMessageFor('plain string', t), 'plain string')
  assert.equal(errorMessageFor({ code: 'not_found', message: 'x' }, null), 'x', 't 缺失时回退原文')
})

test('store.load：请求期间置 loading，结束后清除（管理页刷新指示）', async () => {
  const { createStore } = testApi()
  const { sandbox } = client()
  let resolveFetch
  sandbox.fetch = () => new Promise((resolve) => {
    resolveFetch = resolve
  })
  const store = createStore(makeT(), () => 'zh')
  const pending = store.load()
  assert.equal(store.state.loading, true)
  resolveFetch(successResponse({ markets: [], items: [], installed: [] }))
  await pending
  assert.equal(store.state.loading, false)
})

test('store.loadDetail：陈旧响应不得覆盖已切换详情（force 也不置 ready）', async () => {
  const { createStore } = testApi()
  const { sandbox } = client()
  let resolveFetch
  sandbox.fetch = () => new Promise((resolve) => {
    resolveFetch = resolve
  })
  const store = createStore(makeT(), () => 'zh')
  store.set({
    snapshot: fakeSnapshot(),
    status: 'ready',
    view: 'detail',
    detailKey: 'beta@m1',
    detail: null,
    detailStatus: 'loading',
  })
  const stale = store.loadDetail(true)
  // 用户在请求返回前切到另一插件：新详情进入 loading
  store.set({ detailKey: 'alpha@m1', detail: null, detailStatus: 'loading' })
  resolveFetch(successResponse(fakeDetail()))
  await stale
  assert.equal(store.state.detailStatus, 'loading', '陈旧响应不得把新详情置为 ready')
  assert.equal(json(store.state.detail), json(null))
})

test('components.ManageView：state.error 渲染错误条（与商店页一致）', () => {
  const api = testApi()
  const store = api.createStore(makeT(), () => 'zh')
  store.set({ snapshot: fakeSnapshot(), status: 'ready', error: 'boom' })
  const tree = json(api.components.ManageView({ store, t: makeT(), localeId: 'zh' }))
  assert.ok(tree.includes('aph-error'), '管理页也应渲染错误条')
})

test('components.DetailView：错误态区分「联网获取」（未安装条目）与「重试」（已安装）', () => {
  const api = testApi()
  const store = api.createStore(makeT(), () => 'zh')
  store.set({
    snapshot: fakeSnapshot(),
    status: 'ready',
    view: 'detail',
    detailKey: 'alpha@m1',
    detail: null,
    detailStatus: 'error',
  })
  const fetchable = json(api.components.DetailView({ store, t: makeT(), localeId: 'zh' }))
  assert.ok(fetchable.includes('fetchDetailHint'), '未安装条目错误态提示可联网获取')
  assert.ok(fetchable.includes('fetchDetail'), '未安装条目错误态按钮为联网获取')

  store.set({ detailKey: 'beta@m1' })
  const installedFailed = json(api.components.DetailView({ store, t: makeT(), localeId: 'zh' }))
  assert.ok(installedFailed.includes('componentsError'), '已安装条目错误态保持原提示')
  assert.ok(installedFailed.includes('componentsRetry'), '已安装条目错误态保持重试按钮')
})

test('components.DetailView：MCP 运行时徽标按 runtime.mcp.available 渲染', () => {
  const api = testApi()
  const store = api.createStore(makeT(), () => 'zh')
  store.set({
    snapshot: fakeSnapshot(),
    status: 'ready',
    view: 'detail',
    detailKey: 'beta@m1',
    detail: fakeDetail(),
    detailStatus: 'ready',
  })
  const unavailable = json(api.components.DetailView({ store, t: makeT(), localeId: 'zh' }))
  assert.ok(unavailable.includes('runtimeNotEffective'), 'mcp 不可用时显示未生效')

  store.set({ snapshot: Object.assign({}, fakeSnapshot(), { runtime: Object.assign({}, fakeSnapshot().runtime, { mcp: { available: true } }) }) })
  const available = json(api.components.DetailView({ store, t: makeT(), localeId: 'zh' }))
  assert.ok(available.includes('runtimeEffective'), 'mcp 可用时显示就绪')
})

test('DetailView：安装按钮不再把展示标题当插件名兜底', () => {
  const source = readFileSync(path.join(PACKAGE_DIR, 'client.js'), 'utf8').replace(/\r\n/gu, '\n')
  assert.equal(
    source.includes("store.install(catalogItem || { key, name: title, market })"),
    false,
    '不应再用展示标题兜底安装',
  )
  assert.ok(source.includes('onClick: () => store.install(catalogItem)'), '安装按钮必须传市场条目')
})

test('图标：search/info/anchor 圆环用描边 circle（lucide 形态），more 保持实心圆点', () => {
  const source = readFileSync(path.join(PACKAGE_DIR, 'client.js'), 'utf8').replace(/\r\n/gu, '\n')
  assert.ok(source.includes('search: [{ circle: [11, 11, 8] }'), '搜索放大镜应为描边圆环')
  assert.ok(source.includes('info: [{ circle: [12, 12, 10] }'), 'info 圆环应为描边')
  assert.ok(source.includes('anchor: [{ circle: [12, 5, 3] }'), 'anchor 圆环应为描边')
  assert.ok(source.includes('more: [[5, 12, 1.4]'), 'more 省略号应为实心圆点')
})

test('Avatar：缺图降级为中性 Blocks 图标，不再用首字母兜底', () => {
  const source = readFileSync(path.join(PACKAGE_DIR, 'client.js'), 'utf8').replace(/\r\n/gu, '\n')
  assert.equal(source.includes('slice(0, 1).toUpperCase()'), false, '不应再用首字母兜底')
  assert.ok(source.includes("h(Icon, { name: 'blocks', size: large ? 24 : 16 })"), '缺图降级为 Blocks 图标')
})