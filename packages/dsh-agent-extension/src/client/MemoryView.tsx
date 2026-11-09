/**
 * Memory tab of the Agent Extension panel: one compact toolbar row (scope
 * switch, project select, search with a type-filter dropdown, and the action
 * icons), the entry list beside the detail editor (create / edit / save /
 * deactivate / archive / restore / two-step delete), the Markdown export,
 * and a settings dialog (capture-injection switches and limits persist
 * immediately; per-session statistics live there too).
 *
 * The view owns its local state (the hub snapshot only carries the section
 * tab) and talks to the host's `/memory/*` routes through `api()`; all copy
 * comes from `t()` and every toast goes through `actions.toast`.
 *
 * @module dsh-agent-extension/client/MemoryView
 */

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { api } from './api.ts'
import { Badge, Button, EmptyBlock, IconButton, LoadingBlock, Spinner, columnGap } from './controls.tsx'
import { DialogShell } from './dialogs.tsx'
import { Icon } from './icons.tsx'
import { Switch } from './Switch.tsx'
import { useEscapeClose, useFocusRestore } from './overlay-hooks.ts'
import { errorMessageFor, formatTime, type JsonRecord, type Translate } from './presentation.ts'
import type { HubActions } from './store.ts'
import panelCss from './panel.module.css'
import css from './memory.module.css'

/** Scope of a memory query: the shared global store or one project store. */
export type MemoryScope = 'global' | 'project'

/** Fixed memory types understood by the host. */
export type MemoryType = 'preference' | 'decision' | 'gotcha' | 'project' | 'reference'

/** Lifecycle status of one memory entry. */
export type MemoryStatus = 'active' | 'stale' | 'archived'

/** Capture / injection settings stored by the host. */
export interface MemorySettings {
  captureEnabled: boolean
  captureSessionEnd: boolean
  injectEnabled: boolean
  indexLimitGlobal: number
  indexLimitProject: number
  maxChars: number
}

/** One detected project scope. */
export interface MemoryProject {
  key: string
  displayName: string
  source: string
  remote: string
  lastSeen: string
  entryCount: number
}

/** Per-session injection statistics. */
export interface MemorySessionStat {
  sessionId: string
  injected: number
  injectedUsed: number
  overflow: number
  updatedAt: string
}

/** Aggregate stats of the capture pipeline. */
export interface MemoryStats {
  captureRuns: number
  capturedEntries: number
  sessions: MemorySessionStat[]
}

/** One list row of the memory store. */
export interface MemoryEntrySummary {
  id: string
  name: string
  description: string
  type: string
  tags: string[]
  importance: number
  status: string
  reinforcement: number
  createdAt: string
  updatedAt: string
}

/** Full entry returned by get / save / status. */
export interface MemoryEntry extends MemoryEntrySummary {
  content: string
  originSessionId: string
  supersedes: string[]
  obsoleteVotes: number
}

/** Editable form of the detail pane. */
interface MemoryForm {
  name: string
  description: string
  type: MemoryType
  tags: string
  importance: number
  content: string
}

/** Props of MemoryView (bound from the slot inject face). */
export interface MemoryViewProps {
  actions: HubActions
  t: Translate
}

const TYPE_VALUES: readonly MemoryType[] = ['preference', 'decision', 'gotcha', 'project', 'reference']

const TYPE_LABEL_KEYS: Record<MemoryType, string> = {
  preference: 'memoryTypePreference',
  decision: 'memoryTypeDecision',
  gotcha: 'memoryTypeGotcha',
  project: 'memoryTypeProject',
  reference: 'memoryTypeReference',
}

const STATUS_LABEL_KEYS: Record<MemoryStatus, string> = {
  active: 'memoryStatusActive',
  stale: 'memoryStatusStale',
  archived: 'memoryStatusArchived',
}

const DEFAULT_SETTINGS: MemorySettings = {
  captureEnabled: true,
  captureSessionEnd: true,
  injectEnabled: true,
  indexLimitGlobal: 50,
  indexLimitProject: 30,
  maxChars: 12000,
}

const EMPTY_FORM: MemoryForm = {
  name: '',
  description: '',
  type: 'preference',
  tags: '',
  importance: 50,
  content: '',
}

/** Loose JSON object guard. */
function record(value: unknown): JsonRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {}
}

/** Coerce to a trimmed string; missing values become the fallback. */
function text(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : typeof value === 'number' ? String(value) : fallback
}

/** Coerce to a clamped integer; NaN falls back. */
function integer(value: unknown, min: number, max: number, fallback: number): number {
  const parsed = typeof value === 'number'
    ? value
    : typeof value === 'string' && value.trim() !== '' ? Number(value) : Number.NaN
  if (!Number.isFinite(parsed)) return fallback
  return Math.min(max, Math.max(min, Math.round(parsed)))
}

