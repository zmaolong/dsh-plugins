/**
 * 轻量 Markdown frontmatter 解析器与命令模板渲染（零依赖）。
 *
 * 只支持 Agent 插件里实际会出现的 YAML 子集：单行标量、引号字符串、
 * 内联数组 `[a, b]`、短横线列表、布尔与数字。未知/嵌套结构按原始文本保留，
 * 不抛错——格式宽容优先（宿主市场数据不可控）。
 *
 * @module dsh-agent-plugin-hub/frontmatter
 */

/** 去掉值两侧的引号。 */
function unquote(value) {
  const text = value.trim()
  if (text.length >= 2) {
    const first = text[0]
    const last = text[text.length - 1]
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
      return text.slice(1, -1).replace(/\\(["'\\])/gu, '$1')
    }
  }
  return text
}

/** 解析一个标量值：布尔、数字、内联数组、字符串。 */
function parseScalar(raw) {
  const text = raw.trim()
  if (text === '') return ''
  if (text === 'true') return true
  if (text === 'false') return false
  if (text === 'null' || text === '~') return null
  if (/^-?\d+(?:\.\d+)?$/u.test(text)) return Number(text)
  if (text.startsWith('[') && text.endsWith(']')) {
    const inner = text.slice(1, -1).trim()
    if (inner === '') return []
    return inner.split(',').map((item) => parseScalar(item))
  }
  return unquote(text)
}

/**
 * 解析 Markdown 的 YAML frontmatter。
 *
 * @param {string} text - 原始 Markdown。
 * @returns {{data: Record<string, unknown>, body: string, hasFrontmatter: boolean, warnings: string[]}}
 */
export function parseFrontmatter(text) {
  const source = typeof text === 'string' ? text : ''
  const warnings = []
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
  const data = {}
  let currentKey = null
  let currentList = null
  for (const line of header.split('\n')) {
    if (line.trim() === '' || line.trimStart().startsWith('#')) continue
    const listItem = /^\s*-\s+(.*)$/u.exec(line)
    if (listItem && currentKey !== null) {
      if (currentList === null) {
        currentList = []
        data[currentKey] = currentList
      }
      currentList.push(parseScalar(listItem[1]))
      continue
    }
    if (/^\s/u.test(line) && currentKey !== null) {
      // 嵌套结构（如 metadata: 下的子键）不在能力解析范围内，记录后跳过。
      warnings.push(`跳过嵌套 frontmatter 行：${line.trim()}`)
      continue
    }
    const pair = /^([A-Za-z0-9_.-]+)\s*:\s*(.*)$/u.exec(line)
    if (!pair) {
      warnings.push(`无法解析的 frontmatter 行：${line.trim()}`)
      continue
    }
    currentKey = pair[1]
    currentList = null
    const value = pair[2]
    if (value.trim() === '') {
      // 可能是列表或嵌套对象；先占位，列表项会覆盖。
      data[currentKey] = null
    } else {
      data[currentKey] = parseScalar(value)
    }
  }
  return { data, body, hasFrontmatter: true, warnings }
}

/**
 * 按 shell 习惯切分参数（支持单双引号与反斜杠转义）。
 *
 * @param {string} input
 * @returns {string[]}
 */
export function splitArguments(input) {
  const text = typeof input === 'string' ? input : ''
  const args = []
  let current = ''
  let quote = null
  let hasContent = false
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]
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
    if (char === '"' || char === "'") {
      quote = char
      hasContent = true
      continue
    }
    if (char === '\\' && index + 1 < text.length) {
      // 引号外的反斜杠转义：直接取下一个字符。
      current += text[index + 1]
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
 * 渲染命令模板：替换 `$ARGUMENTS`、`$1`..`$9`。无占位符时把参数追加为“用户输入”。
 *
 * @param {string} template - 命令正文（已剥离 frontmatter）。
 * @param {string} rawInput - 用户输入参数。
 * @returns {string}
 */
export function renderCommandTemplate(template, rawInput) {
  const body = typeof template === 'string' ? template : ''
  const raw = typeof rawInput === 'string' ? rawInput.trim() : ''
  const args = splitArguments(raw)
  let rendered = body
  let used = false
  if (rendered.includes('$ARGUMENTS')) {
    rendered = rendered.split('$ARGUMENTS').join(raw)
    used = true
  }
  rendered = rendered.replace(/\$(\d)/gu, (match, digit) => {
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