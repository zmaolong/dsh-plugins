/**
 * Client state of the plugin panel: a small snapshot-store engine (official
 * `createSnapshotStore` shape — getSnapshot/subscribe/update/set, stable
 * snapshot references, subscriber-safe notification) plus the hub controller
 * whose actions are the complete mutation API over the plugin HTTP API.
 *
 * Components never touch this module's sources directly: the slot
 * registration binds `hooks.hub` to a `useHub` selector hook and passes the
 * action callbacks through the inject face.
 *
 * @module dsh-agent-plugin-hub/client/store
 */

import { api, ApiError } from './api.ts'
import { addedMarketFor, RECOMMENDED_SOURCES } from './recommended.ts'
import { displayOf, errorMessageFor, updateAvailable, type JsonRecord, type Translate } from './presentation.ts'

/** Observable snapshot face (official engine contract). */
export interface SnapshotStore<T> {
  getSnapshot(): T
  subscribe(listener: () => void): () => void
}

/** One queued toast. */
export interface ToastState {
  id: number
  kind: 'success' | 'warn' | 'error' | 'info'
  message: string
}

/** One stacked dialog. */
export interface DialogState {
  id: string
  kind: 'sources' | 'add-source' | 'preview-source' | 'confirm'
  title?: string
  message?: string
  confirmLabel?: string
  danger?: boolean
  onConfirm?: () => Promise<void> | void
}

/** State of the recommended-source preview dialog. */
export interface RecPreviewState {
  id: string
  title: string
  location: string
  status: 'loading' | 'ready' | 'error'
  error: string
  data: JsonRecord | null
}

/** The panel's full client state (single immutable snapshot). */
export interface HubState {
  status: 'loading' | 'ready' | 'error'
  error: string
  snapshot: JsonRecord | null
  view: 'store' | 'manage' | 'detail'
  storeTab: 'sources' | 'recommended'
  detailKey: string | null
  detail: JsonRecord | null
  detailStatus: 'idle' | 'loading' | 'ready' | 'error'
  detailError: string
  query: string
  manageQuery: string
  manageFilter: 'all' | 'enabled' | 'disabled'
  collapsed: Record<string, boolean>
  busy: Record<string, string>
  capBusy: Record<string, boolean>
  marketBusy: Record<string, string>
  recPreview: RecPreviewState | null
  loading: boolean
  refreshing: boolean
  updatingAll: boolean
  dialogs: DialogState[]
  toasts: ToastState[]
  /** Active locale id (lowercase), tracked from the locale service. */
  localeId: string
}

/** Create a snapshot store: stable snapshots, subscriber-safe dispatch. */
export function createSnapshotStore<T>(init: T): SnapshotStore<T> & {
  update(mutator: (state: T) => Partial<T>): void
  set(next: T): void
} {
  const listeners = new Set<() => void>()
  let state = init
  return {
    getSnapshot: () => state,
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    update(mutator) {
      state = { ...state, ...mutator(state) }
      notify(listeners)
    },
    set(next) {
      state = next
      notify(listeners)
    },
  }
}

/** Notify an observer set without letting one callback starve the rest. */
function notify(listeners: ReadonlySet<() => void>): void {
  for (const listener of [...listeners]) {
    try {
      listener()
    } catch {
      /* one failing subscriber never blocks the others */
    }
  }
}

/** Initial client state. */
export function initialHubState(): HubState {
  return {
    status: 'loading',
    error: '',
    snapshot: null,
    view: 'store',
    storeTab: 'sources',
    detailKey: null,
    detail: null,
    detailStatus: 'idle',
    detailError: '',
    query: '',
    manageQuery: '',
    manageFilter: 'all',
    collapsed: {},
    busy: {},
    capBusy: {},
    marketBusy: {},
    recPreview: null,
    loading: false,
    refreshing: false,
    updatingAll: false,
    dialogs: [],
    toasts: [],
    localeId: '',
  }
}

/** Options of createHubController. */
export interface HubControllerOptions {
  translate: Translate
  getLocaleId: () => string
}

