/**
 * Agent 插件格式注册表。
 *
 * 每种格式声明自己的清单候选路径与能力目录布局。同一目录可能同时存在多套
 * 清单：先按“格式专属清单”优先级 claude > codebuddy > zcode 探测；都没有时
 * 再退回通用的根级 `plugin.json`（按调用方给的提示/默认 claude 记录格式）。
 *
 * 路径均相对于插件根目录，斜杠统一用 `/`。
 *
 * @module dsh-agent-plugin-hub/formats
 */

/** 各格式的能力目录布局（Claude 约定，另两种格式按最小兼容估计）。 */
export const FORMATS = Object.freeze([
  Object.freeze({
    id: 'claude',
    label: 'Claude Code',
    pluginManifests: Object.freeze(['.claude-plugin/plugin.json']),
    rootManifests: Object.freeze(['plugin.json']),
    marketplaceFiles: Object.freeze([
      '.claude-plugin/marketplace.json',
      'marketplace.json',
    ]),
    skillsDirs: Object.freeze(['skills']),
    commandsDirs: Object.freeze(['commands']),
    hooksFiles: Object.freeze(['hooks/hooks.json']),
    mcpFiles: Object.freeze(['.mcp.json']),
  }),
  Object.freeze({
    id: 'codebuddy',
    label: 'CodeBuddy',
    pluginManifests: Object.freeze(['.codebuddy-plugin/plugin.json']),
    rootManifests: Object.freeze(['plugin.json']),
    marketplaceFiles: Object.freeze([
      '.codebuddy-plugin/marketplace.json',
      'marketplace.json',
    ]),
    skillsDirs: Object.freeze(['skills']),
    commandsDirs: Object.freeze(['commands']),
    hooksFiles: Object.freeze(['hooks/hooks.json']),
    mcpFiles: Object.freeze(['.mcp.json']),
  }),
  Object.freeze({
    id: 'zcode',
    label: 'ZCode',
    pluginManifests: Object.freeze(['.zcode-plugin/plugin.json']),
    rootManifests: Object.freeze(['plugin.json']),
    marketplaceFiles: Object.freeze([
      '.zcode-plugin/marketplace.json',
      'marketplace.json',
    ]),
    skillsDirs: Object.freeze(['skills']),
    commandsDirs: Object.freeze(['commands']),
    hooksFiles: Object.freeze(['hooks/hooks.json']),
    mcpFiles: Object.freeze(['.mcp.json']),
  }),
])

/** 格式优先级（id 数组，按命中顺序）。 */
export const FORMAT_PRIORITY = Object.freeze(['claude', 'codebuddy', 'zcode'])

const BY_ID = new Map(FORMATS.map((format) => [format.id, format]))

/**
 * 按 id 查找格式定义。
 * @param {string} id
 * @returns {object | undefined}
 */
export function findFormat(id) {
  return BY_ID.get(id)
}

/** 合法格式 id 集合。 */
export function isFormatId(id) {
  return BY_ID.has(id)
}

/** 插件名白名单：字母数字开头，允许 `._-`，最长 64。 */
const PLUGIN_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/u

/**
 * 校验插件名是否安全（同时拒绝路径分隔符与 `..`）。
 * @param {string} name
 * @returns {boolean}
 */
export function isSafePluginName(name) {
  if (typeof name !== 'string' || !PLUGIN_NAME.test(name)) return false
  if (name.includes('..')) return false
  return true
}

/** 粗略 SemVer / 版本号白名单（允许 `1.2.3-beta.1`、`v` 前缀由调用方剥离）。 */
const VERSION = /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/u

export function isSafeVersion(version) {
  return typeof version === 'string' && VERSION.test(version)
}

/**
 * 把任意文本规整为宿主命令可用的名字（DSH 命令名只允许
 * `[a-z][a-z0-9_-]*`，不允许冒号，因此父子关系用 `-` 连接）。
 *
 * @param {string} input
 * @returns {string}
 */
export function toCommandName(input) {
  const lowered = String(input ?? '').toLowerCase()
  const replaced = lowered.replace(/[^a-z0-9_-]+/gu, '-').replace(/-+/gu, '-')
  const trimmed = replaced.replace(/^-+|-+$/gu, '')
  if (trimmed === '') return 'unnamed'
  const startsLegal = /^[a-z]/u.test(trimmed) ? trimmed : `cmd-${trimmed}`
  return startsLegal.slice(0, 64)
}