/**
 * Wire view shared by the phone page and the desktop panel: renderable
 * shapes plus the normalizers that turn whatever the host services actually
 * returned into them. Host payloads stay `unknown` here on purpose — the
 * normalizers extract defensively so an upstream shape change degrades to a
 * missing field instead of a thrown error.
 *
 * This module is pure (no node builtins, no DOM): both the host bundle and
 * the mobile bundle inline it.
 *
 * @module dsh-remote-ctrl/view
 */

/** One session row of the phone list / panel bootstrap. */
export interface SessionSummary {
  id: string
  title: string
  status: string
  updatedAt: number
  cwd: string
}

/** Renderable history item of one session. */
export type ItemKind = 'user' | 'assistant' | 'tool-call' | 'tool-result' | 'system'

/** One history line of the session view. */
export interface Item {
  id: string
  kind: ItemKind
  text: string
  toolName?: string | undefined
  callId?: string | undefined
  detail?: string | undefined
  ts?: number | undefined
}

/** A card awaiting the user's decision (tool approval or one ask-user question). */
export interface PendingCard {
  id: string
  kind: 'approval' | 'question'
  sessionId: string
  toolName?: string | undefined
  reason?: string | undefined
  question?: string | undefined
  detail?: string | undefined
  options?: string[] | undefined
  multiSelect?: boolean | undefined
}

/** Assistant token-stream frame. */
export interface StreamFrame {
  phase: 'start' | 'chunk' | 'end'
  text: string
}

const MAX_DETAIL_CHARS = 2000
const MAX_SYSTEM_CHARS = 600
const MAX_RESULT_CHARS = 1200

/** Cap display text; injected context and tool output can be enormous. */
function capText(text: string, limit: number): string {
  return text.length > limit ? `${text.slice(0, limit)}…` : text
}

type UnknownRecord = Record<string, unknown>

function asRecord(value: unknown): UnknownRecord | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as UnknownRecord : null
}

/** Epoch milliseconds from whatever timestamp shape a row carries. */
function timestampOf(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value !== '') {
    const parsed = Date.parse(value)
    if (!Number.isNaN(parsed)) return parsed
  }
  return 0
}

/** Join the text parts of one message-content shape into plain text. */
export function textFromContent(content: unknown): string {
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    const parts: string[] = []
    for (const raw of content) {
      const part = asRecord(raw)
      if (part === null) {
        if (typeof raw === 'string' && raw !== '') parts.push(raw)
        continue
      }
      // Only user-visible text rides along; thinking/tool blocks stay out.
      const type = typeof part.type === 'string' ? part.type : 'text'
      if (type !== 'text' || typeof part.text !== 'string' || part.text === '') continue
      parts.push(part.text)
    }
    return parts.join('\n')
  }
  const record = asRecord(content)
  return record !== null && typeof record.text === 'string' ? record.text : ''
}

function firstString(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === 'string' && value.trim() !== '') return value.trim()
  }
  return ''
}

/** Normalize one row of `sessionController.list()` / `sessionQuery.listSessions()`. */
export function normalizeSessionSummary(raw: unknown): SessionSummary | null {
  const record = asRecord(raw)
  if (record === null) return null
  const header = asRecord(record.header)
  const id = firstString(record.sessionId, record.id, record.key, header?.id, header?.sessionId)
  if (id === '') return null
  // Controller summaries carry projection values (title 等)；query records carry header。
  const projections = asRecord(record.projections)
  const values = asRecord(projections?.values)
  const explicitStatus = firstString(record.status, record.state, record.formatStatus, header?.status).toLowerCase()
  // formatStatus 的 'current' 是持久化健康度而非运行态，归空让手机端回退 idle 文案。
  const normalizedExplicit = explicitStatus === 'current' ? '' : explicitStatus
  const status = record.running === true
    ? 'running'
    : record.agentAvailable === true
      ? 'attached'
      : normalizedExplicit
  return {
    id,
    title: firstString(values?.title, record.title, record.name, record.displayName, header?.title) || id,
    status,
    updatedAt: timestampOf(record.updatedAt ?? record.updated ?? record.lastActivity ?? record.timestamp ?? header?.updatedAt),
    cwd: firstString(record.cwd, record.workingDirectory, header?.cwd, header?.workingDirectory),
  }
}

/**
 * Stable identity of one history item: the log's sequence number when the
 * event carries one, else the tool callId, else kind+text-head+timestamp.
 * Baseline (replayed log) and live (session/event) copies of the same event
 * must land on the same key so the phone can dedupe them.
 */
export function itemKey(kind: ItemKind, callId: string, text: string, seq: number, ts: number): string {
  if (seq >= 0) return `s${seq}`
  if (callId !== '') return `${kind}:${callId}`
  return `${kind}:${text.slice(0, 120)}@${ts}`
}

/** Sequence number of one log event, or -1 when the log carries none. */
function seqOf(record: UnknownRecord): number {
  for (const key of ['seq', 'index', 'eventIndex', 'sequence']) {
    const value = record[key]
    if (typeof value === 'number' && Number.isInteger(value) && value >= 0) return value
  }
  return -1
}

