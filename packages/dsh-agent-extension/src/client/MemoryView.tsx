/**
 * Memory tab of the Agent Extension panel: one compact toolbar row (scope
 * switch, narrowed project select, the search field with inline active-filter
 * chips and type-filter dropdown, then the action cluster with 「新建记忆」
 * rightmost), the entry list as a full-width card grid
 * with tag-chip filtering and a recency sort, a wide detail dialog for
 * create / edit / save / deactivate / archive / restore / two-step delete,
 * the Markdown export plus an index-refresh action, a settings dialog
 * (capture-injection switches and limits persist immediately; per-session
 * statistics and the recent-capture list with its one-shot undo live there
 * too), and a
 * health-audit dialog (stale / duplicate / low-value findings with batch
 * archive / deactivate / delete reusing the existing endpoints), and the
 * maintenance dialog (threshold prompt, confirm / run / result, and the
 * recent-run list with its whole-run undo).
 *
 * The view owns its local state (the hub snapshot only carries the section
 * tab) and talks to the host's `/memory/*` routes through `api()`; all copy
 * comes from `t()` and every toast goes through `actions.toast`.
 *
 * @module dsh-agent-extension/client/MemoryView
 */

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { api } from './api.ts'
import { runAudit, type AuditEntry, type AuditResult } from './audit.ts'
import { Badge, Button, EmptyBlock, IconButton, LoadingBlock, Select, Spinner, columnGap } from './controls.tsx'
import { DialogShell, PanelDialogLayer } from './dialogs.tsx'
import { Icon } from './icons.tsx'
import { Switch } from './Switch.tsx'
import { errorMessageFor, formatTime, type JsonRecord, type Translate } from './presentation.ts'
import type { HubActions } from './store.ts'
import { loadHostMarkdownText } from './host-ui.ts'
import {
  defaultSettings,
  type CreatedRef,
  type MaintenanceRun,
  type MemoryDetailRow,
  type MemoryListRow,
  type MemoryProjectWire,
  type MemoryScope,
  type MemorySettings,
  type MemoryStats,
  type MemoryStatus,
  type MemoryTier,
  type MemoryType,
  type RecentCapture,
  type RecentRetrieval,
} from '../shared/memory-wire.ts'
import { RECALL_MAX_CHARS, RECALL_MAX_PER_LAYER } from '../shared/memory-wire.ts'
import panelCss from './panel.module.css'
import css from './memory.module.css'

/** Editable form of the detail pane. */
interface MemoryForm {
  name: string
  description: string
  type: MemoryType
  tags: string[]
  importance: number
  content: string
}

/** Props of MemoryView (bound from the slot inject face). */
export interface MemoryViewProps {
  actions: HubActions
  t: Translate
}

/** 面板展示所需的维护运行字段（共享 wire 类型的子集）。 */
type MaintenanceRunSummary = Pick<MaintenanceRun, 'id' | 'at' | 'status' | 'counts' | 'error' | 'undone'>

