/**
 * 能力扫描：从 Agent 插件目录里读出 skills / commands / hooks / mcpServers。
 *
 * 只读文件、不执行任何插件代码。符号链接一律跳过，避免经链接逃出缓存目录。
 *
 * @module dsh-agent-plugin-hub/capabilities
 */

import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'

import { findFormat, isSafePluginName, toCommandName } from './formats.js'
import { isDirectory, isFile, readJsonFile } from './manifest.js'
import { parseFrontmatter } from './frontmatter.js'

/** 单次能力扫描允许的最大文件数，防止异常插件拖垮启动。 */
const MAX_FILES = 2000

/** 递归列出匹配文件（跳过符号链接与隐藏的 .git 目录）。 */
function findFiles(root, { match, limit = MAX_FILES, warnings = [] } = {}) {
  const results = []
  let visited = 0
  const walk = (dir, depth) => {
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

/** 字符串/数组/对象 map 统一成字符串数组（去重、去空）。 */
export function normalizeStringList(value) {
  const items = []
  const push = (item) => {
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

/** 解析 SKILL.md frontmatter，得到技能定义。 */
export function parseSkillFile(filePath, fallbackName) {
  let text
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
    // Claude 的 disable-model-invocation 表示只允许用户手动调用。
    invocation: { modelInvocable: !disableModelInvocation, userInvocable: true },
  }
}

/** 扫描插件目录下的技能。 */
export function scanSkills(pluginRoot, formatId) {
  const warnings = []
  const format = findFormat(formatId) ?? findFormat('claude')
  const skills = []
  for (const relative of format.skillsDirs) {
    const root = path.join(pluginRoot, relative)
    const files = findFiles(root, {
      warnings,
      match: (file, base) => base === 'SKILL.md' || base === 'skill.md',
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

/** 解析命令 Markdown。 */
export function parseCommandFile(filePath, relativeName) {
  let text
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

/** 扫描插件目录下的命令。 */
export function scanCommands(pluginRoot, formatId) {
  const warnings = []
  const format = findFormat(formatId) ?? findFormat('claude')
  const commands = []
  for (const relative of format.commandsDirs) {
    const root = path.join(pluginRoot, relative)
    const files = findFiles(root, {
      warnings,
      match: (file, base) => base.toLowerCase().endsWith('.md'),
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

/** 读取 hooks 配置：plugin.json 的 hooks 字段优先，其次 hooks/hooks.json。 */
export function readHooksConfig(pluginRoot, formatId, manifest = {}) {
  const warnings = []
  if (manifest.hooks !== undefined && manifest.hooks !== null) {
    if (typeof manifest.hooks === 'object' && !Array.isArray(manifest.hooks)) {
      return { config: manifest.hooks, source: 'plugin.json#hooks', warnings }
    }
    warnings.push('plugin.json 的 hooks 字段不是对象，已忽略')
  }
  const format = findFormat(formatId) ?? findFormat('claude')
  for (const relative of format.hooksFiles) {
    const file = path.join(pluginRoot, relative)
    if (!isFile(file)) continue
    try {
      const parsed = readJsonFile(file)
      const config = parsed?.hooks ?? parsed
      if (config === null || typeof config !== 'object' || Array.isArray(config)) {
        warnings.push(`${file} 的 hooks 结构无法识别`)
        continue
      }
      return { config, source: relative, warnings }
    } catch (error) {
      warnings.push(error instanceof Error ? error.message : String(error))
    }
  }
  return { config: null, source: '', warnings }
}

/**
 * 把 hooks 配置规整为 `{事件名: [{matcher, entries:[{command, timeout}]}]}`。
 *
 * 兼容 Claude Code 的 `{matcher, hooks:[{type:'command', command, timeout}]}` 结构，
 * 也接受数组里直接放命令字符串的宽松写法；未知事件原样保留（由上层标注未生效）。
 */
export function normalizeHooks(config) {
  const events = {}
  const warnings = []
  if (config === null || typeof config !== 'object' || Array.isArray(config)) {
    return { events, warnings }
  }
  for (const [eventName, groups] of Object.entries(config)) {
    if (!Array.isArray(groups)) {
      warnings.push(`hooks.${eventName} 不是数组，已跳过`)
      continue
    }
    const normalizedGroups = []
    for (const group of groups) {
      if (typeof group === 'string') {
        normalizedGroups.push({ matcher: '', entries: [{ command: group, timeout: 60 }] })
        continue
      }
      if (group === null || typeof group !== 'object') {
        warnings.push(`hooks.${eventName} 的条目无法识别，已跳过`)
        continue
      }
      const matcher = typeof group.matcher === 'string' ? group.matcher : ''
      const rawEntries = Array.isArray(group.hooks) ? group.hooks : []
      const entries = []
      for (const entry of rawEntries) {
        if (typeof entry === 'string') {
          entries.push({ command: entry, timeout: 60 })
          continue
        }
        if (entry === null || typeof entry !== 'object') continue
        const command = typeof entry.command === 'string' ? entry.command : ''
        if (command.trim() === '') {
          warnings.push(`hooks.${eventName} 的条目缺少 command，已跳过`)
          continue
        }
        const timeout = Number.isFinite(entry.timeout) && entry.timeout > 0 ? entry.timeout : 60
        entries.push({
          command,
          timeout: Math.min(Math.max(timeout, 1), 600),
          type: typeof entry.type === 'string' ? entry.type : 'command',
        })
      }
      if (entries.length === 0) continue
      normalizedGroups.push({ matcher, entries })
    }
    if (normalizedGroups.length > 0) events[eventName] = normalizedGroups
  }
  return { events, warnings }
}

/** 读取 mcpServers：plugin.json 的 mcpServers 优先，其次 .mcp.json。 */
export function readMcpServers(pluginRoot, formatId, manifest = {}) {
  const warnings = []
  if (manifest.mcpServers !== undefined && manifest.mcpServers !== null) {
    if (typeof manifest.mcpServers === 'object' && !Array.isArray(manifest.mcpServers)) {
      return { servers: normalizeMcpServers(manifest.mcpServers, warnings), source: 'plugin.json#mcpServers', warnings }
    }
    warnings.push('plugin.json 的 mcpServers 字段不是对象，已忽略')
  }
  const format = findFormat(formatId) ?? findFormat('claude')
  for (const relative of format.mcpFiles) {
    const file = path.join(pluginRoot, relative)
    if (!isFile(file)) continue
    try {
      const parsed = readJsonFile(file)
      const servers = normalizeMcpServers(parsed?.mcpServers ?? parsed, warnings)
      return { servers, source: relative, warnings }
    } catch (error) {
      warnings.push(error instanceof Error ? error.message : String(error))
    }
  }
  return { servers: [], source: '', warnings }
}

/** 规整 MCP server 定义（只保留展示与安全校验需要的字段）。 */
export function normalizeMcpServers(raw, warnings) {
  const servers = []
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    warnings.push('mcpServers 结构无法识别')
    return servers
  }
  for (const [name, config] of Object.entries(raw)) {
    if (typeof name !== 'string' || name.trim() === '') continue
    if (config === null || typeof config !== 'object') {
      warnings.push(`mcpServers.${name} 不是对象，已跳过`)
      continue
    }
    const transport = typeof config.type === 'string'
      ? config.type
      : typeof config.transport === 'string'
        ? config.transport
        : config.url ? 'streamable-http' : 'stdio'
    servers.push({
      name,
      transport,
      command: typeof config.command === 'string' ? config.command : '',
      args: Array.isArray(config.args) ? config.args.map(String) : [],
      url: typeof config.url === 'string' ? config.url : '',
    })
  }
  return servers
}

/**
 * 扫描一个已安装插件的全部能力摘要（写入 state.capabilities）。
 *
 * @param {string} pluginRoot
 * @param {string} formatId
 * @param {object} [manifest]
 * @returns {{summary: object, details: object, warnings: string[]}}
 */
export function scanCapabilities(pluginRoot, formatId, manifest = {}) {
  const warnings = []
  const skills = scanSkills(pluginRoot, formatId)
  const commands = scanCommands(pluginRoot, formatId)
  const hooks = readHooksConfig(pluginRoot, formatId, manifest)
  const mcp = readMcpServers(pluginRoot, formatId, manifest)
  warnings.push(...skills.warnings, ...commands.warnings, ...hooks.warnings, ...mcp.warnings)
  const hookEvents = normalizeHooks(hooks.config)
  warnings.push(...hookEvents.warnings)
  const summary = {
    skills: skills.skills.map((skill) => skill.name),
    commands: commands.commands.map((command) => command.name),
    hooks: Object.keys(hookEvents.events),
    mcpServers: mcp.servers.map((server) => server.name),
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