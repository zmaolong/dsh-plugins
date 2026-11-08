/**
 * MCP manifest: parse and display a plugin's `mcpServers` without spawning
 * processes.
 *
 * Probe conclusion (see docs/HOST-API.md): the host mounts MCP through
 * `@deepseek-ai/dsh-mcp-client` as a static "one plugin row per MCP server"
 * configuration; that package exposes no runtime registration service (`ctx`
 * only carries the `mcpResources` read service, no mount API), and third-party
 * plugins cannot write the profile composition. Per the standing decision:
 * keep the manifest and mark it inactive; no homemade execution channel.
 *
 * @module dsh-agent-plugin-hub/mcp
 */

import { readMcpServers, type McpServerDefinition } from './capabilities.ts'

/** MCP availability facts for the status display. */
export interface McpAvailability {
  available: boolean
  hasResources: boolean
  reason: string
}

/** Whether MCP can mount (unavailable under the current host API). */
export function mcpAvailability(ctx: unknown): McpAvailability {
  const hasResources = Boolean((ctx as { get?: (name: string) => unknown } | null)?.get?.('mcpResources'))
  return {
    available: false,
    hasResources,
    reason: hasResources
      ? '宿主未加载 dsh-mcp-client（只有 mcpResources 资源服务），第三方插件没有运行时挂载接口；MCP server 需在 profile 中以独立插件行配置'
      : '宿主未提供 MCP 挂载接口（dsh-mcp-client 未加载）；MCP server 需在 profile 中以独立插件行配置',
  }
}

/** MCP manifest description of one plugin. */
export interface PluginMcpDescription {
  servers: McpServerDefinition[]
  source: string
  warnings: string[]
  effective: false
}

/** Describe one plugin's MCP manifest. */
export function describePluginMcp(
  pluginRoot: string,
  formatId: string,
  manifest: Record<string, unknown> = {},
): PluginMcpDescription {
  const read = readMcpServers(pluginRoot, formatId, manifest)
  return {
    servers: read.servers,
    source: read.source,
    warnings: read.warnings,
    effective: false,
  }
}

/** Display form: one line per server. */
export function formatMcpServers(servers: readonly McpServerDefinition[] | unknown): string[] {
  if (!Array.isArray(servers) || servers.length === 0) return ['（无）']
  return servers.map((server) => {
    const target = server.transport === 'stdio'
      ? [server.command, ...(server.args ?? [])].filter(Boolean).join(' ')
      : server.url || '（未提供 url）'
    return `- ${server.name}（${server.transport}）：${target}`
  })
}
