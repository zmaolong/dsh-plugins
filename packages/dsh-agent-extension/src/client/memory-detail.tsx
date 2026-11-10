/**
 * Body of the plugin's "memory detail" page in the host's right Sidebar: the
 * metadata form (name / description / type / tags / importance), the lifecycle
 * actions (deactivate / restore, archive, two-step delete), and a hint that the
 * read-only body is rendered by the host preview in the neighbouring pane.
 *
 * The page receives its memory through `useTabInfo().tab.navigation.params`;
 * the controller stores the last requested memory as a fallback for restored
 * tabs that carry no params. Switching to another memory discards unsaved edits
 * (v1 has no editor-level conflict handling).
 *
 * @module dsh-agent-extension/client/memory-detail
 */

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { api, ApiError } from './api.ts'
import { Badge, Button, EmptyBlock, LoadingBlock, Select, Spinner } from './controls.tsx'
import { Icon } from './icons.tsx'
import { errorMessageFor, type JsonRecord, type Translate } from './presentation.ts'
import {
  TYPE_LABEL_KEYS,
  TYPE_VALUES,
  formOf,
  integer,
  normalizeEntry,
  sameForm,
  statusLabel,
  statusTone,
  typeLabel,
  type MemoryEntry,
  type MemoryForm,
  type MemoryStatus,
  type MemoryType,
} from './memory-model.ts'
import type { HubActions, MemoryDetailTarget, UseHub } from './store.ts'
import memoryCss from './memory.module.css'
import css from './memory-detail.module.css'

/** Tab information the host binds into every page body. */
export interface MemoryDetailTabInfo {
  tab: {
    /** What the last `openTab` delivered; `undefined` when a restored tab carries none. */
    navigation: { params?: unknown, revision: number }
    /** Page actions owned by this tab occurrence. */
    actions: { close(): void }
  }
}

/** Props of the detail page (host standard props plus the plugin's inject face). */
export interface MemoryDetailTabProps {
  useTabInfo: () => MemoryDetailTabInfo
  useHub: UseHub
  actions: HubActions
  t: Translate
}

/** Read one navigation target out of arbitrary params. */
export function targetOf(raw: unknown): MemoryDetailTarget | null {
  if (raw === null || typeof raw !== 'object') return null
  const item = raw as Record<string, unknown>
  const scope = item.scope === 'project' ? 'project' : item.scope === 'global' ? 'global' : null
  const id = typeof item.id === 'string' ? item.id : ''
  if (scope === null || id === '') return null
  return { scope, project: typeof item.project === 'string' ? item.project : '', id }
}

