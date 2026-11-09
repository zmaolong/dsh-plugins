// @vitest-environment jsdom

/**
 * Sidebar-row placement specs: with the shipped sidebar foot present, the
 * footer entry portals beside the account launcher (second layout child of the
 * settings trigger row, stepping through `display: contents` slot-outlet
 * wrappers) and re-anchors when the settings shell replaces that row; the
 * collapsed rail and any other foot layout keep the entry in its own footer
 * row. Behavior only: roles, data attributes and DOM order, never hashed class
 * names.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'

import { Launcher } from '../src/client/Launcher.tsx'
import { zh } from '../src/client/locales.ts'
import { initialPanelState, type PanelActions, type UseRemote } from '../src/client/store.ts'

afterEach(() => {
  cleanup()
  document.body.replaceChildren()
  vi.restoreAllMocks()
})

const t = (key: string, vars?: Record<string, unknown>): string => {
  let text: string = zh[key as keyof typeof zh] ?? key
  if (vars !== undefined) {
    for (const name of Object.keys(vars)) text = text.split(`{${name}}`).join(String(vars[name]))
  }
  return text
}

const useRemote: UseRemote = selector => selector(initialPanelState)

function panelActions(overrides: Partial<PanelActions> = {}): PanelActions {
  return {
    init: vi.fn(),
    load: vi.fn(),
    copy: vi.fn().mockResolvedValue(undefined),
    start: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn().mockResolvedValue(undefined),
    refreshToken: vi.fn().mockResolvedValue(undefined),
    destroy: vi.fn(),
    ...overrides,
  }
}

/** A slot outlet wrapper: present in the DOM, absent from layout. */
function slotOutlet(slotKey: string): HTMLElement {
  const outlet = document.createElement('div')
  outlet.setAttribute('data-slot', slotKey)
  outlet.style.display = 'contents'
  return outlet
}

interface FootFixture {
  readonly foot: HTMLElement
  readonly actionSlot: HTMLElement
  readonly settingsSlot: HTMLElement
  readonly row: HTMLElement
}

/** The shipped foot: actions cell first, then the settings column and its row. */
function footFixture(): FootFixture {
  const foot = document.createElement('div')
  const actions = document.createElement('div')
  const settings = document.createElement('div')
  const settingsSlot = slotOutlet('sidebar.settings')
  const row = document.createElement('div')
  const launcherSlot = slotOutlet('settings.launcher')
  const account = document.createElement('button')
  account.type = 'button'
  account.textContent = 'account launcher'
  launcherSlot.append(account)
  row.append(launcherSlot)
  settingsSlot.append(row)
  settings.append(settingsSlot)
  const actionSlot = slotOutlet('sidebar.footer.action')
  actions.append(actionSlot)
  foot.append(actions, settings)
  document.body.append(foot)
  return { foot, actionSlot, settingsSlot, row }
}

describe('sidebar-row placement', () => {
  it('portals the trigger beside the account launcher and leaves the footer row empty', () => {
    const { actionSlot, row } = footFixture()
    render(<Launcher wide useRemote={useRemote} actions={panelActions()} t={t} />, { container: actionSlot })

    const wrapper = row.querySelector('[data-remote-ctrl-row]')
    expect(wrapper).not.toBeNull()
    expect(row.children[1]).toBe(wrapper)
    expect(within(row).getByRole('button', { name: t('title') })).toBeDefined()
    // The footer cell keeps only the hidden mount node: its row collapses.
    expect(actionSlot.querySelector('[data-remote-ctrl-mount]')).not.toBeNull()
    expect(actionSlot.querySelector('[data-remote-ctrl-trigger]')).toBeNull()

    fireEvent.click(within(row).getByRole('button', { name: t('title') }))
    expect(screen.getByRole('dialog', { name: t('title') })).toBeDefined()
  })

  it('re-anchors when the settings shell replaces the trigger row', async () => {
    const { actionSlot, settingsSlot, row } = footFixture()
    render(<Launcher wide useRemote={useRemote} actions={panelActions()} t={t} />, { container: actionSlot })
    const wrapper = row.querySelector('[data-remote-ctrl-row]')
    expect(wrapper).not.toBeNull()

    const next = document.createElement('div')
    const launcherSlot = slotOutlet('settings.launcher')
    const account = document.createElement('button')
    account.type = 'button'
    launcherSlot.append(account)
    next.append(launcherSlot)
    settingsSlot.replaceChild(next, row)

    await waitFor(() => expect(next.children[1]).toBe(wrapper))
    expect(within(next).getByRole('button', { name: t('title') })).toBeDefined()
  })

  it('keeps the collapsed rail on its own footer row', () => {
    const { actionSlot, row } = footFixture()
    render(<Launcher wide={false} useRemote={useRemote} actions={panelActions()} t={t} />, { container: actionSlot })

    expect(row.querySelector('[data-remote-ctrl-row]')).toBeNull()
    expect(within(actionSlot).getByRole('button', { name: t('title') })).toBeDefined()
  })

  it('moves back to the footer row when the sidebar collapses', () => {
    const { actionSlot, row } = footFixture()
    const { rerender } = render(<Launcher wide useRemote={useRemote} actions={panelActions()} t={t} />, { container: actionSlot })
    expect(row.querySelector('[data-remote-ctrl-row]')).not.toBeNull()

    rerender(<Launcher wide={false} useRemote={useRemote} actions={panelActions()} t={t} />)
    expect(row.querySelector('[data-remote-ctrl-row]')).toBeNull()
    expect(within(actionSlot).getByRole('button', { name: t('title') })).toBeDefined()
  })

  it('falls back to the footer row when the sidebar foot is not the shipped one', () => {
    const actions = document.createElement('div')
    document.body.append(actions)
    render(<Launcher wide useRemote={useRemote} actions={panelActions()} t={t} />, { container: actions })

    expect(within(actions).getByRole('button', { name: t('title') })).toBeDefined()
  })
})