/**
 * Controller handoff for "open in system app": the detail dialog never renders
 * body markdown itself; the controller derives a body-only file and hands its
 * path to the Host's native opener. Offline; the Host is a fake.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'

import { createHubController } from '../src/client/store.ts'
import { zh } from '../src/client/locales.ts'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

const t = (key: string, vars?: Record<string, unknown>): string => {
  let copy: string = zh[key as keyof typeof zh] ?? key
  if (vars !== undefined) {
    for (const name of Object.keys(vars)) copy = copy.split(`{${name}}`).join(String(vars[name]))
  }
  return copy
}

function okResponse(data: unknown): Response {
  return new Response(JSON.stringify({ ok: true, data }), { status: 200, headers: { 'content-type': 'application/json' } })
}

async function waitUntil(check: () => boolean, timeoutMs = 3000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (check()) return
    await new Promise<void>((resolve) => { setTimeout(resolve, 10) })
  }
  throw new Error('condition not reached in time')
}

const TARGET = { scope: 'project', project: '/repo/new', id: 'm1' } as const

describe('openMemoryInApp', () => {
  it('先取预览文件路径，再交给 Host 原生打开，成功后不打扰用户', async () => {
    const calls: string[] = []
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL): Promise<Response> => {
      calls.push(String(input))
      return okResponse({ path: 'C:\\Temp\\memory-preview\\a.md', name: 'a', empty: false })
    }))
    const opened: string[] = []
    const controller = createHubController({
      translate: t,
      getLocaleId: () => 'zh',
      openNativePath: async (path) => { opened.push(path); return { ok: true } },
    })
    controller.actions.openMemoryInApp(TARGET)
    await waitUntil(() => opened.length === 1)
    expect(opened[0]).toBe('C:\\Temp\\memory-preview\\a.md')
    expect(calls[0]).toContain('/memory/preview-file')
    expect(calls[0]).toContain('scope=project')
    expect(calls[0]).toContain(`project=${encodeURIComponent('/repo/new')}`)
    expect(calls[0]).toContain('id=m1')
    expect(controller.store.getSnapshot().toasts).toEqual([])
  })

  it('Host 无原生打开能力时给出明确提示', () => {
    const controller = createHubController({ translate: t, getLocaleId: () => 'zh' })
    controller.actions.openMemoryInApp(TARGET)
    expect(controller.store.getSnapshot().toasts.map(item => item.message)).toContain(t('memoryOpenNativeUnavailable'))
  })

  it('原生打开失败时把 Host 的原因带进提示', async () => {
    vi.stubGlobal('fetch', vi.fn(async (): Promise<Response> => okResponse({ path: 'C:\\Temp\\a.md', name: 'a', empty: false })))
    const controller = createHubController({
      translate: t,
      getLocaleId: () => 'zh',
      openNativePath: async () => ({ ok: false, error: { message: 'no associated app' } }),
    })
    controller.actions.openMemoryInApp(TARGET)
    await waitUntil(() => controller.store.getSnapshot().toasts.length > 0)
    expect(controller.store.getSnapshot().toasts.map(item => item.message))
      .toContain(t('memoryOpenNativeFailed', { message: 'no associated app' }))
  })
})
