/**
 * 技能注入：把已启用 Agent 插件里的 `skills/**\/SKILL.md` 注册成宿主技能 provider。
 *
 * 宿主接口（已侦察）：
 * `ctx.skills.registerProvider(create)`，create 收到 `{invalidate}` 生命周期控制，
 * 返回 `{name, list(options), get(candidate, options)}`。
 * candidate 需要 name/description/invocation/source/provider/resourceBase/rank/locator。
 *
 * @module dsh-agent-plugin-hub/skills
 */

import { parseSkillFile, scanSkills } from './capabilities.js'

export const SKILL_PROVIDER_NAME = 'agent-plugin-hub'

export class SkillRuntime {
  /**
   * @param {{getEnabledPlugins: () => object[], store: import('./store.js').HubStore}} options
   */
  constructor(options) {
    this.getEnabledPlugins = options.getEnabledPlugins
    this.store = options.store
    this.controls = new Set()
    this.disposer = null
    this.registered = false
    this.reason = ''
    this.cache = null
    this.warnings = []
  }

  /** 在插件 apply 时同步注册 provider；宿主没有 skills 服务时记录原因。 */
  register(ctx) {
    const skills = ctx?.get?.('skills') ?? ctx?.skills
    if (!skills || typeof skills.registerProvider !== 'function') {
      this.registered = false
      this.reason = '宿主未提供 skills 服务（未启用 @deepseek-ai/dsh-skill）'
      return false
    }
    try {
      this.disposer = skills.registerProvider((control) => {
        this.controls.add(control)
        return this.provider()
      })
      this.registered = true
      this.reason = ''
      return true
    } catch (error) {
      this.registered = false
      this.reason = `注册技能 provider 失败：${error instanceof Error ? error.message : String(error)}`
      this.store.log('error', this.reason)
      return false
    }
  }

  /** provider 每次 list 都读当前启用状态，插件启停后由 invalidate 触发宿主重查。 */
  provider() {
    return {
      name: SKILL_PROVIDER_NAME,
      list: async () => this.listCandidates(),
      get: async (candidate) => this.loadSkill(candidate),
    }
  }

  /** 收集所有启用插件的技能候选（带去重与告警）。 */
  collect() {
    const plugins = this.getEnabledPlugins()
    const candidates = []
    const warnings = []
    const seen = new Set()
    for (const plugin of plugins) {
      const scan = scanSkills(plugin.installedPath, plugin.format)
      for (const warning of scan.warnings) warnings.push(`${plugin.name}: ${warning}`)
      for (const skill of scan.skills) {
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

  listCandidates() {
    if (this.cache !== null) return this.cache
    const candidates = this.collect()
    this.cache = candidates.map((candidate) => ({
      ...candidate,
      // locator 由 provider 自己使用，字段类型为 unknown，原样保留。
    }))
    return this.cache
  }

  /** 按 candidate 的 locator 读回完整技能定义。 */
  loadSkill(candidate) {
    const locator = candidate?.locator
    if (!locator || typeof locator.file !== 'string') return undefined
    try {
      const skill = parseSkillFile(locator.file, String(candidate?.name ?? 'skill'))
      return {
        name: candidate.name,
        description: candidate.description,
        whenToUse: candidate.whenToUse,
        invocation: candidate.invocation,
        source: candidate.source,
        provider: candidate.provider,
        path: locator.file,
        resourceBase: { kind: 'directory', path: locator.dir },
        content: skill.content,
        metadata: candidate.metadata,
      }
    } catch (error) {
      this.store.log('warn', `读取技能 ${candidate?.name} 失败：${error instanceof Error ? error.message : String(error)}`)
      return undefined
    }
  }

  /** 插件状态变化后让宿主丢弃技能目录缓存。 */
  invalidate() {
    this.cache = null
    for (const control of this.controls) {
      try {
        control?.invalidate?.()
      } catch (error) {
        this.store.log('warn', `技能目录失效通知失败：${error instanceof Error ? error.message : String(error)}`)
      }
    }
  }

  /** 卸载时注销 provider。 */
  dispose() {
    if (typeof this.disposer === 'function') {
      try {
        this.disposer()
      } catch {
        /* 忽略卸载异常 */
      }
    }
    this.disposer = null
    this.registered = false
    this.controls.clear()
    this.cache = null
  }

  /** 供 /agent-plugin info 展示的技能统计。 */
  stats() {
    const plugins = this.getEnabledPlugins()
    let count = 0
    for (const plugin of plugins) {
      count += Array.isArray(plugin.capabilities?.skills) ? plugin.capabilities.skills.length : scanSkills(plugin.installedPath, plugin.format).skills.length
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