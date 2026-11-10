/**
 * Address encoding of the memory preview file: the plugin restates the host's
 * `dsh-resource://file/session/...` grammar, so these cases pin every rule the
 * host parser depends on.
 */
import { describe, expect, it } from 'vitest'

import { sessionFileAddress } from '../src/client/resource-address.ts'

/** Decode one address the way the host's `parseFileAddress` does. */
function parse(address: string): { sessionId: string, path: string } {
  expect(address.startsWith('dsh-resource://file/session/')).toBe(true)
  const rest = address.slice('dsh-resource://file/session/'.length)
  const separator = rest.indexOf('/')
  const sessionId = decodeURIComponent(rest.slice(0, separator))
  const path = rest.slice(separator + 1).split('/').map(decodeURIComponent).join('/')
  return { sessionId, path }
}

describe('sessionFileAddress', () => {
  it('保留 Windows 盘符冒号并逐段编码', () => {
    const address = sessionFileAddress('sess-1', 'C:\\Users\\me\\AppData\\Local\\Temp\\a.md')
    expect(address).toBe('dsh-resource://file/session/sess-1/C:/Users/me/AppData/Local/Temp/a.md')
    expect(parse(address)).toEqual({ sessionId: 'sess-1', path: 'C:/Users/me/AppData/Local/Temp/a.md' })
  })

  it('编码空格、#、? 与中文', () => {
    const address = sessionFileAddress('s 1', 'C:\\Temp\\记忆 #1?\\文件 a.md')
    expect(address).toContain('session/s%201/')
    expect(address).toContain('%20')
    expect(address).toContain('%23')
    expect(address).toContain('%3F')
    expect(address).toContain('%E8%AE%B0%E5%BF%86')
    expect(parse(address)).toEqual({ sessionId: 's 1', path: 'C:/Temp/记忆 #1?/文件 a.md' })
  })

  it('反斜杠归一为正斜杠并去掉前导 ./', () => {
    expect(sessionFileAddress('s', './src\\a.md')).toBe('dsh-resource://file/session/s/src/a.md')
    expect(sessionFileAddress('s', '././../outside/a.md')).toBe('dsh-resource://file/session/s/../outside/a.md')
  })

  it('POSIX 绝对路径保留空首段', () => {
    expect(sessionFileAddress('s', '/tmp/a.md')).toBe('dsh-resource://file/session/s//tmp/a.md')
    expect(parse(sessionFileAddress('s', '/tmp/a.md'))).toEqual({ sessionId: 's', path: '/tmp/a.md' })
  })
})
