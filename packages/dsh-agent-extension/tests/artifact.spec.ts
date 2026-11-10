/**
 * Built-artifact smoke (the legacy client smoke's successor): the committed
 * browser bundle must keep the closure-factory handoff shape — the
 * `window.__ModuleLoader__.load` banner/footer/intro, react resolved through
 * the injected require, and the `data-plugin-css` style injection. The host
 * half must stay an ESM module without the banner. Line endings normalize
 * (autocrlf checkouts).
 */
import { readFileSync } from 'node:fs'
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
  it('wraps the browser half in the ModuleLoader factory handoff', () => {
    expect(flat(client)).toContain('window.__ModuleLoader__.load({ id: "dsh-agent-extension", factory: (require) => {')
    expect(flat(client.trimEnd())).toContain('return module.exports; } });')
    expect(client).toContain('var module = { exports: {} }')
  })

  it('answers react through the loader require and inlines everything else', () => {
    expect(client).toContain('require("react")')
    // ADR-0008 受控例外：只允许宿主 primitives（MarkdownText 可选加载），其它 @deepseek-ai 值导入仍禁止。
    expect(client).toContain('require("@deepseek-ai/dsh-client-ui-primitives")')
    expect(client).not.toMatch(/require\("@deepseek-ai\/(?!dsh-client-ui-primitives")/u)
    expect(client).not.toMatch(/require\("node:[a-z]+"?\)/u)
    expect(client).not.toContain('require("fs")')
  })

  it('injects each compiled stylesheet once through data-plugin-css tags', () => {
    expect(client).toContain('data-plugin-css')
    expect(client).toContain('tag.dataset.plugin = "dsh-agent-extension"')
    expect(client).toMatch(/const css = "\.[A-Za-z0-9_-]+\{/) // minified hashed sheet
  })

  it('keeps the host half a plain ESM library', () => {
    expect(index).toContain('export')
    expect(index).not.toContain('__ModuleLoader__')
    // Bundling turns single-assignment classes into anonymous class expressions; names survive as identifiers.
    expect(index).toContain('HubStore')
    expect(index).toContain('AgentPluginHub')
    expect(index).toContain('function apply(')
  })

  it('carries the sourcemap reference for the browser half', () => {
    expect(client).toContain('sourceMappingURL=client.js.map')
  })
})
