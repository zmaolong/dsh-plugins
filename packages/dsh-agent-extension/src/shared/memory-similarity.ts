/**
 * 记忆相似度：字符 bigram 的 Jaccard 系数。
 *
 * 浏览器端的记忆体检（`client/audit.ts`）与服务端的维护 Run 预筛共用这套
 * 纯函数：中文按两字滑窗、英文忽略空白与大小写后按字符滑窗，因此无需分词
 * 依赖也能覆盖 CJK 与拉丁文本。
 *
 * @module dsh-agent-extension/shared/memory-similarity
 */

/** 客户端体检认定「疑似重复」的相似度阈值。 */
export const DUPLICATE_THRESHOLD = 0.6

/**
 * 写入相似吸收阈值：模型/提炼的新写入与既有条目相似度达到该值时不新建，
 * 转为对既有条目的强化。比体检的疑似重复（0.6）更保守，只吞极相似候选。
 */
export const CAPTURE_SIMILARITY_THRESHOLD = 0.75

/** 相似度比对要求的最短归一化长度；更短的文本 bigram 重合率虚高、不可信。 */
export const SIMILARITY_MIN_CHARS = 40

/** 文本归一化后是否够长、可参与相似度判定（防「记忆 1」vs「记忆 2」式误吸收）。 */
export function longEnoughForSimilarity(value: string): boolean {
  return normalizeText(value).length >= SIMILARITY_MIN_CHARS
}

/** 归一化：小写并去掉全部空白。 */
function normalizeText(value: string): string {
  return value.toLowerCase().replace(/\s+/gu, '')
}

/** 一个文本的字符 bigram 集合；单字文本退化成一个标记。 */
export function bigramsOf(value: string): Set<string> {
  const flat = normalizeText(value)
  const grams = new Set<string>()
  if (flat.length <= 1) {
    if (flat !== '') grams.add(flat)
    return grams
  }
  for (let index = 0; index < flat.length - 1; index += 1) {
    grams.add(flat.slice(index, index + 2))
  }
  return grams
}

/** 两个 bigram 集合的 Jaccard 相似度，落在 `[0, 1]`。 */
export function jaccard(left: ReadonlySet<string>, right: ReadonlySet<string>): number {
  if (left.size === 0 || right.size === 0) return 0
  let shared = 0
  for (const gram of left) {
    if (right.has(gram)) shared += 1
  }
  return shared / (left.size + right.size - shared)
}

/** 两段文本的 bigram-Jaccard 相似度，落在 `[0, 1]`。 */
export function similarity(left: string, right: string): number {
  return jaccard(bigramsOf(left), bigramsOf(right))
}