/** Normalize one list row. */
function normalizeSummary(raw: unknown): MemoryEntrySummary {
  const item = record(raw)
  return {
    id: text(item.id),
    name: text(item.name),
    description: text(item.description),
    type: text(item.type),
    tags: Array.isArray(item.tags) ? item.tags.filter((tag): tag is string => typeof tag === 'string') : [],
    importance: integer(item.importance, 0, 100, 50),
    status: text(item.status),
    reinforcement: integer(item.reinforcement, 0, Number.MAX_SAFE_INTEGER, 0),
    createdAt: text(item.createdAt),
    updatedAt: text(item.updatedAt),
  }
}

/** Normalize one full entry. */
function normalizeEntry(raw: unknown): MemoryEntry {
  const item = record(raw)
  return {
    ...normalizeSummary(item),
    content: text(item.content),
    originSessionId: text(item.originSessionId),
    supersedes: Array.isArray(item.supersedes) ? item.supersedes.filter((id): id is string => typeof id === 'string') : [],
    obsoleteVotes: integer(item.obsoleteVotes, 0, Number.MAX_SAFE_INTEGER, 0),
  }
}

/** Normalize the projects array, newest `lastSeen` first. */
function normalizeProjects(raw: unknown): MemoryProject[] {
  const list = Array.isArray(raw) ? raw : []
  const projects: MemoryProject[] = []
  for (const entry of list) {
    const item = record(entry)
    const key = text(item.key)
    if (key === '') continue
    projects.push({
      key,
      displayName: text(item.displayName) || key,
      source: text(item.source),
      remote: text(item.remote),
      lastSeen: text(item.lastSeen),
      entryCount: integer(item.entryCount, 0, Number.MAX_SAFE_INTEGER, 0),
    })
  }
  return projects.sort((left, right) => timeOf(right.lastSeen) - timeOf(left.lastSeen))
}

function timeOf(value: string): number {
  const time = Date.parse(value)
  return Number.isFinite(time) ? time : 0
}

/** Normalize the settings block. */
function normalizeSettings(raw: unknown): MemorySettings {
  const item = record(raw)
  return {
    captureEnabled: item.captureEnabled !== false,
    captureSessionEnd: item.captureSessionEnd !== false,
    injectEnabled: item.injectEnabled !== false,
    indexLimitGlobal: integer(item.indexLimitGlobal, 0, 200, DEFAULT_SETTINGS.indexLimitGlobal),
    indexLimitProject: integer(item.indexLimitProject, 0, 200, DEFAULT_SETTINGS.indexLimitProject),
    maxChars: integer(item.maxChars, 1000, 40000, DEFAULT_SETTINGS.maxChars),
  }
}

/** Normalize the stats block. */
function normalizeStats(raw: unknown): MemoryStats {
  const item = record(raw)
  const sessionsRaw = Array.isArray(item.sessions) ? item.sessions : []
  const sessions: MemorySessionStat[] = sessionsRaw.map((entry) => {
    const session = record(entry)
    return {
      sessionId: text(session.sessionId),
      injected: integer(session.injected, 0, Number.MAX_SAFE_INTEGER, 0),
      injectedUsed: integer(session.injectedUsed, 0, Number.MAX_SAFE_INTEGER, 0),
      overflow: integer(session.overflow, 0, Number.MAX_SAFE_INTEGER, 0),
      updatedAt: text(session.updatedAt),
    }
  })
  return {
    captureRuns: integer(item.captureRuns, 0, Number.MAX_SAFE_INTEGER, 0),
    capturedEntries: integer(item.capturedEntries, 0, Number.MAX_SAFE_INTEGER, 0),
    sessions,
  }
}

/** Form values of one loaded entry (tags join back to a comma list). */
function formOf(entry: MemoryEntry): MemoryForm {
  const type = TYPE_VALUES.find(value => value === entry.type) ?? 'preference'
  return {
    name: entry.name,
    description: entry.description,
    type,
    tags: entry.tags.join(', '),
    importance: entry.importance,
    content: entry.content,
  }
}

/** Split the comma-separated tag field. */
function parseTags(value: string): string[] {
  return value.split(/[,，]/u).map(tag => tag.trim()).filter(tag => tag !== '')
}

/** Localized type label; unknown values fall back to the raw server text. */
function typeLabel(value: string, t: Translate): string {
  const type = TYPE_VALUES.find(entry => entry === value)
  return type ? t(TYPE_LABEL_KEYS[type]) : value
}

/** Localized status label; unknown values fall back to the raw server text. */
function statusLabel(value: string, t: Translate): string {
  const status = value === 'active' || value === 'stale' || value === 'archived' ? value : null
  return status ? t(STATUS_LABEL_KEYS[status]) : value
}

/** Badge tone of one status. */
function statusTone(value: string): 'success' | 'warn' | 'plain' {
  return value === 'active' ? 'success' : value === 'stale' ? 'warn' : 'plain'
}

/**
 * Trigger a browser download of an exported Markdown file.
 * Throws when the environment has no object-URL support so the caller can
 * degrade with a toast (jsdom and some embedded webviews lack it).
 */
