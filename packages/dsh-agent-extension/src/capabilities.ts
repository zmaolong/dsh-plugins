/**
 * Capability scanning: read skills / commands / hooks / mcpServers from an
 * agent plugin directory.
 *
 * Read-only: no plugin code executes. Symbolic links are always skipped so
 * nothing escapes the cache directory through a link.
 *
 * @module dsh-agent-extension/capabilities
 */

import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'

import { findFormat, isSafePluginName, toCommandName } from './formats.ts'
import { isDirectory, isFile, readJsonFile } from './manifest.ts'
import { parseFrontmatter } from './frontmatter.ts'

/** Maximum files per capability scan, so a pathological plugin cannot stall startup. */
const MAX_FILES = 2000

/** Capability kinds that can be toggled individually. */
export const CAPABILITY_KINDS = ['skills', 'commands', 'hooks', 'mcpServers'] as const

/** One capability kind. */
export type CapabilityKind = (typeof CAPABILITY_KINDS)[number]

/** Per-kind enable table. */
export type CapabilityMap = Record<CapabilityKind, string[]>

/** The per-item disable table. */
export function emptyDisabledCapabilities(): CapabilityMap {
  return { skills: [], commands: [], hooks: [], mcpServers: [] }
}

/**
 * Normalize the persisted per-item toggle table: unknown kinds and illegal
 * values are dropped.
 *
 * @param value - raw disable table.
 */
export function normalizeDisabledCapabilities(value?: unknown): CapabilityMap {
  const result = emptyDisabledCapabilities()
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return result
  const record = value as Record<string, unknown>
  for (const kind of CAPABILITY_KINDS) {
    const list = record[kind]
    if (!Array.isArray(list)) continue
    result[kind] = [...new Set(list.filter((item): item is string => typeof item === 'string' && item.trim() !== '').map(item => item.trim()))]
  }
  return result
}

/** Whether one capability item is individually disabled. */
export function isCapabilityDisabled(
  record: { disabledCapabilities?: Partial<CapabilityMap> } | null | undefined,
  kind: CapabilityKind,
  name: string,
): boolean {
  const disabled = record?.disabledCapabilities?.[kind]
  return Array.isArray(disabled) && disabled.includes(name)
}

/** Recursively list matching files (skipping symlinks and hidden .git directories). */
function findFiles(
  root: string,
  options: { match: (file: string, base: string) => boolean, limit?: number, warnings?: string[] },
): string[] {
  const { match, limit = MAX_FILES, warnings = [] } = options
  const results: string[] = []
  let visited = 0
  const walk = (dir: string, depth: number): void => {
    if (depth > 6 || results.length >= limit) return
    let entries
    try {
      entries = readdirSync(dir, { withFileTypes: true })
    } catch (error) {
      warnings.push(`无法读取目录 ${dir}：${error instanceof Error ? error.message : String(error)}`)
      return
    }
    for (const entry of entries) {
      if (results.length >= limit) return
      if (entry.name.startsWith('.git')) continue
      const full = path.join(dir, entry.name)
      if (entry.isSymbolicLink()) {
        warnings.push(`跳过符号链接：${full}`)
        continue
      }
      if (entry.isDirectory()) {
        walk(full, depth + 1)
        continue
      }
      if (!entry.isFile()) continue
      visited += 1
      if (visited > MAX_FILES * 4) return
      if (match(full, entry.name)) results.push(full)
    }
  }
  if (isDirectory(root)) walk(root, 0)
  return results
}

/** Collapse string / array / object-map values into a string array (deduped, empties dropped). */
export function normalizeStringList(value: unknown): string[] {
  const items: string[] = []
  const push = (item: unknown): void => {
    if (typeof item === 'string' && item.trim() !== '') items.push(item.trim())
  }
  if (typeof value === 'string') {
    push(value)
  } else if (Array.isArray(value)) {
    for (const item of value) push(item)
  } else if (value !== null && typeof value === 'object') {
    for (const key of Object.keys(value)) push(key)
  }
  return [...new Set(items)]
}

/** Parsed SKILL.md definition. */
export interface SkillDefinition {
  name: string
  description: string
  whenToUse: string
  allowedTools: string[]
  content: string
  dir: string
  file: string
  warnings: string[]
  invocation: { modelInvocable: boolean, userInvocable: boolean }
}

