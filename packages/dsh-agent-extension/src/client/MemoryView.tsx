/**
 * Memory tab of the Agent Extension panel: one compact toolbar row (scope
 * switch, project select, active-filter chips, search with a type-filter
 * dropdown, and the action icons), the entry list as a full-width card grid
 * with tag-chip filtering and a recency sort, a wide dialog that only creates
 * memories, the Markdown export, a settings dialog (capture-injection switches
 * and limits persist immediately; per-session statistics live there too), and
 * a health-audit dialog (stale / duplicate / low-value findings with batch
 * archive / deactivate / delete reusing the existing endpoints).
 *
 * Opening an entry leaves the panel for the host's right Sidebar detail
 * surface (metadata page plus read-only preview); the controller's
 * `openMemoryDetail` owns that sequence because this view unmounts on click.
 *
 * @module dsh-agent-extension/client/MemoryView
 */

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { api } from './api.ts'
import { runAudit, type AuditEntry, type AuditResult } from './audit.ts'
import { Badge, Button, EmptyBlock, IconButton, LoadingBlock, Select, Spinner, columnGap } from './controls.tsx'
import { DialogShell } from './dialogs.tsx'
import { Icon } from './icons.tsx'
import { Switch } from './Switch.tsx'
import {
  TYPE_LABEL_KEYS,
  TYPE_VALUES,
  integer,
  normalizeEntry,
  normalizeSummary,
  record,
  statusLabel,
  statusTone,
  text,
  typeLabel,
  type MemoryEntrySummary,
  type MemoryForm,
  type MemoryScope,
  type MemoryType,
} from './memory-model.ts'
import { errorMessageFor, formatTime, type JsonRecord, type Translate } from './presentation.ts'
import type { HubActions } from './store.ts'
import panelCss from './panel.module.css'
import css from './memory.module.css'

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

/** Props of MemoryView (bound from the slot inject face). */
export interface MemoryViewProps {
  actions: HubActions
  t: Translate
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
  tags: [],
  importance: 50,
  content: '',
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
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState<MemoryForm>(EMPTY_FORM)
  const [saveBusy, setSaveBusy] = useState(false)
  const [exportBusy, setExportBusy] = useState(false)
  const [settings, setSettings] = useState<MemorySettings>(DEFAULT_SETTINGS)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [tagFilter, setTagFilter] = useState('')
  const [sort, setSort] = useState<'default' | 'recent'>('default')
  const [tagDraft, setTagDraft] = useState('')
  const [auditOpen, setAuditOpen] = useState(false)
  const [auditBusy, setAuditBusy] = useState(false)
  const [auditResult, setAuditResult] = useState<AuditResult | null>(null)
  const [auditSelected, setAuditSelected] = useState<string[]>([])
  const [auditConfirmDelete, setAuditConfirmDelete] = useState(false)
  const [auditBatchBusy, setAuditBatchBusy] = useState(false)

  // The user's explicit scope choice wins over the auto-selected defaults.
  const userChoseRef = useRef(false)
  // Latest local settings (kept in sync synchronously) and the last value the
  // server confirmed; a failed persist rolls the UI back to the latter.
  const settingsRef = useRef<MemorySettings>(DEFAULT_SETTINGS)
  const savedSettingsRef = useRef<MemorySettings>(DEFAULT_SETTINGS)
  const settingsTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
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

  const closeCreate = (): void => {
    setCreating(false)
    setTagDraft('')
  }

  const chooseScope = (next: MemoryScope): void => {
    userChoseRef.current = true
    setScope(next)
    closeCreate()
    if (next === 'project' && project === '') setProject(latestProjectKey(projects))
  }

  const chooseProject = (next: string): void => {
    userChoseRef.current = true
    setProject(next)
    closeCreate()
  }

  const startCreate = (): void => {
    setCreating(true)
    setForm(EMPTY_FORM)
    setTagDraft('')
  }

