/**
 * 自动捕获：事件摘要、便宜闸门、强制信号、提炼 JSON 解析与请求载荷。
 */

import { describe, expect, it } from 'vitest'

import {
  buildExtractionMessages,
  digestOf,
  gateCapture,
  hasForceSignal,
  parseExtraction,
  wordCount,
  type TurnEvent,
} from '../src/memory/capture.ts'

/** One human user message event. */
function human(seq: number, text: string): TurnEvent {
  return { seq, type: 'user/message', data: { id: `u-${seq}`, role: 'user', source: { kind: 'user' }, content: [{ type: 'text', text }] } }
}

/** One synthetic plugin message event (must never count as human input). */
function synthetic(seq: number, text: string): TurnEvent {
  return { seq, type: 'user/message', data: { id: `s-${seq}`, role: 'user', source: { kind: 'system-prompt' }, content: [{ type: 'text', text }] } }
}

describe('自动捕获：闸门、摘要与提炼', () => {
  it('统计中英文词数', () => {
    expect(wordCount('use pnpm in this repo')).toBe(5)
    expect(wordCount('记住这件事')).toBe(5)
    expect(wordCount('')).toBe(0)
  })

  it('摘要只收人类消息，合成上下文与工具参数按字段归类', () => {
    const events: TurnEvent[] = [
      human(1, '以后都用 pnpm 安装依赖，不要用 npm'),
      synthetic(2, 'AGENTS.md 指令内容不应该被当成用户输入'),
      { seq: 3, type: 'assistant/message', data: { message: { role: 'assistant', content: [{ type: 'text', text: '好的，已记录。' }] } } },
      { seq: 4, type: 'tool/call', data: { name: 'edit', arguments: '{"file_path":"src/index.ts","old_string":"a","new_string":"b"}' } },
      { seq: 5, type: 'tool/result', data: { message: { role: 'tool', content: [], isError: true } } },
    ]
    const digest = digestOf(events, 's-1', 3)
    expect(digest.userTexts).toHaveLength(1)
    expect(digest.userTexts[0]).toContain('pnpm')
    expect(digest.assistantTexts[0]).toContain('已记录')
    expect(digest.toolNames).toEqual(['edit'])
    expect(digest.filesTouched).toContain('src/index.ts')
    expect(digest.hadToolCalls).toBe(true)
    expect(digest.hadError).toBe(true)
    expect(digest.userWordCount).toBeGreaterThan(8)
  })

  it('闸门规则：关闭/子代理/已捕获/空轮/过短轮/强制信号', () => {
    const digest = digestOf([human(1, '改按钮')], 's-1', 1)
    expect(gateCapture(digest, { subagent: false, enabled: false, capturedThroughThisTurn: false, force: false }).capture).toBe(false)
    expect(gateCapture(digest, { subagent: true, enabled: true, capturedThroughThisTurn: false, force: false }).capture).toBe(false)
    expect(gateCapture(digest, { subagent: false, enabled: true, capturedThroughThisTurn: true, force: false }).capture).toBe(false)
    expect(gateCapture(digest, { subagent: false, enabled: true, capturedThroughThisTurn: false, force: false }).reason).toBe('trivial')
    expect(gateCapture(digest, { subagent: false, enabled: true, capturedThroughThisTurn: false, force: true })).toMatchObject({ capture: true, reason: 'explicit-request' })
    expect(gateCapture(digestOf([], 's-1', 1), { subagent: false, enabled: true, capturedThroughThisTurn: false, force: false }).reason).toBe('empty')
    const longHuman = digestOf([human(1, '这个仓库统一使用 pnpm 管理依赖，禁止 npm 与 yarn，请写进约定里')], 's-1', 1)
    expect(gateCapture(longHuman, { subagent: false, enabled: true, capturedThroughThisTurn: false, force: false }).capture).toBe(true)
  })

  it('强制信号覆盖“记住/以后都/never use”等显式请求', () => {
    expect(hasForceSignal([], digestOf([human(1, '记住：提交信息用中文')], 's-1', 1))).toBe(true)
    expect(hasForceSignal([], digestOf([human(1, 'never use npm in this repo')], 's-1', 1))).toBe(true)
    expect(hasForceSignal([], digestOf([human(1, '看看这个函数')], 's-1', 1))).toBe(false)
  })

  it('force 只看当前轮：上一轮说过「记住」不会泄漏到本轮', () => {
    const previous: TurnEvent = { ...human(1, '记住：提交信息用中文'), turn: 1 }
    const current: TurnEvent = { ...human(2, '看看这个函数'), turn: 2 }
    // 缓冲里仍带着上一轮事件，但摘要属于第 2 轮 → 本轮不得命中 force。
    expect(hasForceSignal([previous, current], digestOf([current], 's-1', 2))).toBe(false)
    const askedAgain: TurnEvent = { ...human(3, '记住：以后都用 pnpm'), turn: 2 }
    expect(hasForceSignal([previous, askedAgain], digestOf([askedAgain], 's-1', 2))).toBe(true)
  })

  it('提炼请求载荷是合法 JSON，且带项目与既有记忆', () => {
    const digest = digestOf([human(1, '以后都用 pnpm')], 's-1', 1)
    const messages = buildExtractionMessages({
      digest,
      project: { key: 'p_abc', displayName: 'repo' },
      existing: [{ id: 'm-1', type: 'preference', name: 'npm', description: '旧' }],
    })
    expect(messages).toHaveLength(2)
    expect(messages[0]?.role).toBe('system')
    const payload = JSON.parse(messages[1]?.content ?? '{}') as Record<string, unknown>
    expect(payload.project).toEqual({ key: 'p_abc', name: 'repo' })
    expect(payload.existing).toHaveLength(1)
    expect(payload.turn).toBeTruthy()
  })

  it('解析提炼结果：容忍包裹文本、过滤非法项、最多三条', () => {
    const raw = '好的：\n[{"name":"用 pnpm","description":"统一包管理器","type":"preference","scope":"global","importance":80,"tags":["pnpm"],"content":"统一 pnpm。"}]\n完成'
    const parsed = parseExtraction(raw)
    expect(parsed).toHaveLength(1)
    expect(parsed?.[0]).toMatchObject({ name: '用 pnpm', type: 'preference', scope: 'global', importance: 80 })

    const invalid = parseExtraction('not json at all')
    expect(invalid).toBeNull()
    expect(parseExtraction('')).toBeNull()

    const fallback = parseExtraction('[{"name":"x","content":"y","type":"unknown","scope":"weird"}]')
    expect(fallback?.[0]).toMatchObject({ type: 'reference', scope: 'project', importance: 50 })

    const many = parseExtraction(JSON.stringify([
      { name: 'a', content: '1', type: 'preference' },
      { name: 'b', content: '2', type: 'preference' },
      { name: 'c', content: '3', type: 'preference' },
      { name: 'd', content: '4', type: 'preference' },
    ]))
    expect(many).toHaveLength(3)
    expect(parseExtraction('[{"name":"","content":""}]')).toEqual([])
  })

  it('解析提炼结果：代码围栏、尾随含括号的说明、字符串内裸换行', () => {
    const fenced = parseExtraction('说明\n```json\n[{"name":"a","content":"b","type":"gotcha"}]\n```\n(注意：不要存 [草稿])')
    expect(fenced).toHaveLength(1)
    expect(fenced?.[0]).toMatchObject({ name: 'a', type: 'gotcha' })

    const trailing = parseExtraction('[{"name":"a","content":"b","type":"decision"}]\n补充：[见上]')
    expect(trailing).toHaveLength(1)

    const rawNewline = '[{"name":"多行","content":"第一行\n第二行","type":"project"}]'
    const repaired = parseExtraction(rawNewline)
    expect(repaired).toHaveLength(1)
    expect(repaired?.[0]?.content).toContain('第一行')

    const truncated = parseExtraction('[{"name":"a","content":"b"},')
    expect(truncated).toBeNull()
  })
})