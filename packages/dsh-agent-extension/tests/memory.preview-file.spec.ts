/**
 * 记忆预览文件：仅正文（剥离 frontmatter）、内容 trim、文件名清洗、路径稳定、
 * 幂等覆写、删除清理与 7 天过期清理。全部使用临时目录，不写真实的
 * `%TEMP%/dsh-agent-extension-memory-preview`。
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, utimesSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { MemoryStore } from '../src/memory/store.ts'
import {
  dispatchMemoryGet,
  dispatchMemoryPost,
  isMemoryGetRoute,
  MEMORY_GET_ROUTES,
} from '../src/memory-routes.ts'
import {
  fileName,
  previewContent,
  previewPath,
  previewRoot,
  prunePreviewRoot,
  removePreviewEntry,
  writePreviewFile,
} from '../src/memory/preview.ts'
import { removeDirs, tempHome } from './helpers.ts'

/** 预览文件位置（路由返回的 `{ path, name }`）。 */
interface PreviewResult {
  path: string
  name: string
}

describe('记忆预览文件：正文派生、命名清洗、路径稳定与清理', () => {
  let tempDirs: string[] = []

  afterEach(() => {
    removeDirs(...tempDirs)
    tempDirs = []
  })

  /** 临时插件 home + 临时预览根目录；测试结束时整体删除。 */
  function makeFixture(): { store: MemoryStore, home: string, previewDir: string } {
    const home = tempHome('memory-preview-')
    tempDirs.push(home)
    const previewDir = path.join(home, 'preview-root')
    const store = new MemoryStore({ home, previewRoot: previewDir })
    store.start()
    return { store, home, previewDir }
  }

  /** 通过真实写路由保存一条记忆（返回入库后的条目）。 */
  async function saveEntry(
    store: MemoryStore,
    overrides: Record<string, unknown> = {},
  ): Promise<{ id: string, name: string, content: string }> {
    const saved = await dispatchMemoryPost(store, '/memory/save', {
      scope: 'global',
      name: '预览测试',
      description: '验证预览文件派生',
      type: 'reference',
      content: '# 正文\n\n第一行。',
      ...overrides,
    }) as { entry: { id: string, name: string, content: string } }
    return saved.entry
  }

  /** 走 GET 路由请求预览文件。 */
  async function previewOf(store: MemoryStore, id: string, scope = 'global', project = ''): Promise<PreviewResult> {
    return await dispatchMemoryGet(store, '/memory/preview-file', new URLSearchParams({
      scope,
      id,
      ...(project === '' ? {} : { project }),
    })) as PreviewResult
  }

  it('预览根目录默认位于系统临时目录，可直接用于路由注册', () => {
    expect(previewRoot()).toBe(path.join(os.tmpdir(), 'dsh-agent-extension-memory-preview'))
    // 路由必须注册为 GET 路由，且分派顺序在 /memory/get 之后。
    expect(isMemoryGetRoute('/memory/preview-file')).toBe(true)
    expect(MEMORY_GET_ROUTES.indexOf('/memory/preview-file')).toBe(MEMORY_GET_ROUTES.indexOf('/memory/get') + 1)
  })

  it('预览文件只含正文：剥离 frontmatter 且 content 已 trim', async () => {
    const { store, previewDir } = makeFixture()
    const entry = await saveEntry(store, {
      name: '记忆条目',
      tags: ['alpha', 'beta'],
      importance: 66,
      content: '  \n# 标题\n\n正文第一段。\n\n正文第二段。  \n',
    })

    const preview = await previewOf(store, entry.id)
    expect(path.isAbsolute(preview.path)).toBe(true)
    expect(preview.path.startsWith(previewDir)).toBe(true)
    expect(path.dirname(preview.path)).toBe(path.join(previewDir, entry.id))
    expect(preview.name).toBe('记忆条目')
    expect(path.basename(preview.path)).toBe('记忆条目.md')

    const written = readFileSync(preview.path, 'utf8')
    // 只有正文：不存在 frontmatter 的 `---` 头与任何 YAML 字段。
    expect(written.startsWith('---')).toBe(false)
    expect(written).not.toContain('---')
    expect(written).not.toContain('id:')
    expect(written).not.toContain('name:')
    expect(written).not.toContain('tags:')
    expect(written).not.toContain('importance:')
    expect(written).toBe('# 标题\n\n正文第一段。\n\n正文第二段。\n')
    // 原文件仍保留 frontmatter，预览是派生数据而非原文件。
    expect(readFileSync(path.join(store.root, 'global', `${entry.id}.md`), 'utf8')).toContain('tags: [')
  })

  it('previewContent 去掉首尾空白并补一个换行，空正文只留换行', () => {
    expect(previewContent('  \n# 标题\n\n正文  \n')).toBe('# 标题\n\n正文\n')
    expect(previewContent('   ')).toBe('\n')
    expect(previewContent('')).toBe('\n')
  })

  it('fileName 清洗非法字符、控制字符与连续空白', () => {
    expect(fileName('a/b\\c:d*e?f"g<h>i|j', 'm-1')).toBe('a b c d e f g h i j')
    expect(fileName('a\u0000b\u001fc', 'm-1')).toBe('a b c')
    expect(fileName('  使用   pnpm \n 安装  ', 'm-1')).toBe('使用 pnpm 安装')
    expect(fileName('标题\t副标题', 'm-1')).toBe('标题 副标题')
  })

  it('fileName 裁剪到 60 字符，空名称回退 memory-<id>', () => {
    expect(fileName('x'.repeat(80), 'm-1')).toBe('x'.repeat(60))
    expect(fileName('y'.repeat(60), 'm-1')).toBe('y'.repeat(60))
    expect(fileName('z'.repeat(61), 'm-1')).toBe('z'.repeat(60))
    expect(fileName('   ', 'm-7')).toBe('memory-m-7')
    expect(fileName('/:*?', 'm-7')).toBe('memory-m-7')
  })

  it('fileName 给 Windows 保留名追加下划线', () => {
    expect(fileName('CON', 'm-1')).toBe('CON_')
    expect(fileName('con', 'm-1')).toBe('con_')
    expect(fileName('COM1', 'm-1')).toBe('COM1_')
    expect(fileName('LPT9', 'm-1')).toBe('LPT9_')
    expect(fileName('CON.txt', 'm-1')).toBe('CON_.txt')
    expect(fileName('CONSOLE', 'm-1')).toBe('CONSOLE')
  })

  it('previewPath 按 <root>/<id>/<name>.md 布局，且 id 不能逃出根目录', () => {
    const root = path.join(os.tmpdir(), 'dsh-preview-layout-check')
    expect(previewPath(root, '名称', 'm-1')).toBe(path.join(root, 'm-1', '名称.md'))
    const escaped = previewPath(root, '名称', '../evil')
    expect(escaped.startsWith(`${root}${path.sep}`)).toBe(true)
    expect(path.relative(root, escaped).startsWith('..')).toBe(false)
  })

  it('writePreviewFile 使用注入的根目录，内容与返回值可直接断言', () => {
    const { previewDir } = makeFixture()
    const preview = writePreviewFile({ id: 'm-1', name: '标题: 非法/字符', content: '  正文  \n' }, previewDir)
    expect(preview.path).toBe(path.join(previewDir, 'm-1', '标题 非法 字符.md'))
    expect(preview.name).toBe('标题 非法 字符')
    expect(readFileSync(preview.path, 'utf8')).toBe('正文\n')
  })

  it('同一 id 路径稳定，重复调用覆写同一文件（名称变化才换路径）', async () => {
    const { store } = makeFixture()
    const entry = await saveEntry(store, { content: '第一版正文。' })
    const first = await previewOf(store, entry.id)
    const second = await previewOf(store, entry.id)
    expect(second.path).toBe(first.path)
    expect(readFileSync(first.path, 'utf8')).toBe('第一版正文。\n')
    expect(readdirSync(path.dirname(first.path)).filter(name => name.endsWith('.md'))).toHaveLength(1)

    // 同 id 再保存（正文变化）→ 仍然同一路径，内容被覆写。
    await dispatchMemoryPost(store, '/memory/save', {
      scope: 'global',
      id: entry.id,
      name: entry.name,
      description: '验证覆写',
      type: 'reference',
      content: '第二版正文。',
    })
    const third = await previewOf(store, entry.id)
    expect(third.path).toBe(first.path)
    expect(third.name).toBe(first.name)
    expect(readFileSync(first.path, 'utf8')).toBe('第二版正文。\n')
    expect(readdirSync(path.dirname(first.path)).filter(name => name.endsWith('.md'))).toHaveLength(1)

    // 名称变化 → 文件名变化（旧文件留在同一 id 目录，由 7 天清理兜底）。
    await dispatchMemoryPost(store, '/memory/save', {
      scope: 'global',
      id: entry.id,
      name: '改名后的记忆',
      description: '验证改名',
      type: 'reference',
      content: '第三版正文。',
    })
    const renamed = await previewOf(store, entry.id)
    expect(renamed.path).not.toBe(first.path)
    expect(path.dirname(renamed.path)).toBe(path.dirname(first.path))
    expect(existsSync(renamed.path)).toBe(true)
    expect(existsSync(first.path)).toBe(true)
  })

  it('项目级记忆同样可生成预览文件', async () => {
    const { store, previewDir } = makeFixture()
    store.touchProject({
      projectKey: 'p_preview0000001',
      identity: 'github.com/acme/preview-repo',
      source: 'git-remote',
      displayName: 'preview-repo',
      root: path.dirname(previewDir),
    })
    const entry = await saveEntry(store, {
      scope: 'project',
      project: 'p_preview0000001',
      name: '项目记忆',
      content: '项目正文。',
    })
    const preview = await previewOf(store, entry.id, 'project', 'p_preview0000001')
    expect(readFileSync(preview.path, 'utf8')).toBe('项目正文。\n')
  })

  it('条目不存在返回 not_found，缺少 id 返回 bad_request', async () => {
    const { store } = makeFixture()
    await expect(previewOf(store, 'missing')).rejects.toMatchObject({
      code: 'not_found',
      message: '记忆不存在：missing',
    })
    await expect(dispatchMemoryGet(store, '/memory/preview-file', new URLSearchParams({ scope: 'global' })))
      .rejects.toMatchObject({ code: 'bad_request' })
    // 项目作用域未识别到项目时与 /memory/get 一致地报 not_found。
    await expect(dispatchMemoryGet(store, '/memory/preview-file', new URLSearchParams({ scope: 'project', id: 'x' })))
      .rejects.toMatchObject({ code: 'not_found' })
  })

  it('/memory/delete 成功后删除该 id 的预览目录（best effort）', async () => {
    const { store } = makeFixture()
    const entry = await saveEntry(store)
    const preview = await previewOf(store, entry.id)
    expect(existsSync(preview.path)).toBe(true)

    const removed = await dispatchMemoryPost(store, '/memory/delete', { scope: 'global', id: entry.id })
    expect(removed).toEqual({ deleted: true, id: entry.id })
    expect(existsSync(preview.path)).toBe(false)
    expect(existsSync(path.dirname(preview.path))).toBe(false)
  })

  it('写入时清理 mtime 超过 7 天的条目目录，未过期目录保留', async () => {
    const { store, previewDir } = makeFixture()
    const day = 24 * 60 * 60 * 1000
    // 一个 8 天未更新的陈旧条目目录…
    const staleDir = path.join(previewDir, 'm-stale')
    mkdirSync(staleDir, { recursive: true })
    writeFileSync(path.join(staleDir, 'old.md'), '旧正文\n')
    const eightDaysAgo = new Date(Date.now() - 8 * day)
    utimesSync(staleDir, eightDaysAgo, eightDaysAgo)
    // …和一个 1 天前写入的条目目录（应保留）。
    const recentDir = path.join(previewDir, 'm-recent')
    mkdirSync(recentDir, { recursive: true })
    writeFileSync(path.join(recentDir, 'recent.md'), '新正文\n')
    const yesterday = new Date(Date.now() - day)
    utimesSync(recentDir, yesterday, yesterday)

    const entry = await saveEntry(store, { content: '触发清理的正文。' })
    const preview = await previewOf(store, entry.id)

    expect(existsSync(staleDir)).toBe(false)
    expect(existsSync(recentDir)).toBe(true)
    expect(existsSync(preview.path)).toBe(true)
  })

  it('prunePreviewRoot 按注入时间判断阈值；removePreviewEntry 幂等', () => {
    const { previewDir } = makeFixture()
    const dir = path.join(previewDir, 'm-old')
    mkdirSync(dir, { recursive: true })
    writeFileSync(path.join(dir, 'old.md'), '旧正文\n')

    // 时间推进 8 天：目录过期被删。
    prunePreviewRoot(previewDir, Date.now() + 8 * 24 * 60 * 60 * 1000)
    expect(existsSync(dir)).toBe(false)

    // 未推进时间：新建目录保留。
    const keep = path.join(previewDir, 'm-keep')
    mkdirSync(keep, { recursive: true })
    prunePreviewRoot(previewDir, Date.now())
    expect(existsSync(keep)).toBe(true)

    // 删除不存在的预览目录不抛错（best effort）。
    expect(() => removePreviewEntry('m-does-not-exist', previewDir)).not.toThrow()
  })
})
