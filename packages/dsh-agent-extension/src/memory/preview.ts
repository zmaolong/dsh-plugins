/**
 * 记忆预览文件的数据面：把记忆正文写成宿主可直接预览的临时 Markdown。
 *
 * 记忆原文件是 frontmatter（YAML）+ 正文，宿主右侧栏的 `.md` 预览会把 YAML
 * 头当正文渲染；因此这里派生「仅正文」文件，供宿主预览页签只读展示：
 *
 * ```
 * <os.tmpdir()>/dsh-agent-extension-memory-preview/
 *   <id>/<清洗后的记忆名称>.md    每次调用覆写同一文件（名称变化会新增文件）
 * ```
 *
 * 预览目录是纯派生数据，随时可删：写入时顺手清理 7 天未更新的条目目录，
 * `/memory/delete` 成功后删除对应目录；所有清理均为 best effort。
 *
 * @module dsh-agent-extension/memory/preview
 */

import { mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import type { MemoryEntry } from './types.ts'

/** 预览根目录名；位于系统临时目录下。 */
const PREVIEW_DIR_NAME = 'dsh-agent-extension-memory-preview'
/** 条目目录保留时长：最后一次写入后 7 天。 */
const PREVIEW_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000
/** 文件名最长字符数。 */
const FILE_NAME_CHARS = 60
/** 文件名非法字符：`\ / : * ? " < > |` 与控制字符。 */
const ILLEGAL_CHARS = /[\\/:*?"<>|\u0000-\u001F\u007F]/gu
/** Windows 保留设备名（不区分大小写；带扩展名同样被系统视为保留）。 */
const RESERVED_NAMES = /^(?:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/iu

/** 一条记忆的预览文件位置。 */
export interface PreviewFile {
  /** 预览文件绝对路径。 */
  path: string
  /** 清洗后的文件名（不含 `.md` 扩展名）。 */
  name: string
}

/** 预览根目录：`<os.tmpdir()>/dsh-agent-extension-memory-preview`。 */
export function previewRoot(): string {
  return path.join(os.tmpdir(), PREVIEW_DIR_NAME)
}

/**
 * 目录与文件名里安全的条目 id。
 *
 * id 可能来自手改过的 frontmatter，直接拼进路径会有目录穿越风险，
 * 这里只保留字母、数字、`.`、`_`、`-`。
 */
function safeId(id: string): string {
  const cleaned = id.replace(/[^A-Za-z0-9._-]+/gu, '_').replace(/^\.+/u, '').slice(0, 80)
  return cleaned === '' ? 'memory' : cleaned
}

/**
 * 清洗记忆名称，得到预览文件名（不含 `.md`）。
 *
 * 规则：去掉 `\ / : * ? " < > |` 与控制字符 → 折叠空白 → 裁剪到 60 字符 →
 * 空名称回退 `memory-<id>` → Windows 保留名追加下划线。
 *
 * @param name - 记忆名称（可含任意字符）。
 * @param id - 记忆 id，用于空名称兜底。
 */
export function fileName(name: string, id: string): string {
  const cleaned = name.replace(ILLEGAL_CHARS, ' ').replace(/\s+/gu, ' ').trim()
  // 按码点裁剪，避免把代理对（emoji）截成半个字符。
  const truncated = [...cleaned].slice(0, FILE_NAME_CHARS).join('').trim()
  const base = truncated === '' ? `memory-${safeId(id)}` : truncated
  const dot = base.indexOf('.')
  const stem = dot === -1 ? base : base.slice(0, dot)
  if (!RESERVED_NAMES.test(stem)) return base
  // Windows 把 `CON.txt` 之类同样视为保留名，因下划线加在主干上。
  return `${stem}_${dot === -1 ? '' : base.slice(dot)}`
}

/** 一条记忆的预览文件绝对路径。 */
export function previewPath(root: string, name: string, id: string): string {
  return path.join(root, safeId(id), `${fileName(name, id)}.md`)
}

/**
 * 预览文件内容：只有正文（去首尾空白 + 结尾换行），绝不含 frontmatter。
 *
 * @param content - 记忆正文（不含 YAML 头）。
 */
export function previewContent(content: string): string {
  return `${content.trim()}\n`
}

/**
 * 删除 root 下超过 7 天未更新的条目目录（best effort，任何错误都忽略）。
 *
 * @param root - 预览根目录。
 * @param now - 当前时间戳；测试可注入以便验证阈值。
 */
export function prunePreviewRoot(root: string, now = Date.now()): void {
  let names: string[] = []
  try {
    names = readdirSync(root)
  } catch {
    return
  }
  for (const name of names) {
    const dir = path.join(root, name)
    try {
      if (!statSync(dir).isDirectory()) continue
      if (now - statSync(dir).mtimeMs <= PREVIEW_MAX_AGE_MS) continue
      removePreviewDir(dir)
    } catch {
      /* 单个条目失败不影响其他条目清理 */
    }
  }
}

/**
 * 删除一条记忆的预览目录（best effort）。
 *
 * @param id - 记忆 id。
 * @param root - 预览根目录。
 */
export function removePreviewEntry(id: string, root: string = previewRoot()): void {
  removePreviewDir(path.join(root, safeId(id)))
}

/**
 * 写入一条记忆的预览文件，返回绝对路径与清洗后的文件名。
 *
 * 同一条目重复调用覆写同一文件（幂等）；写入成功后顺手清理过期条目目录。
 *
 * @param entry - 记忆（至少需要 id / name / content）。
 * @param root - 预览根目录，默认 `previewRoot()`（测试传临时目录）。
 */
export function writePreviewFile(
  entry: Pick<MemoryEntry, 'id' | 'name' | 'content'>,
  root: string = previewRoot(),
): PreviewFile {
  const file = previewPath(root, entry.name, entry.id)
  mkdirSync(path.dirname(file), { recursive: true })
  writeFileSync(file, previewContent(entry.content), 'utf8')
  prunePreviewRoot(root)
  return { path: file, name: path.basename(file, '.md') }
}

/** 尽力删除一个预览目录（Windows 句柄短暂占用时重试）。 */
function removePreviewDir(dir: string): void {
  try {
    rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 })
  } catch {
    /* 预览目录是临时产物，删除失败无需处理 */
  }
}
