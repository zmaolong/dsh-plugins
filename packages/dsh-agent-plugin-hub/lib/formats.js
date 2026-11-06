/**
 * Agent 插件格式注册表（骨架）。
 *
 * 这里只声明每种格式的候选清单路径，真正的探测与解析在后续版本实现。
 * 路径均相对于插件根目录。同一目录可能同时存在多套清单，解析器需要
 * 按优先级选择并记录 format，避免不同格式的同名插件互相覆盖。
 *
 * @module dsh-agent-plugin-hub/formats
 */

export const FORMATS = Object.freeze([
  Object.freeze({
    id: 'claude',
    label: 'Claude Code',
    pluginManifests: Object.freeze(['.claude-plugin/plugin.json']),
    marketplaceFiles: Object.freeze([
      '.claude-plugin/marketplace.json',
      'marketplace.json',
    ]),
  }),
  Object.freeze({
    id: 'codebuddy',
    label: 'CodeBuddy',
    pluginManifests: Object.freeze(['.codebuddy-plugin/plugin.json']),
    marketplaceFiles: Object.freeze([
      '.codebuddy-plugin/marketplace.json',
      'marketplace.json',
    ]),
  }),
  Object.freeze({
    id: 'zcode',
    label: 'ZCode',
    pluginManifests: Object.freeze(['.zcode-plugin/plugin.json']),
    marketplaceFiles: Object.freeze([
      '.zcode-plugin/marketplace.json',
      'marketplace.json',
    ]),
  }),
])

const BY_ID = new Map(FORMATS.map((format) => [format.id, format]))

/**
 * 按 id 查找格式定义。
 * @param {string} id - 格式 id，例如 `claude`。
 * @returns {object | undefined}
 */
export function findFormat(id) {
  return BY_ID.get(id)
}