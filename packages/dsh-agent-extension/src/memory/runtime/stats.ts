/**
 * 统计记账：召回命中计数、装配样本与会话级批量落盘。
 *
 * 读路径（提示词装配、工具检索）只改内存；真正的 `stats.json` 写入发生在
 * `agent/turn-stopping`、`agent/disposed` 与插件销毁时。
 *
 * @module dsh-agent-extension/memory/runtime/stats
 */

import type { LogFn } from '../../log.ts'
import type { MemoryStore } from '../store.ts'
import type { CreatedRef } from '../types.ts'

/** 一个会话的召回计数（与 SessionBuffer 共享同一批 Set）。 */
export interface RecallCounters {
  /** 注入到提示词里的索引 id。 */
  injected: Set<string>
  /** 注入 id 中被模型用工具回读的 id。 */
  used: Set<string>
  /** 检索命中但不在注入集合里的 id。 */
  overflow: Set<string>
  /** `memory_search` 返回过的 id；判定 `searchUsed` 的成员集合。 */
  searched: Set<string>
  /** `memory_search` 累计返回的结果条数（重复命中按次计）。 */
  searchedCount: number
  /** `searched` 中后来被 `memory_get` 打开的 id（同一 id 只计一次）。 */
  searchUsed: Set<string>
}

/** 一次提示词装配样本（面板「最近注入」用）。 */
export interface InjectionSample {
  entries: number
  chars: number
  truncated: boolean
}

/**
 * 记录一次工具检索/读取。
 *
 * @param counters - 会话计数。
 * @param resultIds - 本次工具结果里的 id（`memory_search` 用）。
 * @param usedIds - 本次真正读到的 id（`memory_get` 用）。
 */
export function noteToolUsage(
  counters: RecallCounters,
  resultIds: readonly string[],
  usedIds: readonly string[],
): void {
  for (const id of usedIds) {
    counters.used.add(id)
    // 只有先被 search 返回过的 id 才计入检索命中率，且同一 id 只计一次。
    if (counters.searched.has(id)) counters.searchUsed.add(id)
  }
  for (const id of resultIds) {
    counters.searched.add(id)
    counters.searchedCount += 1
    if (counters.injected.has(id)) counters.used.add(id)
    else counters.overflow.add(id)
  }
}

/**
 * 从 assistant 文本中提取被引用的记忆 id。
 *
 * B10 注入抬头立了「依赖时引用 id」的规约，这里是它的承接（codex citation
 * 闭环）：正文里出现 `m-<时间戳>-<hex>` 短格式或迁移条目的 UUID 形式即算
 * 引用候选。只提取候选、不判定真伪——命中是否计数由调用方与「本会话暴露
 * 给模型的 id 集合」取交集决定，防止正文里偶然出现的同形字符串误计。
 *
 * @param text - assistant 文本（多条直接拼接）。
 */
export function citedMemoryIds(text: string): string[] {
  const found = new Set<string>()
  for (const match of text.matchAll(/\bm-[0-9a-z]{4,12}-[0-9a-f]{6}\b/giu)) found.add(match[0])
  for (const match of text.matchAll(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/giu)) {
    found.add(match[0])
  }
  return [...found]
}

/**
 * 把一个会话的召回计数与装配样本写入存储（best effort，失败只记日志）。
 *
 * @param options - 存储、会话 id、计数、可选装配样本与日志。
 */
export function flushRecall(options: {
  store: MemoryStore
  sessionId: string
  counters: RecallCounters
  injection?: InjectionSample
  log: LogFn
}): void {
  const { store, sessionId, counters, injection, log } = options
  if (counters.injected.size > 0 || counters.overflow.size > 0
    || counters.searchedCount > 0 || counters.searchUsed.size > 0) {
    try {
      store.recordRecall(sessionId, [...counters.injected], [...counters.used], counters.overflow.size, {
        searched: counters.searchedCount,
        searchUsed: counters.searchUsed.size,
      })
    } catch (error) {
      log('warn', `写命中率统计失败：${error instanceof Error ? error.message : String(error)}`)
    }
  }
  if (injection !== undefined && injection.entries > 0) {
    try {
      store.recordInjection({
        sessionId,
        entries: injection.entries,
        chars: injection.chars,
        truncated: injection.truncated,
      })
    } catch (error) {
      log('warn', `写注入样本失败：${error instanceof Error ? error.message : String(error)}`)
    }
  }
}

/**
 * 记录一次捕获尝试（best effort）。
 *
 * @param store - 记忆存储。
 * @param log - 失败日志。
 * @param entries - 写入或强化的条数。
 * @param skipped - 本轮没有产出（失败/空轮/被闸门拒绝）。
 * @param detail - 会话 id、跳过原因与该次**新增**的条目引用，供面板
 *   「最近捕获」展示与撤销。
 */
export function recordCaptureAttempt(
  store: MemoryStore,
  log: LogFn,
  entries: number,
  skipped: boolean,
  detail: { sessionId?: string; skippedReason?: string; error?: string; created?: readonly CreatedRef[] } = {},
): void {
  try {
    store.recordCapture(entries, skipped, detail)
  } catch (error) {
    log('warn', `写捕获统计失败：${error instanceof Error ? error.message : String(error)}`)
  }
}