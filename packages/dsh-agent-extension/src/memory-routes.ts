/**
 * HTTP API of the memory panel, mounted under the plugin's existing
 * `/agent-plugin/api` prefix (the caller dispatches the `/memory/*` routes).
 *
 * Read routes are pure reads; write routes validate every field at this
 * boundary because the client is untrusted UI input.
 *
 * @module dsh-agent-extension/memory-routes
 */

import { hubError } from './hub.ts'
import { MemoryStore } from './memory/store.ts'
import {
  LIMITS,
  clampInt,
  isMemoryStatus,
  isMemoryType,
  normalizeIds,
  normalizeTags,
  text,
  type MemoryScope,
  type MemoryStatus,
} from './memory/types.ts'

/** GET routes served by the memory panel. */
export const MEMORY_GET_ROUTES = ['/memory/state', '/memory/list', '/memory/get'] as const

/** POST routes served by the memory panel. */
export const MEMORY_POST_ROUTES = [
  '/memory/save',
  '/memory/status',
  '/memory/delete',
  '/memory/settings',
  '/memory/export',
] as const

/** Whether `route` is one of the read routes. */
export function isMemoryGetRoute(route: string): boolean {
  return (MEMORY_GET_ROUTES as readonly string[]).includes(route)
}

/** Whether `route` is one of the write routes. */
export function isMemoryPostRoute(route: string): boolean {
  return (MEMORY_POST_ROUTES as readonly string[]).includes(route)
}

/** Parse one scope query/body value. */
function scopeOf(value: unknown, fallback: MemoryScope = 'global'): MemoryScope {
  return value === 'project' || value === 'global' ? value : fallback
}

/** Resolve the project key a project-scope request addresses. */
function projectOf(store: MemoryStore, requested: unknown, scope: MemoryScope): string {
  if (scope === 'global') return ''
  const key = text(requested)
  if (key !== '') return key
  const first = store.listProjects()[0]
  if (first === undefined) throw hubError('尚未识别到项目：先在某个 git 项目中发起会话', 'not_found')
  return first.key
}

/** Dispatch one GET /memory/* request. */
export async function dispatchMemoryGet(store: MemoryStore, route: string, params: URLSearchParams): Promise<unknown> {
  if (route === '/memory/state') {
    return {
      settings: store.settings(),
      projects: store.listProjects(),
      stats: store.stats(),
    }
  }
  if (route === '/memory/list') {
    const scope = scopeOf(params.get('scope'), 'global')
    const project = projectOf(store, params.get('project'), scope)
    const rawType = params.get('type')
    const type = isMemoryType(rawType) ? rawType : undefined
    const entries = store.list(scope, project, {
      query: params.get('query') ?? '',
      ...(type === undefined ? {} : { type }),
      includeArchived: params.get('includeArchived') === '1',
      limit: LIMITS.entriesPerScope,
      includeContent: params.get('content') === '1',
    })
    return { scope, project, total: entries.length, entries }
  }
  if (route === '/memory/get') {
    const scope = scopeOf(params.get('scope'), 'global')
    const project = projectOf(store, params.get('project'), scope)
    const id = text(params.get('id'))
    if (id === '') throw hubError('缺少记忆 id', 'bad_request')
    const entry = store.get(scope, project, id)
    if (entry === undefined) throw hubError(`记忆不存在：${id}`, 'not_found')
    return { entry }
  }
  throw hubError(`未知接口：${route}`, 'not_found')
}

/** Dispatch one POST /memory/* request. */
export async function dispatchMemoryPost(store: MemoryStore, route: string, body: Record<string, unknown> = {}): Promise<unknown> {
  if (route === '/memory/save') {
    const name = text(body.name)
    const content = text(body.content)
    if (name === '') throw hubError('记忆名称不能为空', 'bad_request')
    if (content === '') throw hubError('记忆内容不能为空', 'bad_request')
    const scope = scopeOf(body.scope, 'project')
    const project = projectOf(store, body.project, scope)
    const entry = store.save({
      ...(text(body.id) === '' ? {} : { id: text(body.id) }),
      name: name.slice(0, LIMITS.name),
      description: text(body.description).slice(0, LIMITS.description),
      type: isMemoryType(body.type) ? body.type : 'reference',
      scope,
      project,
      content: content.slice(0, LIMITS.content),
      tags: normalizeTags(body.tags),
      importance: clampInt(body.importance, 0, 100, 50),
      supersedes: normalizeIds(body.supersedes),
      originSessionId: text(body.originSessionId),
    })
    return { entry }
  }
  if (route === '/memory/status') {
    const scope = scopeOf(body.scope, 'global')
    const project = projectOf(store, body.project, scope)
    const id = text(body.id)
    const status: MemoryStatus | undefined = isMemoryStatus(body.status) ? body.status : undefined
    if (id === '') throw hubError('缺少记忆 id', 'bad_request')
    if (status === undefined) throw hubError('status 只能是 active / stale / archived', 'bad_request')
    return { entry: store.setStatus(scope, project, id, status) }
  }
  if (route === '/memory/delete') {
    const scope = scopeOf(body.scope, 'global')
    const project = projectOf(store, body.project, scope)
    const id = text(body.id)
    if (id === '') throw hubError('缺少记忆 id', 'bad_request')
    if (!store.remove(scope, project, id)) throw hubError(`记忆不存在：${id}`, 'not_found')
    return { deleted: true, id }
  }
  if (route === '/memory/settings') {
    return { settings: store.updateSettings(parseSettingsPatch(body)) }
  }
  if (route === '/memory/export') {
    const scope = scopeOf(body.scope, 'global')
    const project = projectOf(store, body.project, scope)
    return store.exportMarkdown(scope, project)
  }
  throw hubError(`未知接口：${route}`, 'not_found')
}

/** Validate the settings patch accepted from the UI. */
function parseSettingsPatch(body: Record<string, unknown>): Partial<{
  captureEnabled: boolean
  captureSessionEnd: boolean
  injectEnabled: boolean
  indexLimitGlobal: number
  indexLimitProject: number
  maxChars: number
}> {
  const patch: Record<string, boolean | number> = {}
  for (const key of ['captureEnabled', 'captureSessionEnd', 'injectEnabled'] as const) {
    if (typeof body[key] === 'boolean') patch[key] = body[key]
  }
  for (const key of ['indexLimitGlobal', 'indexLimitProject'] as const) {
    if (body[key] !== undefined) patch[key] = clampInt(body[key], 0, LIMITS.indexEntries, 50)
  }
  if (body.maxChars !== undefined) patch.maxChars = clampInt(body.maxChars, 1000, LIMITS.maxChars, 12000)
  return patch as Partial<{
    captureEnabled: boolean
    captureSessionEnd: boolean
    injectEnabled: boolean
    indexLimitGlobal: number
    indexLimitProject: number
    maxChars: number
  }>
}