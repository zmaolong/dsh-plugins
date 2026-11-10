/**
 * HTTP API of the memory panel, mounted under the plugin's existing
 * `/agent-plugin/api` prefix (the caller dispatches the `/memory/*` routes).
 *
 * Read routes are pure reads；例外是 `/memory/preview-file`：它把记忆正文派生
 * 到系统临时目录（幂等、可随时删除）。写路由在本层校验每个字段，因为客户端
 * 是不可信 UI 输入。
 *
 * @module dsh-agent-extension/memory-routes
 */

import { hubError } from './hub.ts'
import { MemoryStore } from './memory/store.ts'
import {
  LIMITS,
  RECALL_MAX_CHARS,
  RECALL_MAX_PER_LAYER,
  clampInt,
  defaultSettings,
  isMemoryStatus,
  isMemoryType,
  normalizeIds,
  normalizeTags,
  text,
  type MemoryGetWire,
  type MemoryListWire,
  type MemoryPreviewFileWire,
  type MemoryScope,
  type MemoryStateWire,
  type MemoryStatus,
} from './memory/types.ts'

/** GET routes served by the memory panel. */
export const MEMORY_GET_ROUTES = ['/memory/state', '/memory/list', '/memory/get', '/memory/preview-file'] as const

/** POST routes served by the memory panel. */
export const MEMORY_POST_ROUTES = [
  '/memory/save',
  '/memory/status',
  '/memory/delete',
  '/memory/settings',
  '/memory/export',
  '/memory/refresh-index',
  '/memory/undo-capture',
] as const

/** 面板可调用的宿主钩子；测试与只读挂载可以省略。 */
export interface MemoryRouteHooks {
  /** 清空索引缓存（不传 sessionId 即清空全部，下一次装配重新渲染）。 */
  refreshRecall?: () => void
}

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
export async function dispatchMemoryGet(
  store: MemoryStore,
  route: string,
  params: URLSearchParams,
): Promise<MemoryStateWire | MemoryListWire | MemoryGetWire | MemoryPreviewFileWire> {
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
  if (route === '/memory/preview-file') {
    const scope = scopeOf(params.get('scope'), 'global')
    const project = projectOf(store, params.get('project'), scope)
    const id = text(params.get('id'))
    if (id === '') throw hubError('缺少记忆 id', 'bad_request')
    // 条目不存在统一按 404 返回，避免 store 的 Error 落到 500。
    const entry = store.get(scope, project, id)
    if (entry === undefined) throw hubError(`记忆不存在：${id}`, 'not_found')
    try {
      // `empty` 让客户端在正文为空时不打开预览页签（spec §5.1），而无需再取一次正文。
      return { ...store.previewFile(scope, project, id), empty: entry.content.trim() === '' }
    } catch (error) {
      // 临时目录不可写等异常：返回结构化错误，客户端提示后仍可继续编辑参数。
      throw hubError(`生成记忆预览失败：${error instanceof Error ? error.message : String(error)}`, 'internal')
    }
  }
  throw hubError(`未知接口：${route}`, 'not_found')
}

/** Dispatch one POST /memory/* request. */
export async function dispatchMemoryPost(
  store: MemoryStore,
  route: string,
  body: Record<string, unknown> = {},
  hooks: MemoryRouteHooks = {},
): Promise<unknown> {
  if (route === '/memory/refresh-index') {
    hooks.refreshRecall?.()
    return { refreshed: true }
  }
  if (route === '/memory/undo-capture') {
    const id = text(body.id)
    if (id === '') throw hubError('缺少捕获样本 id', 'bad_request')
    try {
      return { archived: store.undoCapture(id).archived, undone: true }
    } catch (error) {
      // 样本不存在与归档失败都按客户端可纠正的请求处理。
      throw hubError(error instanceof Error ? error.message : String(error), 'bad_request')
    }
  }
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
    // 预览文件是派生数据：删除记忆后顺手清掉它的预览目录（best effort）。
    store.removePreview(id)
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
  const defaults = defaultSettings()
  const patch: Record<string, boolean | number> = {}
  for (const key of ['captureEnabled', 'captureSessionEnd', 'injectEnabled'] as const) {
    if (typeof body[key] === 'boolean') patch[key] = body[key]
  }
  for (const key of ['indexLimitGlobal', 'indexLimitProject'] as const) {
    if (body[key] !== undefined) patch[key] = clampInt(body[key], 0, RECALL_MAX_PER_LAYER, defaults[key])
  }
  if (body.maxChars !== undefined) patch.maxChars = clampInt(body.maxChars, 1000, RECALL_MAX_CHARS, defaults.maxChars)
  return patch as Partial<{
    captureEnabled: boolean
    captureSessionEnd: boolean
    injectEnabled: boolean
    indexLimitGlobal: number
    indexLimitProject: number
    maxChars: number
  }>
}
