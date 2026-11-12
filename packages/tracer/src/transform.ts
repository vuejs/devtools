import type { Plugin } from 'vite'
import type { VueTracerOptions } from './options'
import type { RawSourceMap } from 'source-map-js'
import { dirname, isAbsolute, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { walk } from 'estree-walker'
import MagicString from 'magic-string'
import { SourceMapConsumer } from 'source-map-js'
import { normalizePath, searchForWorkspaceRoot } from 'vite'

const functions = [
  'h',
  '_createElementVNode',
  '_createElementBlock',
  '_createBlock',
  '_createVNode',
  '_createStaticVNode',
]
const testRe = new RegExp(`\\b(?:${functions.join('|')})\\(`)

/** Record source locations after Vue has compiled the template. */
export function tracerTransform(options: VueTracerOptions = {}): Plugin {
  const { enabled = 'dev', resolveRecordEntryPath = true } = options
  let tracingEnabled = enabled === true
  let workspaceRoot: string
  const recordPath = fileURLToPath(import.meta.resolve('@vue/devtools-tracer/client'))

  return {
    name: 'vue-devtools:tracer-transform',
    enforce: 'post',
    configResolved(config) {
      // The mode gates instrumentation, not the Vite DevTools picker.
      tracingEnabled =
        enabled === true ||
        (enabled === 'dev' && config.command === 'serve') ||
        (enabled === 'prod' && config.command === 'build')
      workspaceRoot = searchForWorkspaceRoot(config.root)
    },
    transform(code, id) {
      if (!tracingEnabled) return
      if (this.environment.name !== 'client') return
      if (!code.includes('_sfc_render(') || !testRe.test(code)) return
      if (code.includes('_tracer(')) return

      const consumer = new SourceMapConsumer(this.getCombinedSourcemap() as unknown as RawSourceMap)
      const s = new MagicString(code)
      const ast = this.parse(code)
      let hit = false

      // Vite 8's Oxc AST is ESTree-compatible for these call expressions.
      walk(ast as unknown as Parameters<typeof walk>[0], {
        enter(node) {
          if (node.type !== 'CallExpression' || node.callee.type !== 'Identifier') return
          if (!functions.includes(node.callee.name)) return

          const { start, end } = node as typeof node & { start: number; end: number }
          const lines = code.slice(0, start).split('\n')
          const original = consumer.originalPositionFor({
            line: lines.length,
            column: lines.at(-1)!.length,
          })
          if (original.source === null || original.line === null || original.column === null) return

          hit = true
          s.appendLeft(start, `_tracer(${original.line},${original.column},`)
          s.appendRight(end, ')')
        },
      })
      if (!hit) return

      // Virtual modules have no filesystem directory to resolve a relative import from.
      const filename = id.split('?')[0]!
      let recordImport = resolveRecordEntryPath
        ? normalizePath(recordPath)
        : '@vue/devtools-tracer/client/record'
      if (resolveRecordEntryPath && isAbsolute(filename)) {
        recordImport = normalizePath(relative(dirname(filename), recordPath))
        if (!recordImport.startsWith('.')) recordImport = `./${recordImport}`
      }
      const source = normalizePath(relative(workspaceRoot, filename))
      s.prepend(
        `import { recordPosition as _tracerRecordPosition } from ${JSON.stringify(recordImport)}\n`,
      )
      s.append(
        `\nfunction _tracer(line, column, vnode) { return _tracerRecordPosition(${JSON.stringify(source)}, line, column, vnode) }\n`,
      )
      return { code: s.toString(), map: s.generateMap({ hires: true }) }
    },
  }
}
