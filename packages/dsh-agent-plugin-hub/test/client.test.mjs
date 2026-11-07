/**
 * Client 模块的装配测试：在没有浏览器的 Node 环境里加载 client.js，
 * 验证模块 id、左侧栏入口 / 主面板注册、图标与页面组件、locale 字典注册。
 */

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import vm from 'node:vm'
import { fileURLToPath } from 'node:url'

const PACKAGE_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

/** 最小 React 替身：组件只做定义，测试不真正渲染。 */
function createReactStub() {
  return {
    createElement(...args) {
      return { args }
    },
    cloneElement(element, props) {
      return { ...element, props }
    },
    useState(initial) {
      return [initial, () => {}]
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

test('client.js：注册左侧栏入口与主面板、locale 字典', () => {
  const source = readFileSync(path.join(PACKAGE_DIR, 'client.js'), 'utf8')
  const packageJson = JSON.parse(
    readFileSync(path.join(PACKAGE_DIR, 'package.json'), 'utf8').replace(/^\uFEFF/u, ''),
  )
  let loaded = null
  const sandbox = {
    window: {
      __ModuleLoader__: {
        load(definition) {
          loaded = definition
        },
      },
    },
  }
  vm.runInNewContext(source, sandbox, { filename: 'client.js' })
  assert.ok(loaded, '应调用 window.__ModuleLoader__.load')
  assert.equal(loaded.id, packageJson.name, '模块 id 必须等于包名')
  assert.equal(typeof loaded.factory, 'function')

  const react = createReactStub()
  const plugin = loaded.factory((name) => {
    if (name === 'react') return react
    throw new Error(`unexpected require: ${name}`)
  })
  assert.ok(Array.isArray(plugin.inject))
  assert.ok(plugin.inject.includes('slots'))
  assert.equal(typeof plugin.apply, 'function')

  const locales = []
  const registrations = []
  const injectedSlots = []
  const ctx = {
    locale: {
      register(namespace, localeId, dict) {
        locales.push({ namespace, localeId, dict })
      },
      bind() {
        return (key) => `t:${key}`
      },
      subscribe() {
        return () => {}
      },
    },
    slots: {
      inject(key, factory) {
        injectedSlots.push(key)
        factory()
      },
      register(options, component) {
        registrations.push({ options, component })
        return () => {}
      },
    },
  }
  plugin.apply(ctx)

  assert.deepEqual(injectedSlots.sort(), ['main', 'sidebar.panellist'])
  assert.ok(!injectedSlots.includes('settings.plugins.tab'), '不应再注册设置页 Tab')

  const sidebar = registrations.find((item) => item.options.name === 'sidebar.panellist')
  assert.ok(sidebar, '应注册左侧栏入口')
  assert.equal(sidebar.options.id, 'agent-plugin')
  assert.equal(typeof sidebar.options.order, 'number')
  assert.ok(sidebar.options.order < 10, '应排在“自动化任务”(10) 之前')
  const label = sidebar.options.label()
  assert.equal(typeof label, 'string')
  assert.ok(label.length > 0)
  const icon = sidebar.component({ size: 20, active: false })
  assert.ok(icon, '图标组件应可渲染')

  const main = registrations.find((item) => item.options.name === 'main')
  assert.ok(main, '应注册主面板')
  assert.equal(main.options.key, 'agent-plugin')
  const page = main.component({})
  assert.ok(page, '主面板组件应可渲染')

  const localeIds = locales.map((item) => item.localeId).sort()
  assert.deepEqual(localeIds, ['en', 'zh-cn'])
  for (const item of locales) {
    assert.equal(item.namespace, 'agentPluginHub')
    assert.equal(typeof item.dict.tab, 'string')
  }
})