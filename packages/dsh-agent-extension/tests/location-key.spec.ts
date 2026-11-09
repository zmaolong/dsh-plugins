/** Canonical market location key: equivalent spellings of one source collapse to one key. */
import { describe, expect, it } from 'vitest'

import { marketLocationKey } from '../src/location-key.ts'

describe('marketLocationKey', () => {
  it('collapses github repo spellings (bare / .git / tree / raw / scp / case) to one key', () => {
    const wanted = 'git:github.com/anthropics/claude-plugins-official'
    expect(marketLocationKey('https://github.com/anthropics/claude-plugins-official')).toBe(wanted)
    expect(marketLocationKey('https://github.com/anthropics/claude-plugins-official.git')).toBe(wanted)
    expect(marketLocationKey('https://github.com/anthropics/claude-plugins-official/tree/main')).toBe(wanted)
    expect(marketLocationKey('https://raw.githubusercontent.com/anthropics/claude-plugins-official/HEAD/.claude-plugin/marketplace.json')).toBe(wanted)
    expect(marketLocationKey('git@github.com:anthropics/claude-plugins-official.git')).toBe(wanted)
    expect(marketLocationKey('https://GitHub.com/Anthropics/Claude-Plugins-Official/')).toBe(wanted)
  })

  it('keeps other hosts and non-repo github urls distinct', () => {
    expect(marketLocationKey('https://example.com/market.json')).toBe('url:example.com/market.json')
    expect(marketLocationKey('https://gitlab.com/a/b.git')).toBe('url:gitlab.com/a/b.git')
    expect(marketLocationKey('https://github.com/anthropics')).toBe('url:github.com/anthropics')
  })

  it('normalizes windows paths case-insensitively and posix paths case-sensitively', () => {
    expect(marketLocationKey('C:\\Foo\\Bar\\')).toBe('local:c:/foo/bar')
    expect(marketLocationKey('c:/foo/bar')).toBe('local:c:/foo/bar')
    expect(marketLocationKey('/tmp/Market')).toBe('local:/tmp/Market')
  })

  it('returns empty for empty input', () => {
    expect(marketLocationKey('')).toBe('')
    expect(marketLocationKey('   ')).toBe('')
    expect(marketLocationKey(undefined)).toBe('')
  })
})
