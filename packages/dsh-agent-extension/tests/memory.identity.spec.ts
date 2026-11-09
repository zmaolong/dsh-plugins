/**
 * 项目身份：路径兜底、config.json 覆盖、worktree/克隆共享、多远程与 exclude。
 */

import { afterEach, describe, expect, it } from 'vitest'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

import {
  MEMORY_PROJECT_DIR,
  PROJECT_CONFIG_FILE,
  normalizeRemoteUrl,
  resolveProject,
} from '../src/memory/identity.ts'
import { removeDirs, tempHome } from './helpers.ts'

/** Create a `<dir>/.git/config` with the given INI body. */
function writeGit(dir: string, config: string): void {
  mkdirSync(path.join(dir, '.git'), { recursive: true })
  writeFileSync(path.join(dir, '.git', 'config'), config, 'utf8')
}

describe('项目身份：worktree/克隆共享与手动覆盖', () => {
  let tempDirs: string[] = []

  afterEach(() => {
    removeDirs(...tempDirs)
    tempDirs = []
  })

  function temp(): string {
    const dir = tempHome('memory-identity-')
    tempDirs.push(dir)
    return dir
  }

  it('非 git 目录按路径生成稳定 key，并写 config.json', () => {
    const dir = temp()
    const first = resolveProject(dir)
    expect(first.source).toBe('path')
    expect(first.projectKey).toMatch(/^p_[0-9a-f]{16}$/u)
    const config = JSON.parse(readFileSync(path.join(dir, MEMORY_PROJECT_DIR, PROJECT_CONFIG_FILE), 'utf8')) as Record<string, unknown>
    expect(config.projectKey).toBe(first.projectKey)
    const second = resolveProject(dir)
    expect(second.projectKey).toBe(first.projectKey)
  })

  it('config.json 已有 projectKey 时直接使用且不重写', () => {
    const dir = temp()
    const configFile = path.join(dir, MEMORY_PROJECT_DIR, PROJECT_CONFIG_FILE)
    mkdirSync(path.dirname(configFile), { recursive: true })
    const manual = { schema: 1, projectKey: 'p_manual_override', identity: 'manual', source: 'path' }
    writeFileSync(configFile, JSON.stringify(manual), 'utf8')
    const resolved = resolveProject(dir)
    expect(resolved.projectKey).toBe('p_manual_override')
    expect(JSON.parse(readFileSync(configFile, 'utf8'))).toEqual(manual)
  })

  it('同一个 origin 的两个克隆共享 projectKey，并写入本地 exclude', () => {
    const one = temp()
    const two = temp()
    const config = '[remote "origin"]\n\turl = git@github.com:Acme/Repo.git\n'
    writeGit(one, config)
    writeGit(two, config)
    const first = resolveProject(one)
    const second = resolveProject(two)
    expect(first.source).toBe('git-remote')
    expect(second.projectKey).toBe(first.projectKey)
    const exclude = readFileSync(path.join(one, '.git', 'info', 'exclude'), 'utf8')
    expect(exclude).toContain('.dsh/agent-extension/memory/')
  })

  it('没有 origin 时取按名排序的第一个远程', () => {
    const dir = temp()
    writeGit(dir, '[remote "upstream"]\n\turl = https://gitlab.com/team/up.git\n[remote "fork"]\n\turl = https://gitlab.com/me/fork.git\n')
    const resolved = resolveProject(dir)
    expect(resolved.source).toBe('git-remote')
    expect(resolved.identity).toBe('gitlab.com/me/fork')
  })

  it('worktree 通过 common dir 与主仓库共享 projectKey', () => {
    const repo = temp()
    writeGit(repo, '')
    const worktree = path.join(repo, '.git', 'worktrees', 'feature')
    mkdirSync(worktree, { recursive: true })
    writeFileSync(path.join(worktree, 'commondir'), '../..', 'utf8')
    const checkout = temp()
    writeFileSync(path.join(checkout, '.git'), `gitdir: ${worktree}\n`, 'utf8')
    const main = resolveProject(repo)
    const linked = resolveProject(checkout)
    expect(main.source).toBe('git-common')
    expect(linked.projectKey).toBe(main.projectKey)
  })

  it('远程 URL 规范化覆盖 scp、https、凭据与大小写', () => {
    expect(normalizeRemoteUrl('git@github.com:Acme/Repo.git')).toBe('github.com/acme/repo')
    expect(normalizeRemoteUrl('https://github.com/Acme/Repo.git/')).toBe('github.com/acme/repo')
    expect(normalizeRemoteUrl('ssh://git@github.com:22/Acme/Repo')).toBe('github.com/acme/repo')
    expect(normalizeRemoteUrl('https://user:token@github.com/acme/repo.git')).toBe('github.com/acme/repo')
    expect(normalizeRemoteUrl('not a remote')).toBe('')
  })
})