/** Render the memory detail page. */
export function MemoryDetailTab({ useTabInfo, useHub, actions, t }: MemoryDetailTabProps): ReactNode {
  const info = useTabInfo()
  const fallbackTarget = useHub(state => state.detailTarget)
  const target = targetOf(info.tab.navigation.params) ?? fallbackTarget
  const revision = info.tab.navigation.revision
  const targetKey = target === null ? '' : `${target.scope}\n${target.project}\n${target.id}`

  const [phase, setPhase] = useState<'loading' | 'ready' | 'missing' | 'error'>('loading')
  const [error, setError] = useState('')
  const [entry, setEntry] = useState<MemoryEntry | null>(null)
  const [form, setForm] = useState<MemoryForm | null>(null)
  const [savedForm, setSavedForm] = useState<MemoryForm | null>(null)
  const [saveBusy, setSaveBusy] = useState(false)
  const [statusBusy, setStatusBusy] = useState(false)
  const [deleteBusy, setDeleteBusy] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [tagDraft, setTagDraft] = useState('')
  const [reloadToken, setReloadToken] = useState(0)
  const targetKeyRef = useRef('')
  const revisionRef = useRef(revision)

  const dirty = form !== null && savedForm !== null && !sameForm(form, savedForm)

  // Load (and reload on navigation) one memory; a dirty form is discarded on
  // navigation, as the v1 contract states.
  useEffect(() => {
    const navigationChanged = targetKey !== targetKeyRef.current || revision !== revisionRef.current
    targetKeyRef.current = targetKey
    revisionRef.current = revision
    const wasDirty = form !== null && savedForm !== null && !sameForm(form, savedForm)
    if (navigationChanged && wasDirty) actions.toast('info', t('memoryDetailDirtyDiscarded'))
    setConfirmDelete(false)
    setTagDraft('')
    if (target === null) {
      setPhase('missing')
      setEntry(null)
      setForm(null)
      setSavedForm(null)
      return
    }
    let cancelled = false
    setPhase('loading')
    setError('')
    void (async () => {
      try {
        const query = new URLSearchParams({ scope: target.scope, id: target.id })
        if (target.scope === 'project') query.set('project', target.project)
        const data = await api<JsonRecord>(`/memory/get?${query.toString()}`)
        if (cancelled) return
        const loaded = normalizeEntry(data.entry)
        setEntry(loaded)
        setForm(formOf(loaded))
        setSavedForm(formOf(loaded))
        setPhase('ready')
      } catch (readError) {
        if (cancelled) return
        if (readError instanceof ApiError && readError.code === 'not_found') {
          setPhase('missing')
          setEntry(null)
          setForm(null)
          setSavedForm(null)
          return
        }
        setError(errorMessageFor(readError, t))
        setPhase('error')
      }
    })()
    return () => { cancelled = true }
    // `form`/`savedForm` are read for the discard check only; adding them would reload on every keystroke.
  }, [targetKey, revision, reloadToken])

  const close = (): void => { info.tab.actions.close() }

  const appendTags = (raw: string): void => {
    const parts = raw.split(/[,，]/u).map(part => part.trim()).filter(part => part !== '')
    if (parts.length === 0) return
    setForm((current) => {
      if (current === null) return current
      const tags = [...current.tags]
      for (const part of parts) {
        if (!tags.includes(part)) tags.push(part)
      }
      return { ...current, tags }
    })
  }

  const commitTagDraft = (): void => {
    if (tagDraft === '') return
    const raw = tagDraft
    setTagDraft('')
    appendTags(raw)
  }

  const save = async (): Promise<void> => {
    if (form === null || entry === null || target === null || saveBusy || !dirty) return
    const name = form.name.trim()
    if (name === '') {
      actions.toast('warn', t('memoryNameRequired'))
      return
    }
    setSaveBusy(true)
    try {
      const body: Record<string, unknown> = {
        id: entry.id,
        scope: target.scope,
        name,
        description: form.description.trim(),
        type: form.type,
        tags: form.tags,
        importance: form.importance,
        // The body is read-only here; it travels so the save endpoint keeps it.
        content: entry.content,
      }
      if (target.scope === 'project') body.project = target.project
      const data = await api<JsonRecord>('/memory/save', { method: 'POST', body })
      const saved = normalizeEntry(data.entry)
      setEntry(saved)
      setForm(formOf(saved))
      setSavedForm(formOf(saved))
      actions.toast('success', t('memorySaved'))
    } catch (saveError) {
      actions.toast('error', errorMessageFor(saveError, t))
    } finally {
      setSaveBusy(false)
    }
  }

  const changeStatus = async (status: MemoryStatus): Promise<void> => {
    if (entry === null || target === null || statusBusy) return
    setStatusBusy(true)
    try {
      const body: Record<string, unknown> = { scope: target.scope, id: entry.id, status }
      if (target.scope === 'project') body.project = target.project
      const data = await api<JsonRecord>('/memory/status', { method: 'POST', body })
      setEntry(normalizeEntry(data.entry))
      setConfirmDelete(false)
      actions.toast('success', t('memoryStatusDone'))
    } catch (statusError) {
      actions.toast('error', errorMessageFor(statusError, t))
    } finally {
      setStatusBusy(false)
    }
  }

  const remove = async (): Promise<void> => {
    if (entry === null || target === null || deleteBusy) return
    if (!confirmDelete) {
      setConfirmDelete(true)
      return
    }
    setDeleteBusy(true)
    try {
      const body: Record<string, unknown> = { scope: target.scope, id: entry.id }
      if (target.scope === 'project') body.project = target.project
      await api<JsonRecord>('/memory/delete', { method: 'POST', body })
      actions.toast('success', t('memoryDeleted', { name: entry.name }))
      close()
    } catch (deleteError) {
      actions.toast('error', errorMessageFor(deleteError, t))
    } finally {
      setDeleteBusy(false)
    }
  }

  if (phase === 'loading') {
    return <div className={css.root}><LoadingBlock text={t('memoryLoading')} /></div>
  }

  if (phase === 'missing') {
    return (
      <div className={css.root}>
        <EmptyBlock
          description={t('memoryDetailMissing')}
          action={<Button variant="secondary" onClick={close}>{t('close')}</Button>}
        />
      </div>
    )
  }

  if (phase === 'error' || entry === null || form === null) {
    return (
      <div className={css.root}>
        <div className={memoryCss.errorBox}>
          <span className={memoryCss.errorText}>{t('memoryDetailReadError', { message: error })}</span>
          <Button variant="secondary" icon="refresh" onClick={() => { setReloadToken(token => token + 1) }}>
            {t('memoryRetry')}
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className={css.root} aria-label={t('memoryDetailTabTitle')}>
      <header className={css.header}>
        <h2 className={css.title}>{form.name !== '' ? form.name : entry.name}</h2>
        <div className={css.badges}>
          <Badge tone="plain">{typeLabel(form.type, t)}</Badge>
          {entry.status !== 'active'
            ? <Badge tone={statusTone(entry.status)}>{statusLabel(entry.status, t)}</Badge>
            : null}
        </div>
      </header>

      <div className={css.formGrid}>
        <label className={css.field}>
          <span className={css.fieldLabel}>{t('memoryFieldName')}</span>
          <input
            className={css.input}
            type="text"
            aria-label={t('memoryFieldName')}
            value={form.name}
            onChange={(event) => { setForm(current => current === null ? current : { ...current, name: event.target.value }) }}
          />
        </label>
        <label className={css.field}>
          <span className={css.fieldLabel}>{t('memoryFieldDescription')}</span>
          <input
            className={css.input}
            type="text"
            aria-label={t('memoryFieldDescription')}
            value={form.description}
            onChange={(event) => { setForm(current => current === null ? current : { ...current, description: event.target.value }) }}
          />
        </label>
        <label className={css.field}>
          <span className={css.fieldLabel}>{t('memoryFieldType')}</span>
          <Select
            label={t('memoryFieldType')}
            value={form.type}
            options={TYPE_VALUES.map(value => ({ value, label: t(TYPE_LABEL_KEYS[value]) }))}
            onChange={(next) => {
              const type: MemoryType = TYPE_VALUES.find(value => value === next) ?? 'preference'
              setForm(current => current === null ? current : { ...current, type })
            }}
          />
        </label>
        <label className={css.field}>
          <span className={css.fieldLabel}>{t('memoryFieldImportance')}</span>
          <div className={memoryCss.rangeRow}>
            <input
              className={memoryCss.rangeInput}
              type="range"
              min={0}
              max={100}
              step={1}
              aria-label={t('memoryFieldImportance')}
              value={form.importance}
              style={{ '--range-fill': `${form.importance}%` } as CSSProperties}
              onChange={(event) => {
                setForm(current => current === null ? current : { ...current, importance: integer(event.target.value, 0, 100, current.importance) })
              }}
            />
            <span className={memoryCss.rangeValue}>{String(form.importance)}</span>
          </div>
          <span className={css.fieldHint}>{t('memoryImportanceHint')}</span>
        </label>
      </div>

      <div className={css.field}>
        <span className={css.fieldLabel}>{t('memoryFieldTags')}</span>
        <div className={memoryCss.tagBox}>
          {form.tags.map((tag, index) => (
            <span key={`${index}-${tag}`} className={memoryCss.tagChip}>
              <span className={memoryCss.tagChipText}>{tag}</span>
              <button
                type="button"
                className={memoryCss.tagChipRemove}
                aria-label={t('memoryTagRemove', { tag })}
                onClick={() => {
                  setForm(current => current === null ? current : { ...current, tags: current.tags.filter((_, tagIndex) => tagIndex !== index) })
                }}
              >
                <Icon name="x" size={12} />
              </button>
            </span>
          ))}
          <input
            className={memoryCss.tagInput}
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
                setForm(current => current === null ? current : { ...current, tags: current.tags.slice(0, -1) })
              }
            }}
            onBlur={commitTagDraft}
          />
        </div>
        <span className={css.fieldHint}>{t('memoryTagsHint')}</span>
      </div>

      <div className={css.hintLine}>
        <span className={css.previewHint}>{t('memoryDetailPreviewHint')}</span>
        {entry.content.trim() === '' ? <span className={css.emptyContent}>{t('memoryDetailEmptyContent')}</span> : null}
      </div>

      <div className={css.actions}>
        <Button variant="primary" disabled={!dirty || saveBusy} onClick={() => { void save() }}>
          {saveBusy ? <Spinner /> : null}{saveBusy ? t('memorySaving') : t('memorySave')}
        </Button>
        <span className={css.actionsRight}>
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
              <span className={memoryCss.confirmArea} role="group" aria-label={t('memoryDelete')}>
                <span className={memoryCss.confirmText}>{t('memoryDeleteDescription', { name: entry.name })}</span>
                <Button variant="danger" disabled={deleteBusy} onClick={() => { void remove() }}>
                  {deleteBusy ? <Spinner /> : null}{deleteBusy ? t('memoryDeleting') : t('memoryDeleteConfirm')}
                </Button>
                <Button variant="secondary" onClick={() => { setConfirmDelete(false) }}>{t('cancel')}</Button>
              </span>
            )
            : (
              <Button variant="danger" icon="trash" onClick={() => { void remove() }}>
                {t('memoryDelete')}
              </Button>
            )}
        </span>
      </div>

      <div className={css.footer}>{t('memoryDetailAutoMaintained')}</div>
    </div>
  )
}
