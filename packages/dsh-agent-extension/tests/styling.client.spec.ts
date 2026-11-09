/**
 * Style-sheet regression guards carried over from the legacy probe tests:
 * every full-round shape (999px / 50% / 100%) must pair `corner-shape: round`
 * to escape the host's global superellipse, no stylesheet may hardcode a blur
 * on the dialog mask, and hover styles sit behind `(hover: hover)`.
 * Sources are read from disk; line endings normalize (autocrlf checkouts).
 */
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const CSS_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'client')

function cssFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true })
    .filter(entry => entry.isFile() && entry.name.endsWith('.css'))
    .map(entry => join(dir, entry.name))
}

function normalize(text: string): string {
  return text.replace(/\r\n/gu, '\n')
}

/** Rules of one stylesheet keyed by selector; a naive brace scan is enough for these flat sheets. */
function rulesOf(text: string): Array<{ selector: string, body: string }> {
  const rules: Array<{ selector: string, body: string }> = []
  for (const match of text.matchAll(/([^{}]+)\{([^{}]*)\}/gu)) {
    rules.push({ selector: (match[1] ?? '').trim(), body: match[2] ?? '' })
  }
  return rules
}

/** Remove whole `@media (hover: hover) { … }` blocks (balanced) so the remaining text holds only non-hover styles. */
function stripHoverBlocks(text: string): string {
  let out = ''
  let index = 0
  while (index < text.length) {
    const start = text.indexOf('@media', index)
    if (start === -1) {
      out += text.slice(index)
      break
    }
    const headerEnd = text.indexOf('{', start)
    if (headerEnd === -1) {
      out += text.slice(index)
      break
    }
    if (!/\(hover:\s*hover\)/u.test(text.slice(start, headerEnd))) {
      out += text.slice(index, headerEnd + 1)
      index = headerEnd + 1
      continue
    }
    let depth = 1
    let cursor = headerEnd + 1
    while (cursor < text.length && depth > 0) {
      if (text[cursor] === '{') depth += 1
      else if (text[cursor] === '}') depth -= 1
      cursor += 1
    }
    out += text.slice(index, start)
    index = cursor
  }
  return out
}

const sheets = cssFiles(CSS_DIR).map(file => ({
  name: file.slice(CSS_DIR.length + 1),
  text: normalize(readFileSync(file, 'utf8')),
}))

describe('client stylesheet guards', () => {
  it('pairs corner-shape: round with every full-round radius', () => {
    const offenders: string[] = []
    for (const sheet of sheets) {
      for (const rule of rulesOf(sheet.text)) {
        if (!/border-radius:\s*(?:999px|50%|100%)/u.test(rule.body)) continue
        if (!/corner-shape:\s*round/u.test(rule.body)) offenders.push(`${sheet.name}: ${rule.selector}`)
      }
    }
    expect(offenders).toEqual([])
  })

  it('keeps hover styles behind (hover: hover)', () => {
    const offenders: string[] = []
    for (const sheet of sheets) {
      const outside = stripHoverBlocks(sheet.text)
      for (const line of outside.split('\n')) {
        if (/:hover/u.test(line) && !line.trim().startsWith('/*')) offenders.push(`${sheet.name}: ${line.trim()}`)
      }
    }
    expect(offenders).toEqual([])
  })

  it('never hardcodes a backdrop blur on the dialog mask', () => {
    const dialogs = sheets.find(sheet => sheet.name === 'dialogs.module.css')
    expect(dialogs).toBeTruthy()
    const blur = dialogs?.text.match(/backdrop-filter:\s*([^;]+);/u)?.[1]?.trim() ?? ''
    // The theme token (--dsw-mask-blur) is allowed; a literal blur() is not.
    expect(blur).not.toMatch(/blur\(/u)
  })

  it('uses theme tokens instead of a local palette', () => {
    const offenders = sheets.filter(sheet => /--[a-z-]*aph-/u.test(sheet.text))
    expect(offenders.map(sheet => sheet.name)).toEqual([])
  })

  it('builds the Switch from the official 36×20 geometry', () => {
    const switchSheet = sheets.find(sheet => sheet.name === 'Switch.module.css')
    expect(switchSheet?.text).toContain('width: 36px')
    expect(switchSheet?.text).toContain('height: 20px')
    expect(switchSheet?.text).toContain('corner-shape: round')
    expect(switchSheet?.text).toContain('background: var(--dsw-alias-switch-thumb)')
  })
})