/** Complete action set of the panel. */
export interface HubActions {
  init(): void
  load(): Promise<void>
  openStore(): void
  openManage(): void
  openDetail(key: string): void
  loadDetail(force: boolean): Promise<void>
  setQuery(query: string): void
  setManageQuery(query: string): void
  setManageFilter(filter: HubState['manageFilter']): void
  setStoreTab(tab: HubState['storeTab']): void
  addRecommendedSource(entry: JsonRecord): void
  setLocaleId(localeId: string): void
  toggleCollapse(groupKey: string): void
  refreshAll(): Promise<void>
  install(item: JsonRecord): void
  update(item: JsonRecord): void
  updateAll(): void
  toggleEnabled(entity: JsonRecord, enabled: boolean): void
  askUninstall(entity: JsonRecord): void
  askRollback(record: JsonRecord, targetVersion?: string): void
  toggleCapability(pluginKey: string, kind: string, capability: string, enabled: boolean): void
  addMarketSource(location: string, name: string): Promise<JsonRecord>
  previewRecommendedSource(entry: JsonRecord, refresh?: boolean): void
  closePreview(): void
  refreshMarket(id: string): Promise<void>
  removeMarket(market: JsonRecord): void
  openSources(): void
  openAddSource(): void
  closeDialog(id?: string): void
  toast(kind: ToastState['kind'], message: string, durationMs?: number): void
  dismissToast(id: number): void
  isCapBusy(pluginKey: string, kind: string, capability: string): boolean
  destroy(): void
}

/** Controller instance: the observable store plus its action set. */
export interface HubController {
  store: SnapshotStore<HubState>
  actions: HubActions
}

/** Selector hook bound from the registration's `hooks.hub` compartment. */
export type UseHub = <S = HubState>(selector?: (state: HubState) => S) => S

/**
 * Identity selector. The host binds `use<Name>` hooks straight onto
 * `useSyncExternalStoreWithSelector`, whose selector is required — a no-arg
 * call crashes with "selector is not a function", so whole-snapshot
 * subscriptions pass this explicitly.
 */
export function identity<T>(state: T): T {
  return state
}

