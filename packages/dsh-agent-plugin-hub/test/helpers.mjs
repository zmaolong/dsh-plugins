/**
 * 测试辅助：临时 home、夹具复制、假宿主 ctx。
 *
 * 测试不依赖真实宿主，也不访问网络；唯一的子进程是系统 git（本地仓库）。
 *
 * @module dsh-agent-plugin-hub/test/helpers
 */

import { copyFileSync, mkdirSync, mkdtempSync, readdirSync, rmSync, statSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const TEST_DIR = path.dirname(fileURLToPath(import.meta.url))
export const FIXTURES = path.join(TEST_DIR, 'fixtures')

/** 创建临时 hub home；调用方负责清理（或使用 track 清理钩子）。 */
export function tempHome(prefix = 'hub-test-') {
  const dir = mkdtempSync(path.join(os.tmpdir(), prefix))
  return dir
}

/** 递归复制目录。 */
export function copyDir(source, target) {
  mkdirSync(target, { recursive: true })
  for (const entry of readdirSync(source, { withFileTypes: true })) {
    const src = path.join(source, entry.name)
    const dst = path.join(target, entry.name)
    if (entry.isDirectory()) copyDir(src, dst)
    else if (entry.isFile()) copyFileSync(src, dst)
  }
}

/** 把夹具复制到临时目录，返回副本根路径。 */
export function copyFixture(name, targetParent) {
  const source = path.join(FIXTURES, name)
  if (!statSync(source).isDirectory()) throw new Error(`夹具不存在：${source}`)
  const target = path.join(targetParent, name)
  copyDir(source, target)
  return target
}

/** 注册清理：测试结束删除临时目录。 */
export function cleanup(t, ...dirs) {
  t.after(() => {
    for (const dir of dirs) rmSync(dir, { recursive: true, force: true })
  })
}

/**
 * 假宿主 ctx：
 * - commands：register 会拒绝重名（与宿主一致）
 * - skills：registerProvider 收到 control，provider 可被测试直接调用
 * - on：记录事件监听
 * - get：按 services 返回服务
 */
export function createFakeCtx(services = {}) {
  const state = {
    commands: new Map(),
    providers: [],
    listeners: [],
    invalidations: 0,
    services: {
      tools: {},
      ...services,
    },
  }
  const ctx = {
    state,
    get(name) {
      if (name === 'commands') {
        return {
          register(definition) {
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
          registerProvider(create) {
            const control = { invalidate: () => { state.invalidations += 1 } }
            state.providers.push(create(control))
            return () => {
              state.providers = state.providers.filter((provider) => provider !== state.providers.at(-1))
            }
          },
        }
      }
      return state.services[name]
    },
    on(event, listener) {
      const entry = { event, listener }
      state.listeners.push(entry)
      return () => {
        state.listeners = state.listeners.filter((item) => item !== entry)
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

/** 找到某个宿主事件的监听函数。 */
export function listenerOf(ctx, event) {
  const entries = ctx.state.listeners.filter((item) => item.event === event)
  return entries.map((item) => item.listener)
}

/** 假 hooks 执行器：按需记录调用并返回预设结果。 */
export function createFakeExecutor(handler = () => ({ exitCode: 0, signal: null, stdout: '', stderr: '', timedOut: false })) {
  const calls = []
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