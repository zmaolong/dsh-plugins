/**
 * 零依赖版本号解析、比较与更新判定。
 *
 * 设计：
 * - 接受可选 `v` / `V` 或 `=` 前缀（比较用），最多三段数字（缺失段按 0 补齐，`1.2` ≡ `1.2.0`）；
 * - `1.2.3.4`、空串、非字符串等一律视为**不可比较**（`parseVersion` 返回 `null`），
 *   调用方必须显式处理 `unknown`，不得默认「可更新」；
 * - 预发布按 SemVer 规则比较：数字标识符按数值、字母标识符按 ASCII、数字 < 字母、
 *   前缀相同但段数少的一侧更小（`alpha < alpha.1`）、无预发布 > 任意预发布；
 * - 构建元数据（`+build`）忽略；
 * - `isInstallableVersion` 比 `parseVersion` 更严格：只接受不带 `v` 前缀的三段
 *   `x.y.z[-pre][+build]`，与安装器目标目录规范一致。
 *
 * @module dsh-agent-plugin-hub/version
 */

/** 比较/解析用版本号结构（宽松：允许 1~3 段数字、可选 v/= 前缀）。 */
const PARSE_PATTERN = /^(?:v)?(\d+)(?:\.(\d+))?(?:\.(\d+))?(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/u

/** 安装器目标目录用严格版本号（与 0.2.x 行为一致：三段、可选预发布/构建、无 v 前缀）。 */
const INSTALL_PATTERN = /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/u

function normalizeVersionText(value) {
  if (typeof value !== 'string') return ''
  let text = value.trim()
  if (text.startsWith('=')) text = text.slice(1).trim()
  if (/^[vV]\d/u.test(text)) text = text.slice(1).trim()
  return text
}

function toNumber(text) {
  return Number.parseInt(text, 10)
}

/**
 * 解析版本号；不可解析返回 `null`。
 *
 * @param {unknown} value
 * @returns {{major: number, minor: number, patch: number, prerelease: string[] | null, raw: string} | null}
 */
export function parseVersion(value) {
  const text = normalizeVersionText(value)
  if (text === '') return null
  const match = PARSE_PATTERN.exec(text)
  if (!match) return null
  const prereleaseText = match[4]
  const prerelease = prereleaseText === undefined
    ? null
    : prereleaseText.split('.')
  if (prerelease !== null && prerelease.some((part) => part === '')) return null
  return {
    major: toNumber(match[1]),
    minor: toNumber(match[2] ?? '0'),
    patch: toNumber(match[3] ?? '0'),
    prerelease,
    raw: String(value).trim(),
  }
}

/** 预发布标识符比较（SemVer 11.4）：数字 < 字母；数字按数值；字母按 ASCII；段数少更小。 */
function comparePrerelease(left, right) {
  const a = left ?? []
  const b = right ?? []
  if (a.length === 0 && b.length === 0) return 0
  if (a.length === 0) return 1
  if (b.length === 0) return -1
  const length = Math.max(a.length, b.length)
  for (let index = 0; index < length; index += 1) {
    const one = a[index]
    const two = b[index]
    if (one === undefined) return -1
    if (two === undefined) return 1
    const oneNumeric = /^\d+$/u.test(one)
    const twoNumeric = /^\d+$/u.test(two)
    if (oneNumeric && twoNumeric) {
      const diff = Number(one) - Number(two)
      if (diff !== 0) return diff < 0 ? -1 : 1
      continue
    }
    if (oneNumeric !== twoNumeric) return oneNumeric ? -1 : 1
    if (one !== two) return one < two ? -1 : 1
  }
  return 0
}

function compareParsed(left, right) {
  for (const key of ['major', 'minor', 'patch']) {
    if (left[key] !== right[key]) return left[key] < right[key] ? -1 : 1
  }
  return comparePrerelease(left.prerelease, right.prerelease)
}

/**
 * 比较两个版本号；任意一侧不可解析时返回 `null`。
 *
 * @param {unknown} left
 * @param {unknown} right
 * @returns {number | null} <0 / 0 / >0，或 null 表示不可比较
 */
export function compareVersions(left, right) {
  const a = parseVersion(left)
  const b = parseVersion(right)
  if (a === null || b === null) return null
  return compareParsed(a, b)
}

/**
 * 判定更新状态（调用方负责「没有已安装记录」的情况；这里只比较两个版本）。
 *
 * - `available`：最新版本高于已安装；
 * - `current`：两者相等；
 * - `installed-newer`：市场版本低于已安装；
 * - `unknown`：任一侧版本缺失或不可比较（**不得**当成 available）。
 *
 * @param {unknown} installedVersion
 * @param {unknown} latestVersion
 * @returns {'available' | 'current' | 'installed-newer' | 'unknown'}
 */
export function classifyUpdate(installedVersion, latestVersion) {
  if (installedVersion === null || installedVersion === undefined || String(installedVersion).trim() === '') {
    return 'unknown'
  }
  if (latestVersion === null || latestVersion === undefined || String(latestVersion).trim() === '') {
    return 'unknown'
  }
  const comparison = compareVersions(installedVersion, latestVersion)
  if (comparison === null) return 'unknown'
  if (comparison < 0) return 'available'
  if (comparison === 0) return 'current'
  return 'installed-newer'
}

/**
 * 版本号是否可用于安装目标目录（严格三段、允许预发布/构建，不接受 v 前缀）。
 *
 * @param {unknown} value
 * @returns {boolean}
 */
export function isInstallableVersion(value) {
  return typeof value === 'string' && INSTALL_PATTERN.test(value.trim())
}