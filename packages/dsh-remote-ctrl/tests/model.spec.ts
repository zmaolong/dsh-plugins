/**
 * Wire-view & mobile model specs: the pure normalizers and the SSE fold
 * functions that both the server and the phone page rely on. No DOM, no
 * sockets.
 */
import { describe, expect, it } from 'vitest'
import {
  applyBaseline,
  applyFrame,
  initialState,
  sessionItems,
  statusBadge,
  type MobileState,
} from '../src/mobile/model.ts'
import {
  historyEventsOf,
  itemKey,
  normalizeEventItem,
  normalizeSessionSummary,
  normalizeStreamFrame,
  textFromContent,
} from '../src/view.ts'

function newState(): MobileState {
  return initialState('tok')
}

describe('view normalizers', () => {
  it('normalizes controller and query session shapes', () => {
    const official = normalizeSessionSummary({
      agentAvailable: true,
      formatStatus: 'current',
      sessionId: 's1',
      updatedAt: 1700000000000,
      running: true,
      blank: false,
      cwd: 'F:/w',
      projections: { kind: 'sequenced', asOfSeq: 3, values: { title: '官方摘要标题' } },
    })
    expect(official).toMatchObject({ id: 's1', title: '官方摘要标题', status: 'running', updatedAt: 1700000000000, cwd: 'F:/w' })
    const idle = normalizeSessionSummary({ agentAvailable: false, running: false, sessionId: 's3', updatedAt: 1 })
    expect(idle).toMatchObject({ id: 's3', status: '' })
    const formatCurrent = normalizeSessionSummary({ formatStatus: 'current', sessionId: 's4', updatedAt: 1 })
    expect(formatCurrent?.status).toBe('')
    const fromQuery = normalizeSessionSummary({ sessionId: 's2', header: { title: '冷会话', cwd: 'C:/x', updatedAt: '2024-01-01T00:00:00Z' } })
    expect(fromQuery).toMatchObject({ id: 's2', title: '冷会话', cwd: 'C:/x' })
    expect(fromQuery?.updatedAt).toBe(Date.parse('2024-01-01T00:00:00Z'))
    expect(normalizeSessionSummary(null)).toBeNull()
    expect(normalizeSessionSummary({ title: '没有 id' })).toBeNull()
  })

  it('extracts text from message content shapes', () => {
    expect(textFromContent('plain')).toBe('plain')
    expect(textFromContent([
      { type: 'text', text: '第一段' },
      { type: 'thinking', text: '不该出现' },
      { type: 'text', text: '第二段' },
    ])).toBe('第一段\n第二段')
    expect(textFromContent({ text: '对象形态' })).toBe('对象形态')
    expect(textFromContent(42)).toBe('')
  })

  it('maps event log entries to renderable items and skips noise', () => {
    const user = normalizeEventItem({ type: 'user/message', message: { content: [{ type: 'text', text: '你好' }] }, timestamp: 5 })
    expect(user).toMatchObject({ kind: 'user', text: '你好', ts: 5 })
    const assistant = normalizeEventItem({ type: 'assistant/message', message: { content: [{ type: 'text', text: '回答' }] } })
    expect(assistant).toMatchObject({ kind: 'assistant', text: '回答' })
    const call = normalizeEventItem({ type: 'tool/call', name: 'shell', callId: 'c1', arguments: { cmd: 'dir' } })
    expect(call).toMatchObject({ kind: 'tool-call', toolName: 'shell', callId: 'c1' })
    expect(call?.detail).toContain('dir')
    // 官方形状：arguments 是模型产出的原始 JSON 字符串
    const officialCall = normalizeEventItem({ type: 'tool/call', turn: 1, step: 1, callId: 'c2', name: 'read', arguments: '{"path":"a.ts"}' })
    expect(officialCall?.detail).toBe('{"path":"a.ts"}')
    const result = normalizeEventItem({ type: 'tool/result', callId: 'c1', error: '炸了' })
    expect(result).toMatchObject({ kind: 'tool-result', callId: 'c1', text: '炸了', detail: 'error' })
    const officialResult = normalizeEventItem({
      type: 'tool/result',
      turn: 1,
      step: 1,
      message: { role: 'tool', callId: 'c2', content: [{ type: 'text', text: '文件内容' }] },
      error: { name: 'FsError', code: 'not_found', reason: '文件不存在' },
    })
    expect(officialResult).toMatchObject({ kind: 'tool-result', callId: 'c2', text: '文件不存在', detail: 'error' })
    expect(normalizeEventItem({ type: 'turn/start' })).toBeNull()
    expect(normalizeEventItem('garbage')).toBeNull()
  })

  it('derives stable item keys for baseline/live dedupe', () => {
    expect(itemKey('tool-call', 'c1', 'shell', -1, 0)).toBe('tool-call:c1')
    expect(itemKey('user', '', '同一条消息', 7, 0)).toBe('s7')
    expect(itemKey('user', '', '同一条消息', -1, 99)).toBe(itemKey('user', '', '同一条消息', -1, 99))
    expect(itemKey('user', '', '同一条消息', -1, 0)).not.toBe(itemKey('user', '', '同一条消息', -1, 99))
  })

  it('unwraps readSession payloads and stream frames', () => {
    expect(historyEventsOf({ events: [1, 2] })).toEqual([1, 2])
    expect(historyEventsOf([3])).toEqual([3])
    expect(historyEventsOf({ log: [4] })).toEqual([4])
    expect(historyEventsOf({})).toEqual([])
    expect(normalizeStreamFrame({ type: 'chunk', text: '片段' })).toEqual({ phase: 'chunk', text: '片段' })
    expect(normalizeStreamFrame({ frame: { type: 'start', text: '' } })).toEqual({ phase: 'start', text: '' })
    expect(normalizeStreamFrame({ type: 'end' })).toEqual({ phase: 'end', text: '' })
    // 官方形状：chunk 帧的文本在 frame.chunk.text（text-delta）；非文本块归 null
    expect(normalizeStreamFrame({ frame: { type: 'chunk', index: 0, chunk: { type: 'text-delta', index: 0, text: '你好' } } }))
      .toEqual({ phase: 'chunk', text: '你好' })
    expect(normalizeStreamFrame({ frame: { type: 'chunk', index: 1, chunk: { type: 'finish', reason: 'stop' } } })).toBeNull()
  })
})

