/**
 * Persisted pairing state specs: the token survives restarts, the enabled
 * intent rides beside it, and a legacy token-only file migrates in place
 * without losing either value.
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { loadEnabled, loadOrCreateToken, saveEnabled } from '../src/auth.ts'

const homes: string[] = []

function tempHome(): string {
  const home = mkdtempSync(join(os.tmpdir(), 'dsh-remote-ctrl-'))
  homes.push(home)
  return home
}

afterEach(() => {
  while (homes.length > 0) {
    const home = homes.pop()
    if (home !== undefined) rmSync(home, { recursive: true, force: true })
  }
})

describe('pairing state', () => {
  it('mints and reuses a token, and defaults to enabled', () => {
    const home = tempHome()
    const token = loadOrCreateToken(home, '')
    expect(token).not.toBe('')
    expect(loadOrCreateToken(home, '')).toBe(token)
    expect(loadEnabled(home)).toBe(true)
  })

  it('persists the enabled intent without losing the token', () => {
    const home = tempHome()
    const token = loadOrCreateToken(home, '')
    saveEnabled(home, token, false)
    expect(loadEnabled(home)).toBe(false)
    expect(loadOrCreateToken(home, '')).toBe(token)
    const stored = JSON.parse(readFileSync(join(home, 'remote-ctrl.json'), 'utf8')) as { token?: string, enabled?: boolean }
    expect(stored).toEqual({ version: 1, token, enabled: false })

    saveEnabled(home, token, true)
    expect(loadEnabled(home)).toBe(true)
  })

  it('migrates a legacy token-only file and keeps its enabled intent', () => {
    const home = tempHome()
    writeFileSync(join(home, 'remote-ctrl.json'), JSON.stringify({ token: 'legacy-token' }), 'utf8')
    expect(loadOrCreateToken(home, '')).toBe('legacy-token')
    expect(loadEnabled(home)).toBe(true)
    const migrated = JSON.parse(readFileSync(join(home, 'remote-ctrl.json'), 'utf8')) as { version?: number, token?: string }
    expect(migrated).toEqual({ version: 1, token: 'legacy-token' })
  })

  it('honors an explicitly configured token over the persisted one', () => {
    const home = tempHome()
    loadOrCreateToken(home, '')
    expect(loadOrCreateToken(home, 'configured')).toBe('configured')
  })
})