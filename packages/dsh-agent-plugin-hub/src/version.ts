/**
 * Zero-dependency version parsing, comparison, and update classification.
 *
 * Design:
 * - Accepts an optional `v` / `V` or `=` prefix (for comparison), at most three
 *   numeric segments (missing segments count as 0, `1.2` ≡ `1.2.0`);
 * - `1.2.3.4`, empty strings, and non-strings are **incomparable**
 *   (`parseVersion` returns `null`); callers must handle `unknown` explicitly
 *   and never default to "updatable";
 * - Prerelease identifiers follow SemVer 11.4: numeric identifiers compare
 *   numerically, alphanumeric by ASCII, numeric < alphanumeric, fewer segments
 *   sort lower when prefixes match (`alpha < alpha.1`), and a release outranks
 *   any prerelease;
 * - Build metadata (`+build`) is ignored;
 * - `isInstallableVersion` is stricter than `parseVersion`: only a
 *   prefix-free three-segment `x.y.z[-pre][+build]` is accepted, matching the
 *   installer's target directory rule.
 *
 * @module dsh-agent-plugin-hub/version
 */

/** Parsed version: 1–3 numeric segments plus an optional prerelease list. */
export interface ParsedVersion {
  major: number
  minor: number
  patch: number
  prerelease: readonly string[] | null
  raw: string
}

/** Update classification between an installed and a latest version. */
export type UpdateStatus = 'available' | 'current' | 'installed-newer' | 'unknown'

/** Loose compare/parse shape: 1–3 numeric segments, optional v/= prefix. */
const PARSE_PATTERN = /^(?:v)?(\d+)(?:\.(\d+))?(?:\.(\d+))?(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/u

/** Strict installer target shape (three segments, optional pre/build, no v prefix). */
const INSTALL_PATTERN = /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/u

function normalizeVersionText(value: unknown): string {
  if (typeof value !== 'string') return ''
  let text = value.trim()
  if (text.startsWith('=')) text = text.slice(1).trim()
  if (/^[vV]\d/u.test(text)) text = text.slice(1).trim()
  return text
}

function toNumber(text: string): number {
  return Number.parseInt(text, 10)
}

/**
 * Parse a version; return `null` when unparsable.
 * @param value - raw version text of any shape.
 */
export function parseVersion(value: unknown): ParsedVersion | null {
  const text = normalizeVersionText(value)
  if (text === '') return null
  const match = PARSE_PATTERN.exec(text)
  if (!match) return null
  const prereleaseText = match[4]
  const prerelease = prereleaseText === undefined ? null : prereleaseText.split('.')
  if (prerelease !== null && prerelease.some(part => part === '')) return null
  return {
    major: toNumber(match[1] as string),
    minor: toNumber(match[2] ?? '0'),
    patch: toNumber(match[3] ?? '0'),
    prerelease,
    raw: String(value).trim(),
  }
}

/** SemVer 11.4 prerelease comparison: numeric < alphanumeric; numeric by value; ASCII otherwise; fewer segments lower. */
function comparePrerelease(left: readonly string[] | null, right: readonly string[] | null): number {
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

function compareParsed(left: ParsedVersion, right: ParsedVersion): number {
  for (const key of ['major', 'minor', 'patch'] as const) {
    if (left[key] !== right[key]) return left[key] < right[key] ? -1 : 1
  }
  return comparePrerelease(left.prerelease, right.prerelease)
}

/**
 * Compare two versions; return `null` when either side is unparsable.
 * @param left - installed version text.
 * @param right - latest version text.
 * @returns `<0` / `0` / `>0`, or `null` when incomparable.
 */
export function compareVersions(left: unknown, right: unknown): number | null {
  const a = parseVersion(left)
  const b = parseVersion(right)
  if (a === null || b === null) return null
  return compareParsed(a, b)
}

/**
 * Classify the update state (the caller handles "no installed record"; this
 * only compares two versions).
 *
 * - `available`: latest is higher than installed;
 * - `current`: equal;
 * - `installed-newer`: market version is lower than installed;
 * - `unknown`: either side is missing or incomparable (**never** treated as available).
 *
 * @param installedVersion - installed version text.
 * @param latestVersion - latest version text.
 */
export function classifyUpdate(installedVersion: unknown, latestVersion: unknown): UpdateStatus {
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
 * Whether a version can name an install target directory (strict three
 * segments, optional pre/build, no v prefix).
 * @param value - candidate version text.
 */
export function isInstallableVersion(value: unknown): boolean {
  return typeof value === 'string' && INSTALL_PATTERN.test(value.trim())
}