/** Parse a SKILL.md frontmatter into a skill definition. */
export function parseSkillFile(filePath: string, fallbackName: string): SkillDefinition {
  let text: string
  try {
    text = readFileSync(filePath, 'utf8')
  } catch (error) {
    throw new Error(`无法读取技能文件 ${filePath}：${error instanceof Error ? error.message : String(error)}`)
  }
  const { data, body, warnings } = parseFrontmatter(text)
  const dir = path.dirname(filePath)
  const rawName = typeof data.name === 'string' ? data.name.trim() : ''
  const name = rawName !== '' ? rawName : fallbackName
  const description = typeof data.description === 'string' && data.description.trim() !== ''
    ? data.description.trim()
    : ''
  const whenToUse = typeof data.whenToUse === 'string'
    ? data.whenToUse
    : typeof data.when_to_use === 'string' ? data.when_to_use : ''
  const allowedTools = Array.isArray(data['allowed-tools']) ? data['allowed-tools'] : data.allowedTools
  const disableModelInvocation = data['disable-model-invocation'] === true
  return {
    name,
    description,
    whenToUse,
    allowedTools: normalizeStringList(allowedTools),
    content: body,
    dir,
    file: filePath,
    warnings,
    // Claude's disable-model-invocation means manual invocation only.
    invocation: { modelInvocable: !disableModelInvocation, userInvocable: true },
  }
}

/** Scan the plugin directory for skills. */
export function scanSkills(pluginRoot: string, formatId: string): { skills: SkillDefinition[], warnings: string[] } {
  const warnings: string[] = []
  const format = findFormat(formatId) ?? findFormat('claude')
  const skills: SkillDefinition[] = []
  for (const relative of format?.skillsDirs ?? []) {
    const root = path.join(pluginRoot, relative)
    const files = findFiles(root, {
      warnings,
      match: (_file, base) => base === 'SKILL.md' || base === 'skill.md',
    })
    for (const file of files) {
      const fallbackName = path.basename(path.dirname(file))
      try {
        const skill = parseSkillFile(file, fallbackName)
        if (!isSafePluginName(skill.name)) {
          warnings.push(`技能名不合法（${skill.name}），跳过 ${file}`)
          continue
        }
        if (skill.description === '') warnings.push(`技能 ${skill.name} 缺少 description`)
        skills.push(skill)
      } catch (error) {
        warnings.push(error instanceof Error ? error.message : String(error))
      }
    }
  }
  return { skills, warnings }
}

/** Parsed command Markdown definition. */
export interface CommandDefinition {
  name: string
  rawName: string
  description: string
  argumentHint: string
  body: string
  file: string
  warnings: string[]
}

/** Parse a command Markdown file. */
export function parseCommandFile(filePath: string, relativeName: string): CommandDefinition {
  let text: string
  try {
    text = readFileSync(filePath, 'utf8')
  } catch (error) {
    throw new Error(`无法读取命令文件 ${filePath}：${error instanceof Error ? error.message : String(error)}`)
  }
  const { data, body, warnings } = parseFrontmatter(text)
  const description = typeof data.description === 'string' && data.description.trim() !== ''
    ? data.description.trim()
    : `来自 ${path.basename(filePath)} 的命令`
  const argumentHint = typeof data['argument-hint'] === 'string'
    ? data['argument-hint']
    : typeof data.argumentHint === 'string' ? data.argumentHint : ''
  return {
    name: toCommandName(relativeName),
    rawName: relativeName,
    description,
    argumentHint,
    body,
    file: filePath,
    warnings,
  }
}

