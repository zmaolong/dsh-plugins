/**
 * Hub 的骨架状态：只算路径、列格式，不落盘、不读外部 Harness 目录。
 *
 * 后续版本在这里接入 state.json / marketplaces.json / cache 与安装器。
 * 刻意不 import 任何 @deepseek-ai/* 包：profile 关闭了 autoInstallPeers，
 * 第三方插件的 peer 依赖不会被安装，只能用 Node 内置模块和 ctx 接口。
 *
 * @module dsh-agent-plugin-hub/hub
 */

import { existsSync, readFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { FORMATS } from './formats.js'

const PACKAGE = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
)

export const HUB_NAME = 'dsh-agent-plugin-hub'
export const HUB_VERSION = PACKAGE.version

/** 展开配置里的 `~` / `~/`，其余原样交给 path.resolve。 */
function expandHome(value) {
  if (value === '~') return os.homedir()
  if (value.startsWith('~/') || value.startsWith('~\\')) {
    return path.join(os.homedir(), value.slice(2))
  }
  return value
}

export class AgentPluginHub {
  /**
   * @param {{ home?: string }} [options]
   */
  constructor(options = {}) {
    const configured = typeof options.home === 'string' ? options.home.trim() : ''
    const fromEnv = typeof process.env.DSH_AGENT_PLUGIN_HUB_HOME === 'string'
      ? process.env.DSH_AGENT_PLUGIN_HUB_HOME.trim()
      : ''
    const fallback = path.join(os.homedir(), '.dsh', 'agent-plugin-hub')
    this.home = path.resolve(expandHome(configured || fromEnv || fallback))
    this.formats = FORMATS
  }

  /** 骨架期只计算路径，不创建目录。 */
  get paths() {
    return {
      home: this.home,
      state: path.join(this.home, 'state.json'),
      marketplaces: path.join(this.home, 'marketplaces.json'),
      cache: path.join(this.home, 'cache'),
      logs: path.join(this.home, 'logs'),
      tmp: path.join(this.home, 'tmp'),
    }
  }

  listFormats() {
    return this.formats.map((format) => ({
      id: format.id,
      label: format.label,
      pluginManifests: [...format.pluginManifests],
      marketplaceFiles: [...format.marketplaceFiles],
    }))
  }

  status() {
    return {
      name: HUB_NAME,
      version: HUB_VERSION,
      home: this.home,
      formats: this.formats.map((format) => format.id),
      state: existsSync(this.paths.state) ? 'present' : 'missing',
    }
  }
}