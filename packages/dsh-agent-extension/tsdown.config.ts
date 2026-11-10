/**
 * Build config for dsh-agent-extension: the host half plus the browser
 * factory. Behavior mirrors the official UI-plugin preset
 * (deepseek-harness `packages/client/tsdown.client.ts`) artifact by artifact;
 * the preset itself imports the official workspace internals, so this
 * package restates the parts it needs instead of importing them:
 *
 * - Host half `lib/index.js`: ESM, node, es2024, every relative module
 *   bundled (the package keeps zero runtime dependencies).
 * - Browser half `lib/client.js`: CJS inside the closure-factory handoff —
 *   banner `window.__ModuleLoader__.load({ id, factory: (require) => {`,
 *   footer `return module.exports; } });`, intro declaring `module`/`exports`
 *   — with sourcemap, react and `dsh.client.external` as the only externals
 *   (the loader module table answers them), and everything else inlined.
 * - CSS Modules compile through lightningcss (`[hash]_[local]` pattern,
 *   minified) into a style-injection module that tags
 *   `<style data-plugin-css>` once per sheet and exports the class map.
 * - Purity gate: value imports of `@deepseek-ai/*` packages and node
 *   builtins fail the browser build — host capabilities cross through ctx,
 *   never through a module specifier.
 */
import { readFile } from 'node:fs/promises'
import { basename, dirname, isAbsolute, resolve } from 'node:path'
import { builtinModules } from 'node:module'
import { transform } from 'lightningcss'
import type { Plugin } from 'rolldown'
import { defineConfig, type UserConfig } from 'tsdown'

/** Package name; also the Client loader id stamped into the factory handoff. */
const PACKAGE_ID = 'dsh-agent-extension'

/**
 * Baseline module-table specifiers the loader's require answers for every
 * dynamic bundle (official `PLATFORM_MODULES`); `dsh.client.external` in
 * package.json may add package-specific rows. The hub requests no rows, so
 * only react (and its jsx runtime) matter here.
 */
const PLATFORM_MODULES = [
  'react', 'react/jsx-runtime', 'react-dom', 'react-dom/client', '@deepseek-ai/cordis',
  'zod', '@tanstack/react-virtual',
  '@deepseek-ai/dsh-client-store',
  '@deepseek-ai/dsh-client-ui-slots',
  '@deepseek-ai/dsh-client-ui-primitives',
  '@deepseek-ai/dsh-client-ui-dockkit',
]

/** The `dsh.client` declaration of this package, read once. */
const manifest = JSON.parse(await readFile(new URL('./package.json', import.meta.url), 'utf8')) as {
  dsh?: { client?: { external?: string[] } }
}

/** Module-table specifiers this bundle may stay external on. */
const externals = new Set([...PLATFORM_MODULES, ...(manifest.dsh?.client?.external ?? [])])

/**
 * 受控例外（ADR-0008）：浏览器半只允许从宿主 primitives 取 MarkdownText。
 *
 * 值为 `undefined` 表示该包整体放行；这里收窄到 primitives 一个包，其它
 * `@deepseek-ai/*` 仍然在浏览器构建里被拒绝。
 */
const HOST_PRIMITIVES = '@deepseek-ai/dsh-client-ui-primitives'

/** Node builtins and prefixes, rejected in the browser face. */
const nodeBuiltins = new Set([
  ...builtinModules,
  ...builtinModules.map(name => `node:${name}`),
])

/**
 * Virtual-id wrapper keeping module CSS away from tsdown's own css pipeline.
 * The `.mjs` suffix matters: tsdown's guard matches ids ending in `.css`.
 */
const CSS_VIRTUAL_PREFIX = '\0dsh-css:'
const CSS_VIRTUAL_SUFFIX = '.mjs'

/**
 * Emit one style injector and the CSS Modules class map. The guard keeps the
 * sheet idempotent across factory re-execution (HMR reruns), mirroring the
 * official `styleInjectionModule`.
 */
function styleInjectionModule(id: string, fileId: string, css: string, classMap: Record<string, string>): string {
  const source = [
    `const css = ${css};`,
    `const tagId = ${JSON.stringify(`${id}/${basename(fileId)}`)};`,
    'if (typeof document !== \'undefined\' && document.querySelector(\'style[data-plugin-css=\' + JSON.stringify(tagId) + \']\') === null) {',
    '  const tag = document.createElement(\'style\');',
    `  tag.dataset.plugin = ${JSON.stringify(id)};`,
    '  tag.dataset.pluginCss = tagId;',
    '  tag.textContent = css;',
    '  document.head.appendChild(tag);',
    '}',
    `export default ${JSON.stringify(classMap)};`,
  ]
  return source.join('\n')
}