/** `/memory/maintenance` 的阈值读数与最近运行。 */
interface MaintenanceInfo {
  due: boolean
  reason: string
  writesSince: number
  daysSince: number
  recentRuns: MaintenanceRunSummary[]
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

const TIER_LABEL_KEYS: Record<MemoryTier, string> = {
  short: 'memoryTierShort',
  long: 'memoryTierLong',
}

const DEFAULT_SETTINGS: MemorySettings = defaultSettings()

/** 「最近捕获」最多展示的条数（stats.recentCaptures 顺序即最新在前）。 */
const RECENT_CAPTURE_ROWS = 5

/** 维护对话框里展示的最近运行条数。 */
const RECENT_MAINTENANCE_ROWS = 3

/** 诊断对话框每块默认展示的条数，其余折叠。 */
const DIAGNOSIS_ROWS = 10

const EMPTY_FORM: MemoryForm = {
  name: '',
  description: '',
  type: 'preference',
  tags: [],
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
function normalizeSummary(raw: unknown): MemoryListRow {
  const item = record(raw)
  return {
    id: text(item.id),
    name: text(item.name),
    description: text(item.description),
    type: text(item.type),
    tags: Array.isArray(item.tags) ? item.tags.filter((tag): tag is string => typeof tag === 'string') : [],
    importance: integer(item.importance, 0, 100, 50),
    status: text(item.status),
    tier: item.tier === 'short' ? 'short' : 'long',
    reinforcement: integer(item.reinforcement, 0, Number.MAX_SAFE_INTEGER, 0),
    createdAt: text(item.createdAt),
    updatedAt: text(item.updatedAt),
  }
}

/** Normalize one full entry. */
function normalizeEntry(raw: unknown): MemoryDetailRow {
  const item = record(raw)
  return {
    ...normalizeSummary(item),
    content: text(item.content),
    originSessionId: text(item.originSessionId),
    supersedes: Array.isArray(item.supersedes) ? item.supersedes.filter((id): id is string => typeof id === 'string') : [],
    obsoleteVotes: integer(item.obsoleteVotes, 0, Number.MAX_SAFE_INTEGER, 0),
  }
}

/** 归一化项目数组，按 lastSeen 从新到旧排序。 */
function normalizeProjects(raw: unknown): MemoryProjectWire[] {
  const list = Array.isArray(raw) ? raw : []
  const projects: MemoryProjectWire[] = []
  for (const entry of list) {
    const item = record(entry)
    const key = text(item.key)
    if (key === '') continue
    projects.push({
      key,
      displayName: text(item.displayName) || key,
      source: text(item.source),
      identity: text(item.identity),
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

/** 归一化设置块（维护模型缺省为空串：继承宿主默认模型）。 */
function normalizeSettings(raw: unknown): MemorySettings {
  const item = record(raw)
  return {
    captureEnabled: item.captureEnabled !== false,
    captureSessionEnd: item.captureSessionEnd !== false,
    injectEnabled: item.injectEnabled !== false,
    indexLimitGlobal: integer(item.indexLimitGlobal, 0, RECALL_MAX_PER_LAYER, DEFAULT_SETTINGS.indexLimitGlobal),
    indexLimitProject: integer(item.indexLimitProject, 0, RECALL_MAX_PER_LAYER, DEFAULT_SETTINGS.indexLimitProject),
    maxChars: integer(item.maxChars, 1000, RECALL_MAX_CHARS, DEFAULT_SETTINGS.maxChars),
    maintenanceProvider: text(item.maintenanceProvider),
    maintenanceModel: text(item.maintenanceModel),
    observationDays: integer(item.observationDays, 1, 365, DEFAULT_SETTINGS.observationDays),
    autoMaintenance: item.autoMaintenance !== false,
    autoMaintenanceThreshold: integer(item.autoMaintenanceThreshold, 5, 1000, DEFAULT_SETTINGS.autoMaintenanceThreshold),
    updatedAt: text(item.updatedAt),
  }
}

/** 归一化统计块（v2：会话命中、跳过原因与最近样本；检索样本缺省 []）。 */
function normalizeStats(raw: unknown): MemoryStats {
  const item = record(raw)
  const sessionsRaw = Array.isArray(item.sessions) ? item.sessions : []
  const sessions: MemoryStats['sessions'] = sessionsRaw.map((entry) => {
    const session = record(entry)
    return {
      sessionId: text(session.sessionId),
      injected: integer(session.injected, 0, Number.MAX_SAFE_INTEGER, 0),
      injectedUsed: integer(session.injectedUsed, 0, Number.MAX_SAFE_INTEGER, 0),
      searched: integer(session.searched, 0, Number.MAX_SAFE_INTEGER, 0),
      searchUsed: integer(session.searchUsed, 0, Number.MAX_SAFE_INTEGER, 0),
      overflow: integer(session.overflow, 0, Number.MAX_SAFE_INTEGER, 0),
      updatedAt: text(session.updatedAt),
    }
  })
  const skipReasons: Record<string, number> = {}
  for (const [reason, count] of Object.entries(record(item.skipReasons))) {
    skipReasons[reason] = integer(count, 0, Number.MAX_SAFE_INTEGER, 0)
  }
  const recentInjections: MemoryStats['recentInjections'] = (Array.isArray(item.recentInjections) ? item.recentInjections : [])
    .map(record)
    .map(sample => ({
      sessionId: text(sample.sessionId),
      at: text(sample.at),
      entries: integer(sample.entries, 0, Number.MAX_SAFE_INTEGER, 0),
      chars: integer(sample.chars, 0, Number.MAX_SAFE_INTEGER, 0),
      truncated: sample.truncated === true,
    }))
  const recentCaptures: MemoryStats['recentCaptures'] = (Array.isArray(item.recentCaptures) ? item.recentCaptures : [])
    .map(record)
    .map((sample) => {
      const skippedReason = text(sample.skippedReason)
      const error = text(sample.error)
      const created: CreatedRef[] = (Array.isArray(sample.created) ? sample.created : [])
        .map(record)
        .map((entry): CreatedRef => ({
          id: text(entry.id),
          scope: entry.scope === 'project' ? 'project' : 'global',
          project: text(entry.project),
        }))
      return {
        id: text(sample.id),
        at: text(sample.at),
        sessionId: text(sample.sessionId),
        written: integer(sample.written, 0, Number.MAX_SAFE_INTEGER, 0),
        created,
        undone: sample.undone === true,
        ...(skippedReason === '' ? {} : { skippedReason }),
        ...(error === '' ? {} : { error }),
      }
    })
  const recentRetrievals: RecentRetrieval[] = (Array.isArray(item.recentRetrievals) ? item.recentRetrievals : [])
    .map(record)
    .map(sample => ({
      at: text(sample.at),
      sessionId: text(sample.sessionId),
      query: text(sample.query),
      results: integer(sample.results, 0, Number.MAX_SAFE_INTEGER, 0),
      ids: Array.isArray(sample.ids) ? sample.ids.filter((id): id is string => typeof id === 'string') : [],
    }))
  return {
    captureRuns: integer(item.captureRuns, 0, Number.MAX_SAFE_INTEGER, 0),
    capturedEntries: integer(item.capturedEntries, 0, Number.MAX_SAFE_INTEGER, 0),
    captureSkips: integer(item.captureSkips, 0, Number.MAX_SAFE_INTEGER, 0),
    sessions,
    skipReasons,
    recentInjections,
    recentCaptures,
    recentRetrievals,
  }
}

/** 归一化一次维护运行；未知状态按「无变更」处理。 */
function normalizeMaintenanceRun(raw: unknown): MaintenanceRunSummary {
  const item = record(raw)
  const counts = record(item.counts)
  return {
    id: text(item.id),
    at: text(item.at),
    status: item.status === 'completed' || item.status === 'failed' || item.status === 'empty' ? item.status : 'empty',
    counts: {
      candidates: integer(counts.candidates, 0, Number.MAX_SAFE_INTEGER, 0),
      merges: integer(counts.merges, 0, Number.MAX_SAFE_INTEGER, 0),
      staled: integer(counts.staled, 0, Number.MAX_SAFE_INTEGER, 0),
      restored: integer(counts.restored, 0, Number.MAX_SAFE_INTEGER, 0),
      deleted: integer(counts.deleted, 0, Number.MAX_SAFE_INTEGER, 0),
    },
    error: text(item.error),
    undone: item.undone === true,
  }
}

/** 归一化维护概览；未知/失败载荷读作「未达阈值」。 */
function normalizeMaintenance(raw: unknown): MaintenanceInfo {
  const item = record(raw)
  return {
    due: item.due === true,
    reason: text(item.reason),
    writesSince: integer(item.writesSince, 0, Number.MAX_SAFE_INTEGER, 0),
    daysSince: integer(item.daysSince, -1, Number.MAX_SAFE_INTEGER, -1),
    recentRuns: (Array.isArray(item.recentRuns) ? item.recentRuns : []).map(normalizeMaintenanceRun),
  }
}

/** 维护状态文案 key。 */
function maintenanceStatusKey(status: MaintenanceRunSummary['status']): string {
  if (status === 'completed') return 'memoryMaintenanceStatusCompleted'
  if (status === 'failed') return 'memoryMaintenanceStatusFailed'
  return 'memoryMaintenanceStatusEmpty'
}

/** 维护状态徽章色。 */
function maintenanceTone(run: MaintenanceRunSummary): 'success' | 'error' | 'plain' {
  if (run.undone) return 'plain'
  return run.status === 'completed' ? 'success' : run.status === 'failed' ? 'error' : 'plain'
}

/** 阈值原因：优先本地化的条数/天数，服务端 reason 只作兜底。 */
function maintenanceDueText(info: MaintenanceInfo, t: Translate): string {
  // 从未维护时服务端给 daysSince = -1（见共享 wire 注释）。
  if (info.daysSince < 0) return t('memoryMaintenanceDueNeverHint', { writes: info.writesSince })
  if (info.writesSince > 0 || info.daysSince > 0) {
    return t('memoryMaintenanceDueHint', { writes: info.writesSince, days: info.daysSince })
  }
  return info.reason !== '' ? info.reason : t('memoryMaintenanceDueHint', { writes: 0, days: 0 })
}

/** Form values of one loaded entry. */
function formOf(entry: MemoryDetailRow): MemoryForm {
  const type = TYPE_VALUES.find(value => value === entry.type) ?? 'preference'
  return {
    name: entry.name,
    description: entry.description,
    type,
    tags: [...entry.tags],
    importance: entry.importance,
    content: entry.content,
  }
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

/** Localized tier label; unknown values fall back to long-term wording. */
function tierLabel(value: string, t: Translate): string {
  const tier: MemoryTier = value === 'short' ? 'short' : 'long'
  return t(TIER_LABEL_KEYS[tier])
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

/** 百分比展示；分母为 0（尚无会话数据）时显示破折号。 */
function percentText(used: number, total: number): string {
  return total <= 0 ? '—' : `${Math.round((used / total) * 100)}%`
}

/** 汇总所有会话的注入与检索计数。 */
function recallTotalsOf(stats: MemoryStats | null): {
  injected: number
  injectedUsed: number
  searched: number
  searchUsed: number
} {
  const totals = { injected: 0, injectedUsed: 0, searched: 0, searchUsed: 0 }
  for (const session of stats?.sessions ?? []) {
    totals.injected += session.injected
    totals.injectedUsed += session.injectedUsed
    totals.searched += session.searched ?? 0
    totals.searchUsed += session.searchUsed ?? 0
  }
  return totals
}

/** 捕获行的说明文本：错误优先，其次跳过原因；都没有时为空串。 */
function captureNoteOf(row: RecentCapture, t: Translate): string {
  if (row.error !== undefined && row.error !== '') return row.error
  if (row.skippedReason !== undefined && row.skippedReason !== '') {
    return t('memoryCaptureSkipped', { reason: row.skippedReason })
  }
  return ''
}

/** Render the memory tab. */
export function MemoryView({ actions, t }: MemoryViewProps): ReactNode {
  const [stateReady, setStateReady] = useState(false)
  const [stateBusy, setStateBusy] = useState(false)
  const [stateError, setStateError] = useState('')
  const [stateToken, setStateToken] = useState(0)
  const [projects, setProjects] = useState<MemoryProjectWire[]>([])
  const [stats, setStats] = useState<MemoryStats | null>(null)
  const [scope, setScope] = useState<MemoryScope>('global')
  const [project, setProject] = useState('')
  const [query, setQuery] = useState('')
  const [appliedQuery, setAppliedQuery] = useState('')
  const [typeFilter, setTypeFilter] = useState<MemoryType | ''>('')
  const [entries, setEntries] = useState<MemoryListRow[]>([])
  const [listReady, setListReady] = useState(false)
  const [listBusy, setListBusy] = useState(false)
  const [listError, setListError] = useState('')
  const [listToken, setListToken] = useState(0)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [entry, setEntry] = useState<MemoryDetailRow | null>(null)
  const [creating, setCreating] = useState(false)
  const [detailStatus, setDetailStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle')
  const [detailError, setDetailError] = useState('')
  const [form, setForm] = useState<MemoryForm>(EMPTY_FORM)
  const [saveBusy, setSaveBusy] = useState(false)
  const [statusBusy, setStatusBusy] = useState(false)
  const [deleteBusy, setDeleteBusy] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [exportBusy, setExportBusy] = useState(false)
  const [refreshIndexBusy, setRefreshIndexBusy] = useState(false)
  const [settings, setSettings] = useState<MemorySettings>(DEFAULT_SETTINGS)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [maintenance, setMaintenance] = useState<MaintenanceInfo | null>(null)
  const [maintenanceOpen, setMaintenanceOpen] = useState(false)
  const [maintenanceBusy, setMaintenanceBusy] = useState(false)
  const [maintenanceRunning, setMaintenanceRunning] = useState(false)
  const [maintenanceUndoBusy, setMaintenanceUndoBusy] = useState(false)
  const [maintenanceResult, setMaintenanceResult] = useState<MaintenanceRunSummary | null>(null)
  // 撤销进行中的捕获 id；本地已撤销 id 用于撤销后立即显示状态，直到重拉统计。
  const [undoBusyId, setUndoBusyId] = useState<string | null>(null)
  const [undoneCaptureIds, setUndoneCaptureIds] = useState<string[]>([])
  const [tagFilter, setTagFilter] = useState('')
  const [sort, setSort] = useState<'default' | 'recent'>('default')
  const [tagDraft, setTagDraft] = useState('')
  const [auditOpen, setAuditOpen] = useState(false)
  const [auditBusy, setAuditBusy] = useState(false)
  const [auditResult, setAuditResult] = useState<AuditResult | null>(null)
  const [auditSelected, setAuditSelected] = useState<string[]>([])
  const [auditConfirmDelete, setAuditConfirmDelete] = useState(false)
  const [auditBatchBusy, setAuditBatchBusy] = useState(false)
  const [showArchived, setShowArchived] = useState(false)
  const [diagnosisOpen, setDiagnosisOpen] = useState(false)
  const [diagnosisBusy, setDiagnosisBusy] = useState(false)
  const [diagnosisError, setDiagnosisError] = useState('')
  const [diagnosisStats, setDiagnosisStats] = useState<MemoryStats | null>(null)
  const [diagnosisTiers, setDiagnosisTiers] = useState<{ short: number; long: number } | null>(null)
  const [diagnosisRuns, setDiagnosisRuns] = useState<MaintenanceRunSummary[]>([])
  const [diagnosisUndoBusyId, setDiagnosisUndoBusyId] = useState<string | null>(null)

  // The user's explicit scope choice wins over the auto-selected defaults.
  const userChoseRef = useRef(false)
  const detailSeq = useRef(0)
  // 详情标题区的 id 文本节点：复制失败时全选它作为降级。
  const idTextRef = useRef<HTMLElement | null>(null)
  // Latest local settings (kept in sync synchronously) and the last value the
  // server confirmed; a failed persist rolls the UI back to the latter.
  const settingsRef = useRef<MemorySettings>(DEFAULT_SETTINGS)
  const savedSettingsRef = useRef<MemorySettings>(DEFAULT_SETTINGS)
  const settingsTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Maintenance dialog visibility is mirrored in a ref so the async threshold
  // probe never stacks a due prompt on top of an open dialog.
  const maintenanceOpenRef = useRef(false)
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

  // Threshold probe: once the state loads, fetch the maintenance overview
  // alongside the list. Due maintenance runs automatically after sessions
  // (memory-host autoMaintainIfNeeded), so the panel only reflects the state
  // instead of interrupting with a prompt.
  useEffect(() => {
    if (!stateReady) return
    let cancelled = false
    void (async () => {
      try {
        const data = await api<JsonRecord>('/memory/maintenance')
        if (cancelled) return
        setMaintenance(normalizeMaintenance(data))
      } catch {
        // 探测失败不打扰面板：工具条入口仍可手动打开并显示错误。
      }
    })()
    return () => { cancelled = true }
  }, [stateReady, stateToken])

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
    // 归档条目默认隐藏；开启「显示已归档」后才让服务端一并返回。
    if (showArchived) params.set('includeArchived', '1')
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
  }, [stateReady, scope, project, appliedQuery, typeFilter, showArchived, listToken, t])

  const latestProjectKey = (list: MemoryProjectWire[]): string => list[0]?.key ?? ''

  const closeEditor = (): void => {
    detailSeq.current += 1
    setSelectedId(null)
    setEntry(null)
    setCreating(false)
    setConfirmDelete(false)
    setDetailStatus('idle')
    setDetailError('')
    setTagDraft('')
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
    setTagDraft('')
  }

  const openEntry = (id: string): void => {
    const seq = ++detailSeq.current
    setCreating(false)
    setSelectedId(id)
    setEntry(null)
    setForm(EMPTY_FORM)
    setConfirmDelete(false)
    setTagDraft('')
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
        tags: form.tags,
        importance: form.importance,
      }
      if (scope === 'project') body.project = project
      if (!creating && entry) body.id = entry.id
      const data = await api<JsonRecord>('/memory/save', { method: 'POST', body })
      const saved = normalizeEntry(data.entry)
      setEntry(saved)
      setForm(formOf(saved))
      setTagDraft('')
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

  const changeTier = async (tier: MemoryTier): Promise<void> => {
    if (entry === null || statusBusy) return
    setStatusBusy(true)
    try {
      const body: Record<string, unknown> = { scope, id: entry.id, tier }
      if (scope === 'project') body.project = project
      const data = await api<JsonRecord>('/memory/tier', { method: 'POST', body })
      const updated = normalizeEntry(data.entry)
      setEntry(updated)
      setForm(formOf(updated))
      actions.toast('success', t('memoryTierDone'))
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
   * Switches persist immediately; numeric and model fields debounce by 500 ms.
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

  /** 重建提示词索引：只改变注入内容，本视图的条目列表不重载。 */
  const refreshIndex = async (): Promise<void> => {
    if (refreshIndexBusy) return
    setRefreshIndexBusy(true)
    try {
      await api<JsonRecord>('/memory/refresh-index', { method: 'POST' })
      actions.toast('success', t('memoryRefreshIndexDone'))
    } catch (error) {
      actions.toast('error', t('memoryRefreshIndexFailed', { message: errorMessageFor(error, t) }))
    } finally {
      setRefreshIndexBusy(false)
    }
  }

  /** 关闭维护对话框；运行/撤销进行中保持打开。 */
  const closeMaintenance = (): void => {
    if (maintenanceRunning || maintenanceUndoBusy) return
    maintenanceOpenRef.current = false
    setMaintenanceOpen(false)
    setMaintenanceResult(null)
  }

  /** 工具条入口：先取阈值概览，再打开确认对话框。 */
  const openMaintenance = async (): Promise<void> => {
    if (maintenanceBusy || maintenanceRunning) return
    setMaintenanceBusy(true)
    setMaintenanceResult(null)
    try {
      const data = await api<JsonRecord>('/memory/maintenance')
      setMaintenance(normalizeMaintenance(data))
      maintenanceOpenRef.current = true
      setMaintenanceOpen(true)
    } catch (error) {
      actions.toast('error', errorMessageFor(error, t))
    } finally {
      setMaintenanceBusy(false)
    }
  }

  /** 运行维护：范围由服务端决定（全局 + 最久未维护的项目）。 */
  const runMaintenance = async (): Promise<void> => {
    if (maintenanceRunning || maintenance === null) return
    setMaintenanceRunning(true)
    try {
      const data = await api<JsonRecord>('/memory/maintenance/run', { method: 'POST', body: {} })
      setMaintenanceResult(normalizeMaintenanceRun(data.run))
      setStateToken(token => token + 1)
    } catch (error) {
      actions.toast('error', t('memoryMaintenanceFailed', { message: errorMessageFor(error, t) }))
    } finally {
      setMaintenanceRunning(false)
    }
  }

  /** 撤销一次维护：本地标记撤销，随后经 stateToken 重拉概览与面板状态。 */
  const undoMaintenance = async (runId: string): Promise<void> => {
    if (maintenanceUndoBusy || runId === '') return
    setMaintenanceUndoBusy(true)
    try {
      await api<JsonRecord>('/memory/maintenance/undo', { method: 'POST', body: { runId } })
      setMaintenance(current => current === null ? current : {
        ...current,
        recentRuns: current.recentRuns.map(run => (run.id === runId ? { ...run, undone: true } : run)),
      })
      setMaintenanceResult(current => (current !== null && current.id === runId ? { ...current, undone: true } : current))
      actions.toast('success', t('memoryMaintenanceUndone'))
      setStateToken(token => token + 1)
    } catch (error) {
      actions.toast('error', t('memoryMaintenanceUndoFailed', { message: errorMessageFor(error, t) }))
    } finally {
      setMaintenanceUndoBusy(false)
    }
  }

  /** 撤销一次捕获：归档该次写入，随后重拉 /memory/state 刷新统计。 */
  const undoCapture = async (id: string): Promise<void> => {
    if (undoBusyId !== null || id === '') return
    setUndoBusyId(id)
    try {
      await api<JsonRecord>('/memory/undo-capture', { method: 'POST', body: { id } })
      setUndoneCaptureIds(current => (current.includes(id) ? current : [...current, id]))
      actions.toast('success', t('memoryUndoCaptureDone'))
      setStateToken(token => token + 1)
    } catch (error) {
      actions.toast('error', t('memoryUndoCaptureFailed', { message: errorMessageFor(error, t) }))
    } finally {
      setUndoBusyId(null)
    }
  }

  /** 重拉诊断所需的两个数据面：统计（注入/捕获/检索样本）与维护流水。 */
  const loadDiagnosis = async (): Promise<void> => {
    setDiagnosisBusy(true)
    setDiagnosisError('')
    try {
      const [stateData, maintenanceData] = await Promise.all([
        api<JsonRecord>('/memory/state'),
        api<JsonRecord>('/memory/maintenance'),
      ])
      setDiagnosisStats(normalizeStats(stateData.stats))
      const tiers = record(stateData.tiers)
      setDiagnosisTiers({
        short: integer(tiers.short, 0, Number.MAX_SAFE_INTEGER, 0),
        long: integer(tiers.long, 0, Number.MAX_SAFE_INTEGER, 0),
      })
      setDiagnosisRuns(normalizeMaintenance(maintenanceData).recentRuns)
    } catch (error) {
      setDiagnosisError(errorMessageFor(error, t))
    } finally {
      setDiagnosisBusy(false)
    }
  }

  /** 打开诊断对话框：每次打开都拉新快照，避免展示过期样本。 */
  const openDiagnosis = (): void => {
    setDiagnosisOpen(true)
    setDiagnosisStats(null)
    setDiagnosisRuns([])
    setDiagnosisError('')
    void loadDiagnosis()
  }

  /** 撤销一次维护；成功后全体重拉两块诊断数据。 */
  const undoDiagnosisRun = async (runId: string): Promise<void> => {
    if (diagnosisUndoBusyId !== null || runId === '') return
    setDiagnosisUndoBusyId(runId)
    try {
      await api<JsonRecord>('/memory/maintenance/undo', { method: 'POST', body: { runId } })
      setDiagnosisRuns(current => current.map(run => (run.id === runId ? { ...run, undone: true } : run)))
      actions.toast('success', t('memoryDiagnosisUndoDone'))
      await loadDiagnosis()
    } catch (error) {
      actions.toast('error', t('memoryDiagnosisUndoFailed', { message: errorMessageFor(error, t) }))
    } finally {
      setDiagnosisUndoBusyId(null)
    }
  }

  /**
   * 复制记忆 id：优先剪贴板；环境不提供或写入失败时静默降级为全选 id 文本
   * （不弹错误，用户可直接 Ctrl/Cmd+C）。
   */
  const copyEntryId = async (id: string): Promise<void> => {
    try {
      const clipboard = typeof navigator === 'undefined' ? undefined : navigator.clipboard
      if (clipboard === undefined || typeof clipboard.writeText !== 'function') throw new Error('clipboard unavailable')
      await clipboard.writeText(id)
      actions.toast('success', t('memoryIdCopied'))
      return
    } catch {
      // 降级路径：全选标题区的 id 文本。
    }
    const node = idTextRef.current
    if (node === null || typeof document === 'undefined' || typeof window === 'undefined') return
    const selection = window.getSelection()
    if (selection === null) return
    const range = document.createRange()
    range.selectNodeContents(node)
    selection.removeAllRanges()
    selection.addRange(range)
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
  // Toolbar filter summary: one compact chip at the search field's right edge,
  // an ellipsis marks further active filters, so the input keeps its width.
  const activeFilters: Array<{ kind: 'type' | 'tag', label: string, clearLabel: string }> = []
  if (typeFilter !== '') {
    activeFilters.push({ kind: 'type', label: typeLabel(typeFilter, t), clearLabel: t('memoryClearTypeFilter') })
  }
  if (tagFilter !== '') {
    activeFilters.push({ kind: 'tag', label: tagFilter, clearLabel: t('memoryClearTagFilter') })
  }
  const visibleFilter = activeFilters[0] ?? null
  const hiddenFilterCount = activeFilters.length - (visibleFilter === null ? 0 : 1)
  const recallTotals = recallTotalsOf(stats)
  const injectionRate = percentText(recallTotals.injectedUsed, recallTotals.injected)
  const retrievalRate = percentText(recallTotals.searchUsed, recallTotals.searched)
  const recentCaptureRows = (stats?.recentCaptures ?? []).slice(0, RECENT_CAPTURE_ROWS)
  const showEditor = creating || selectedId !== null
  // 宿主官方 Markdown 渲染组件（可选）：拿不到时退回「只读提示 + 系统应用打开」。
  const HostMarkdownText = loadHostMarkdownText()
  const typeOptions: ReadonlyArray<{ value: MemoryType | '', label: string }> = [
    { value: '', label: t('memoryTypeAll') },
    ...TYPE_VALUES.map(value => ({ value, label: t(TYPE_LABEL_KEYS[value]) })),
  ]

  // Client-side refinements over the fetched list: 归档默认隐藏（服务端已按
// includeArchived 过滤，这里再兜底旧服务端），然后按标签筛选、排序。
  const visibleEntries = (showArchived ? entries : entries.filter(item => item.status !== 'archived'))
    .filter(item => tagFilter === '' || item.tags.includes(tagFilter))
  const sortedEntries = sort === 'recent'
    ? [...visibleEntries].sort((left, right) => timeOf(right.updatedAt) - timeOf(left.updatedAt))
    : visibleEntries

  const auditEmpty = auditResult !== null
    && auditResult.stale.length === 0
    && auditResult.duplicates.length === 0
    && auditResult.lowValue.length === 0

  /** 诊断对话框的一块：前 10 条直接展示，其余折叠在 details 里。 */
  const diagnosisSection = (title: string, rows: ReactNode[], empty: string): ReactNode => (
    <section className={css.diagnosisSection}>
      <h3 className={css.statsTitle}>{title}</h3>
      {rows.length === 0
        ? <span className={css.statLabel}>{empty}</span>
        : (
          <>
            <div className={css.diagnosisList}>{rows.slice(0, DIAGNOSIS_ROWS)}</div>
            {rows.length > DIAGNOSIS_ROWS
              ? (
                <details className={css.diagnosisMore}>
                  <summary>{t('memoryDiagnosisMore', { count: rows.length - DIAGNOSIS_ROWS })}</summary>
                  <div className={css.diagnosisList}>{rows.slice(DIAGNOSIS_ROWS)}</div>
                </details>
              )
              : null}
          </>
        )}
    </section>
  )

  const diagnosisEmptyText = t('memoryDiagnosisEmpty')
  const injectionRows = (diagnosisStats?.recentInjections ?? []).map((row, index) => {
    const at = formatTime(row.at)
    return (
      <div key={`${index}-${row.at}-${row.sessionId}`} className={css.diagnosisRow}>
        {at !== '' ? <span className={css.diagnosisRowTime}>{at}</span> : null}
        <span className={css.diagnosisRowMain}>
          <span>{t('memoryDiagnosisEntries', { count: row.entries })}</span>
          <span>{t('memoryDiagnosisChars', { count: row.chars })}</span>
          {row.truncated ? <Badge tone="warn">{t('memoryDiagnosisTruncated')}</Badge> : null}
        </span>
      </div>
    )
  })
  const captureRows = (diagnosisStats?.recentCaptures ?? []).map((row, index) => {
    const at = formatTime(row.at)
    const note = captureNoteOf(row, t)
    return (
      <div key={`${index}-${row.id}`} className={css.diagnosisRow}>
        {at !== '' ? <span className={css.diagnosisRowTime}>{at}</span> : null}
        <span className={css.diagnosisRowMain}>
          <span>{t('memoryCaptureWritten', { count: row.written })}</span>
          {note !== '' ? <span title={note}>{note}</span> : null}
        </span>
        {row.undone === true ? <Badge tone="plain">{t('memoryCaptureUndone')}</Badge> : null}
      </div>
    )
  })
  const retrievalRows = (diagnosisStats?.recentRetrievals ?? []).map((row, index) => {
    const at = formatTime(row.at)
    const query = row.query.trim()
    return (
      <div key={`${index}-${row.at}-${row.sessionId}`} className={css.diagnosisRow}>
        {at !== '' ? <span className={css.diagnosisRowTime}>{at}</span> : null}
        <span className={css.diagnosisRowMain}>
          <span title={query}>{t('memoryDiagnosisQuery', { query: query === '' ? '—' : query })}</span>
          <span>{t('memoryDiagnosisResults', { count: row.results })}</span>
          {row.ids.length > 0 ? <span className={css.diagnosisRowIds}>{row.ids.slice(0, 3).join(', ')}</span> : null}
        </span>
      </div>
    )
  })
  const maintenanceRunRows = diagnosisRuns.map(run => {
    const at = formatTime(run.at)
    return (
      <div key={run.id !== '' ? run.id : `${run.at}-${run.status}`} className={css.diagnosisRow}>
        {at !== '' ? <span className={css.diagnosisRowTime}>{at}</span> : null}
        <Badge tone={maintenanceTone(run)}>
          {run.undone ? t('memoryMaintenanceStatusUndone') : t(maintenanceStatusKey(run.status))}
        </Badge>
        <span className={css.diagnosisRowMain}>{t('memoryMaintenanceResult', { ...run.counts })}</span>
        {run.status === 'completed' && !run.undone && run.id !== ''
          ? (
            <Button
              variant="ghost"
              icon="rotateCcw"
              disabled={diagnosisUndoBusyId !== null}
              onClick={() => { void undoDiagnosisRun(run.id) }}
            >
              {diagnosisUndoBusyId === run.id ? <Spinner /> : null}{t('memoryDiagnosisUndo')}
            </Button>
          )
          : null}
      </div>
    )
  })

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

  const maintenanceRuns = (maintenance?.recentRuns ?? []).slice(0, RECENT_MAINTENANCE_ROWS)
  const maintenanceTitle = maintenanceResult !== null && maintenanceResult.status !== 'failed'
    ? t('memoryMaintenanceResultTitle')
    : t('memoryMaintenanceConfirmTitle')

  // Footer and body of the one maintenance dialog: result summary or the
  // confirm view (with the current due readout). Due maintenance runs
  // automatically after sessions; the dialog is the manual entry only.
  let maintenanceBody: ReactNode = null
  let maintenanceFooter: ReactNode = null
  if (maintenanceResult !== null) {
    maintenanceBody = (
      <div className={css.maintenanceStack}>
        <div className={css.maintenanceResult}>
          <Badge tone={maintenanceTone(maintenanceResult)}>
            {maintenanceResult.undone
              ? t('memoryMaintenanceStatusUndone')
              : t(maintenanceStatusKey(maintenanceResult.status))}
          </Badge>
          <span className={css.maintenanceResultCounts}>{t('memoryMaintenanceResult', { ...maintenanceResult.counts })}</span>
        </div>
        {maintenanceResult.status === 'failed'
          ? (
            <div className={css.maintenanceError} role="alert">
              {t('memoryMaintenanceFailed', { message: maintenanceResult.error !== '' ? maintenanceResult.error : t('unknownError') })}
            </div>
          )
          : null}
        {maintenanceResult.undone
          ? <div className={css.maintenanceHint}>{t('memoryMaintenanceUndone')}</div>
          : null}
      </div>
    )
    maintenanceFooter = [
      maintenanceResult.status === 'completed' && !maintenanceResult.undone
        ? (
          <Button
            key="undo"
            variant="ghost"
            icon="rotateCcw"
            disabled={maintenanceUndoBusy}
            onClick={() => { void undoMaintenance(maintenanceResult.id) }}
          >
            {maintenanceUndoBusy ? <Spinner /> : null}{t('memoryMaintenanceUndo')}
          </Button>
        )
        : null,
      <Button key="close" variant="secondary" disabled={maintenanceUndoBusy} onClick={closeMaintenance}>{t('close')}</Button>,
    ]
  } else if (maintenance !== null) {
    maintenanceBody = (
      <div className={css.maintenanceStack}>
        <div className={css.maintenanceNotice}>
          {maintenance.due ? maintenanceDueText(maintenance, t) : t('memoryMaintenanceNotDueHint')}
        </div>
        <div className={css.maintenanceHint}>{t('memoryMaintenanceConfirmHint')}</div>
        {maintenanceRunning
          ? (
            <div className={css.maintenanceRunning} role="status">
              <Spinner />
              <span>{t('memoryMaintenanceRunning')}</span>
            </div>
          )
          : null}
        <div className={css.maintenanceSection}>
          <h3 className={css.statsTitle}>{t('memoryMaintenanceRecent')}</h3>
          {maintenanceRuns.length === 0
            ? <span className={css.statLabel}>{t('memoryMaintenanceEmpty')}</span>
            : (
              <div className={css.maintenanceList}>
                {maintenanceRuns.map(run => (
                  <div key={run.id !== '' ? run.id : `${run.at}-${run.status}`} className={css.maintenanceRow}>
                    {formatTime(run.at) !== '' ? <span className={css.maintenanceRowTime}>{formatTime(run.at)}</span> : null}
                    <Badge tone={maintenanceTone(run)}>
                      {run.undone ? t('memoryMaintenanceStatusUndone') : t(maintenanceStatusKey(run.status))}
                    </Badge>
                    <span className={css.maintenanceRowMain}>{t('memoryMaintenanceResult', { ...run.counts })}</span>
                    {run.status === 'completed' && !run.undone && run.id !== ''
                      ? (
                        <Button
                          variant="ghost"
                          icon="rotateCcw"
                          disabled={maintenanceUndoBusy}
                          onClick={() => { void undoMaintenance(run.id) }}
                        >
                          {maintenanceUndoBusy ? <Spinner /> : null}{t('memoryMaintenanceUndo')}
                        </Button>
                      )
                      : null}
                  </div>
                ))}
              </div>
            )}
        </div>
      </div>
    )
    maintenanceFooter = [
      <Button key="cancel" variant="secondary" disabled={maintenanceRunning} onClick={closeMaintenance}>{t('cancel')}</Button>,
      <Button key="run" variant="primary" icon="wand" disabled={maintenanceRunning} onClick={() => { void runMaintenance() }}>
        {maintenanceRunning ? <Spinner /> : null}{t('memoryMaintenanceRun')}
      </Button>,
    ]
  }

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
          <h2 className={css.sectionTitle}>
            {t('memoryListTitle')}
            <span className={css.sectionCount}>{String(sortedEntries.length)}</span>
          </h2>
          <span className={css.listHeadTools}>
            <button
              type="button"
              className={css.archiveToggle}
              aria-pressed={showArchived}
              title={t('memoryShowArchived')}
              onClick={() => { setShowArchived(current => !current) }}
            >
              <Icon name="folder" size={14} />
              <span>{t('memoryShowArchived')}</span>
            </button>
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
              description={appliedQuery !== '' || typeFilter !== '' || tagFilter !== '' || (!showArchived && entries.length > 0)
                ? t('memoryListEmptyFiltered')
                : t('memoryListEmpty')}
              action={appliedQuery === '' && typeFilter === '' && tagFilter === '' && (showArchived || entries.length === 0)
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
              onClick={() => openEntry(item.id)}
              onKeyDown={(event) => {
                if (event.key !== 'Enter' && event.key !== ' ') return
                event.preventDefault()
                openEntry(item.id)
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
                {item.tier === 'short' && item.status === 'active'
                  ? <Badge tone="warn">{t('memoryTierShort')}</Badge>
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
                    onKeyDown={(event) => {
                      // 标签是卡片内的按钮：Enter/Space 不要再冒泡到卡片，
                      // 否则会同时打开详情；原生按钮激活仍由浏览器默认行为完成。
                      if (event.key === 'Enter' || event.key === ' ') event.stopPropagation()
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
          {visibleFilter !== null
            ? (
              <span className={css.filterChip} title={activeFilters.map(item => item.label).join(' · ')}>
                <span className={css.filterChipText}>{visibleFilter.label}</span>
                {hiddenFilterCount > 0
                  ? <span className={css.filterChipMore} aria-hidden="true">…</span>
                  : null}
                <button
                  type="button"
                  className={css.filterChipClear}
                  aria-label={visibleFilter.clearLabel}
                  onClick={() => {
                    if (visibleFilter.kind === 'type') setTypeFilter('')
                    else setTagFilter('')
                  }}
                >
                  <Icon name="x" size={10} />
                </button>
              </span>
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
          <IconButton
            icon="download"
            title={exportBusy ? t('memoryExporting') : t('memoryExportMarkdown')}
            busy={exportBusy}
            disabled={exportBusy || projectRequired}
            onClick={() => { void exportMarkdown() }}
          />
          <IconButton icon="settings" title={t('memorySettingsButton')} onClick={() => { setSettingsOpen(true) }} />
          <IconButton
            icon="info"
            title={t('memoryDiagnosisButton')}
            onClick={openDiagnosis}
          />
          <IconButton
            icon="clipboardCheck"
            title={auditBusy ? t('memoryAuditRunning') : t('memoryAuditButton')}
            busy={auditBusy}
            disabled={auditBusy || projectRequired}
            onClick={() => { void openAudit() }}
          />
          <IconButton
            icon="wand"
            title={t('memoryMaintenanceButton')}
            busy={maintenanceBusy}
            disabled={maintenanceBusy || maintenanceRunning}
            onClick={() => { void openMaintenance() }}
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
          <Button variant="primary" icon="plus" disabled={projectMissing} onClick={startCreate}>
            {t('memoryNew')}
          </Button>
        </div>
      </header>

      {workspace}

      {stateReady && showEditor
        ? (
          <PanelDialogLayer>
            <DialogShell
              t={t}
              title={creating ? t('memoryCreateTitle') : t('memoryEditTitle')}
              titleMeta={entry !== null && !creating
                ? (
                  <span className={css.detailIdRow}>
                    <code ref={idTextRef} className={css.detailId} title={entry.id}>{entry.id}</code>
                    <IconButton
                      icon="clipboardCheck"
                      title={t('memoryCopyId')}
                      onClick={() => { void copyEntryId(entry.id) }}
                    />
                  </span>
                )
                : undefined}
              wide
              onClose={closeEditor}
            >
              {entry !== null && !creating
                ? (
                  <div className={css.editorStatus}>
                    <Badge tone={statusTone(entry.status)}>{statusLabel(entry.status, t)}</Badge>
                    <Badge tone={entry.tier === 'long' ? 'success' : 'warn'}>{tierLabel(entry.tier, t)}</Badge>
                    <Button
                      variant="secondary"
                      disabled={statusBusy}
                      onClick={() => { void changeTier(entry.tier === 'long' ? 'short' : 'long') }}
                    >
                      {entry.tier === 'long' ? t('memoryTierDemote') : t('memoryTierPromote')}
                    </Button>
                  </div>
                )
                : null}
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
                      {creating
                        ? (
                          <textarea
                            className={css.textarea}
                            rows={8}
                            aria-label={t('memoryFieldContent')}
                            value={form.content}
                            onChange={(event) => { setForm(current => ({ ...current, content: event.target.value })) }}
                          />
                        )
                        : (
                          <div className={`${css.readonlyBox}${HostMarkdownText === null ? '' : ` ${css.previewBox}`}`}>
                            {HostMarkdownText !== null && entry !== null
                              ? (
                                <div className={css.previewBody}>
                                  <HostMarkdownText text={entry.content} variant="body" />
                                </div>
                              )
                              : <span className={css.readonlyHint}>{t('memoryBodyReadOnlyHint')}</span>}
                            {entry !== null
                              ? (
                                <Button
                                  variant="secondary"
                                  icon="arrowUpRight"
                                  onClick={() => { actions.openMemoryInApp({ scope, project, id: entry.id }) }}
                                >
                                  {t('memoryOpenNative')}
                                </Button>
                              )
                              : null}
                          </div>
                        )}
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
            </DialogShell>
          </PanelDialogLayer>
        )
        : null}

      {stateReady && maintenanceOpen
        ? (
          <PanelDialogLayer>
            <DialogShell
              t={t}
              title={maintenanceTitle}
              wide
              {...(maintenanceRunning || maintenanceUndoBusy ? {} : { onClose: closeMaintenance })}
              footer={maintenanceFooter}
            >
              {maintenanceBody}
            </DialogShell>
          </PanelDialogLayer>
        )
        : null}

      {stateReady && settingsOpen
        ? (
          <PanelDialogLayer>
            <DialogShell
              t={t}
              title={t('memorySettingsTitle')}
              onClose={() => { setSettingsOpen(false) }}
              footer={[
                <Button
                  key="refresh-index"
                  variant="secondary"
                  icon="refresh"
                  disabled={refreshIndexBusy}
                  onClick={() => { void refreshIndex() }}
                >
                  {refreshIndexBusy ? <Spinner /> : null}{t('memoryRefreshIndex')}
                </Button>,
              ]}
            >
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
                    max={RECALL_MAX_PER_LAYER}
                    aria-label={t('memorySettingsIndexGlobal')}
                    value={settings.indexLimitGlobal}
                    onChange={(event) => { patchSettings({ indexLimitGlobal: integer(event.target.value, 0, RECALL_MAX_PER_LAYER, settingsRef.current.indexLimitGlobal) }, true) }}
                  />
                </label>
                <label className={css.field}>
                  <span className={css.fieldLabel}>{t('memorySettingsIndexProject')}</span>
                  <input
                    className={css.input}
                    type="number"
                    min={0}
                    max={RECALL_MAX_PER_LAYER}
                    aria-label={t('memorySettingsIndexProject')}
                    value={settings.indexLimitProject}
                    onChange={(event) => { patchSettings({ indexLimitProject: integer(event.target.value, 0, RECALL_MAX_PER_LAYER, settingsRef.current.indexLimitProject) }, true) }}
                  />
                </label>
                <label className={css.field}>
                  <span className={css.fieldLabel}>{t('memorySettingsMaxChars')}</span>
                  <input
                    className={css.input}
                    type="number"
                    min={1000}
                    max={RECALL_MAX_CHARS}
                    step={500}
                    aria-label={t('memorySettingsMaxChars')}
                    value={settings.maxChars}
                    onChange={(event) => { patchSettings({ maxChars: integer(event.target.value, 1000, RECALL_MAX_CHARS, settingsRef.current.maxChars) }, true) }}
                  />
                </label>
              </div>
              <div className={css.divider} />
              <div className={css.formGrid}>
                <label className={css.field}>
                  <span className={css.fieldLabel}>{t('memoryMaintenanceProvider')}</span>
                  <input
                    className={css.input}
                    type="text"
                    aria-label={t('memoryMaintenanceProvider')}
                    placeholder={t('memoryMaintenanceModelInherit')}
                    value={settings.maintenanceProvider}
                    onChange={(event) => { patchSettings({ maintenanceProvider: event.target.value }, true) }}
                  />
                </label>
                <label className={css.field}>
                  <span className={css.fieldLabel}>{t('memoryMaintenanceModel')}</span>
                  <input
                    className={css.input}
                    type="text"
                    aria-label={t('memoryMaintenanceModel')}
                    placeholder={t('memoryMaintenanceModelInherit')}
                    value={settings.maintenanceModel}
                    onChange={(event) => { patchSettings({ maintenanceModel: event.target.value }, true) }}
                  />
                </label>
              </div>
              <span className={css.fieldHint}>{t('memoryMaintenanceModelInherit')}</span>
              <div className={css.divider} />
              <div className={css.settingRow}>
                <span className={css.settingLabel}>{t('memorySettingsAutoMaintenance')}</span>
                <Switch
                  checked={settings.autoMaintenance}
                  label={t('memorySettingsAutoMaintenance')}
                  onChange={(next) => { patchSettings({ autoMaintenance: next }) }}
                />
              </div>
              <div className={css.numberGrid}>
                <label className={css.field}>
                  <span className={css.fieldLabel}>{t('memorySettingsObservationDays')}</span>
                  <input
                    className={css.input}
                    type="number"
                    min={1}
                    max={365}
                    aria-label={t('memorySettingsObservationDays')}
                    value={settings.observationDays}
                    onChange={(event) => { patchSettings({ observationDays: integer(event.target.value, 1, 365, settingsRef.current.observationDays) }, true) }}
                  />
                </label>
                <label className={css.field}>
                  <span className={css.fieldLabel}>{t('memorySettingsAutoThreshold')}</span>
                  <input
                    className={css.input}
                    type="number"
                    min={5}
                    max={1000}
                    aria-label={t('memorySettingsAutoThreshold')}
                    value={settings.autoMaintenanceThreshold}
                    onChange={(event) => { patchSettings({ autoMaintenanceThreshold: integer(event.target.value, 5, 1000, settingsRef.current.autoMaintenanceThreshold) }, true) }}
                  />
                </label>
              </div>
              <span className={css.fieldHint}>{t('memorySettingsAutoHint')}</span>
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
                  <span className={css.statLabel}>{t('memoryInjectionRate')}</span>
                  <span className={css.statValue}>{injectionRate}</span>
                </div>
                <div className={css.stat}>
                  <span className={css.statLabel}>{t('memoryRetrievalRate')}</span>
                  <span className={css.statValue}>{retrievalRate}</span>
                </div>
              </div>
              <div className={css.divider} />
              <div style={columnGap(8)}>
                <h3 className={css.statsTitle}>{t('memoryRecentCaptures')}</h3>
                {recentCaptureRows.length === 0
                  ? <span className={css.statLabel}>{t('memoryRecentCapturesEmpty')}</span>
                  : (
                    <div className={panelCss.listBlock}>
                      {recentCaptureRows.map((row, index) => {
                        const at = formatTime(row.at)
                        const note = captureNoteOf(row, t)
                        const undoId = row.id ?? ''
                        const undone = row.undone === true || undoneCaptureIds.includes(undoId)
                        return (
                          <div key={`${index}-${undoId}`} className={panelCss.listRow}>
                            {at !== '' ? <span className={css.statLabel}>{at}</span> : null}
                            <span>{t('memoryCaptureWritten', { count: row.written })}</span>
                            {note !== '' ? <span className={panelCss.listRowMain} title={note}>{note}</span> : null}
                            {undone
                              ? <span className={css.statLabel}>{t('memoryCaptureUndone')}</span>
                              : (row.created ?? []).length > 0
                                ? (
                                  <Button
                                    variant="ghost"
                                    icon="rotateCcw"
                                    disabled={undoBusyId !== null || undoId === ''}
                                    onClick={() => { void undoCapture(undoId) }}
                                  >
                                    {undoBusyId === undoId ? <Spinner /> : null}{t('memoryUndoCapture')}
                                  </Button>
                                )
                                : null}
                          </div>
                        )
                      })}
                    </div>
                  )}
              </div>
            </DialogShell>
          </PanelDialogLayer>
        )
        : null}

      {stateReady && auditOpen && auditResult !== null
        ? (
          <PanelDialogLayer>
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
          </PanelDialogLayer>
        )
        : null}

      {stateReady && diagnosisOpen
        ? (
          <PanelDialogLayer>
            <DialogShell
              t={t}
              title={t('memoryDiagnosisTitle')}
              wide
              onClose={() => { if (diagnosisUndoBusyId === null) setDiagnosisOpen(false) }}
              footer={[
                <Button
                  key="close"
                  variant="secondary"
                  disabled={diagnosisUndoBusyId !== null}
                  onClick={() => { if (diagnosisUndoBusyId === null) setDiagnosisOpen(false) }}
                >
                  {t('close')}
                </Button>,
              ]}
            >
              {diagnosisBusy && diagnosisStats === null
                ? <LoadingBlock text={t('memoryLoading')} />
                : diagnosisError !== ''
                  ? (
                    <div className={css.errorBox}>
                      <span className={css.errorText}>{diagnosisError}</span>
                      <Button variant="secondary" icon="refresh" onClick={() => { void loadDiagnosis() }}>
                        {t('memoryRetry')}
                      </Button>
                    </div>
                  )
                  : (
                    <div className={css.diagnosisStack}>
                      {diagnosisTiers !== null
                        ? (
                          <div className={css.maintenanceNotice} role="status">
                            {t('memoryDiagnosisTierCounts', { long: diagnosisTiers.long, short: diagnosisTiers.short })}
                          </div>
                        )
                        : null}
                      {diagnosisSection(t('memoryDiagnosisInjections'), injectionRows, diagnosisEmptyText)}
                      {diagnosisSection(t('memoryDiagnosisCaptures'), captureRows, diagnosisEmptyText)}
                      {diagnosisSection(t('memoryDiagnosisRetrievals'), retrievalRows, diagnosisEmptyText)}
                      {diagnosisSection(t('memoryDiagnosisMaintenance'), maintenanceRunRows, diagnosisEmptyText)}
                    </div>
                  )}
            </DialogShell>
          </PanelDialogLayer>
        )
        : null}
    </div>
  )
}