function downloadFile(filename: string, content: string): void {
  if (typeof document === 'undefined') throw new Error('download unsupported')
  const createObjectURL = typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function'
    ? URL.createObjectURL.bind(URL)
    : null
  if (createObjectURL === null) throw new Error('object URL unsupported')
  const href = createObjectURL(new Blob([content], { type: 'text/markdown;charset=utf-8' }))
  const anchor = document.createElement('a')
  anchor.href = href
  anchor.download = filename
  anchor.rel = 'noopener'
  document.body.append(anchor)
  anchor.click()
  anchor.remove()
  if (typeof URL.revokeObjectURL === 'function') URL.revokeObjectURL(href)
}

/** Compute the aggregate hit rate of the session stats. */
function hitRateOf(stats: MemoryStats | null): string {
  const sessions = stats?.sessions ?? []
  const injected = sessions.reduce((sum, item) => sum + item.injected, 0)
  const used = sessions.reduce((sum, item) => sum + item.injectedUsed, 0)
  if (injected <= 0) return ''
  return `${Math.round((used / injected) * 100)}%`
}

/** Overflow total across sessions. */
function overflowOf(stats: MemoryStats | null): number {
  return (stats?.sessions ?? []).reduce((sum, item) => sum + item.overflow, 0)
}

/** Render the memory tab. */
export function MemoryView({ actions, t }: MemoryViewProps): ReactNode {
  const [stateReady, setStateReady] = useState(false)
  const [stateBusy, setStateBusy] = useState(false)
  const [stateError, setStateError] = useState('')
  const [stateToken, setStateToken] = useState(0)
  const [projects, setProjects] = useState<MemoryProject[]>([])
  const [stats, setStats] = useState<MemoryStats | null>(null)
  const [scope, setScope] = useState<MemoryScope>('global')
  const [project, setProject] = useState('')
  const [query, setQuery] = useState('')
  const [appliedQuery, setAppliedQuery] = useState('')
  const [typeFilter, setTypeFilter] = useState<MemoryType | ''>('')
  const [entries, setEntries] = useState<MemoryEntrySummary[]>([])
  const [listReady, setListReady] = useState(false)
  const [listBusy, setListBusy] = useState(false)
  const [listError, setListError] = useState('')
  const [listToken, setListToken] = useState(0)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [entry, setEntry] = useState<MemoryEntry | null>(null)
  const [creating, setCreating] = useState(false)
  const [detailStatus, setDetailStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle')
  const [detailError, setDetailError] = useState('')
  const [form, setForm] = useState<MemoryForm>(EMPTY_FORM)
  const [saveBusy, setSaveBusy] = useState(false)
  const [statusBusy, setStatusBusy] = useState(false)
  const [deleteBusy, setDeleteBusy] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [exportBusy, setExportBusy] = useState(false)
  const [settings, setSettings] = useState<MemorySettings>(DEFAULT_SETTINGS)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [filterOpen, setFilterOpen] = useState(false)

  // The user's explicit scope choice wins over the auto-selected defaults.
  const userChoseRef = useRef(false)
  const detailSeq = useRef(0)
  const filterWrapRef = useRef<HTMLDivElement | null>(null)
  // Latest local settings (kept in sync synchronously) and the last value the
  // server confirmed; a failed persist rolls the UI back to the latter.
  const settingsRef = useRef<MemorySettings>(DEFAULT_SETTINGS)
  const savedSettingsRef = useRef<MemorySettings>(DEFAULT_SETTINGS)
  const settingsTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEscapeClose(filterOpen, () => { setFilterOpen(false) })
  useFocusRestore(filterWrapRef, filterOpen)
  // Drop a pending debounced persist when the view unmounts.
  useEffect(() => () => {
    if (settingsTimer.current !== null) clearTimeout(settingsTimer.current)
  }, [])

  // Load settings / projects / stats; the first load also picks the default
  // scope: project memory (newest lastSeen) when any project exists, else global.
  useEffect(() => {
    let cancelled = false
    setStateBusy(true)
    setStateError('')
    void (async () => {
      try {
        const data = await api<JsonRecord>('/memory/state')
        if (cancelled) return
        const nextProjects = normalizeProjects(data.projects)
        setProjects(nextProjects)
        setStats(normalizeStats(data.stats))
        const nextSettings = normalizeSettings(data.settings)
        savedSettingsRef.current = nextSettings
        settingsRef.current = nextSettings
        setSettings(nextSettings)
        if (!userChoseRef.current) {
          const latest = nextProjects[0]
          setScope(latest ? 'project' : 'global')
          setProject(latest ? latest.key : '')
        } else {
          // Keep the explicit project only while it still exists.
          setProject(current => (current === '' ? (nextProjects[0]?.key ?? '') : nextProjects.some(item => item.key === current) ? current : (nextProjects[0]?.key ?? '')))
        }
        setStateReady(true)
      } catch (error) {
        if (!cancelled) setStateError(errorMessageFor(error, t))
      } finally {
        if (!cancelled) setStateBusy(false)
      }
    })()
    return () => { cancelled = true }
  }, [stateToken, t])

  // Debounced search: typing settles after 300ms, Enter applies immediately.
  useEffect(() => {
    if (query === appliedQuery) return
    const timer = setTimeout(() => { setAppliedQuery(query) }, 300)
    return () => { clearTimeout(timer) }
  }, [query, appliedQuery])

  // List reload: one request per scope / project / query / type change.
  useEffect(() => {
    if (!stateReady) return
    if (scope === 'project' && project === '') {
      setEntries([])
      setListReady(true)
      setListError('')
      return
    }
    setListBusy(true)
    setListError('')
    let cancelled = false
    const params = new URLSearchParams()
    params.set('scope', scope)
    if (scope === 'project') params.set('project', project)
    params.set('query', appliedQuery)
    if (typeFilter !== '') params.set('type', typeFilter)
    params.set('includeArchived', '1')
    void (async () => {
      try {
        const data = await api<JsonRecord>(`/memory/list?${params.toString()}`)
        if (cancelled) return
        const list = Array.isArray(data.entries) ? data.entries : []
        setEntries(list.map(normalizeSummary))
        setListReady(true)
      } catch (error) {
        if (!cancelled) {
          setListError(errorMessageFor(error, t))
          setListReady(true)
        }
      } finally {
        if (!cancelled) setListBusy(false)
      }
    })()
    return () => { cancelled = true }
  }, [stateReady, scope, project, appliedQuery, typeFilter, listToken, t])

  const latestProjectKey = (list: MemoryProject[]): string => list[0]?.key ?? ''

  const closeEditor = (): void => {
    detailSeq.current += 1
    setSelectedId(null)
    setEntry(null)
    setCreating(false)
    setConfirmDelete(false)
    setDetailStatus('idle')
    setDetailError('')
  }

  const chooseScope = (next: MemoryScope): void => {
    userChoseRef.current = true
    setScope(next)
    closeEditor()
    if (next === 'project' && project === '') setProject(latestProjectKey(projects))
  }

  const chooseProject = (next: string): void => {
    userChoseRef.current = true
    setProject(next)
    closeEditor()
  }

  const startCreate = (): void => {
    detailSeq.current += 1
    setCreating(true)
    setSelectedId(null)
    setEntry(null)
    setForm(EMPTY_FORM)
    setDetailStatus('idle')
    setDetailError('')
    setConfirmDelete(false)
  }

  const openEntry = (id: string): void => {
    const seq = ++detailSeq.current
    setCreating(false)
    setSelectedId(id)
    setEntry(null)
    setForm(EMPTY_FORM)
    setConfirmDelete(false)
    setDetailStatus('loading')
    setDetailError('')
    const params = new URLSearchParams()
    params.set('scope', scope)
    if (scope === 'project') params.set('project', project)
    params.set('id', id)
    void (async () => {
      try {
        const data = await api<JsonRecord>(`/memory/get?${params.toString()}`)
        if (seq !== detailSeq.current) return
        const loaded = normalizeEntry(data.entry)
        setEntry(loaded)
        setForm(formOf(loaded))
        setDetailStatus('ready')
      } catch (error) {
        if (seq !== detailSeq.current) return
        setDetailError(errorMessageFor(error, t))
        setDetailStatus('error')
      }
    })()
  }

  const saveEntry = async (): Promise<void> => {
    if (saveBusy) return
    const name = form.name.trim()
    if (name === '' || form.content.trim() === '') {
      actions.toast('warn', t('memoryNameRequired'))
      return
    }
    if (scope === 'project' && project === '') {
      actions.toast('warn', t('memoryProjectEmpty'))
      return
    }
    setSaveBusy(true)
    try {
      const body: Record<string, unknown> = {
        scope,
        name,
        description: form.description.trim(),
        type: form.type,
        content: form.content,
        tags: parseTags(form.tags),
        importance: form.importance,
      }
      if (scope === 'project') body.project = project
      if (!creating && entry) body.id = entry.id
      const data = await api<JsonRecord>('/memory/save', { method: 'POST', body })
      const saved = normalizeEntry(data.entry)
      setEntry(saved)
      setForm(formOf(saved))
      setSelectedId(saved.id)
      setCreating(false)
      setDetailStatus('ready')
      actions.toast('success', t('memorySaved'))
      setListToken(token => token + 1)
    } catch (error) {
      actions.toast('error', errorMessageFor(error, t))
    } finally {
      setSaveBusy(false)
    }
  }

  const changeStatus = async (status: MemoryStatus): Promise<void> => {
    if (entry === null || statusBusy) return
    setStatusBusy(true)
    try {
      const body: Record<string, unknown> = { scope, id: entry.id, status }
      if (scope === 'project') body.project = project
      const data = await api<JsonRecord>('/memory/status', { method: 'POST', body })
      const updated = normalizeEntry(data.entry)
      setEntry(updated)
      setForm(formOf(updated))
      setConfirmDelete(false)
      actions.toast('success', t('memoryStatusDone'))
      setListToken(token => token + 1)
    } catch (error) {
      actions.toast('error', errorMessageFor(error, t))
    } finally {
      setStatusBusy(false)
    }
  }

  const removeEntry = async (): Promise<void> => {
    if (entry === null || deleteBusy) return
    setDeleteBusy(true)
    try {
      const body: Record<string, unknown> = { scope, id: entry.id }
      if (scope === 'project') body.project = project
      await api<JsonRecord>('/memory/delete', { method: 'POST', body })
      actions.toast('success', t('memoryDeleted', { name: entry.name }))
      closeEditor()
      setListToken(token => token + 1)
    } catch (error) {
      actions.toast('error', errorMessageFor(error, t))
    } finally {
      setDeleteBusy(false)
    }
  }

  /** POST the current settings; a failure toasts and rolls the UI back. */
  const persistSettings = async (): Promise<void> => {
    settingsTimer.current = null
    try {
      const data = await api<JsonRecord>('/memory/settings', { method: 'POST', body: settingsRef.current })
      savedSettingsRef.current = normalizeSettings(data.settings)
    } catch (error) {
      actions.toast('error', errorMessageFor(error, t))
      settingsRef.current = savedSettingsRef.current
      setSettings(savedSettingsRef.current)
    }
  }

  /**
   * Merge one partial settings patch into the local state and persist.
   * Switches persist immediately; numeric fields debounce by 500 ms.
   */
  const patchSettings = (partial: Partial<MemorySettings>, debounce = false): void => {
    const next = { ...settingsRef.current, ...partial }
    settingsRef.current = next
    setSettings(next)
    if (settingsTimer.current !== null) clearTimeout(settingsTimer.current)
    if (debounce) {
      settingsTimer.current = setTimeout(() => { void persistSettings() }, 500)
    } else {
      void persistSettings()
    }
  }

  const exportMarkdown = async (): Promise<void> => {
    if (exportBusy || (scope === 'project' && project === '')) return
    setExportBusy(true)
    try {
      const body: Record<string, unknown> = { scope }
      if (scope === 'project') body.project = project
      const data = await api<JsonRecord>('/memory/export', { method: 'POST', body })
      const filename = text(data.filename) || 'memory.md'
      downloadFile(filename, text(data.content))
      actions.toast('success', t('memoryExportDone', { filename }))
    } catch (error) {
      actions.toast('error', t('memoryExportFailed', { message: errorMessageFor(error, t) }))
    } finally {
      setExportBusy(false)
    }
  }

  const submitSearch = (): void => {
    if (query === appliedQuery) setListToken(token => token + 1)
    else setAppliedQuery(query)
  }

  const projectRequired = scope === 'project' && project === ''
  const projectMissing = scope === 'project' && projects.length === 0
  const hitRate = hitRateOf(stats)
  const showEditor = creating || selectedId !== null
  const typeOptions: ReadonlyArray<{ value: MemoryType | '', label: string }> = [
    { value: '', label: t('memoryTypeAll') },
    ...TYPE_VALUES.map(value => ({ value, label: t(TYPE_LABEL_KEYS[value]) })),
  ]

  let workspace: ReactNode = null
  if (!stateReady) {
    workspace = stateError !== ''
      ? (
        <div className={css.errorBox}>
          <span className={css.errorText}>{stateError}</span>
          <Button variant="secondary" icon="refresh" onClick={() => setStateToken(token => token + 1)}>
            {t('memoryRetry')}
          </Button>
        </div>
      )
      : <LoadingBlock text={t('memoryLoading')} />
  } else if (projectMissing) {
    workspace = (
      <EmptyBlock
        title={t('memoryScopeProject')}
        description={t('memoryProjectEmpty')}
      />
    )
  } else {
    workspace = (
      <div className={css.workspace}>
        <section className={css.listPane} aria-label={t('memoryListTitle')}>
          <div className={css.listHead}>
            <h2 className={css.sectionTitle}>{t('memoryListTitle')}</h2>
            <span className={css.sectionCount}>{String(entries.length)}</span>
          </div>
          {stateError !== ''
            ? (
              <div className={css.errorBox}>
                <span className={css.errorText}>{stateError}</span>
                <Button variant="secondary" icon="refresh" onClick={() => setStateToken(token => token + 1)}>
                  {t('memoryRetry')}
                </Button>
              </div>
            )
            : null}
          {listError !== ''
            ? (
              <div className={css.errorBox}>
                <span className={css.errorText}>{listError}</span>
                <Button variant="secondary" icon="refresh" onClick={() => setListToken(token => token + 1)}>
                  {t('memoryRetry')}
                </Button>
              </div>
            )
            : null}
          {!listReady && listBusy ? <LoadingBlock text={t('memoryLoading')} /> : null}
          {listReady && listError === '' && entries.length === 0
            ? (
              <EmptyBlock
                description={appliedQuery !== '' || typeFilter !== '' ? t('memoryListEmptyFiltered') : t('memoryListEmpty')}
              />
            )
            : null}
          <div className={css.entryList}>
            {entries.map(item => (
              <button
                key={item.id}
                type="button"
                className={css.entryRow}
                aria-pressed={selectedId === item.id}
                onClick={() => openEntry(item.id)}
              >
                <span className={css.entryMain}>
                  <span className={css.entryTitleRow}>
                    <span className={css.entryName}>{item.name}</span>
                    {item.importance >= 80
                      ? <span className={css.entryImportance} title={t('memoryFieldImportance')}>{String(item.importance)}</span>
                      : null}
                  </span>
                  {item.description !== '' ? <span className={css.entryDesc}>{item.description}</span> : null}
                  <span className={css.entryMeta}>
                    <Badge tone="plain">{typeLabel(item.type, t)}</Badge>
                    {item.status !== 'active'
                      ? <Badge tone={statusTone(item.status)}>{statusLabel(item.status, t)}</Badge>
                      : null}
                    {item.tags.slice(0, 2).map((tag, index) => (
                      <span key={`${index}-${tag}`} className={css.entryTag}>{tag}</span>
                    ))}
                    {item.tags.length > 2
                      ? <span className={css.entryTagMore}>{`+${item.tags.length - 2}`}</span>
                      : null}
                    {formatTime(item.updatedAt) !== ''
                      ? <span className={css.entryTime}>{formatTime(item.updatedAt)}</span>
                      : null}
                  </span>
                </span>
              </button>
            ))}
          </div>
        </section>

        <section className={css.editorPane} aria-label={t('memoryEditTitle')}>
          {!showEditor
            ? <EmptyBlock description={t('memorySelectHint')} />
            : (
              <div className={css.editor}>
                <div className={css.editorHead}>
                  <h2 className={css.sectionTitle}>{creating ? t('memoryCreateTitle') : t('memoryEditTitle')}</h2>
                  {entry !== null && !creating
                    ? <Badge tone={statusTone(entry.status)}>{statusLabel(entry.status, t)}</Badge>
                    : null}
                </div>
                {detailStatus === 'loading' ? <LoadingBlock text={t('memoryLoading')} /> : null}
                {detailStatus === 'error'
                  ? (
                    <div className={css.errorBox}>
                      <span className={css.errorText}>{detailError}</span>
                      <Button
                        variant="secondary"
                        icon="refresh"
                        onClick={() => { if (selectedId !== null) openEntry(selectedId) }}
                      >
                        {t('memoryRetry')}
                      </Button>
                    </div>
                  )
                  : null}
                {detailStatus === 'idle' || detailStatus === 'ready'
                  ? (
                    <div style={columnGap(12)}>
                      <div className={css.formGrid}>
                        <label className={css.field}>
                          <span className={css.fieldLabel}>{t('memoryFieldName')}</span>
                          <input
                            className={css.input}
                            type="text"
                            aria-label={t('memoryFieldName')}
                            value={form.name}
                            onChange={(event) => { setForm(current => ({ ...current, name: event.target.value })) }}
                          />
                        </label>
                        <label className={css.field}>
                          <span className={css.fieldLabel}>{t('memoryFieldDescription')}</span>
                          <input
                            className={css.input}
                            type="text"
                            aria-label={t('memoryFieldDescription')}
                            value={form.description}
                            onChange={(event) => { setForm(current => ({ ...current, description: event.target.value })) }}
                          />
                        </label>
                        <label className={css.field}>
                          <span className={css.fieldLabel}>{t('memoryFieldType')}</span>
                          <select
                            className={css.input}
                            aria-label={t('memoryFieldType')}
                            value={form.type}
                            onChange={(event) => {
                              const next = TYPE_VALUES.find(value => value === event.target.value) ?? 'preference'
                              setForm(current => ({ ...current, type: next }))
                            }}
                          >
                            {TYPE_VALUES.map(value => <option key={value} value={value}>{t(TYPE_LABEL_KEYS[value])}</option>)}
                          </select>
                        </label>
                        <label className={css.field}>
                          <span className={css.fieldLabel}>{t('memoryFieldImportance')}</span>
                          <input
                            className={css.input}
                            type="number"
                            min={0}
                            max={100}
                            aria-label={t('memoryFieldImportance')}
                            value={form.importance}
                            onChange={(event) => {
                              setForm(current => ({ ...current, importance: integer(event.target.value, 0, 100, current.importance) }))
                            }}
                          />
                          <span className={css.fieldHint}>{t('memoryImportanceHint')}</span>
                        </label>
                      </div>
                      <label className={css.field}>
                        <span className={css.fieldLabel}>{t('memoryFieldTags')}</span>
                        <input
                          className={css.input}
                          type="text"
                          aria-label={t('memoryFieldTags')}
                          value={form.tags}
                          onChange={(event) => { setForm(current => ({ ...current, tags: event.target.value })) }}
                        />
                        <span className={css.fieldHint}>{t('memoryTagsHint')}</span>
                      </label>
                      <label className={css.field}>
                        <span className={css.fieldLabel}>{t('memoryFieldContent')}</span>
                        <textarea
                          className={css.textarea}
                          rows={8}
                          aria-label={t('memoryFieldContent')}
                          value={form.content}
                          onChange={(event) => { setForm(current => ({ ...current, content: event.target.value })) }}
                        />
                      </label>
                      <div className={css.formActions}>
                        <Button variant="primary" disabled={saveBusy || projectRequired} onClick={() => { void saveEntry() }}>
                          {saveBusy ? <Spinner /> : null}{saveBusy ? t('memorySaving') : t('memorySave')}
                        </Button>
                        <Button variant="secondary" onClick={closeEditor}>{t('cancel')}</Button>
                        {entry !== null && !creating
                          ? (
                            <span className={css.formActionsRight}>
                              {entry.status !== 'active'
                                ? (
                                  <Button variant="ghost" icon="check" disabled={statusBusy} onClick={() => { void changeStatus('active') }}>
                                    {t('memoryRestore')}
                                  </Button>
                                )
                                : (
                                  <Button variant="ghost" icon="power" disabled={statusBusy} onClick={() => { void changeStatus('stale') }}>
                                    {t('memoryDeactivate')}
                                  </Button>
                                )}
                              {entry.status !== 'archived'
                                ? (
                                  <Button variant="ghost" icon="folder" disabled={statusBusy} onClick={() => { void changeStatus('archived') }}>
                                    {t('memoryArchive')}
                                  </Button>
                                )
                                : null}
                              {confirmDelete
                                ? (
                                  <span className={css.confirmArea} role="group" aria-label={t('memoryDelete')}>
                                    <span className={css.confirmText}>{t('memoryDeleteDescription', { name: entry.name })}</span>
                                    <Button variant="danger" disabled={deleteBusy} onClick={() => { void removeEntry() }}>
                                      {deleteBusy ? <Spinner /> : null}{deleteBusy ? t('memoryDeleting') : t('memoryDeleteConfirm')}
                                    </Button>
                                    <Button variant="secondary" onClick={() => setConfirmDelete(false)}>{t('cancel')}</Button>
                                  </span>
                                )
                                : (
                                  <Button variant="danger" icon="trash" onClick={() => setConfirmDelete(true)}>
                                    {t('memoryDelete')}
                                  </Button>
                                )}
                            </span>
                          )
                          : null}
                      </div>
                    </div>
                  )
                  : null}
              </div>
            )}
        </section>
      </div>
    )
  }

  return (
    <div className={`${panelCss.page} ${css.view}`} role="region" aria-label={t('memoryTitle')}>
      <header className={css.topbar}>
        <div className={css.scopeRow}>
          <div className={css.segmented} role="group" aria-label={t('memoryScopeLabel')}>
            <button
              type="button"
              className={panelCss.segment}
              aria-pressed={scope === 'global'}
              onClick={() => chooseScope('global')}
            >
              {t('memoryScopeGlobal')}
            </button>
            <button
              type="button"
              className={panelCss.segment}
              aria-pressed={scope === 'project'}
              onClick={() => chooseScope('project')}
            >
              {t('memoryScopeProject')}
            </button>
          </div>
        </div>
        {scope === 'project' && projects.length > 0
          ? (
            <select
              className={`${css.input} ${css.projectSelect}`}
              aria-label={t('memoryProjectLabel')}
              value={project}
              onChange={(event) => chooseProject(event.target.value)}
            >
              {projects.map(item => (
                <option key={item.key} value={item.key}>{`${item.displayName} (${item.entryCount})`}</option>
              ))}
            </select>
          )
          : null}
        <div className={css.searchWrap}>
          <Icon name="search" size={16} />
          <input
            className={css.searchInput}
            type="search"
            value={query}
            placeholder={t('memorySearchPlaceholder')}
            aria-label={t('memorySearchPlaceholder')}
            onChange={(event) => { setQuery(event.target.value) }}
            onKeyDown={(event) => {
              if (event.key !== 'Enter') return
              event.preventDefault()
              submitSearch()
            }}
          />
          {query !== ''
            ? (
              <button
                type="button"
                className={css.searchClear}
                title={t('clearSearch')}
                aria-label={t('clearSearch')}
                onClick={() => { setQuery(''); setAppliedQuery('') }}
              >
                <Icon name="x" size={14} />
              </button>
            )
            : null}
          <div ref={filterWrapRef} className={css.filterWrap} tabIndex={-1}>
            <button
              type="button"
              className={css.filterTrigger}
              aria-expanded={filterOpen}
              aria-label={t('memoryTypeFilterLabel')}
              title={t('memoryTypeFilterLabel')}
              onClick={() => { setFilterOpen(value => !value) }}
            >
              <Icon name="filter" size={14} />
              {typeFilter !== '' ? <span className={css.filterDot} /> : null}
            </button>
            {filterOpen
              ? (
                <div>
                  <div className={css.menuBackdrop} onClick={() => { setFilterOpen(false) }} />
                  <div className={css.filterMenu} role="menu" aria-label={t('memoryTypeLabel')}>
                    {typeOptions.map(option => (
                      <button
                        key={option.value === '' ? 'all' : option.value}
                        type="button"
                        role="menuitemradio"
                        aria-checked={typeFilter === option.value}
                        className={css.filterItem}
                        onClick={() => {
                          setTypeFilter(option.value)
                          setFilterOpen(false)
                        }}
                      >
                        <span className={css.filterItemText}>{option.label}</span>
                        {typeFilter === option.value ? <Icon name="check" size={14} /> : null}
                      </button>
                    ))}
                  </div>
                </div>
              )
              : null}
          </div>
        </div>
        <div className={css.actions}>
          <Button variant="primary" icon="plus" disabled={projectMissing} onClick={startCreate}>
            {t('memoryNew')}
          </Button>
          <IconButton
            icon="download"
            title={exportBusy ? t('memoryExporting') : t('memoryExportMarkdown')}
            busy={exportBusy}
            disabled={exportBusy || projectRequired}
            onClick={() => { void exportMarkdown() }}
          />
          <IconButton icon="settings" title={t('memorySettingsButton')} onClick={() => { setSettingsOpen(true) }} />
          <IconButton
            icon="refresh"
            title={stateBusy || listBusy ? t('refreshing') : t('refresh')}
            busy={stateBusy || listBusy}
            disabled={stateBusy || listBusy}
            onClick={() => {
              setStateToken(token => token + 1)
              setListToken(token => token + 1)
            }}
          />
        </div>
      </header>

      {workspace}

      {stateReady && settingsOpen
        ? (
          <div className={css.dialogPortal}>
            <DialogShell t={t} title={t('memorySettingsTitle')} onClose={() => { setSettingsOpen(false) }}>
              <div className={css.settingList}>
                <div className={css.settingRow}>
                  <span className={css.settingLabel}>{t('memorySettingsCapture')}</span>
                  <Switch
                    checked={settings.captureEnabled}
                    label={t('memorySettingsCapture')}
                    onChange={(next) => { patchSettings({ captureEnabled: next }) }}
                  />
                </div>
                <div className={css.settingRow}>
                  <span className={css.settingLabel}>{t('memorySettingsCaptureSessionEnd')}</span>
                  <Switch
                    checked={settings.captureSessionEnd}
                    label={t('memorySettingsCaptureSessionEnd')}
                    onChange={(next) => { patchSettings({ captureSessionEnd: next }) }}
                  />
                </div>
                <div className={css.settingRow}>
                  <span className={css.settingLabel}>{t('memorySettingsInject')}</span>
                  <Switch
                    checked={settings.injectEnabled}
                    label={t('memorySettingsInject')}
                    onChange={(next) => { patchSettings({ injectEnabled: next }) }}
                  />
                </div>
              </div>
              <div className={css.numberGrid}>
                <label className={css.field}>
                  <span className={css.fieldLabel}>{t('memorySettingsIndexGlobal')}</span>
                  <input
                    className={css.input}
                    type="number"
                    min={0}
                    max={200}
                    aria-label={t('memorySettingsIndexGlobal')}
                    value={settings.indexLimitGlobal}
                    onChange={(event) => { patchSettings({ indexLimitGlobal: integer(event.target.value, 0, 200, settingsRef.current.indexLimitGlobal) }, true) }}
                  />
                </label>
                <label className={css.field}>
                  <span className={css.fieldLabel}>{t('memorySettingsIndexProject')}</span>
                  <input
                    className={css.input}
                    type="number"
                    min={0}
                    max={200}
                    aria-label={t('memorySettingsIndexProject')}
                    value={settings.indexLimitProject}
                    onChange={(event) => { patchSettings({ indexLimitProject: integer(event.target.value, 0, 200, settingsRef.current.indexLimitProject) }, true) }}
                  />
                </label>
                <label className={css.field}>
                  <span className={css.fieldLabel}>{t('memorySettingsMaxChars')}</span>
                  <input
                    className={css.input}
                    type="number"
                    min={1000}
                    max={40000}
                    step={500}
                    aria-label={t('memorySettingsMaxChars')}
                    value={settings.maxChars}
                    onChange={(event) => { patchSettings({ maxChars: integer(event.target.value, 1000, 40000, settingsRef.current.maxChars) }, true) }}
                  />
                </label>
              </div>
              <div className={css.divider} />
              <h3 className={css.statsTitle}>{t('memoryStatsTitle')}</h3>
              <div className={css.statGrid}>
                <div className={css.stat}>
                  <span className={css.statLabel}>{t('memoryStatCaptureRuns')}</span>
                  <span className={css.statValue}>{String(stats?.captureRuns ?? 0)}</span>
                </div>
                <div className={css.stat}>
                  <span className={css.statLabel}>{t('memoryStatCapturedEntries')}</span>
                  <span className={css.statValue}>{String(stats?.capturedEntries ?? 0)}</span>
                </div>
                <div className={css.stat}>
                  <span className={css.statLabel}>{t('memoryStatHitRate')}</span>
                  <span className={css.statValue}>{hitRate !== '' ? hitRate : t('memoryStatNoData')}</span>
                </div>
                <div className={css.stat}>
                  <span className={css.statLabel}>{t('memoryStatOverflow')}</span>
                  <span className={css.statValue}>{String(overflowOf(stats))}</span>
                </div>
              </div>
            </DialogShell>
          </div>
        )
        : null}
    </div>
  )
}