/** Compile one `.module.css` sheet and return its injection module source. */
async function compileCssModule(id: string, fileId: string): Promise<string> {
  const source = await readFile(fileId)
  const { code, exports: cssExports } = transform({
    filename: fileId,
    code: source,
    cssModules: { pattern: '[hash]_[local]' },
    minify: true,
  })
  const classMap: Record<string, string> = {}
  const exportEntries = Object.entries(cssExports ?? {})
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
  for (const [local, exp] of exportEntries) classMap[local] = exp.name
  return styleInjectionModule(id, fileId, JSON.stringify(code.toString()), classMap)
}

/** Browser-face plugin set shared by the client config. */
function clientPlugins(): Plugin[] {
  return [{
    name: 'dsh-client-bundle-purity',
    resolveId(source: string) {
      if (nodeBuiltins.has(source)) {
        throw new Error(`client bundle purity: "${source}" is a node builtin; the browser half runs without node`)
      }
      if (source.startsWith('@deepseek-ai/') && source !== HOST_PRIMITIVES) {
        throw new Error(
          `client bundle purity: "${source}" is not in the default client externals or ${PACKAGE_ID}'s dsh.client.external — `
          + 'cross-plugin value imports are forbidden; host capabilities cross through ctx '
          + '(type-only imports are erased and never reach this gate)',
        )
      }
      return null
    },
  }, {
    name: 'dsh-css-modules-inline',
    resolveId(source: string, importer?: string) {
      if (!source.endsWith('.module.css') || importer === undefined) return null
      // Entry ids stay cwd-relative; anchor on the importer's real directory.
      const absImporter = isAbsolute(importer) ? importer : resolve(importer)
      const abs = resolve(dirname(absImporter), source)
      return CSS_VIRTUAL_PREFIX + abs + CSS_VIRTUAL_SUFFIX
    },
    load(virtualId: string) {
      if (!virtualId.startsWith(CSS_VIRTUAL_PREFIX)) return null
      const fileId = virtualId.slice(CSS_VIRTUAL_PREFIX.length, -CSS_VIRTUAL_SUFFIX.length)
      // The virtual id otherwise hides the physical stylesheet from rolldown's watch graph.
      this.addWatchFile(fileId)
      return compileCssModule(PACKAGE_ID, fileId)
    },
  }]
}

/** The browser factory bundle landing at lib/client.js. */
function clientConfig(): UserConfig {
  return {
    entry: { client: 'src/client/index.ts' },
    outDir: 'lib',
    format: 'cjs',
    platform: 'browser',
    target: 'es2024',
    dts: false,
    sourcemap: true,
    clean: false,
    external: [...externals],
    define: {
      'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV ?? 'production'),
    },
    inputOptions: {
      resolve: {
        conditionNames: [
          (process.env.NODE_ENV ?? 'production') === 'development' ? 'development' : 'production',
          'browser', 'import', 'module', 'default',
        ],
      },
    },
    plugins: clientPlugins(),
    outputOptions: {
      entryFileNames: 'client.js',
      chunkFileNames: 'client.[name].js',
      banner: chunk =>
        `window.__ModuleLoader__.load({ id: ${JSON.stringify(PACKAGE_ID)}, ${chunk.isEntry ? '' : `chunk: ${JSON.stringify(chunk.fileName)}, `}factory: (require) => {`,
      footer: 'return module.exports; } });',
      intro: 'var module = { exports: {} }; var exports = module.exports;',
    },
  }
}

/** The host library bundle landing at lib/index.js. */
function libConfig(): UserConfig {
  return {
    entry: ['src/index.ts'],
    outDir: 'lib',
    format: 'esm',
    platform: 'node',
    target: 'es2024',
    // type: module package: keep the .js extension instead of emitting .mjs.
    fixedExtension: false,
    dts: false,
    sourcemap: false,
    // First config in the array: clean once here, then the client config
    // adds its artifact beside the fresh node output (clean stays off there).
    clean: true,
  }
}

export default defineConfig([libConfig(), clientConfig()])
