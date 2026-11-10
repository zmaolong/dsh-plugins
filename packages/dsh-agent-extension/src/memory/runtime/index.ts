/**
 * 记忆运行时模块的入口（B0 运行时层）。
 *
 * `memory-host.ts` 只做薄组合：把这里的提示词、工具、命令、会话捕获与统计
 * 装配到宿主 ctx 上，并保留对外的 `MemoryRuntime` / `MemoryRuntimeOptions`
 * / `MEMORY_TOOL_NAMES` / `asMemoryType` 导出。
 *
 * @module dsh-agent-extension/memory/runtime
 */

export {
  CaptureSessions,
  type BufferedEvent,
  type CaptureSessionsOptions,
  type ModelRoute,
  type SessionBuffer,
} from './capture-session.ts'
export { registerMemoryCommands, type MemoryCommandOptions } from './commands.ts'
export {
  MEMORY_CONTEXT_SECTION,
  MEMORY_GUIDE,
  MEMORY_GUIDE_SECTION,
  RecallCache,
  registerMemoryPrompt,
} from './prompt.ts'
export {
  flushRecall,
  noteToolUsage,
  recordCaptureAttempt,
  type InjectionSample,
  type RecallCounters,
} from './stats.ts'
export {
  MEMORY_TOOL_NAMES,
  asMemoryType,
  createMemoryTools,
  registerMemoryTools,
  type MemoryToolOptions,
} from './tools.ts'