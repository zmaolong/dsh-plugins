/**
 * Agent plugin format registry.
 *
 * Each format declares its own manifest candidate paths and capability
 * directory layout. One directory may hold manifests for several formats:
 * probing prefers format-specific manifests in the order claude > codebuddy >
 * zcode, then falls back to the generic root `plugin.json` (the caller's hint,
 * or claude by default, records the format).
 *
 * Paths are relative to the plugin root; slashes are always `/`.
 *
 * @module dsh-agent-plugin-hub/formats
 */

/** Capability directory layout of one agent plugin format. */
export interface FormatLayout {
  readonly id: string
  readonly label: string
  readonly pluginManifests: readonly string[]
  readonly rootManifests: readonly string[]
  readonly marketplaceFiles: readonly string[]
  readonly skillsDirs: readonly string[]
  readonly commandsDirs: readonly string[]
  readonly hooksFiles: readonly string[]
  readonly mcpFiles: readonly string[]
}

/** Per-format capability directory layout (the Claude convention; the other two are minimal-compatibility estimates). */
export const FORMATS: readonly FormatLayout[] = Object.freeze([
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

/** Format priority (id array, in probe order). */
export const FORMAT_PRIORITY: readonly string[] = Object.freeze(['claude', 'codebuddy', 'zcode'])

const BY_ID = new Map(FORMATS.map(format => [format.id, format]))

/** Look up one format definition by id. */
export function findFormat(id: string): FormatLayout | undefined {
  return BY_ID.get(id)
}

/** Whether an id names a registered format. */
export function isFormatId(id: string): boolean {
  return BY_ID.has(id)
}

/** Plugin name allowlist: starts alphanumeric, allows `._-`, at most 64 chars. */
const PLUGIN_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/u

/**
 * Whether a plugin name is safe (also rejects path separators and `..`).
 * @param name - candidate plugin name.
 */
export function isSafePluginName(name: unknown): boolean {
  if (typeof name !== 'string' || !PLUGIN_NAME.test(name)) return false
  if (name.includes('..')) return false
  return true
}

/** Loose SemVer allowlist (`1.2.3-beta.1` allowed; a `v` prefix is stripped by the caller). */
const VERSION = /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/u

/** Whether a version string fits the marketplace version allowlist. */
export function isSafeVersion(version: unknown): boolean {
  return typeof version === 'string' && VERSION.test(version)
}

/**
 * Normalize arbitrary text into a host command name (DSH command names only
 * allow `[a-z][a-z0-9_-]*` with no colon, so parent-child relations join on `-`).
 *
 * @param input - raw command text.
 */
export function toCommandName(input: unknown): string {
  const lowered = String(input ?? '').toLowerCase()
  const replaced = lowered.replace(/[^a-z0-9_-]+/gu, '-').replace(/-+/gu, '-')
  const trimmed = replaced.replace(/^-+|-+$/gu, '')
  if (trimmed === '') return 'unnamed'
  const startsLegal = /^[a-z]/u.test(trimmed) ? trimmed : `cmd-${trimmed}`
  return startsLegal.slice(0, 64)
}
