/**
 * The standalone mobile page (served by the plugin's own LAN server at `/`).
 * Vanilla DOM, no framework: a token gate, the session list, the session
 * view with live streaming, the composer, and the pending approval/question
 * cards. All state folding lives in `model.ts`.
 *
 * @module dsh-remote-ctrl/mobile/main
 */

import {
  applyBaseline,
  applyFrame,
  initialState,
  sessionItems,
  statusBadge,
  type MobileState,
  type SseFrame,
} from './model.ts'
import type { Item, PendingCard } from '../view.ts'

const TOKEN_KEY = 'dsh-remote-ctrl:token'

interface ApiEnvelope {
  ok?: unknown
  data?: unknown
  error?: unknown
  code?: unknown
}

let state: MobileState
let source: EventSource | null = null

// --------------------------------------------------------------------- dom

function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | boolean | EventListener> = {},
  children: Array<Node | string | null | undefined> = [],
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag)
  for (const [name, value] of Object.entries(attrs)) {
    if (typeof value === 'function') {
      element.addEventListener(name.startsWith('on') ? name.slice(2).toLowerCase() : name, value)
      continue
    }
    if (typeof value === 'boolean') {
      if (value) element.setAttribute(name, '')
      continue
    }
    element.setAttribute(name, value)
  }
  for (const child of children) {
    if (child === null || child === undefined) continue
    element.append(typeof child === 'string' ? document.createTextNode(child) : child)
  }
  return element
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = { authorization: `Bearer ${state.token}` }
  if (init.body !== undefined) headers['content-type'] = 'application/json'
  const response = await fetch(path, { ...init, headers, cache: 'no-store' })
  let payload: ApiEnvelope | null = null
  try {
    payload = await response.json() as ApiEnvelope
  } catch {
    payload = null
  }
  if (!response.ok || payload === null || payload.ok !== true) {
    const message = payload !== null && typeof payload.error === 'string' ? payload.error : `HTTP ${response.status}`
    throw Object.assign(new Error(message), { status: response.status })
  }
  return payload.data as T
}

// ------------------------------------------------------------------ stream

function connectStream(): void {
  source?.close()
  const sid = state.view.name === 'detail' ? state.view.sid : ''
  source = new EventSource(`/api/stream?sid=${encodeURIComponent(sid)}&token=${encodeURIComponent(state.token)}`)
  source.onmessage = event => {
    let frame: SseFrame
    try {
      frame = JSON.parse(event.data) as SseFrame
    } catch {
      return
    }
    if (applyFrame(state, frame)) render()
  }
  source.onerror = () => {
    // EventSource reconnects on its own; only the indicator changes here.
    state.connected = false
    render()
  }
}

// ------------------------------------------------------------------ actions

async function bootstrap(): Promise<void> {
  try {
    const data = await api<Record<string, unknown>>('/api/status')
    state.bridgeReady = data.bridge !== undefined
      ? (data.bridge as Record<string, unknown>).controller === true || (data.bridge as Record<string, unknown>).query === true
      : false
    state.sessions = Array.isArray(data.sessions) ? data.sessions as MobileState['sessions'] : []
    state.pending = Array.isArray(data.pending) ? data.pending as PendingCard[] : []
    state.sessionsError = typeof data.sessionsError === 'string' ? data.sessionsError : ''
    state.error = ''
  } catch (error) {
    const status = (error as { status?: number }).status
    if (status === 401) {
      window.localStorage.removeItem(TOKEN_KEY)
      state = initialState('')
      state.error = '配对码无效，请重新输入'
      render()
      return
    }
    state.error = error instanceof Error ? error.message : String(error)
  }
  render()
  connectStream()
}

async function openSession(sid: string): Promise<void> {
  state.view = { name: 'detail', sid }
  render()
  connectStream()
  try {
    const data = await api<{ items: Item[] }>(`/api/sessions/${encodeURIComponent(sid)}/events`)
    applyBaseline(state, sid, Array.isArray(data.items) ? data.items : [])
    state.error = ''
  } catch (error) {
    state.error = error instanceof Error ? error.message : String(error)
  }
  render()
  scrollToBottom()
}

async function send(text: string): Promise<void> {
  if (state.view.name !== 'detail' || text.trim() === '') return
  const sid = state.view.sid
  try {
    await api(`/api/sessions/${encodeURIComponent(sid)}/prompt`, {
      method: 'POST',
      body: JSON.stringify({ text }),
    })
  } catch (error) {
    flashError(error instanceof Error ? error.message : String(error))
  }
}

async function resolveApproval(id: string, outcome: 'allowed-once' | 'rejected'): Promise<void> {
  try {
    await api(`/api/pending/approvals/${encodeURIComponent(id)}`, {
      method: 'POST',
      body: JSON.stringify({ outcome }),
    })
  } catch (error) {
    // 404 = already decided elsewhere: drop the stale card locally.
    if ((error as { status?: number }).status === 404) {
      state.pending = state.pending.filter(card => card.id !== id)
      render()
      return
    }
    flashError(error instanceof Error ? error.message : String(error))
  }
}

