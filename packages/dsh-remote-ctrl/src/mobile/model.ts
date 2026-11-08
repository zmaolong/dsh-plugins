/**
 * Client state of the mobile page: one mutable snapshot plus pure fold
 * functions over the SSE frames the plugin server publishes. DOM-free so
 * the folding logic is unit-testable under node.
 *
 * @module dsh-remote-ctrl/mobile/model
 */

import type { Item, PendingCard, SessionSummary } from '../view.ts'

/** Assistant streaming state of one session. */
export interface StreamState {
  text: string
  phase: 'start' | 'chunk' | 'end'
}

/** Which screen the phone shows. */
export type MobileView = { name: 'list' } | { name: 'detail', sid: string }

/** The page's whole state. */
export interface MobileState {
  token: string
  connected: boolean
  bridgeReady: boolean
  sessionsError: string
  sessions: SessionSummary[]
  items: Record<string, Item[]>
  seen: Record<string, Set<string>>
  streams: Record<string, StreamState>
  pending: PendingCard[]
  view: MobileView
  error: string
}

/** Create the initial state for one pairing token. */
export function initialState(token: string): MobileState {
  return {
    token,
    connected: false,
    bridgeReady: false,
    sessionsError: '',
    sessions: [],
    items: {},
    seen: {},
    streams: {},
    pending: [],
    view: { name: 'list' },
    error: '',
  }
}

/** One `data:` frame of the SSE stream (discriminated loosely on `type`). */
export type SseFrame = { type: string } & Record<string, unknown>

/**
 * Fold one frame into the state (mutating). Returns true when something
 * visibly changed and the caller should re-render.
 */
export function applyFrame(state: MobileState, frame: SseFrame): boolean {
  switch (frame.type) {
    case 'hello': {
      if (state.connected) return false
      state.connected = true
      return true
    }
    case 'sessions': {
      const sessions = Array.isArray(frame.sessions) ? frame.sessions as SessionSummary[] : []
      state.sessions = sessions
      state.sessionsError = ''
      return true
    }
    case 'item': {
      const sessionId = typeof frame.sessionId === 'string' ? frame.sessionId : ''
      const item = frame.item as Item | undefined
      if (sessionId === '' || item === undefined || typeof item.id !== 'string') return false
      const loaded = state.items[sessionId]
      if (loaded === undefined) return false // history not opened yet; baseline will carry it
      let seen = state.seen[sessionId]
      if (seen === undefined) {
        seen = new Set(loaded.map(entry => entry.id))
        state.seen[sessionId] = seen
      }
      if (seen.has(item.id)) return false
      seen.add(item.id)
      loaded.push(item)
      // The finished assistant message supersedes the live token stream.
      if (item.kind === 'assistant') delete state.streams[sessionId]
      return true
    }
    case 'stream': {
      const sessionId = typeof frame.sessionId === 'string' ? frame.sessionId : ''
      if (sessionId === '' || state.items[sessionId] === undefined) return false
      const phase = frame.phase === 'start' || frame.phase === 'end' ? frame.phase : 'chunk'
      const text = typeof frame.text === 'string' ? frame.text : ''
      const previous = state.streams[sessionId]
      if (phase === 'start' || previous === undefined) {
        state.streams[sessionId] = { text, phase }
      } else {
        state.streams[sessionId] = { text: previous.text + text, phase }
      }
      return true
    }
    case 'pending': {
      const cards = Array.isArray(frame.cards) ? frame.cards as PendingCard[] : []
      state.pending = cards
      return true
    }
    default:
      return false
  }
}

/**
 * Replace one session's history with the baseline read from the server.
 * Live frames buffered before the baseline landed are superseded by it.
 */
export function applyBaseline(state: MobileState, sessionId: string, items: Item[]): void {
  state.items[sessionId] = items
  state.seen[sessionId] = new Set(items.map(item => item.id))
  // Anything already streamed but not yet finalized keeps showing; finalized
  // text that the baseline already contains is dropped by the seen-set.
  const stream = state.streams[sessionId]
  if (stream !== undefined && stream.phase === 'end') delete state.streams[sessionId]
}

/** History of one session (may be empty when never opened). */
export function sessionItems(state: MobileState, sessionId: string): Item[] {
  return state.items[sessionId] ?? []
}

/** Status badge class of one session summary. */
export function statusBadge(status: string): string {
  if (status.includes('run') || status.includes('busy') || status.includes('active') || status.includes('working')) return 'running'
  if (status.includes('wait') || status.includes('input') || status.includes('approv') || status.includes('pend')) return 'waiting'
  if (status.includes('error') || status.includes('fail')) return 'error'
  return ''
}
