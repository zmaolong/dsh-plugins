/**
 * Test helpers: temp hub home, fixture copies, fake host ctx.
 *
 * Tests never touch a real host and never access the network; the only
 * subprocess is system git (local repositories).
 *
 * @module dsh-agent-extension/tests/helpers
 */

import { copyFileSync, mkdirSync, mkdtempSync, readdirSync, rmSync, statSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const TEST_DIR = path.dirname(fileURLToPath(import.meta.url))
export const FIXTURES = path.join(TEST_DIR, 'fixtures')

/** Create a temp hub home; the caller removes it in an afterEach. */
export function tempHome(prefix = 'hub-test-'): string {
  return mkdtempSync(path.join(os.tmpdir(), prefix))
}

/** Remove directories recursively (afterEach cleanup). */
export function removeDirs(...dirs: string[]): void {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true })
}

/** Recursively copy a directory. */
export function copyDir(source: string, target: string): void {
  mkdirSync(target, { recursive: true })
  for (const entry of readdirSync(source, { withFileTypes: true })) {
    const src = path.join(source, entry.name)
    const dst = path.join(target, entry.name)
    if (entry.isDirectory()) copyDir(src, dst)
    else if (entry.isFile()) copyFileSync(src, dst)
  }
}

/** Copy one fixture into a temp parent; returns the copy's root path. */
export function copyFixture(name: string, targetParent: string): string {
  const source = path.join(FIXTURES, name)
  if (!statSync(source).isDirectory()) throw new Error(`夹具不存在：${source}`)
  const target = path.join(targetParent, name)
  copyDir(source, target)
  return target
}

/** The fake ctx state shape (commands, providers, listeners, services). */
export interface FakeCtxState {
  commands: Map<string, { name: string, [key: string]: unknown }>
  providers: Array<{ name: string, list: (options?: unknown) => Promise<unknown[]>, get: (candidate: unknown, options?: unknown) => Promise<unknown> }>
  listeners: Array<{ event: string, listener: (...args: unknown[]) => unknown }>
  invalidations: number
  services: Record<string, unknown>
}

/** Fake host ctx shape (structural; real host comes from cordis). */
export interface FakeCtx {
  state: FakeCtxState
  get(name: string): unknown
  on(event: string, listener: (...args: unknown[]) => unknown): () => void
  effect(): () => void
  log: { info(): void, warn(): void, error(): void }
  [key: string]: unknown
}

/**
 * Fake host ctx:
 * - commands: register rejects duplicates (host behavior);
 * - skills: registerProvider receives a control; tests call the provider directly;
 * - on: records event listeners;
 * - get: returns services by name.
 */
export function createFakeCtx(services: Record<string, unknown> = {}): FakeCtx {
  const state: FakeCtxState = {
    commands: new Map(),
    providers: [],
    listeners: [],
    invalidations: 0,
    services: {
      tools: {},
      ...services,
    },
  }
  const ctx: FakeCtx = {
    state,
    get(name: string) {
      if (name === 'commands') {
        return {
          register(definition: { name: string, [key: string]: unknown }) {
            if (state.commands.has(definition.name)) {
              throw new Error(`command "${definition.name}" is already registered`)
            }
            state.commands.set(definition.name, definition)
            return () => state.commands.delete(definition.name)
          },
        }
      }
      if (name === 'skills') {
        return {
          registerProvider(create: (control: { invalidate: () => void }) => { name: string, [key: string]: unknown }) {
            const control = { invalidate: () => { state.invalidations += 1 } }
            state.providers.push(create(control) as FakeCtxState['providers'][number])
            return () => {
              state.providers = state.providers.filter(provider => provider !== state.providers.at(-1))
            }
          },
        }
      }
      return state.services[name]
    },
    on(event: string, listener: (...args: unknown[]) => unknown) {
      const entry = { event, listener }
      state.listeners.push(entry)
      return () => {
        state.listeners = state.listeners.filter(item => item !== entry)
      }
    },
    effect() {
      return () => {}
    },
    log: {
      info() {},
      warn() {},
      error() {},
    },
  }
  return ctx
}

/** Find the listeners of one host event. */
export function listenerOf(ctx: FakeCtx, event: string): Array<(...args: unknown[]) => unknown> {
  return ctx.state.listeners.filter(item => item.event === event).map(item => item.listener)
}

/** One fake executor run request. */
export interface FakeExecutorRequest {
  command: string
  cwd: string
  payload: unknown
  timeoutMs: number
}

/** Fake hooks executor: records calls and returns canned results. */
export function createFakeExecutor(
  handler: (request: FakeExecutorRequest) => { exitCode: number | null, signal: unknown, stdout: string, stderr: string, timedOut: boolean }
    = () => ({ exitCode: 0, signal: null, stdout: '', stderr: '', timedOut: false }),
): {
  available: true
  reason: string
  calls: FakeExecutorRequest[]
  run: (request: FakeExecutorRequest) => Promise<{ exitCode: number | null, signal: unknown, stdout: string, stderr: string, timedOut: boolean }>
} {
  const calls: FakeExecutorRequest[] = []
  return {
    available: true,
    reason: '',
    calls,
    async run(request) {
      calls.push(request)
      return handler(request)
    },
  }
}
