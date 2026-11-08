/**
 * Built-artifact smoke: the committed browser panel bundle must keep the
 * closure-factory handoff shape; the host half must stay an ESM module
 * without the banner and carry the gateway/proxy implementation. Line
 * endings normalize (autocrlf checkouts).
 */
import { readFileSync } from 'node:fs'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const LIB = join(dirname(fileURLToPath(import.meta.url)), '..', 'lib')

function normalize(text: string): string {
  return text.replace(/\r\n/gu, '\n')
}

/** Whitespace-insensitive view for banner/footer assertions (rolldown pretty-prints them). */
function flat(text: string): string {
  return text.replace(/\s+/gu, ' ')
}

const client = normalize(readFileSync(join(LIB, 'client.js'), 'utf8'))
const index = normalize(readFileSync(join(LIB, 'index.js'), 'utf8'))

describe('built artifacts', () => {
  it('wraps the desktop panel in the ModuleLoader factory handoff', () => {
    expect(flat(client)).toContain('window.__ModuleLoader__.load({ id: "dsh-remote-ctrl", factory: (require) => {')
    expect(flat(client.trimEnd())).toContain('return module.exports; } });')
    expect(client).toContain('var module = { exports: {} }')
  })

  it('answers react through the loader require and inlines everything else', () => {
    expect(client).toContain('require("react")')
    expect(client).not.toContain('require("@deepseek-ai/')
    expect(client).not.toMatch(/require\("node:[a-z]+"?\)/u)
    expect(client).not.toContain('require("fs")')
  })

  it('injects each compiled stylesheet once through data-plugin-css tags', () => {
    expect(client).toContain('data-plugin-css')
    expect(client).toContain('tag.dataset.plugin = "dsh-remote-ctrl"')
    expect(client).toMatch(/const css = "\.[A-Za-z0-9_-]+\{/) // minified hashed sheet
  })

  it('carries the sourcemap reference for the panel half', () => {
    expect(client).toContain('sourceMappingURL=client.js.map')
  })

  it('keeps the host half a plain ESM library carrying the gateway', () => {
    expect(index).toContain('export')
    expect(index).not.toContain('__ModuleLoader__')
    expect(index).toContain('function apply(')
    expect(index).toContain('RemoteCtrl')
    expect(index).toContain('RcServer')
    expect(index).toContain('局域网网关已监听')
    expect(index).toContain('authenticatedUrl')
    // 自研手机页已删除：不再有独立移动端产物
    expect(existsSync(join(LIB, 'mobile.js'))).toBe(false)
  })
})
