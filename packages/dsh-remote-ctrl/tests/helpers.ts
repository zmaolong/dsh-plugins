/**
 * Test helpers: temp home, fake host ctx. Tests never touch a real host and
 * never reach the internet (server specs talk to an in-process loopback
 * listener bound to port 0).
 *
 * @module dsh-remote-ctrl/tests/helpers
 */

import { mkdtempSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

/** Create a temp home; the caller removes it in an afterEach. */
export function tempHome(prefix = 'remote-ctrl-test-'): string {
  return mkdtempSync(path.join(os.tmpdir(), prefix))
}

/** Remove directories recursively (afterEach cleanup). */
export function removeDirs(...dirs: string[]): void {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true })
}

/** Recorded fake-ctx state. */
export interface FakeCtxState {
  listeners: Map<string, Array<(...args: unknown[]) => unknown>>
  injects: Array<{ deps: readonly string[], callback: (scope: unknown) => void }>
  services: Record<string, unknown>
}

/** Fake host ctx shape (structural; the real host comes from cordis). */
export interface FakeCtx {
  state: FakeCtxState
  get<T>(name: string): T | undefined
  effect(fn: () => (() => void) | void, label?: string): unknown
  on(event: string, listener: (...args: unknown[]) => unknown): () => void
  inject(deps: readonly string[], callback: (scope: unknown) => void): unknown
  logger: {
    lines: Array<{ level: string, message: string }>
    debug(message: string): void
    info(message: string): void
    warn(message: string): void
    error(message: string): void
  }
}

/** Build a fake host ctx with canned services. */
export function createFakeCtx(services: Record<string, unknown> = {}): FakeCtx {
  const state: FakeCtxState = {
    listeners: new Map(),
    injects: [],
    services,
  }
  return {
    state,
    get: <T,>(name: string): T | undefined => state.services[name] as T | undefined,
    effect: () => undefined,
    on: (event: string, listener: (...args: unknown[]) => unknown) => {
      const bucket = state.listeners.get(event) ?? []
      bucket.push(listener)
      state.listeners.set(event, bucket)
      return () => {
        const current = state.listeners.get(event) ?? []
        const next = current.filter(entry => entry !== listener)
        if (next.length > 0) state.listeners.set(event, next)
        else state.listeners.delete(event)
      }
    },
    inject: (deps: readonly string[], callback: (scope: unknown) => void) => {
      state.injects.push({ deps, callback })
      return undefined
    },
    logger: {
      lines: [],
      debug(message: string) {
        this.lines.push({ level: 'debug', message })
      },
      info(message: string) {
        this.lines.push({ level: 'info', message })
      },
      warn(message: string) {
        this.lines.push({ level: 'warn', message })
      },
      error(message: string) {
        this.lines.push({ level: 'error', message })
      },
    },
  }
}
