/**
 * Client 模块的装配测试：在没有浏览器的 Node 环境里加载 client.js，
 * 验证模块 id、槽位注册、order、label 与 locale 字典注册。
 */

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import vm from 'node:vm'
import { fileURLToPath } from 'node:url'

const PACKAGE_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

/** 最小 React 替身：组件只做定义，测试不渲染。 */
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

test('client.js：注册模块 id / 槽位 / locale 字典', () => {
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
  let slotKey = ''
  let registration = null
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
        slotKey = key
        factory()
      },
      register(options, component) {
        registration = { options, component }
        return () => {}
      },
    },
  }
  plugin.apply(ctx)
  assert.equal(slotKey, 'settings.plugins.tab')
  assert.ok(registration, '应注册 Tab')
  assert.equal(registration.options.name, 'settings.plugins.tab')
  assert.equal(registration.options.id, 'agent-plugin')
  assert.equal(typeof registration.options.order, 'number')
  const label = registration.options.label()
  assert.equal(typeof label, 'string')
  assert.ok(label.length > 0)
  assert.equal(typeof registration.component, 'function')
  const localeIds = locales.map((item) => item.localeId).sort()
  assert.deepEqual(localeIds, ['en', 'zh-cn'])
  for (const item of locales) {
    assert.equal(item.namespace, 'agentPluginHub')
    assert.equal(typeof item.dict.tab, 'string')
  }
})