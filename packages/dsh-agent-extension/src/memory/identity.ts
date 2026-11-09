/**
 * Project identity: the stable key a project-scoped memory belongs to.
 *
 * Resolution order (first hit wins):
 * 1. `<root>/.dsh/agent-extension/memory/config.json` with a non-empty
 *    `projectKey` — used verbatim and never rewritten, so a user override is
 *    authoritative;
 * 2. the git `origin` remote URL (normalized), so every worktree and clone of
 *    the same repository shares one memory scope;
 * 3. the git common dir path, which already unifies worktrees of one clone;
 * 4. the working-directory path for non-git folders.
 *
 * The derived identity is written back to `config.json` and the file is added
 * to the repository's local `.git/info/exclude` so automatic memory metadata
 * never shows up as a repository change.
 *
 * @module dsh-agent-extension/memory/identity
 */

import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'

import type { ProjectIdentity, ProjectIdentitySource } from './types.ts'

/** Project-local memory metadata directory, relative to the project root. */
export const MEMORY_PROJECT_DIR = path.join('.dsh', 'agent-extension', 'memory')

/** The only file this plugin writes inside a project: identity metadata, no memory content. */
export const PROJECT_CONFIG_FILE = 'config.json'

/** Exclude pattern appended to `.git/info/exclude`. */
const EXCLUDE_PATTERN = '.dsh/agent-extension/memory/'

interface GitLocation {
  /** Directory holding the `.git` entry (the repository/worktree root). */
  root: string
  /** The git directory shared by every worktree of this repository. */
  commonDir: string
}

/** Read `key = value` entries of one `[remote "name"]` section from `.git/config`. */
export function readRemotes(commonDir: string): Array<{ name: string, url: string }> {
  const file = path.join(commonDir, 'config')
  let source = ''
  try {
    source = readFileSync(file, 'utf8')
  } catch {
    return []
  }
  const remotes: Array<{ name: string, url: string }> = []
  let current: { name: string, url: string } | null = null
  for (const rawLine of source.split(/\r?\n/u)) {
    const line = rawLine.trim()
    const section = /^\[remote\s+"([^"]+)"\]$/u.exec(line)
    if (section) {
      current = { name: section[1] as string, url: '' }
      remotes.push(current)
      continue
    }
    if (line.startsWith('[')) {
      current = null
      continue
    }
    if (current === null) continue
    const pair = /^url\s*=\s*(.+)$/u.exec(line)
    if (pair) current.url = (pair[1] as string).trim()
  }
  return remotes.filter(remote => remote.url !== '')
}

/**
 * Normalize a git remote URL into `host/path` (lowercase, no scheme, no
 * credentials, no `.git`, no trailing slash). Returns '' for unusable values.
 *
 * @param raw - remote URL in scp-like (`git@host:org/repo.git`) or URL form.
 */
export function normalizeRemoteUrl(raw: unknown): string {
  let value = typeof raw === 'string' ? raw.trim() : ''
  if (value === '') return ''
  value = value.replace(/\/+$/u, '').replace(/\.git$/u, '')
  const scp = /^(?:[^@/\s]+@)([^:/\s]+):(.+)$/u.exec(value)
  let host: string
  let remotePath: string
  if (scp && !value.includes('://')) {
    host = scp[1] as string
    remotePath = scp[2] as string
  } else {
    try {
      const url = new URL(value)
      host = url.hostname
      remotePath = url.pathname
    } catch {
      return ''
    }
  }
  remotePath = remotePath.replace(/^\/+/u, '').replace(/\/+$/u, '')
  if (host === '' || remotePath === '') return ''
  return `${host}/${remotePath}`.toLowerCase()
}

/** Pick the identity remote: `origin` first, then the alphabetically first remote. */
function chooseRemoteUrl(remotes: Array<{ name: string, url: string }>): string {
  const origin = remotes.find(remote => remote.name === 'origin')
  if (origin) return normalizeRemoteUrl(origin.url)
  const sorted = [...remotes].sort((left, right) => left.name.localeCompare(right.name))
  for (const remote of sorted) {
    const normalized = normalizeRemoteUrl(remote.url)
    if (normalized !== '') return normalized
  }
  return ''
}

/** Capitalize-insensitive path form used for identity hashing. */
function pathIdentity(target: string): string {
  const resolved = path.resolve(target)
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved
}

