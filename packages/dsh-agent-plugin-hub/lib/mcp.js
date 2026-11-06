/**
 * MCP 清单：解析并展示插件里的 `mcpServers`，但不自行 spawn 进程。
 *
 * 侦察结论（见 docs/HOST-API.md）：宿主用 `@deepseek-ai/dsh-mcp-client` 以
 * “一个插件行连一个 MCP server”的静态配置方式挂载 MCP；该包没有运行时注册
 * 服务（`ctx` 里只有 `mcpResources` 资源读取服务，没有挂载接口），第三方插件
 * 也不能写 profile 组合。按自动决策：保留清单并标注「未生效」，不自己造执行通道。
 *
 * @module dsh-agent-plugin-hub/mcp
 */

import { readMcpServers } from './capabilities.js'

/** MCP 是否可挂载（当前宿主 API 下不可用）。 */
export function mcpAvailability(ctx) {
  const hasResources = Boolean(ctx?.get?.('mcpResources'))
  return {
    available: false,
    hasResources,
    reason: hasResources
      ? '宿主未加载 dsh-mcp-client（只有 mcpResources 资源服务），第三方插件没有运行时挂载接口；MCP server 需在 profile 中以独立插件行配置'
      : '宿主未提供 MCP 挂载接口（dsh-mcp-client 未加载）；MCP server 需在 profile 中以独立插件行配置',
  }
}

/** 描述一个插件的 MCP 清单。 */
export function describePluginMcp(pluginRoot, formatId, manifest = {}) {
  const read = readMcpServers(pluginRoot, formatId, manifest)
  return {
    servers: read.servers,
    source: read.source,
    warnings: read.warnings,
    effective: false,
  }
}

/** 展示用：每个 server 一行。 */
export function formatMcpServers(servers) {
  if (!Array.isArray(servers) || servers.length === 0) return ['（无）']
  return servers.map((server) => {
    const target = server.transport === 'stdio'
      ? [server.command, ...(server.args ?? [])].filter(Boolean).join(' ')
      : server.url || '（未提供 url）'
    return `- ${server.name}（${server.transport}）：${target}`
  })
}