/** Scan the plugin directory for commands. */
export function scanCommands(pluginRoot: string, formatId: string): { commands: CommandDefinition[], warnings: string[] } {
  const warnings: string[] = []
  const format = findFormat(formatId) ?? findFormat('claude')
  const commands: CommandDefinition[] = []
  for (const relative of format?.commandsDirs ?? []) {
    const root = path.join(pluginRoot, relative)
    const files = findFiles(root, {
      warnings,
      match: (_file, base) => base.toLowerCase().endsWith('.md'),
    })
    for (const file of files) {
      const relativeFile = path.relative(root, file).replace(/\\/gu, '/')
      const dotted = relativeFile.replace(/\.md$/iu, '').replace(/\//gu, '-')
      try {
        commands.push(parseCommandFile(file, dotted))
      } catch (error) {
        warnings.push(error instanceof Error ? error.message : String(error))
      }
    }
  }
  return { commands, warnings }
}

/** One hook entry: a shell command with a timeout. */
export interface HookEntry {
  command: string
  timeout: number
  type?: string
}

/** One hook group: a matcher plus its entries. */
export interface HookGroup {
  matcher: string
  entries: HookEntry[]
}

/** Hooks config read from a plugin. */
export interface HooksRead {
  config: Record<string, unknown> | null
  source: string
  warnings: string[]
}

/** Read the hooks config: plugin.json's `hooks` field wins, then hooks/hooks.json. */
export function readHooksConfig(
  pluginRoot: string,
  formatId: string,
  manifest: Record<string, unknown> = {},
): HooksRead {
  const warnings: string[] = []
  if (manifest.hooks !== undefined && manifest.hooks !== null) {
    if (typeof manifest.hooks === 'object' && !Array.isArray(manifest.hooks)) {
      return { config: manifest.hooks as Record<string, unknown>, source: 'plugin.json#hooks', warnings }
    }
    warnings.push('plugin.json 的 hooks 字段不是对象，已忽略')
  }
  const format = findFormat(formatId) ?? findFormat('claude')
  for (const relative of format?.hooksFiles ?? []) {
    const file = path.join(pluginRoot, relative)
    if (!isFile(file)) continue
    try {
      const parsed = readJsonFile(file)
      const hookRoot = (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>).hooks ?? parsed
        : null)
      if (hookRoot === null || typeof hookRoot !== 'object' || Array.isArray(hookRoot)) {
        warnings.push(`${file} 的 hooks 结构无法识别`)
        continue
      }
      return { config: hookRoot as Record<string, unknown>, source: relative, warnings }
    } catch (error) {
      warnings.push(error instanceof Error ? error.message : String(error))
    }
  }
  return { config: null, source: '', warnings }
}

/**
 * Normalize a hooks config into `{eventName: [{matcher, entries:[{command, timeout}]}]}`.
 *
 * Accepts the Claude Code `{matcher, hooks:[{type:'command', command, timeout}]}`
 * shape and the loose form of bare command strings in the array; unknown events
 * are kept as-is (the upper layer marks them inactive).
 */
export function normalizeHooks(config: unknown): { events: Record<string, HookGroup[]>, warnings: string[] } {
  const events: Record<string, HookGroup[]> = {}
  const warnings: string[] = []
  if (config === null || typeof config !== 'object' || Array.isArray(config)) {
    return { events, warnings }
  }
  for (const [eventName, groups] of Object.entries(config)) {
    if (!Array.isArray(groups)) {
      warnings.push(`hooks.${eventName} 不是数组，已跳过`)
      continue
    }
    const normalizedGroups: HookGroup[] = []
    for (const group of groups) {
      if (typeof group === 'string') {
        normalizedGroups.push({ matcher: '', entries: [{ command: group, timeout: 60 }] })
        continue
      }
      if (group === null || typeof group !== 'object') {
        warnings.push(`hooks.${eventName} 的条目无法识别，已跳过`)
        continue
      }
      const record = group as Record<string, unknown>
      const matcher = typeof record.matcher === 'string' ? record.matcher : ''
      const rawEntries = Array.isArray(record.hooks) ? record.hooks : []
      const entries: HookEntry[] = []
      for (const entry of rawEntries) {
        if (typeof entry === 'string') {
          entries.push({ command: entry, timeout: 60 })
          continue
        }
        if (entry === null || typeof entry !== 'object') continue
        const entryRecord = entry as Record<string, unknown>
        const command = typeof entryRecord.command === 'string' ? entryRecord.command : ''
        if (command.trim() === '') {
          warnings.push(`hooks.${eventName} 的条目缺少 command，已跳过`)
          continue
        }
        const timeout = typeof entryRecord.timeout === 'number' && Number.isFinite(entryRecord.timeout) && entryRecord.timeout > 0
          ? entryRecord.timeout
          : 60
        entries.push({
          command,
          timeout: Math.min(Math.max(timeout, 1), 600),
          type: typeof entryRecord.type === 'string' ? entryRecord.type : 'command',
        })
      }
      if (entries.length === 0) continue
      normalizedGroups.push({ matcher, entries })
    }
    if (normalizedGroups.length > 0) events[eventName] = normalizedGroups
  }
  return { events, warnings }
}

