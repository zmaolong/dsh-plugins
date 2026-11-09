/**
 * Client state of the desktop panel: a small snapshot-store engine (the
 * official `createSnapshotStore` shape — getSnapshot/subscribe, stable
 * snapshot references) plus the controller whose actions poll the panel
 * API and copy values. Components are pure props components: the slot
 * registration binds `hooks.remote` to a `useRemote` selector hook and
 * passes the action callbacks through the inject face.
 *
 * @module dsh-remote-ctrl/client/store
 */

import { api } from './api.ts'
import type { PanelStatus } from '../remote-ctrl.ts'

/** Observable snapshot face (official engine contract). */
export interface SnapshotStore<T> {
  getSnapshot(): T
  subscribe(listener: () => void): () => void
}

/** The panel's full client state (single immutable snapshot). */
export interface PanelState {
  status: 'loading' | 'ready' | 'error'
  error: string
  data: PanelStatus | null
  copied: string | null
  /** A start/stop request is in flight. */
  pending: boolean
}

/** Initial state before the first poll lands. */
export const initialPanelState: PanelState = { status: 'loading', error: '', data: null, copied: null, pending: false }

/** Identity selector for `useRemote` when the whole snapshot is needed. */
export function identity(state: PanelState): PanelState {
  return state
}

/** The host-bound selector hook face (`useRemote`). */
export type UseRemote = <S>(selector: (state: PanelState) => S) => S

/** Translator handed in by apply. */
export type Translate = (key: string, vars?: Record<string, unknown>) => string

const POLL_MS = 4000

function createSnapshotStore<T>(initial: T): {
  store: SnapshotStore<T>
  get: () => T
  update: (updater: (previous: T) => T) => void
} {
  let snapshot = initial
  const listeners = new Set<() => void>()
  const notify = (): void => {
    for (const listener of [...listeners]) listener()
  }
  return {
    store: {
      getSnapshot: () => snapshot,
      subscribe: listener => {
        listeners.add(listener)
        return () => {
          listeners.delete(listener)
        }
      },
    },
    get: () => snapshot,
    update: updater => {
      const next = updater(snapshot)
      if (next === snapshot) return
      snapshot = next
      notify()
    },
  }
}

/** Copy text to the clipboard with a textarea fallback (non-secure contexts). */
async function writeClipboard(value: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(value)
    return true
  } catch {
    try {
      const area = document.createElement('textarea')
      area.value = value
      area.style.position = 'fixed'
      area.style.opacity = '0'
      document.body.appendChild(area)
      area.select()
      const done = document.execCommand('copy')
      area.remove()
      return done
    } catch {
      return false
    }
  }
}

/** The panel controller: polling, copy feedback, teardown. */
export interface PanelActions {
  /** Start polling the status API (opening the dialog). */
  init: () => void
  /** Read the status once (retry). */
  load: () => void
  /** Copy a value to the clipboard and flash its key as copied. */
  copy: (value: string, key: string) => Promise<void>
  /** Turn the gateway on (persisted on the host). */
  start: () => Promise<void>
  /** Turn the gateway off (persisted on the host). */
  stop: () => Promise<void>
  /** Rotate the pairing token on the host (old pairings stop working). */
  refreshToken: () => Promise<void>
  /** Stop polling (closing the dialog, plugin disposal). */
  destroy: () => void
}

/** The panel controller: polling, copy feedback, teardown. */
export function createRemoteController(): {
  store: SnapshotStore<PanelState>
  actions: PanelActions
} {
  const { store, get, update } = createSnapshotStore<PanelState>(initialPanelState)
  let timer: ReturnType<typeof setInterval> | null = null

  const load = async (): Promise<void> => {
    try {
      const data = await api<PanelStatus>('/status')
      update(previous => ({ ...previous, status: 'ready', error: '', data }))
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      update(previous => ({ ...previous, status: previous.data === null ? 'error' : 'ready', error: message }))
    }
  }

  // Start/stop/token-refresh flip host state and answer with the new status,
  // so the dialog never renders a half-updated state.
  const mutate = async (path: '/start' | '/stop' | '/token/refresh'): Promise<void> => {
    update(previous => ({ ...previous, pending: true }))
    try {
      const data = await api<PanelStatus>(path, { method: 'POST' })
      update(previous => ({ ...previous, pending: false, status: 'ready', error: '', data }))
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      update(previous => ({ ...previous, pending: false, error: message }))
    }
  }

  return {
    store,
    actions: {
      init: () => {
        void load()
        if (timer === null) timer = setInterval(() => {
          void load()
        }, POLL_MS)
      },
      load: () => {
        void load()
      },
      copy: async (value: string, key: string) => {
        if (!(await writeClipboard(value))) return
        update(previous => ({ ...previous, copied: key }))
        setTimeout(() => {
          if (get().copied === key) update(previous => ({ ...previous, copied: null }))
        }, 1500)
      },
      start: () => mutate('/start'),
      stop: () => mutate('/stop'),
      refreshToken: () => mutate('/token/refresh'),
      destroy: () => {
        if (timer !== null) {
          clearInterval(timer)
          timer = null
        }
      },
    },
  }
}