/** Normalize one entry of the session event log into a renderable item (null = skip). */
export function normalizeEventItem(raw: unknown): Item | null {
  const record = asRecord(raw)
  if (record === null) return null
  const type = firstString(record.type, record.kind)
  // Payloads either sit directly on the event or under a wrapper key.
  const inner = asRecord(record.message) ?? asRecord(record.data) ?? asRecord(record.event) ?? record
  const seq = seqOf(record)
  const ts = timestampOf(record.timestamp ?? inner.timestamp)
  switch (type) {
    case 'user/message': {
      const text = textFromContent(inner.content) || firstString(inner.text)
      if (text === '') return null
      // source.kind === 'user' 才是人类输入；system-reminder / inject 等注入
      // 走 system 展示（虚线灰条），避免把上下文注入渲染成用户气泡。
      const sourceKind = firstString(asRecord(inner.source)?.kind)
      if (sourceKind !== '' && sourceKind !== 'user') {
        return { id: itemKey('system', '', text, seq, ts), kind: 'system', text: capText(text, MAX_SYSTEM_CHARS), ts }
      }
      return { id: itemKey('user', '', text, seq, ts), kind: 'user', text, ts }
    }
    case 'assistant/message': {
      const message = asRecord(inner.message) ?? inner
      const text = textFromContent(message.content) || textFromContent(inner.content) || firstString(inner.text)
      if (text === '') return null
      return { id: itemKey('assistant', '', text, seq, ts), kind: 'assistant', text, ts }
    }
    case 'tool/call': {
      const toolName = firstString(inner.name, inner.toolName, record.name, record.toolName)
      const callId = firstString(inner.callId, inner.id, record.callId)
      const args = inner.arguments ?? inner.input ?? inner.args ?? record.arguments
      let detail = ''
      if (typeof args === 'string' && args !== '') {
        // 官方 tool/call 的 arguments 是模型产出的原始 JSON 字符串：紧凑化展示。
        try {
          detail = JSON.stringify(JSON.parse(args))
        } catch {
          detail = args
        }
      } else if (args !== undefined && args !== null) {
        try {
          detail = JSON.stringify(args)
        } catch {
          detail = String(args)
        }
      }
      if (detail.length > MAX_DETAIL_CHARS) detail = `${detail.slice(0, MAX_DETAIL_CHARS)}…`
      return {
        id: itemKey('tool-call', callId, toolName, seq, ts),
        kind: 'tool-call',
        text: toolName || 'tool',
        ...(toolName !== '' ? { toolName } : {}),
        ...(callId !== '' ? { callId } : {}),
        ...(detail !== '' ? { detail } : {}),
        ts,
      }
    }
    case 'tool/result': {
      const callId = firstString(inner.callId, record.callId)
      // error 挂在事件本体（inner 已被 message 占据时从 record 兜底）。
      const error = inner.error ?? record.error
      const errorRecord = asRecord(error)
      const errorText = typeof error === 'string'
        ? error
        : errorRecord !== null ? firstString(errorRecord.reason, errorRecord.message) : ''
      const text = errorText !== ''
        ? errorText
        : textFromContent(inner.content) || textFromContent(asRecord(inner.message)?.content) || firstString(inner.summary, inner.text, inner.result)
      if (text === '') return null
      return {
        id: itemKey('tool-result', callId, text, seq, ts),
        kind: 'tool-result',
        text: capText(text, MAX_RESULT_CHARS),
        ...(callId !== '' ? { callId } : {}),
        ...(errorText !== '' ? { detail: 'error' } : {}),
        ts,
      }
    }
    case 'system/message':
    case 'developer/message': {
      const text = textFromContent(inner.content) || firstString(inner.text)
      if (text === '') return null
      return { id: itemKey('system', '', text, seq, ts), kind: 'system', text: capText(text, MAX_SYSTEM_CHARS), ts }
    }
    default:
      return null
  }
}

/**
 * Extract the event array from a `sessionQuery.readSession` result. The
 * result may be the array itself or a wrapper ({events|log|entries|items}).
 */
export function historyEventsOf(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload
  const record = asRecord(payload)
  if (record === null) return []
  for (const key of ['events', 'log', 'entries', 'items']) {
    const candidate = record[key]
    if (Array.isArray(candidate)) return candidate
  }
  return []
}

/**
 * Normalize one `agent/assistant-stream` frame. Official shape:
 * `{agent, frame: {type:'start'|'chunk'|'end', …, chunk?: StreamChunk}}` —
 * text deltas carry the string in `frame.chunk.text`. Frames without visible
 * text (block-start/usage/finish) normalize to null and are not broadcast.
 */
export function normalizeStreamFrame(raw: unknown): StreamFrame | null {
  const outer = asRecord(raw)
  if (outer === null) return null
  const frame = asRecord(outer.frame) ?? outer
  const rawType = firstString(frame.type, frame.phase).toLowerCase()
  if (rawType === 'start') return { phase: 'start', text: '' }
  if (rawType === 'end') return { phase: 'end', text: '' }
  if (rawType !== 'chunk' && rawType !== 'delta' && rawType !== 'text') return null
  const chunk = asRecord(frame.chunk)
  const text = firstString(frame.text, frame.delta, chunk?.text)
  if (text === '') return null
  return { phase: 'chunk', text }
}
