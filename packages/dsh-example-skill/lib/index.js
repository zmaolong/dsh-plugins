/**
 * 示例插件：随包提供一条内置 skill。
 *
 * skill 的正文放在 assets/hello-skill.md，按需读取；图片等资源通过 resourceBase 暴露。
 * 不 import 任何 @deepseek-ai/* 包：rank 直接用内置 skill 的约定值 600。
 *
 * @module dsh-example-skill
 */

import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

/** 本 provider 的名字，不能是保留名 "runtime"。 */
const PROVIDER_NAME = 'example-skill'

/** 内置 skill 的优先级：与 @deepseek-ai/dsh-skill 的 BUNDLED_SKILL_RANK 一致。 */
const RANK = 600

const SKILL_FILE = new URL('../assets/hello-skill.md', import.meta.url)

const RESOURCE_BASE = {
  kind: 'directory',
  path: fileURLToPath(new URL('../assets/', import.meta.url)),
}

const CANDIDATE = {
  name: 'example-greeting',
  description:
    'Greet someone in a friendly, slightly formal tone. Use when the user asks for a greeting example or wants to check that a custom skill is installed.',
  invocation: {
    modelInvocable: true,
    userInvocable: true,
  },
  provider: PROVIDER_NAME,
  source: 'package',
  rank: RANK,
  resourceBase: RESOURCE_BASE,
}

const provider = {
  name: PROVIDER_NAME,
  list() {
    return Promise.resolve([CANDIDATE])
  },
  async get() {
    return {
      name: CANDIDATE.name,
      description: CANDIDATE.description,
      invocation: CANDIDATE.invocation,
      provider: PROVIDER_NAME,
      source: CANDIDATE.source,
      resourceBase: RESOURCE_BASE,
      content: await readFile(SKILL_FILE, 'utf8'),
    }
  },
}

/** Cordis 插件名。 */
export const name = 'example-skill'

/** 等待宿主提供 skills 服务后再注册 provider。 */
export const inject = ['skills']

/**
 * 注册内置 skill provider。
 * @param ctx - 宿主注入的上下文（此时 skills 服务已可用）。
 */
export function apply(ctx) {
  ctx.skills.registerProvider(() => provider)
  console.log('[dsh-example-skill] 已注册 skill example-greeting')
}