/** One MCP server definition (display and safety-check fields only). */
export interface McpServerDefinition {
  name: string
  transport: string
  command: string
  args: string[]
  url: string
}

/** MCP servers read from a plugin. */
export interface McpRead {
  servers: McpServerDefinition[]
  source: string
  warnings: string[]
}

/** Read mcpServers: plugin.json's `mcpServers` wins, then .mcp.json. */
export function readMcpServers(
  pluginRoot: string,
  formatId: string,
  manifest: Record<string, unknown> = {},
): McpRead {
  const warnings: string[] = []
  if (manifest.mcpServers !== undefined && manifest.mcpServers !== null) {
    if (typeof manifest.mcpServers === 'object' && !Array.isArray(manifest.mcpServers)) {
      return { servers: normalizeMcpServers(manifest.mcpServers, warnings), source: 'plugin.json#mcpServers', warnings }
    }
    warnings.push('plugin.json 的 mcpServers 字段不是对象，已忽略')
  }
  const format = findFormat(formatId) ?? findFormat('claude')
  for (const relative of format?.mcpFiles ?? []) {
    const file = path.join(pluginRoot, relative)
    if (!isFile(file)) continue
    try {
      const parsed = readJsonFile(file)
      const mcpRoot = (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>).mcpServers ?? parsed
        : null)
      return { servers: normalizeMcpServers(mcpRoot, warnings), source: relative, warnings }
    } catch (error) {
      warnings.push(error instanceof Error ? error.message : String(error))
    }
  }
  return { servers: [], source: '', warnings }
}

/** Normalize MCP server definitions. */
export function normalizeMcpServers(raw: unknown, warnings: string[]): McpServerDefinition[] {
  const servers: McpServerDefinition[] = []
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    warnings.push('mcpServers 结构无法识别')
    return servers
  }
  for (const [name, config] of Object.entries(raw)) {
    if (typeof name !== 'string' || name.trim() === '') continue
    if (config === null || typeof config !== 'object' || Array.isArray(config)) {
      warnings.push(`mcpServers.${name} 不是对象，已跳过`)
      continue
    }
    const record = config as Record<string, unknown>
    const transport = typeof record.type === 'string'
      ? record.type
      : typeof record.transport === 'string'
        ? record.transport
        : record.url ? 'streamable-http' : 'stdio'
    servers.push({
      name,
      transport,
      command: typeof record.command === 'string' ? record.command : '',
      args: Array.isArray(record.args) ? record.args.map(String) : [],
      url: typeof record.url === 'string' ? record.url : '',
    })
  }
  return servers
}

/** Capability scan result (the summary lands in state.capabilities). */
export interface CapabilityScan {
  summary: CapabilityMap
  details: {
    skills: SkillDefinition[]
    commands: CommandDefinition[]
    hooks: Record<string, HookGroup[]>
    hooksSource: string
    mcpServers: McpServerDefinition[]
    mcpSource: string
  }
  warnings: string[]
}

/** Scan the full capability summary of one installed plugin. */
export function scanCapabilities(
  pluginRoot: string,
  formatId: string,
  manifest: Record<string, unknown> = {},
): CapabilityScan {
  const warnings: string[] = []
  const skills = scanSkills(pluginRoot, formatId)
  const commands = scanCommands(pluginRoot, formatId)
  const hooks = readHooksConfig(pluginRoot, formatId, manifest)
  const mcp = readMcpServers(pluginRoot, formatId, manifest)
  warnings.push(...skills.warnings, ...commands.warnings, ...hooks.warnings, ...mcp.warnings)
  const hookEvents = normalizeHooks(hooks.config)
  warnings.push(...hookEvents.warnings)
  const summary: CapabilityMap = {
    skills: skills.skills.map(skill => skill.name),
    commands: commands.commands.map(command => command.name),
    hooks: Object.keys(hookEvents.events),
    mcpServers: mcp.servers.map(server => server.name),
  }
  return {
    summary,
    details: {
      skills: skills.skills,
      commands: commands.commands,
      hooks: hookEvents.events,
      hooksSource: hooks.source,
      mcpServers: mcp.servers,
      mcpSource: mcp.source,
    },
    warnings,
  }
}