/** Create the panel controller (one per apply; disposed with the plugin). */
export function createHubController(options: HubControllerOptions): HubController {
  const { translate: t, getLocaleId } = options
  const store = createSnapshotStore<HubState>({ ...initialHubState(), localeId: getLocaleId() })
  let started = false
  let queue: Promise<void> = Promise.resolve()
  let toastSeq = 0
  let dialogSeq = 0
  let disposed = false

  const set = (patch: Partial<HubState> | ((state: HubState) => Partial<HubState>)): void => {
    if (disposed) return
    store.update(state => (typeof patch === 'function' ? patch(state) : patch))
  }

  const toast = (kind: ToastState['kind'], message: string, durationMs = 4500): void => {
    if (disposed || typeof message !== 'string' || message === '') return
    toastSeq += 1
    const id = toastSeq
    set(state => ({ toasts: [...state.toasts, { id, kind, message }].slice(-5) }))
    if (typeof window !== 'undefined' && typeof window.setTimeout === 'function') {
      window.setTimeout(() => dismissToast(id), durationMs)
    }
  }

  const dismissToast = (id: number): void => {
    set(state => ({ toasts: state.toasts.filter(toastItem => toastItem.id !== id) }))
  }

  const pushDialog = (dialog: Omit<DialogState, 'id'>): string => {
    dialogSeq += 1
    const id = `dialog-${dialogSeq}`
    set(state => ({ dialogs: [...state.dialogs, { ...dialog, id }] }))
    return id
  }

  const closeDialog = (id?: string): void => {
    set(state => ({ dialogs: id === undefined ? [] : state.dialogs.filter(dialog => dialog.id !== id) }))
  }

  const setBusy = (key: string, label: string): void => {
    set((state) => {
      const busy = { ...state.busy }
      if (label !== '') busy[key] = label
      else delete busy[key]
      return { busy }
    })
  }

  const capBusyId = (pluginKey: string, kind: string, capability: string): string => `${pluginKey}#${kind}:${capability}`

  const setCapBusy = (pluginKey: string, kind: string, capability: string, busy: boolean): void => {
    const id = capBusyId(pluginKey, kind, capability)
    set((state) => {
      const capBusy = { ...state.capBusy }
      if (busy) capBusy[id] = true
      else delete capBusy[id]
      return { capBusy }
    })
  }

  const isCapBusy = (pluginKey: string, kind: string, capability: string): boolean => {
    return Boolean(store.getSnapshot().capBusy[capBusyId(pluginKey, kind, capability)])
  }

  const setMarketBusy = (id: string, label: string): void => {
    set((state) => {
      const marketBusy = { ...state.marketBusy }
      if (label !== '') marketBusy[id] = label
      else delete marketBusy[id]
      return { marketBusy }
    })
  }

  /** Serialize mutating tasks; failures surface as error toasts. */
  const enqueue = (task: () => Promise<void>): Promise<void> => {
    queue = queue.then(async () => {
      try {
        await task()
      } catch (error) {
        toast('error', errorMessageFor(error, t))
      }
    })
    return queue
  }

  const load = async (): Promise<void> => {
    if (!store.getSnapshot().snapshot) set({ status: 'loading' })
    set({ loading: true })
    try {
      const snapshot = await api<JsonRecord>('/store')
      set({ snapshot, status: 'ready', error: '' })
    } catch (error) {
      set(state => ({ status: state.snapshot ? 'ready' : 'error', error: errorMessageFor(error, t) }))
    } finally {
      set({ loading: false })
    }
  }

  const loadDetail = async (force: boolean): Promise<void> => {
    const key = store.getSnapshot().detailKey
    if (!key) return
    const snapshot = store.getSnapshot().snapshot
    if (!snapshot) return
    const installed = ((snapshot.installed as JsonRecord[] | undefined) ?? []).find(item => item.key === key) ?? null
    const item = ((snapshot.items as JsonRecord[] | undefined) ?? []).find(entry => entry.key === key) ?? null
    set({ detailStatus: 'loading', detailError: '' })
    try {
      let data: JsonRecord
      if (installed) {
        data = await api<JsonRecord>(`/describe?key=${encodeURIComponent(key)}`, { timeoutMs: 60000 })
      } else if (force && item) {
        // "Fetch online": the host may clone an uncached Git source before describing.
        const market = item.market ? String((item.market as JsonRecord).id ?? '') : ''
        data = await api<JsonRecord>('/describe', {
          method: 'POST',
          body: { market, name: item.name, fetch: true },
          timeoutMs: 180000,
        })
      } else if (item) {
        const market = item.market ? String((item.market as JsonRecord).id ?? '') : ''
        data = await api<JsonRecord>(`/describe?market=${encodeURIComponent(market)}&name=${encodeURIComponent(String(item.name ? '' : ''))}`, { timeoutMs: 60000 })
      } else {
        throw new ApiError(t('unknownError'), 'not_found')
      }
      // Backfill only while the user is still on this detail page (race guard).
      if (store.getSnapshot().detailKey === key) set({ detail: data, detailStatus: 'ready' })
    } catch (error) {
      if (store.getSnapshot().detailKey === key) set({ detailStatus: 'error', detailError: errorMessageFor(error, t) })
    }
  }

  const actions: HubActions = {
    init() {
      if (started) return
      started = true
      void load()
    },
    load,
    openStore() {
      set({ view: 'store', detailKey: null, detail: null, detailStatus: 'idle', detailError: '' })
    },
    openManage() {
      set({ view: 'manage', detailKey: null, detail: null, detailStatus: 'idle', detailError: '' })
    },
    openDetail(key: string) {
      set({ view: 'detail', detailKey: key, detail: null, detailStatus: 'loading', detailError: '' })
      void loadDetail(false)
    },
    loadDetail,
    setQuery(query: string) {
      set({ query })
    },
    setManageQuery(manageQuery: string) {
      set({ manageQuery })
    },
    setManageFilter(manageFilter: HubState['manageFilter']) {
      set({ manageFilter })
    },
    setStoreTab(storeTab: HubState['storeTab']) {
      set({ storeTab })
    },
    setLocaleId(localeId: string) {
      set({ localeId })
    },
    toggleCollapse(groupKey: string) {
      set((state) => {
        const collapsed = { ...state.collapsed }
        if (collapsed[groupKey]) delete collapsed[groupKey]
        else collapsed[groupKey] = true
        return { collapsed }
      })
    },
    async refreshAll() {
      if (store.getSnapshot().refreshing) return
      set({ refreshing: true })
      try {
        const result = await api<JsonRecord>('/market/refresh', { method: 'POST', body: {}, timeoutMs: 180000 })
        await load()
        const installed = ((store.getSnapshot().snapshot?.installed as JsonRecord[] | undefined) ?? [])
        const updates = installed.filter(item => updateAvailable(item)).length
        toast('success', updates > 0 ? t('checkFound', { count: updates }) : t('checkNone'))
        const failures = (result?.failures as JsonRecord[] | undefined) ?? []
        if (failures.length > 0) {
          toast('warn', t('refreshPartial', { count: failures.length }))
        }
      } catch (error) {
        toast('error', errorMessageFor(error, t))
      } finally {
        set({ refreshing: false })
      }
    },
    install(item: JsonRecord) {
      if (store.getSnapshot().busy[item.key as string]) return
      setBusy(item.key as string, 'install')
      void enqueue(async () => {
        try {
          await api('/install', {
            method: 'POST',
            body: { name: item.name, market: (item.market as JsonRecord | undefined)?.id },
            timeoutMs: 180000,
          })
          await load()
          const state = store.getSnapshot()
          if (state.view === 'detail' && state.detailKey === item.key) await loadDetail(false)
          toast('success', t('installedToast', { name: displayOf(item, getLocaleId()).title }))
        } finally {
          setBusy(item.key as string, '')
        }
      })
    },
    update(item: JsonRecord) {
      if (store.getSnapshot().busy[item.key as string]) return
      setBusy(item.key as string, 'update')
      void enqueue(async () => {
        try {
          const result = await api<JsonRecord>('/update', { method: 'POST', body: { name: item.key }, timeoutMs: 180000 })
          await load()
          const state = store.getSnapshot()
          if (state.view === 'detail' && state.detailKey === item.key) await loadDetail(false)
          const name = displayOf(item, getLocaleId()).title
          toast('success', result?.changed === false ? t('upToDate', { name }) : t('updatedToast', { name }))
        } finally {
          setBusy(item.key as string, '')
        }
      })
    },
    updateAll() {
      if (store.getSnapshot().updatingAll) return
      set({ updatingAll: true })
      void enqueue(async () => {
        try {
          const result = await api<JsonRecord>('/update-all', { method: 'POST', body: {}, timeoutMs: 300000 })
          await load()
          const succeeded = (result?.succeeded as JsonRecord[] | undefined) ?? []
          const failed = (result?.failed as JsonRecord[] | undefined) ?? []
          if (result?.aborted === true) {
            toast('warn', t('updateAllAborted', { count: succeeded.length }))
          } else if (failed.length > 0) {
            // Show the first three failures; a long list must not flood the toast.
            const failedNames = failed.map(entry => String(entry.key ?? ''))
            const plugins = failedNames.length > 3
              ? `${failedNames.slice(0, 3).join('、')} ${t('andMore', { count: failedNames.length - 3 })}`
              : failedNames.join('、')
            toast('warn', t('updateAllPartial', {
              succeeded: succeeded.length,
              failed: failed.length,
              plugins,
            }))
          } else {
            toast('success', t('updateAllDone', { count: succeeded.length }))
          }
        } finally {
          set({ updatingAll: false })
        }
      })
    },
    toggleEnabled(entity: JsonRecord, enabled: boolean) {
      const key = entity.key as string
      if (store.getSnapshot().busy[key]) return
      setBusy(key, 'toggle')
      void enqueue(async () => {
        try {
          await api('/enable', { method: 'POST', body: { name: key, enabled } })
          await load()
          const state = store.getSnapshot()
          if (state.view === 'detail' && state.detailKey === key) await loadDetail(false)
          const name = displayOf(entity, getLocaleId()).title
          toast('success', enabled ? t('enabledToast', { name }) : t('disabledToast', { name }))
        } finally {
          setBusy(key, '')
        }
      })
    },
    askUninstall(entity: JsonRecord) {
      const name = displayOf(entity, getLocaleId()).title
      pushDialog({
        kind: 'confirm',
        title: t('uninstallTitle', { name }),
        message: t('uninstallDescription'),
        confirmLabel: t('uninstall'),
        danger: true,
        onConfirm: async () => {
          await api('/uninstall', { method: 'POST', body: { name: entity.key } })
          await load()
          const state = store.getSnapshot()
          if (state.view === 'detail' && state.detailKey === entity.key) actions.openStore()
          toast('success', t('uninstalledToast', { name }))
        },
      })
    },
    askRollback(record: JsonRecord, targetVersion?: string) {
      const versions = (record.previousVersions as JsonRecord[] | undefined) ?? []
      const wanted = typeof targetVersion === 'string' ? targetVersion : ''
      const target = wanted !== ''
        ? versions.find(item => item.version === wanted && item.available !== false)
        : versions.filter(item => item.available).slice(-1)[0]
      if (!target) return
      const name = displayOf(record, getLocaleId()).title
      pushDialog({
        kind: 'confirm',
        title: t('rollbackTitle', { name }),
        message: t('rollbackDescription', { version: target.version }),
        confirmLabel: t('rollback'),
        danger: false,
        onConfirm: async () => {
          await api('/rollback', { method: 'POST', body: { name: record.key, version: String(target.version) } })
          await load()
          await loadDetail(false)
          toast('success', t('rollbackToast', { name, version: String(target.version) }))
        },
      })
    },
    toggleCapability(pluginKey: string, kind: string, capability: string, enabled: boolean) {
      if (isCapBusy(pluginKey, kind, capability)) return
      setCapBusy(pluginKey, kind, capability, true)
      void enqueue(async () => {
        try {
          await api('/capability', {
            method: 'POST',
            body: { name: pluginKey, kind, capability, enabled },
          })
          await load()
          await loadDetail(false)
        } finally {
          setCapBusy(pluginKey, kind, capability, false)
        }
      })
    },
    async addMarketSource(location: string, name: string): Promise<JsonRecord> {
      const data = await api<JsonRecord>('/market/add', {
        method: 'POST',
        body: { location, ...(name !== '' ? { name } : {}) },
        timeoutMs: 180000,
      })
      await load()
      return data
    },
    addRecommendedSource(entry: JsonRecord) {
      const id = String(entry.id ?? '')
      const busyKey = `rec:${id}`
      if (id === '' || store.getSnapshot().marketBusy[busyKey]) return
      setMarketBusy(busyKey, 'add')
      void enqueue(async () => {
        try {
          const data = await actions.addMarketSource(String(entry.location ?? ''), '')
          const detected = data.detectedType === 'git'
            ? t('detectedGit')
            : data.detectedType === 'url' ? t('detectedUrl') : t('detectedLocal')
          const market = (data.market ?? {}) as JsonRecord
          toast('success', t('addedToast', {
            name: String(market.title || market.name || String(entry.location ?? '')),
            type: detected,
            count: typeof data.pluginCount === 'number' ? data.pluginCount : 0,
          }))
        } finally {
          setMarketBusy(busyKey, '')
        }
      })
    },
    previewRecommendedSource(entry: JsonRecord, refresh = false) {
      const id = String(entry.id ?? '')
      const location = String(entry.location ?? '')
      if (id === '' || location === '') return
      const state = store.getSnapshot()
      const markets = ((state.snapshot ?? {}).markets as JsonRecord[] | undefined) ?? []
      const matched = addedMarketFor(markets, location)
      // Display fields come from the curated list (the action face only carries id/location).
      const known = RECOMMENDED_SOURCES.find(source => source.id === id)
      const display = displayOf(known ?? entry, getLocaleId())
      const previous = state.recPreview
      const previousData = previous?.id === id && previous.status === 'ready' ? previous.data ?? null : null

      // Zero-request path: an equivalent market is already added — project its catalog items.
      let instantData: JsonRecord | null = null
      if (matched !== null) {
        const items = ((state.snapshot ?? {}).items as JsonRecord[] | undefined) ?? []
        instantData = { plugins: items.filter(item => ((item.market as JsonRecord | undefined) ?? {}).id === matched.id) }
      }

      if (state.dialogs.find(item => item.kind === 'preview-source') === undefined) {
        pushDialog({ kind: 'preview-source', title: display.title })
      }
      // Ready without a request when projecting an added market, or re-opening a
      // fetched preview; a refresh keeps the old data visible (spinner) while re-fetching.
      const data = instantData ?? previousData
      const ready = instantData !== null || (!refresh && previousData !== null)
      set({
        recPreview: {
          id,
          title: display.title,
          location,
          status: ready ? 'ready' : 'loading',
          error: '',
          data,
        },
      })
      if (ready) return

      void (async () => {
        try {
          const fetched = await api<JsonRecord>('/market/preview', {
            method: 'POST',
            body: { location, ...(refresh ? { refresh: true } : {}) },
            timeoutMs: 180000,
          })
          // Apply only while this preview is still the open one (race guard).
          if (store.getSnapshot().recPreview?.id === id) {
            set(current => ({ recPreview: current.recPreview ? { ...current.recPreview, status: 'ready', error: '', data: fetched } : null }))
          }
        } catch (error) {
          if (store.getSnapshot().recPreview?.id === id) {
            set(current => ({ recPreview: current.recPreview ? { ...current.recPreview, status: 'error', error: errorMessageFor(error, t) } : null }))
          }
        }
      })()
    },
    closePreview() {
      const dialog = store.getSnapshot().dialogs.find(item => item.kind === 'preview-source')
      if (dialog !== undefined) closeDialog(dialog.id)
      set({ recPreview: null })
    },
    async refreshMarket(id: string): Promise<void> {
      if (store.getSnapshot().marketBusy[id]) return
      setMarketBusy(id, 'refresh')
      try {
        const result = await api<JsonRecord>('/market/refresh', { method: 'POST', body: { id }, timeoutMs: 180000 })
        await load()
        const markets = ((store.getSnapshot().snapshot?.markets as JsonRecord[] | undefined) ?? [])
        const market = markets.find(entry => entry.id === id) ?? {}
        const failures = (result?.failures as JsonRecord[] | undefined) ?? []
        if (failures.length > 0) toast('warn', String(failures[0]?.error ?? t('unknownError')))
        else toast('success', t('refreshDone', { name: String(market.title || market.name || id) }))
      } finally {
        setMarketBusy(id, '')
      }
    },
    removeMarket(market: JsonRecord) {
      const name = String(market.title || market.name || market.id)
      pushDialog({
        kind: 'confirm',
        title: t('removeMarketTitle'),
        message: t('removeMarketDescription'),
        confirmLabel: t('remove'),
        danger: true,
        onConfirm: async () => {
          setMarketBusy(String(market.id), 'remove')
          try {
            const result = await api<JsonRecord>('/market/remove', { method: 'POST', body: { id: market.id }, timeoutMs: 60000 })
            await load()
            const orphaned = (result?.orphaned as unknown[] | undefined) ?? []
            if (orphaned.length > 0) toast('warn', t('orphanedToast', { name, count: orphaned.length }))
            else toast('success', t('removedMarketToast', { name }))
          } finally {
            setMarketBusy(String(market.id), '')
          }
        },
      })
    },
    openSources() {
      pushDialog({ kind: 'sources' })
    },
    openAddSource() {
      pushDialog({ kind: 'add-source' })
    },
    closeDialog,
    toast,
    dismissToast,
    isCapBusy,
    destroy() {
      disposed = true
    },
  }

  return { store, actions }
}