async function answerQuestion(id: string, payload: Record<string, unknown>): Promise<void> {
  try {
    await api(`/api/pending/questions/${encodeURIComponent(id)}`, {
      method: 'POST',
      body: JSON.stringify(payload),
    })
    state.pending = state.pending.filter(card => card.id !== id)
    render()
  } catch (error) {
    if ((error as { status?: number }).status === 404) {
      state.pending = state.pending.filter(card => card.id !== id)
      render()
      return
    }
    flashError(error instanceof Error ? error.message : String(error))
  }
}

function back(): void {
  state.view = { name: 'list' }
  render()
  connectStream()
}

let errorTimer: ReturnType<typeof setTimeout> | null = null

function flashError(message: string): void {
  state.error = message
  render()
  if (errorTimer !== null) clearTimeout(errorTimer)
  errorTimer = setTimeout(() => {
    state.error = ''
    render()
  }, 5000)
}

// ------------------------------------------------------------------ render

let root: HTMLElement | null = null

function render(): void {
  if (root === null) return
  if (state.token === '') {
    root.replaceChildren(gateView())
    return
  }
  // 详情视图里接近底部时保持吸底（新消息/流式增量自动滚到最新）。
  const stick = state.view.name === 'detail' ? wasNearBottom() : false
  root.replaceChildren(
    state.view.name === 'detail' ? detailView() : listView(),
  )
  if (stick) scrollToBottom()
}

function connectionDot(): HTMLElement {
  return h('span', { class: `conn${state.connected ? ' on' : ''}`, title: state.connected ? '已连接' : '未连接' })
}

function errorBanner(): Node | null {
  if (state.error === '') return null
  return h('div', { class: 'error' }, [state.error])
}

function pendingCards(): Node[] {
  const nodes: Node[] = []
  if (state.pending.length > 0) {
    nodes.push(h('div', { class: 'section' }, ['待处理']))
  }
  for (const card of state.pending) nodes.push(pendingCard(card))
  return nodes
}

function pendingCard(card: PendingCard): HTMLElement {
  if (card.kind === 'approval') {
    return h('div', { class: 'card pending' }, [
      h('div', { class: 'title' }, [`工具请求确认${text(card.toolName) !== '' ? `：${text(card.toolName)}` : ''}`]),
      text(card.reason) !== '' ? h('div', { class: 'q' }, [text(card.reason)]) : null,
      h('div', { class: 'row' }, [
        h('button', {
          class: 'act deny',
          onclick: () => { void resolveApproval(card.id, 'rejected') },
        }, ['拒绝']),
        h('button', {
          class: 'act allow',
          onclick: () => { void resolveApproval(card.id, 'allowed-once') },
        }, ['允许一次']),
      ]),
    ])
  }
  const options = Array.isArray(card.options) ? card.options : []
  const question = h('div', { class: 'card pending' }, [
    h('div', { class: 'title' }, ['智能体提问']),
    text(card.question) !== '' ? h('div', { class: 'q' }, [text(card.question)]) : null,
    text(card.detail) !== '' ? h('div', { class: 'meta' }, [text(card.detail)]) : null,
  ])
  for (const option of options) {
    question.append(h('button', {
      class: 'opt',
      onclick: () => { void answerQuestion(card.id, { selected: [option] }) },
    }, [option]))
  }
  const input = h('input', { placeholder: options.length > 0 ? '或输入自定义回答' : '输入回答…' })
  const send = h('button', { class: 'act primary', style: 'flex:none;width:72px;' }, ['发送'])
  send.addEventListener('click', () => {
    const value = input.value.trim()
    if (value !== '') void answerQuestion(card.id, options.length > 0 ? { custom: value } : { selected: [], custom: value })
  })
  input.addEventListener('keydown', event => {
    if (event.key === 'Enter') send.click()
  })
  question.append(h('div', { class: 'row' }, [input, send]))
  return question
}

function sessionCard(session: MobileState['sessions'][number]): HTMLElement {
  const badge = statusBadge(session.status)
  return h('div', {
    class: 'card',
    onclick: () => { void openSession(session.id) },
  }, [
    h('div', { class: 'title' }, [session.title || session.id]),
    h('div', { class: 'sub' }, [
      badge !== '' ? h('span', { class: `badge ${badge}` }, [session.status || 'idle']) : h('span', { class: 'badge' }, [session.status || 'idle']),
      session.cwd !== '' ? ` ${session.cwd}` : '',
    ]),
  ])
}

