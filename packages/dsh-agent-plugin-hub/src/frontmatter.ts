/**
 * Lightweight Markdown frontmatter parser and command template renderer
 * (zero dependencies).
 *
 * Only the YAML subset that actually appears in agent plugins is supported:
 * single-line scalars, quoted strings, inline arrays `[a, b]`, dash lists,
 * booleans, and numbers. Unknown/nested structures keep their raw text and
 * are skipped with a warning instead of throwing — format tolerance first
 * (the market data is not under our control).
 *
 * @module dsh-agent-plugin-hub/frontmatter
 */

/** Result of splitting a Markdown document into frontmatter data and body. */
export interface FrontmatterResult {
  data: Record<string, unknown>
  body: string
  hasFrontmatter: boolean
  warnings: string[]
}

/** Strip quotes from both sides of a value. */
function unquote(value: string): string {
  const text = value.trim()
  if (text.length >= 2) {
    const first = text[0]
    const last = text[text.length - 1]
    if ((first === '"' && last === '"') || (first === '\'' && last === '\'')) {
      return text.slice(1, -1).replace(/\\(["'\\])/gu, '$1')
    }
  }
  return text
}

/** Parse one scalar value: boolean, number, inline array, or string. */
function parseScalar(raw: string): unknown {
  const text = raw.trim()
  if (text === '') return ''
  if (text === 'true') return true
  if (text === 'false') return false
  if (text === 'null' || text === '~') return null
  if (/^-?\d+(?:\.\d+)?$/u.test(text)) return Number(text)
  if (text.startsWith('[') && text.endsWith(']')) {
    const inner = text.slice(1, -1).trim()
    if (inner === '') return []
    return inner.split(',').map(item => parseScalar(item))
  }
  return unquote(text)
}

/**
 * Parse the YAML frontmatter of a Markdown document.
 *
 * @param text - raw Markdown.
 * @returns the parsed data, the body after the frontmatter, and tolerance warnings.
 */
export function parseFrontmatter(text: unknown): FrontmatterResult {
  const source = typeof text === 'string' ? text : ''
  const warnings: string[] = []
  const normalized = source.replace(/\r\n/gu, '\n')
  if (!normalized.startsWith('---\n')) {
    return { data: {}, body: normalized, hasFrontmatter: false, warnings }
  }
  const end = normalized.indexOf('\n---', 4)
  if (end === -1) {
    warnings.push('frontmatter 未闭合，按正文处理')
    return { data: {}, body: normalized, hasFrontmatter: false, warnings }
  }
  const header = normalized.slice(4, end)
  let body = normalized.slice(end + 4)
  if (body.startsWith('\n')) body = body.slice(1)
  const data: Record<string, unknown> = {}
  let currentKey: string | null = null
  let currentList: unknown[] | null = null
  for (const line of header.split('\n')) {
    if (line.trim() === '' || line.trimStart().startsWith('#')) continue
    const listItem = /^\s*-\s+(.*)$/u.exec(line)
    if (listItem && currentKey !== null) {
      if (currentList === null) {
        currentList = []
        data[currentKey] = currentList
      }
      currentList.push(parseScalar(listItem[1] as string))
      continue
    }
    if (/^\s/u.test(line) && currentKey !== null) {
      // Nested structures (sub-keys under `metadata:` and the like) are out of
      // scope for capability parsing; record and skip.
      warnings.push(`跳过嵌套 frontmatter 行：${line.trim()}`)
      continue
    }
    const pair = /^([A-Za-z0-9_.-]+)\s*:\s*(.*)$/u.exec(line)
    if (!pair) {
      warnings.push(`无法解析的 frontmatter 行：${line.trim()}`)
      continue
    }
    currentKey = pair[1] as string
    currentList = null
    const value = pair[2] as string
    if (value.trim() === '') {
      // Possibly a list or nested object; reserve the key, list items overwrite.
      data[currentKey] = null
    } else {
      data[currentKey] = parseScalar(value)
    }
  }
  return { data, body, hasFrontmatter: true, warnings }
}

/**
 * Split arguments following shell habits (single/double quotes and backslash escapes).
 *
 * @param input - raw argument text.
 */
export function splitArguments(input: unknown): string[] {
  const text = typeof input === 'string' ? input : ''
  const args: string[] = []
  let current = ''
  let quote: string | null = null
  let hasContent = false
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index] as string
    if (quote !== null) {
      if (char === '\\' && quote === '"' && index + 1 < text.length) {
        current += text[index + 1]
        index += 1
        continue
      }
      if (char === quote) {
        quote = null
        hasContent = true
        continue
      }
      current += char
      continue
    }
    if (char === '"' || char === '\'') {
      quote = char
      hasContent = true
      continue
    }
    if (char === '\\' && index + 1 < text.length) {
      // Backslash escape outside quotes: take the next character verbatim.
      current += text[index + 1] as string
      index += 1
      hasContent = true
      continue
    }
    if (/\s/u.test(char)) {
      if (hasContent || current !== '') {
        args.push(current)
        current = ''
        hasContent = false
      }
      continue
    }
    current += char
    hasContent = true
  }
  if (hasContent || current !== '') args.push(current)
  return args
}

/**
 * Render a command template: replace `$ARGUMENTS` and `$1`..`$9`. Without any
 * placeholder, the arguments are appended as a "user input" block.
 *
 * @param template - command body (frontmatter already stripped).
 * @param rawInput - user-provided arguments.
 */
export function renderCommandTemplate(template: unknown, rawInput: unknown): string {
  const body = typeof template === 'string' ? template : ''
  const raw = typeof rawInput === 'string' ? rawInput.trim() : ''
  const args = splitArguments(raw)
  let rendered = body
  let used = false
  if (rendered.includes('$ARGUMENTS')) {
    rendered = rendered.split('$ARGUMENTS').join(raw)
    used = true
  }
  rendered = rendered.replace(/\$(\d)/gu, (match, digit: string) => {
    const index = Number(digit) - 1
    if (index < 0) return match
    used = true
    return args[index] ?? ''
  })
  if (!used && raw !== '') {
    rendered = `${rendered.trimEnd()}\n\n用户输入：${raw}\n`
  }
  return rendered
}
