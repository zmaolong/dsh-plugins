#!/usr/bin/env node
/**
 * 扫描 packages/*，生成聚合索引 index.json（插件市场索引格式 1）。
 *
 * 用法：
 *   node scripts/build-index.mjs
 *
 * 环境变量：
 *   DSH_PLUGINS_SOURCE=git|npm     默认 git
 *   DSH_PLUGINS_REPO=<https 地址>  默认取 git remote origin
 *   DSH_PLUGINS_NPM_REGISTRY=<url> npm 源的私有 registry（可选）
 */
import { execFileSync } from 'node:child_process'
import { readdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const PACKAGES_DIR = join(ROOT, 'packages')
const INDEX_PATH = join(ROOT, 'index.json')
const CONFIG_PATH = join(ROOT, 'market.config.json')
const PLACEHOLDER_REPO = 'https://github.com/your-name/dsh-plugins'

const PACKAGE_NAME = /^(?:@[a-z0-9][a-z0-9._~-]*\/)?[a-z0-9][a-z0-9._~-]*$/u
const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/u

const SOURCE_MODE = (process.env.DSH_PLUGINS_SOURCE ?? 'git').trim().toLowerCase()

function fail(message) {
  console.error(`\n[build-index] ${message}\n`)
  process.exit(1)
}

async function readJson(path, fallback) {
  try {
    return JSON.parse(await readFile(path, 'utf8'))
  } catch {
    return fallback
  }
}

function sh(command, args) {
  return execFileSync(command, args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
}

function gitOrNull(args) {
  try {
    return sh('git', args).trim()
  } catch {
    return null
  }
}

function normalizeRepo(raw) {
  let url = String(raw).trim().replace(/\.git$/u, '')
  const ssh = /^git@([^:]+):(.+)$/u.exec(url)
  if (ssh) url = `https://${ssh[1]}/${ssh[2]}`
  if (!/^https:\/\/[^/]+\/[^/]+\/[^/]+$/u.test(url)) {
    fail(`仓库地址不合法：${raw}。需要 https://host/owner/repo 形式（可用 DSH_PLUGINS_REPO 指定）。`)
  }
  return url
}

function detectRepo() {
  if (process.env.DSH_PLUGINS_REPO) return normalizeRepo(process.env.DSH_PLUGINS_REPO)
  const remote = gitOrNull(['remote', 'get-url', 'origin'])
  if (remote) return normalizeRepo(remote)
  console.warn(`[build-index] 没有 git remote origin，索引里先写占位地址 ${PLACEHOLDER_REPO}；推送仓库后请重新生成。`)
  return PLACEHOLDER_REPO
}

/** 多语言文本：字符串视为英文；对象要求有小写语言 id，并补齐 en。 */
function localized(value, fallback) {
  const source = typeof value === 'string' ? { en: value } : value
  if (source === null || typeof source !== 'object' || Array.isArray(source)) return fallback
  const text = {}
  for (const [language, member] of Object.entries(source)) {
    const id = String(language).toLowerCase()
    if (typeof member !== 'string' || member.trim() === '') continue
    text[id] = member
  }
  if (!Object.hasOwn(text, 'en')) text.en = fallback.en
  return text
}

/** 简单 SemVer 比较，够排序索引里的版本用。 */
function compareSemver(left, right) {
  const parse = (version) => {
    const match = SEMVER.exec(version)
    if (match === null) return null
    return { core: [Number(match[1]), Number(match[2]), Number(match[3])], pre: match[4] ?? null }
  }
  const a = parse(left)
  const b = parse(right)
  if (a === null || b === null) return 0
  for (let index = 0; index < 3; index += 1) {
    if (a.core[index] !== b.core[index]) return a.core[index] - b.core[index]
  }
  if (a.pre === b.pre) return 0
  if (a.pre === null) return 1
  if (b.pre === null) return -1
  return a.pre < b.pre ? -1 : 1
}

function sourceFor(pkg) {
  const override = pkg.dsh?.market?.source
  const mode = override?.type === 'npm' || override?.type === 'git' ? override.type : SOURCE_MODE
  if (mode === 'npm') {
    const registry = override?.registry ?? process.env.DSH_PLUGINS_NPM_REGISTRY
    return registry ? { type: 'npm', registry } : { type: 'npm' }
  }
  const { repo, commit } = gitState()
  return {
    type: 'git',
    url: repo,
    commit,
    path: `packages/${pkg.__dir}`,
  }
}

let cachedGitState
function gitState() {
  if (cachedGitState) return cachedGitState
  const commit = gitOrNull(['rev-parse', 'HEAD'])
  if (!commit || !/^[0-9a-f]{40}$/u.test(commit)) {
    fail('当前目录不是有效的 Git 仓库（取不到 40 位 commit）。请先 git init 并提交，或改用 DSH_PLUGINS_SOURCE=npm。')
  }
  const timestamp = Number(gitOrNull(['show', '-s', '--format=%ct', 'HEAD']))
  if (!Number.isInteger(timestamp) || timestamp <= 0) fail('取不到 HEAD 的提交时间。')
  cachedGitState = { repo: detectRepo(), commit, timestamp }
  return cachedGitState
}

function validatePackage(pkg, dir, config) {
  if (!PACKAGE_NAME.test(pkg.name)) fail(`packages/${dir}：包名 ${JSON.stringify(pkg.name)} 不是合法的 npm 包名。`)
  if (!SEMVER.test(pkg.version)) fail(`packages/${dir}：版本 ${JSON.stringify(pkg.version)} 不是精确 SemVer。`)
  if (typeof pkg.dsh?.bundle?.patch !== 'string') {
    fail(`packages/${dir}：缺少 dsh.bundle.patch 声明，它不是可安装的组合包（bundle）。`)
  }
  const category = pkg.dsh?.market?.category
  if (category !== undefined && !Object.hasOwn(config.metadata?.categories ?? {}, category)) {
    fail(`packages/${dir}：分类 ${JSON.stringify(category)} 没有在 market.config.json 里声明。`)
  }
  for (const label of pkg.dsh?.market?.labels ?? []) {
    if (!Object.hasOwn(config.metadata?.labels ?? {}, label)) {
      fail(`packages/${dir}：标签 ${JSON.stringify(label)} 没有在 market.config.json 里声明。`)
    }
  }
}

async function main() {
  const config = await readJson(CONFIG_PATH, {})
  const metadata = config.metadata ?? {
    categories: config.categories ?? {},
    labels: config.labels ?? {},
    sortKeys: config.sortKeys ?? {},
  }

  const dirs = (await readdir(PACKAGES_DIR, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()

  const previous = new Map()
  const existing = await readJson(INDEX_PATH, null)
  if (existing !== null && Array.isArray(existing.plugins)) {
    for (const plugin of existing.plugins) {
      for (const version of plugin.versions ?? []) {
        previous.set(`${plugin.name}@${version.version}`, version)
      }
    }
  }

  const entries = []
  for (const dir of dirs) {
    const pkg = await readJson(join(PACKAGES_DIR, dir, 'package.json'), null)
    if (pkg === null) {
      console.warn(`[build-index] 跳过 packages/${dir}：没有可读的 package.json。`)
      continue
    }
    if (typeof pkg.dsh?.bundle?.patch !== 'string') {
      console.warn(`[build-index] 跳过 packages/${dir}：未声明 dsh.bundle.patch。`)
      continue
    }
    pkg.__dir = dir
    validatePackage(pkg, dir, { metadata })

    const source = sourceFor(pkg)
    const previousVersion = previous.get(`${pkg.name}@${pkg.version}`)
    const current = {
      version: pkg.version,
      publishTimestamp:
        source.type === 'git'
          ? gitState().timestamp
          : (previousVersion?.publishTimestamp ?? Math.floor(Date.now() / 1000)),
      source,
    }

    const versions = [current]
    if (existing !== null && Array.isArray(existing.plugins)) {
      const old = existing.plugins.find((plugin) => plugin.name === pkg.name)
      for (const version of old?.versions ?? []) {
        if (version.version !== current.version && !versions.some((item) => item.version === version.version)) {
          versions.push(version)
        }
      }
    }
    versions.sort((left, right) => compareSemver(right.version, left.version))

    const market = pkg.dsh?.market ?? {}
    entries.push({
      name: pkg.name,
      ...(market.title ? { title: localized(market.title, { en: pkg.name }) } : {}),
      ...(market.description || pkg.description
        ? { description: localized(market.description ?? pkg.description, { en: pkg.name }) }
        : {}),
      ...(market.icon ? { icon: market.icon } : {}),
      ...(pkg.author ? { author: typeof pkg.author === 'string' ? pkg.author : pkg.author.name } : {}),
      ...(pkg.homepage ? { homepage: pkg.homepage } : {}),
      ...(pkg.repository?.url ? { repository: { url: pkg.repository.url.replace(/^git\+|\.git$/gu, '').replace(/^git@([^:]+):(.+)$/u, 'https://$1/$2') } } : {}),
      ...(market.category || market.labels?.length || market.keywords?.length
        ? {
            metadata: {
              ...(market.category ? { category: market.category } : {}),
              ...(market.labels?.length ? { labels: market.labels } : {}),
              ...((market.keywords ?? pkg.keywords)?.length ? { keywords: market.keywords ?? pkg.keywords } : {}),
            },
          }
        : {}),
      versions,
    })
  }

  if (entries.length === 0) fail('没有找到任何插件包（packages/* 里需要有声明 dsh.bundle.patch 的包）。')

  const index = {
    format: 1,
    title: localized(config.title, { en: 'My DSH plugins' }),
    ...(config.description ? { description: localized(config.description, { en: 'My DSH plugins' }) } : {}),
    metadata,
    plugins: entries,
  }

  await writeFile(INDEX_PATH, `${JSON.stringify(index, null, 2)}\n`, 'utf8')

  console.log(`[build-index] 已写出 ${INDEX_PATH}`)
  for (const entry of entries) {
    const first = entry.versions[0]
    const source = first.source.type === 'git' ? `git+path (${first.source.path})` : 'npm'
    console.log(`  - ${entry.name}@${entry.versions[0].version}  ${source}  版本数 ${entry.versions.length}`)
  }
  console.log(`\n下一步：托管 index.json（见 README「索引（市场源）」），然后在 DSH 插件页 → 发现 → 添加索引源。`)
}

await main()