function listView(): HTMLElement {
  const container = h('div', { class: 'main' }, [
    errorBanner(),
    ...pendingCards(),
  ])
  if (state.sessionsError !== '') {
    container.append(h('div', { class: 'error' }, [`会话列表不可用：${state.sessionsError}`]))
  }
  if (state.sessions.length === 0) {
    container.append(h('div', { class: 'empty' }, [
      state.bridgeReady ? '还没有会话' : '宿主会话服务尚未就绪，稍后自动重试',
    ]))
  }
  const sorted = [...state.sessions].sort((left, right) => right.updatedAt - left.updatedAt)
  for (const session of sorted) container.append(sessionCard(session))
  return h('div', {}, [
    h('div', { class: 'topbar' }, [
      connectionDot(),
      h('h1', {}, ['DSH 远程控制']),
      h('button', {
        class: 'iconbtn',
        title: '刷新',
        onclick: () => { void bootstrap() },
      }, ['⟳']),
    ]),
    container,
  ])
}

function wasNearBottom(): boolean {
  const scroller = document.scrollingElement
  if (scroller === null) return true
  return scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < 160
}

function messageNode(item: Item): HTMLElement {
  const detail = text(item.detail)
  const bubble = h('div', { class: 'bubble' }, [
    item.kind === 'tool-call' ? h('span', { class: 'toolname' }, [`⚙ ${text(item.toolName) || 'tool'}`]) : null,
    item.kind === 'tool-call' && detail !== '' ? null : item.text,
    detail !== '' ? h('span', { class: 'detail' }, [detail]) : null,
  ])
  return h('div', { class: `msg ${item.kind}` }, [bubble])
}

function scrollToBottom(): void {
  window.scrollTo({ top: document.documentElement.scrollHeight })
}

function detailView(): HTMLElement {
  if (state.view.name !== 'detail') return listView()
  const sid = state.view.sid
  const session = state.sessions.find(entry => entry.id === sid)
  const stream = state.streams[sid]
  const container = h('div', { class: 'main' }, [
    errorBanner(),
    ...pendingCards(),
  ])
  const history = sessionItems(state, sid)
  if (history.length === 0 && stream === undefined) {
    container.append(h('div', { class: 'empty' }, ['暂无消息']))
  }
  for (const item of history) container.append(messageNode(item))
  if (stream !== undefined && stream.text !== '') {
    container.append(h('div', { class: `msg assistant${stream.phase === 'end' ? '' : ' streaming'}` }, [
      h('div', { class: 'bubble' }, [stream.text]),
    ]))
  }
  const composerInput = h('textarea', { placeholder: '发送消息…', rows: '1' }) as HTMLTextAreaElement
  const sendButton = h('button', { class: 'send' }, ['发送'])
  const submit = () => {
    const value = composerInput.value.trim()
    if (value === '') return
    composerInput.value = ''
    void send(value)
  }
  sendButton.addEventListener('click', submit)
  composerInput.addEventListener('keydown', event => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      submit()
    }
  })
  return h('div', { style: 'display:flex;flex-direction:column;min-height:100dvh;' }, [
    h('div', { class: 'topbar' }, [
      h('button', { class: 'iconbtn', title: '返回', onclick: back }, ['←']),
      h('h1', {}, [session?.title || sid]),
      connectionDot(),
    ]),
    container,
    h('div', { class: 'composer' }, [composerInput, sendButton]),
  ])
}

// -------------------------------------------------------------------- gate

/** Token gate screen; the banner message comes from state.error when present. */
function gateView(): HTMLElement {
  const message = state.error
  const input = h('input', { placeholder: '输入配对码', autocomplete: 'off' })
  const submit = () => {
    const value = input.value.trim()
    if (value === '') return
    state = initialState(value)
    state.error = ''
    window.localStorage.setItem(TOKEN_KEY, value)
    render()
    void bootstrap()
  }
  input.addEventListener('keydown', event => {
    if (event.key === 'Enter') submit()
  })
  return h('div', { class: 'gate' }, [
    h('div', { style: 'font-size:34px;margin-bottom:6px;' }, ['📱']),
    h('h1', { style: 'font-size:18px;' }, ['DSH 远程控制']),
    message !== '' ? h('div', { class: 'error' }, [message]) : null,
    h('div', { class: 'card' }, [
      input,
      h('div', { class: 'row' }, [
        h('button', { class: 'act primary', onclick: submit }, ['连接']),
      ]),
    ]),
    h('div', { class: 'hint' }, ['配对码来自 DSH 桌面端「远程控制」面板。']),
  ])
}

// --------------------------------------------------------------------- boot

function boot(): void {
  const app = document.getElementById('app')
  if (app === null) return
  root = app
  const url = new URL(window.location.href)
  const fromQuery = url.searchParams.get('token') ?? ''
  if (fromQuery !== '') {
    window.localStorage.setItem(TOKEN_KEY, fromQuery)
    url.searchParams.delete('token')
    window.history.replaceState(null, '', url.pathname + (url.searchParams.size > 0 ? `?${url.searchParams}` : ''))
  }
  const token = fromQuery !== '' ? fromQuery : window.localStorage.getItem(TOKEN_KEY) ?? ''
  state = initialState(token)
  render()
  if (token !== '') void bootstrap()
}

void boot()