/** Locate the enclosing git repository and its shared common dir. */
function locateGit(start: string): GitLocation | null {
  let dir = path.resolve(start)
  for (;;) {
    const entry = path.join(dir, '.git')
    if (existsSync(entry)) {
      try {
        const stats = statSync(entry)
        if (stats.isDirectory()) return { root: dir, commonDir: entry }
        if (stats.isFile()) {
          const text = readFileSync(entry, 'utf8')
          const match = /^gitdir:\s*(.+)$/mu.exec(text)
          if (!match) return null
          const gitDir = path.resolve(dir, (match[1] as string).trim())
          const commonFile = path.join(gitDir, 'commondir')
          let commonDir = gitDir
          try {
            commonDir = path.resolve(gitDir, readFileSync(commonFile, 'utf8').trim())
          } catch {
            /* older git layouts have no commondir file; the worktree layout is next */
          }
          if (commonDir === gitDir && /[\\/]worktrees[\\/][^\\/]+$/u.test(gitDir)) {
            commonDir = path.resolve(gitDir, '..', '..')
          }
          return { root: dir, commonDir }
        }
      } catch {
        return null
      }
    }
    const parent = path.dirname(dir)
    if (parent === dir) return null
    dir = parent
  }
}

/** Write a small JSON file atomically (best effort for project-local metadata). */
function writeJsonAtomic(file: string, value: unknown): boolean {
  try {
    mkdirSync(path.dirname(file), { recursive: true })
    const tmp = `${file}.tmp-${process.pid}`
    writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
    renameSync(tmp, file)
    return true
  } catch {
    return false
  }
}

/** Append the memory metadata directory to the repository-local exclude file. */
function ensureGitExclude(commonDir: string): boolean {
  try {
    const infoDir = path.join(commonDir, 'info')
    const file = path.join(infoDir, 'exclude')
    let current = ''
    try {
      current = readFileSync(file, 'utf8')
    } catch {
      current = ''
    }
    const lines = current.split(/\r?\n/u)
    if (lines.some(line => line.trim() === EXCLUDE_PATTERN)) return true
    mkdirSync(infoDir, { recursive: true })
    const separator = current === '' || current.endsWith('\n') ? '' : '\n'
    const next = `${current}${separator}${EXCLUDE_PATTERN}\n`
    const tmp = `${file}.tmp-${process.pid}`
    writeFileSync(tmp, next, 'utf8')
    renameSync(tmp, file)
    return true
  } catch {
    return false
  }
}

interface ProjectConfig {
  schema?: number
  projectKey?: unknown
  identity?: unknown
  source?: unknown
}

/** Read the project-local identity override, if any. */
export function readProjectConfig(root: string): ProjectConfig | null {
  const file = path.join(root, MEMORY_PROJECT_DIR, PROJECT_CONFIG_FILE)
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8')) as unknown
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return null
    return parsed as ProjectConfig
  } catch {
    return null
  }
}

/** Resolve the project identity of `cwd`; see the module docs for the order. */
export function resolveProject(cwd: unknown): ProjectIdentity {
  const start = path.resolve(typeof cwd === 'string' && cwd.trim() !== '' ? cwd.trim() : process.cwd())
  const git = locateGit(start)
  const root = git?.root ?? start
  const existing = readProjectConfig(root)
  if (existing !== null && typeof existing.projectKey === 'string' && existing.projectKey.trim() !== '') {
    const source = existing.source === 'git-remote' || existing.source === 'git-common' || existing.source === 'path'
      ? existing.source
      : git === null ? 'path' : 'git-common'
    const identity = typeof existing.identity === 'string' && existing.identity.trim() !== ''
      ? existing.identity.trim()
      : root
    return {
      projectKey: existing.projectKey.trim(),
      identity,
      source,
      displayName: displayNameOf(identity, root),
      root,
    }
  }

  let identity: string
  let source: ProjectIdentitySource
  if (git !== null) {
    const remote = chooseRemoteUrl(readRemotes(git.commonDir))
    if (remote !== '') {
      identity = remote
      source = 'git-remote'
    } else {
      identity = `common:${pathIdentity(git.commonDir)}`
      source = 'git-common'
    }
  } else {
    identity = `path:${pathIdentity(start)}`
    source = 'path'
  }
  const projectKey = `p_${createHash('sha256').update(identity).digest('hex').slice(0, 16)}`
  const resolved: ProjectIdentity = {
    projectKey,
    identity,
    source,
    displayName: displayNameOf(identity, root),
    root,
  }
  // Pin the derived identity so later remote/config changes cannot migrate the
  // memories to another key (and so the user can override it by hand).
  writeJsonAtomic(path.join(root, MEMORY_PROJECT_DIR, PROJECT_CONFIG_FILE), {
    schema: 1,
    projectKey,
    identity,
    source,
  })
  if (git !== null) ensureGitExclude(git.commonDir)
  return resolved
}

/** Human-readable project name: the remote repository name, else the directory name. */
export function displayNameOf(identity: string, root: string): string {
  const cleaned = identity.replace(/\.git$/u, '').replace(/[\\/]+$/u, '')
  const last = cleaned.split(/[\\/:]/u).filter(Boolean).pop() ?? ''
  return last !== '' ? last : path.basename(root) || 'project'
}

/** Whether the project-local config file exists for `root` (UI hint only). */
export function hasProjectConfig(root: string): boolean {
  return existsSync(path.join(root, MEMORY_PROJECT_DIR, PROJECT_CONFIG_FILE))
}