/**
 * Controller lifecycle specs: the real loopback listener starts, stops and
 * restarts on the same port, and the enabled intent survives into the next
 * controller instance through the plugin home.
 */
import http from 'node:http'
import type { AddressInfo } from 'node:net'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import os from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { RemoteCtrl } from '../src/remote-ctrl.ts'
import type { HostContext } from '../src/host.ts'

const homes: string[] = []
const controllers: RemoteCtrl[] = []

afterEach(() => {
  for (const ctrl of controllers.splice(0)) ctrl.dispose()
  for (const home of homes.splice(0)) rmSync(home, { recursive: true, force: true })
})

function tempHome(): string {
  const home = mkdtempSync(join(os.tmpdir(), 'dsh-remote-ctrl-life-'))
  homes.push(home)
  return home
}

/** Minimal host face: no upstream services, no logger. */
function fakeContext(): HostContext {
  return {
    get: () => undefined,
    effect: () => undefined,
    inject: () => undefined,
  }
}

/** A currently free loopback port. */
async function freePort(): Promise<number> {
  const probe = http.createServer()
  await new Promise<void>(resolve => { probe.listen(0, '127.0.0.1', () => resolve()) })
  const address = probe.address() as AddressInfo
  await new Promise<void>(resolve => { probe.close(() => resolve()) })
  return address.port
}

async function waitFor(predicate: () => boolean, timeoutMs = 5000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error('等待条件超时')
    await new Promise(resolve => setTimeout(resolve, 20))
  }
}

function controller(home: string, port: number): RemoteCtrl {
  const ctrl = new RemoteCtrl(fakeContext(), { home, host: '127.0.0.1', port })
  controllers.push(ctrl)
  return ctrl
}

describe('remote control lifecycle', () => {
  it('starts, stops and restarts the listener, persisting the intent', async () => {
    const home = tempHome()
    const port = await freePort()
    const ctrl = controller(home, port)

    ctrl.start()
    await waitFor(() => ctrl.panelStatus().listening)
    expect(ctrl.panelStatus().enabled).toBe(true)
    expect(ctrl.panelStatus().port).toBe(port)

    ctrl.disable()
    await waitFor(() => !ctrl.panelStatus().listening)
    expect(ctrl.panelStatus().enabled).toBe(false)
    expect(ctrl.panelStatus().active).toBe(false)
    const stored = JSON.parse(readFileSync(join(home, 'remote-ctrl.json'), 'utf8')) as { enabled?: boolean }
    expect(stored.enabled).toBe(false)

    // The released port must be bindable again by the same controller.
    ctrl.enable()
    await waitFor(() => ctrl.panelStatus().listening)
    expect(ctrl.panelStatus().enabled).toBe(true)
    expect(ctrl.panelStatus().port).toBe(port)
    expect(ctrl.panelStatus().error).toBe('')

    ctrl.dispose()
    await waitFor(() => !ctrl.panelStatus().listening)
  })

  it('honors a persisted stopped state on the next start', async () => {
    const home = tempHome()
    const port = await freePort()
    const first = controller(home, port)
    first.start()
    await waitFor(() => first.panelStatus().listening)
    first.disable()
    await waitFor(() => !first.panelStatus().listening)
    first.dispose()

    const second = controller(home, port)
    second.start()
    // 停止意图来自 home 里的 remote-ctrl.json，新实例不会自动监听
    await new Promise(resolve => setTimeout(resolve, 100))
    expect(second.panelStatus().listening).toBe(false)
    expect(second.panelStatus().enabled).toBe(false)

    second.enable()
    await waitFor(() => second.panelStatus().listening)
    expect(second.panelStatus().enabled).toBe(true)
  })

  it('rotates the token, rebinds the listener and drops the old pairing', async () => {
    const home = tempHome()
    const port = await freePort()
    const ctrl = controller(home, port)
    ctrl.start()
    await waitFor(() => ctrl.panelStatus().listening)
    const before = ctrl.panelStatus().token
    expect(before).not.toBe('')

    expect(await ctrl.refreshToken()).toBe(true)
    await waitFor(() => ctrl.panelStatus().listening)
    const after = ctrl.panelStatus().token
    expect(after).not.toBe(before)
    expect(ctrl.panelStatus().port).toBe(port)
    expect(ctrl.panelStatus().tokenPinned).toBe(false)

    const stored = JSON.parse(readFileSync(join(home, 'remote-ctrl.json'), 'utf8')) as { token?: string }
    expect(stored.token).toBe(after)

    // 旧配对码立即失效：网关还在监听，但请求被 401 拒绝。
    const status = await new Promise<number | undefined>(resolve => {
      const request = http.request(`http://127.0.0.1:${port}/?token=${encodeURIComponent(before)}`, response => {
        response.resume()
        resolve(response.statusCode)
      })
      request.on('error', () => resolve(undefined))
      request.end()
    })
    expect(status).toBe(401)
  })

  it('refuses to rotate a config-pinned token', async () => {
    const ctrl = new RemoteCtrl(fakeContext(), { home: tempHome(), host: '127.0.0.1', port: 0, token: 'fixed-token' })
    controllers.push(ctrl)
    ctrl.start()
    expect(ctrl.panelStatus().tokenPinned).toBe(true)
    expect(ctrl.panelStatus().token).toBe('fixed-token')
    expect(await ctrl.refreshToken()).toBe(false)
    expect(ctrl.panelStatus().token).toBe('fixed-token')
  })
})