  /** Create one memory from the dialog; the reading surface is only opened from the list. */
  const createEntry = async (): Promise<void> => {
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
        tags: form.tags,
        importance: form.importance,
      }
      if (scope === 'project') body.project = project
      await api<JsonRecord>('/memory/save', { method: 'POST', body })
      actions.toast('success', t('memorySaved'))
      closeCreate()
      setListToken(token => token + 1)
    } catch (error) {
      actions.toast('error', errorMessageFor(error, t))
    } finally {
      setSaveBusy(false)
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

  /** Full-list fetch + client-side audit rules for the current scope. */
  const openAudit = async (): Promise<void> => {
    if (auditBusy || (scope === 'project' && project === '')) return
    setAuditBusy(true)
    try {
      const params = new URLSearchParams()
      params.set('scope', scope)
      if (scope === 'project') params.set('project', project)
      params.set('includeArchived', '1')
      params.set('content', '1')
      const data = await api<JsonRecord>(`/memory/list?${params.toString()}`)
      const list = Array.isArray(data.entries) ? data.entries : []
      setAuditResult(runAudit(list.map(normalizeEntry), Date.now()))
      setAuditSelected([])
      setAuditConfirmDelete(false)
      setAuditOpen(true)
    } catch (error) {
      actions.toast('error', errorMessageFor(error, t))
    } finally {
      setAuditBusy(false)
    }
  }

  /** Select / unselect one audit finding row. */
  const toggleAuditSelect = (id: string): void => {
    setAuditSelected(current => current.includes(id) ? current.filter(item => item !== id) : [...current, id])
  }

  /** Run a batch action over the selected rows, reusing the existing endpoints. */
  const runAuditBatch = async (action: 'archive' | 'stale' | 'delete'): Promise<void> => {
    if (auditBatchBusy || auditSelected.length === 0) return
    if (action === 'delete' && !auditConfirmDelete) {
      setAuditConfirmDelete(true)
      return
    }
    setAuditBatchBusy(true)
    const ids = [...auditSelected]
    let failed = 0
    try {
      for (const id of ids) {
        const body: Record<string, unknown> = { scope, id }
        if (scope === 'project') body.project = project
        try {
          if (action === 'delete') {
            await api<JsonRecord>('/memory/delete', { method: 'POST', body })
          } else {
            await api<JsonRecord>('/memory/status', { method: 'POST', body: { ...body, status: action === 'archive' ? 'archived' : 'stale' } })
          }
        } catch {
          failed += 1
        }
      }
      actions.toast(failed === 0 ? 'success' : 'warn',
        failed === 0 ? t('memoryAuditDone', { count: ids.length }) : t('memoryAuditPartial', { count: failed }))
      setAuditOpen(false)
      setListToken(token => token + 1)
    } finally {
      setAuditBatchBusy(false)
      setAuditConfirmDelete(false)
      setAuditSelected([])
    }
  }

  const submitSearch = (): void => {
    if (query === appliedQuery) setListToken(token => token + 1)
    else setAppliedQuery(query)
  }

  /** Append comma-separated text as deduplicated tag chips. */
  const appendTags = (raw: string): void => {
    const parts = raw.split(/[,，]/u).map(part => part.trim()).filter(part => part !== '')
    if (parts.length === 0) return
    setForm(current => {
      const tags = [...current.tags]
      for (const part of parts) {
        if (!tags.includes(part)) tags.push(part)
      }
      return { ...current, tags }
    })
  }

  /** Commit the pending tag draft (Enter / comma / blur). */
  const commitTagDraft = (): void => {
    if (tagDraft === '') return
    const raw = tagDraft
    setTagDraft('')
    appendTags(raw)
  }

  const projectRequired = scope === 'project' && project === ''
  const projectMissing = scope === 'project' && projects.length === 0
  const hitRate = hitRateOf(stats)
  const showEditor = creating
  const typeOptions: ReadonlyArray<{ value: MemoryType | '', label: string }> = [
    { value: '', label: t('memoryTypeAll') },
    ...TYPE_VALUES.map(value => ({ value, label: t(TYPE_LABEL_KEYS[value]) })),
  ]

  // Client-side refinements over the fetched list: tag filter first, then sort.
  const visibleEntries = tagFilter === '' ? entries : entries.filter(item => item.tags.includes(tagFilter))
  const sortedEntries = sort === 'recent'
    ? [...visibleEntries].sort((left, right) => timeOf(right.updatedAt) - timeOf(left.updatedAt))
    : visibleEntries

  const auditEmpty = auditResult !== null
    && auditResult.stale.length === 0
    && auditResult.duplicates.length === 0
    && auditResult.lowValue.length === 0

  /** One selectable audit finding row (checkbox + card summary + suggestion). */
  const auditRow = (item: AuditEntry, hint: string): ReactNode => (
    <label key={item.id} className={css.auditRow}>
      <input
        className={css.auditCheck}
        type="checkbox"
        aria-label={item.name}
        checked={auditSelected.includes(item.id)}
        onChange={() => toggleAuditSelect(item.id)}
      />
      <span className={css.auditSummary}>
        <span className={css.entryTitleRow}>
          <span className={css.entryName}>{item.name}</span>
          {item.importance >= 80
            ? <span className={css.entryImportance}>{String(item.importance)}</span>
            : null}
        </span>
        {item.description !== '' ? <span className={css.entryDesc}>{item.description}</span> : null}
        <span className={css.entryMeta}>
          <Badge tone="plain">{typeLabel(item.type, t)}</Badge>
          <span className={css.auditHint}>{hint}</span>
        </span>
      </span>
    </label>
  )

  /** Group heading with its finding count. */
  const auditGroupTitle = (title: string, count: number): ReactNode => (
    <h3 className={css.auditGroupTitle}>
      {title}
      <span className={css.auditCount}>{String(count)}</span>
    </h3>
  )

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
      <section className={css.listPane} aria-label={t('memoryListTitle')}>
        <div className={css.listHead}>
          <h2 className={css.sectionTitle}>{t('memoryListTitle')}</h2>
          <span className={css.listHeadTools}>
            <Select
              label={t('memorySortLabel')}
              size="sm"
              align="right"
              value={sort}
              options={[
                { value: 'default', label: t('memorySortDefault') },
                { value: 'recent', label: t('memorySortRecent') },
              ]}
              onChange={(next) => { setSort(next === 'recent' ? 'recent' : 'default') }}
            />
            <span className={css.sectionCount}>{String(sortedEntries.length)}</span>
          </span>
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
        {listReady && listError === '' && sortedEntries.length === 0
          ? (
            <EmptyBlock
              description={appliedQuery !== '' || typeFilter !== '' || tagFilter !== '' ? t('memoryListEmptyFiltered') : t('memoryListEmpty')}
              action={appliedQuery === '' && typeFilter === '' && tagFilter === ''
                ? (
                  <Button variant="primary" icon="plus" disabled={projectRequired} onClick={startCreate}>
                    {t('memoryNew')}
                  </Button>
                )
                : null}
            />
          )
          : null}
        <div className={css.entryGrid}>
          {sortedEntries.map(item => (
            <div
              key={item.id}
              role="button"
              tabIndex={0}
              className={css.entryCard}
              onClick={() => actions.openMemoryDetail({ scope, project, id: item.id })}
              onKeyDown={(event) => {
                if (event.key !== 'Enter' && event.key !== ' ') return
                event.preventDefault()
                actions.openMemoryDetail({ scope, project, id: item.id })
              }}
            >
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
                  <button
                    key={`${index}-${tag}`}
                    type="button"
                    className={css.entryTag}
                    title={t('memoryTagFilterHint')}
                    onClick={(event) => {
                      event.stopPropagation()
                      setTagFilter(tag)
                    }}
                  >
                    {tag}
                  </button>
                ))}
                {item.tags.length > 2
                  ? <span className={css.entryTagMore}>{`+${item.tags.length - 2}`}</span>
                  : null}
                {formatTime(item.updatedAt) !== ''
                  ? <span className={css.entryTime}>{formatTime(item.updatedAt)}</span>
                  : null}
              </span>
            </div>
          ))}
        </div>
      </section>
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
            <Select
              label={t('memoryProjectLabel')}
              className={css.projectSelect}
              value={project}
              options={projects.map(item => ({ value: item.key, label: item.displayName }))}
              onChange={chooseProject}
            />
          )
          : null}
        {(typeFilter !== '' || tagFilter !== '')
          ? (
            <div className={css.filterChips}>
              {typeFilter !== ''
                ? (
                  <span className={css.filterChip}>
                    <span className={css.filterChipText}>{typeLabel(typeFilter, t)}</span>
                    <button
                      type="button"
                      className={css.filterChipClear}
                      aria-label={t('memoryClearTypeFilter')}
                      onClick={() => { setTypeFilter('') }}
                    >
                      <Icon name="x" size={12} />
                    </button>
                  </span>
                )
                : null}
              {tagFilter !== ''
                ? (
                  <span className={css.filterChip}>
                    <span className={css.filterChipText}>{tagFilter}</span>
                    <button
                      type="button"
                      className={css.filterChipClear}
                      aria-label={t('memoryClearTagFilter')}
                      onClick={() => { setTagFilter('') }}
                    >
                      <Icon name="x" size={12} />
                    </button>
                  </span>
                )
                : null}
            </div>
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
          <Select
            label={t('memoryTypeFilterLabel')}
            title={t('memoryTypeFilterLabel')}
            align="right"
            value={typeFilter}
            options={typeOptions}
            onChange={(next) => { setTypeFilter(next === '' ? '' : (TYPE_VALUES.find(value => value === next) ?? '')) }}
            triggerClassName={css.filterTrigger}
            trigger={(
              <>
                <Icon name="filter" size={14} />
                {typeFilter !== '' ? <span className={css.filterDot} /> : null}
              </>
            )}
          />
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
            icon="clipboardCheck"
            title={auditBusy ? t('memoryAuditRunning') : t('memoryAuditButton')}
            busy={auditBusy}
            disabled={auditBusy || projectRequired}
            onClick={() => { void openAudit() }}
          />
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

      {stateReady && showEditor
        ? (
          <div className={css.dialogPortal}>
            <DialogShell
              t={t}
              title={t('memoryCreateTitle')}
              wide
              onClose={closeCreate}
            >
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
                    <Select
                      label={t('memoryFieldType')}
                      value={form.type}
                      options={TYPE_VALUES.map(value => ({ value, label: t(TYPE_LABEL_KEYS[value]) }))}
                      onChange={(next) => {
                        const type = TYPE_VALUES.find(value => value === next) ?? 'preference'
                        setForm(current => ({ ...current, type }))
                      }}
                    />
                  </label>
                  <label className={css.field}>
                    <span className={css.fieldLabel}>{t('memoryFieldImportance')}</span>
                    <div className={css.rangeRow}>
                      <input
                        className={css.rangeInput}
                        type="range"
                        min={0}
                        max={100}
                        step={1}
                        aria-label={t('memoryFieldImportance')}
                        value={form.importance}
                        style={{ '--range-fill': `${form.importance}%` } as CSSProperties}
                        onChange={(event) => {
                          setForm(current => ({ ...current, importance: integer(event.target.value, 0, 100, current.importance) }))
                        }}
                      />
                      <span className={css.rangeValue}>{String(form.importance)}</span>
                    </div>
                    <span className={css.fieldHint}>{t('memoryImportanceHint')}</span>
                  </label>
                </div>
                <div className={css.field}>
                  <span className={css.fieldLabel}>{t('memoryFieldTags')}</span>
                  <div className={css.tagBox}>
                    {form.tags.map((tag, index) => (
                      <span key={`${index}-${tag}`} className={css.tagChip}>
                        <span className={css.tagChipText}>{tag}</span>
                        <button
                          type="button"
                          className={css.tagChipRemove}
                          aria-label={t('memoryTagRemove', { tag })}
                          onClick={() => {
                            setForm(current => ({ ...current, tags: current.tags.filter((_, tagIndex) => tagIndex !== index) }))
                          }}
                        >
                          <Icon name="x" size={12} />
                        </button>
                      </span>
                    ))}
                    <input
                      className={css.tagInput}
                      type="text"
                      aria-label={t('memoryFieldTags')}
                      value={tagDraft}
                      onChange={(event) => {
                        const next = event.target.value
                        if (next.endsWith(',') || next.endsWith('，')) {
                          appendTags(next)
                          setTagDraft('')
                        } else {
                          setTagDraft(next)
                        }
                      }}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ',') {
                          event.preventDefault()
                          commitTagDraft()
                          return
                        }
                        if (event.key === 'Backspace' && tagDraft === '' && form.tags.length > 0) {
                          event.preventDefault()
                          setForm(current => ({ ...current, tags: current.tags.slice(0, -1) }))
                        }
                      }}
                      onBlur={commitTagDraft}
                    />
                  </div>
                  <span className={css.fieldHint}>{t('memoryTagsHint')}</span>
                </div>
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
                  <Button variant="primary" disabled={saveBusy || projectRequired} onClick={() => { void createEntry() }}>
                    {saveBusy ? <Spinner /> : null}{saveBusy ? t('memorySaving') : t('memorySave')}
                  </Button>
                  <Button variant="secondary" onClick={closeCreate}>{t('cancel')}</Button>
                </div>
              </div>
            </DialogShell>
          </div>
        )
        : null}

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

      {stateReady && auditOpen && auditResult !== null
        ? (
          <div className={css.dialogPortal}>
            <DialogShell t={t} title={t('memoryAuditTitle')} wide onClose={() => { setAuditOpen(false) }}>
              {auditEmpty
                ? <EmptyBlock description={t('memoryAuditEmpty')} />
                : (
                  <div className={css.auditGroups}>
                    {auditResult.stale.length > 0
                      ? (
                        <section className={css.auditGroup}>
                          {auditGroupTitle(t('memoryAuditStaleTitle'), auditResult.stale.length)}
                          {auditResult.stale.map(item => auditRow(item, t('memoryAuditStaleHint')))}
                        </section>
                      )
                      : null}
                    {auditResult.duplicates.length > 0
                      ? (
                        <section className={css.auditGroup}>
                          {auditGroupTitle(t('memoryAuditDuplicateTitle'), auditResult.duplicates.length)}
                          {auditResult.duplicates.map(pair => (
                            <div key={`${pair.left.id}-${pair.right.id}`} className={css.auditPair}>
                              <span className={css.auditPairKeep}>{t('memoryAuditKeep', { name: pair.keep.name })}</span>
                              {auditRow(pair.left, t('memoryAuditDuplicateHint'))}
                              {auditRow(pair.right, t('memoryAuditDuplicateHint'))}
                            </div>
                          ))}
                        </section>
                      )
                      : null}
                    {auditResult.lowValue.length > 0
                      ? (
                        <section className={css.auditGroup}>
                          {auditGroupTitle(t('memoryAuditLowValueTitle'), auditResult.lowValue.length)}
                          {auditResult.lowValue.map(item => auditRow(item, t('memoryAuditLowValueHint')))}
                        </section>
                      )
                      : null}
                  </div>
                )}
              <div className={css.auditBar}>
                <span className={css.auditBarCount}>{t('memoryAuditSelected', { count: auditSelected.length })}</span>
                {auditConfirmDelete
                  ? (
                    <span className={css.confirmArea} role="group" aria-label={t('memoryAuditDeleteConfirm', { count: auditSelected.length })}>
                      <span className={css.confirmText}>{t('memoryAuditDeleteConfirm', { count: auditSelected.length })}</span>
                      <Button variant="danger" disabled={auditBatchBusy} onClick={() => { void runAuditBatch('delete') }}>
                        {auditBatchBusy ? <Spinner /> : null}{auditBatchBusy ? t('memoryDeleting') : t('memoryDeleteConfirm')}
                      </Button>
                      <Button variant="secondary" onClick={() => setAuditConfirmDelete(false)}>{t('cancel')}</Button>
                    </span>
                  )
                  : (
                    <>
                      <Button variant="secondary" disabled={auditSelected.length === 0 || auditBatchBusy} onClick={() => { void runAuditBatch('archive') }}>
                        {t('memoryArchive')}
                      </Button>
                      <Button variant="secondary" disabled={auditSelected.length === 0 || auditBatchBusy} onClick={() => { void runAuditBatch('stale') }}>
                        {t('memoryDeactivate')}
                      </Button>
                      <Button variant="danger" icon="trash" disabled={auditSelected.length === 0 || auditBatchBusy} onClick={() => setAuditConfirmDelete(true)}>
                        {t('memoryDelete')}
                      </Button>
                    </>
                  )}
              </div>
            </DialogShell>
          </div>
        )
        : null}
    </div>
  )
}
