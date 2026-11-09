/**
 * Skill injection: register the `skills/**\/SKILL.md` of enabled agent plugins
 * as a host skill provider.
 *
 * Host interface (probed): `ctx.skills.registerProvider(create)`; `create`
 * receives an `{invalidate}` lifecycle control and returns
 * `{name, list(options), get(candidate, options)}`. A candidate needs
 * name/description/invocation/source/provider/resourceBase/rank/locator.
 *
 * @module dsh-agent-extension/skills
 */

import { isCapabilityDisabled, parseSkillFile, scanSkills, type SkillDefinition } from './capabilities.ts'
import type { PluginRecord } from './store.ts'
import type { SkillCandidate, SkillLoaded, SkillProviderControl, SkillsService } from './host.ts'
import type { LogFn } from './log.ts'

export const SKILL_PROVIDER_NAME = 'agent-extension'

/** Skill registration state exposed to status rendering. */
export interface SkillStats {
  registered: boolean
  reason: string
  providers: number
  skills: number
  warnings: string[]
}

/** Host-side skill runtime. */
export class SkillRuntime {
  private readonly getEnabledPlugins: () => PluginRecord[]
  private readonly log: LogFn
  private controls = new Set<SkillProviderControl>()
  private disposer: (() => void) | null = null
  private cache: SkillCandidate[] | null = null

  /** Whether the provider is registered, plus the reason when not. */
  registered = false
  reason = ''
  /** Warnings from the last candidate collection. */
  warnings: string[] = []

  constructor(options: { getEnabledPlugins: () => PluginRecord[], log: LogFn }) {
    this.getEnabledPlugins = options.getEnabledPlugins
    this.log = options.log
  }

  /** Register the provider synchronously during apply; records the reason when the host lacks the skills service. */
  register(ctx: unknown): boolean {
    const skills = (ctx as { get?: (name: string) => unknown } | null)?.get?.('skills')
      ?? (ctx as { skills?: unknown } | null)?.skills
    if (!skills || typeof (skills as SkillsService).registerProvider !== 'function') {
      this.registered = false
      this.reason = '宿主未提供 skills 服务（未启用 @deepseek-ai/dsh-skill）'
      return false
    }
    try {
      this.disposer = (skills as SkillsService).registerProvider((control) => {
        this.controls.add(control)
        return this.provider()
      })
      this.registered = true
      this.reason = ''
      return true
    } catch (error) {
      this.registered = false
      this.reason = `注册技能 provider 失败：${error instanceof Error ? error.message : String(error)}`
      this.log('error', this.reason)
      return false
    }
  }

  /** The provider reads current enabled state on every list; toggling calls invalidate so the host re-queries. */
  provider(): {
    name: string
    list: (options?: unknown) => Promise<SkillCandidate[]>
    get: (candidate: { name?: unknown, locator?: unknown }, options?: unknown) => Promise<SkillLoaded | undefined>
  } {
    return {
      name: SKILL_PROVIDER_NAME,
      list: async () => this.listCandidates(),
      get: async candidate => this.loadSkill(candidate),
    }
  }

  /** Collect skill candidates across all enabled plugins (deduplicated, with warnings). */
  collect(): SkillCandidate[] {
    const plugins = this.getEnabledPlugins()
    const candidates: SkillCandidate[] = []
    const warnings: string[] = []
    const seen = new Set<string>()
    for (const plugin of plugins) {
      const scan = scanSkills(plugin.installedPath, plugin.format)
      for (const warning of scan.warnings) warnings.push(`${plugin.name}: ${warning}`)
      for (const skill of scan.skills) {
        if (isCapabilityDisabled(plugin, 'skills', skill.name)) continue
        if (seen.has(skill.name)) {
          warnings.push(`技能名冲突：${skill.name}（${plugin.name}），后者跳过`)
          continue
        }
        seen.add(skill.name)
        candidates.push({
          name: skill.name,
          description: skill.description || `来自 Agent 插件 ${plugin.name} 的技能`,
          whenToUse: skill.whenToUse || undefined,
          invocation: skill.invocation,
          source: 'agent-plugin',
          provider: SKILL_PROVIDER_NAME,
          rank: 100,
          path: skill.file,
          resourceBase: { kind: 'directory', path: skill.dir },
          locator: { file: skill.file, dir: skill.dir, plugin: plugin.key },
          metadata: { plugin: plugin.key },
        })
      }
    }
    this.warnings = warnings.slice(0, 100)
    return candidates
  }

  /** Cached candidate list. */
  listCandidates(): SkillCandidate[] {
    if (this.cache !== null) return this.cache
    const candidates = this.collect()
    this.cache = candidates.map(candidate => ({ ...candidate }))
    return this.cache
  }

  /** Read the full skill definition back through the candidate's locator. */
  loadSkill(candidate: Record<string, unknown>): SkillLoaded | undefined {
    const locator = candidate?.locator
    const file = (locator as { file?: unknown } | null | undefined)?.file
    if (typeof file !== 'string') return undefined
    try {
      const skill: SkillDefinition = parseSkillFile(file, String(candidate?.name ?? 'skill'))
      return {
        name: candidate?.name as string | undefined,
        description: candidate?.description as string | undefined,
        whenToUse: candidate?.whenToUse as string | undefined,
        invocation: candidate?.invocation as SkillLoaded['invocation'],
        source: candidate?.source as string | undefined,
        provider: candidate?.provider as string | undefined,
        path: file,
        resourceBase: { kind: 'directory', path: String((locator as { dir?: unknown }).dir ?? '') },
        content: skill.content,
        metadata: candidate?.metadata as Record<string, unknown> | undefined,
      }
    } catch (error) {
      this.log('warn', `读取技能 ${String(candidate?.name)} 失败：${error instanceof Error ? error.message : String(error)}`)
      return undefined
    }
  }

  /** Tell the host to drop its skill catalog cache after a plugin state change. */
  invalidate(): void {
    this.cache = null
    for (const control of this.controls) {
      try {
        control?.invalidate?.()
      } catch (error) {
        this.log('warn', `技能目录失效通知失败：${error instanceof Error ? error.message : String(error)}`)
      }
    }
  }

  /** Unregister the provider on dispose. */
  dispose(): void {
    if (typeof this.disposer === 'function') {
      try {
        this.disposer()
      } catch {
        /* dispose failures are ignored */
      }
    }
    this.disposer = null
    this.registered = false
    this.controls.clear()
    this.cache = null
  }

  /** Skill stats for `/agent-plugin info`. */
  stats(): SkillStats {
    const plugins = this.getEnabledPlugins()
    let count = 0
    for (const plugin of plugins) {
      count += Array.isArray(plugin.capabilities?.skills)
        ? (plugin.capabilities.skills as string[]).length
        : scanSkills(plugin.installedPath, plugin.format).skills.length
    }
    return {
      registered: this.registered,
      reason: this.reason,
      providers: this.controls.size,
      skills: count,
      warnings: this.warnings,
    }
  }
}