describe('mobile model folding', () => {
  it('tracks connection and lists', () => {
    const state = newState()
    expect(applyFrame(state, { type: 'hello' })).toBe(true)
    expect(state.connected).toBe(true)
    expect(applyFrame(state, { type: 'hello' })).toBe(false)
    expect(applyFrame(state, { type: 'sessions', sessions: [{ id: 's1', title: 'A', status: 'running', updatedAt: 2, cwd: '' }] })).toBe(true)
    expect(state.sessions).toHaveLength(1)
  })

  it('dedupes live items against the baseline', () => {
    const state = newState()
    state.view = { name: 'detail', sid: 's1' }
    const baseline = [
      { id: 's0', kind: 'user' as const, text: '第一条' },
      { id: 's1', kind: 'assistant' as const, text: '回复' },
    ]
    applyBaseline(state, 's1', baseline)
    expect(sessionItems(state, 's1')).toHaveLength(2)
    expect(applyFrame(state, { type: 'item', sessionId: 's1', item: { id: 's1', kind: 'assistant', text: '回复' } })).toBe(false)
    expect(applyFrame(state, { type: 'item', sessionId: 's1', item: { id: 's2', kind: 'assistant', text: '新的回复' } })).toBe(true)
    expect(sessionItems(state, 's1')).toHaveLength(3)
    // 基线未加载的会话：直播帧被忽略，等基线带上
    expect(applyFrame(state, { type: 'item', sessionId: 's9', item: { id: 'x', kind: 'user', text: '?' } })).toBe(false)
    expect(state.items.s9).toBeUndefined()
  })

  it('accumulates stream frames and clears on the finalized assistant item', () => {
    const state = newState()
    state.view = { name: 'detail', sid: 's1' }
    applyBaseline(state, 's1', [])
    applyFrame(state, { type: 'stream', sessionId: 's1', phase: 'start', text: '' })
    applyFrame(state, { type: 'stream', sessionId: 's1', phase: 'chunk', text: '你' })
    applyFrame(state, { type: 'stream', sessionId: 's1', phase: 'chunk', text: '好' })
    expect(state.streams.s1).toEqual({ text: '你好', phase: 'chunk' })
    applyFrame(state, { type: 'item', sessionId: 's1', item: { id: 's2', kind: 'assistant', text: '你好，世界' } })
    expect(state.streams.s1).toBeUndefined()
  })

  it('replaces pending cards wholesale', () => {
    const state = newState()
    applyFrame(state, { type: 'pending', cards: [{ id: 'c1', kind: 'approval', sessionId: 's1' }] })
    expect(state.pending).toHaveLength(1)
    applyFrame(state, { type: 'pending', cards: [] })
    expect(state.pending).toHaveLength(0)
    applyFrame(state, { type: 'unknown-frame' })
    expect(state.pending).toHaveLength(0)
  })

  it('maps statuses to badges', () => {
    expect(statusBadge('running')).toBe('running')
    expect(statusBadge('waiting-input')).toBe('waiting')
    expect(statusBadge('error')).toBe('error')
    expect(statusBadge('archived')).toBe('')
  })
})
