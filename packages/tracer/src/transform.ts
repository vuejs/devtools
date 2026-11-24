import type { Plugin } from 'vite'
import type { VueTracerOptions } from './options'
import type { RawSourceMap } from 'source-map-js'
import { dirname, isAbsolute, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { walk } from 'estree-walker'
import MagicString from 'magic-string'
import { SourceMapConsumer } from 'source-map-js'
import { normalizePath, searchForWorkspaceRoot } from 'vite'
import { vaporTransform } from './vapor'

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
  return createPostTransform(options)
}

export function createTracerTransforms(options: VueTracerOptions): [Plugin, Plugin] {
  const vaporFiles = new Set<string>()
  return [vaporTransform(options, vaporFiles), createPostTransform(options, vaporFiles)]
}

function createPostTransform(options: VueTracerOptions, vaporFiles?: Set<string>): Plugin {
  const { resolveRecordEntryPath = true } = options
  let workspaceRoot: string
  const recordPath = fileURLToPath(import.meta.resolve('@vue/devtools-tracer/client'))

  return {
    name: 'vue-devtools:tracer-transform',
    enforce: 'post',
    apply: 'serve',
    configResolved(config) {
      workspaceRoot = searchForWorkspaceRoot(config.root)
    },
    transform(code, id) {
      if (options.enabled === false) return
      // Virtual modules have no filesystem directory to resolve a relative import from.
      const filename = id.split('?')[0]!
      let recordImport = resolveRecordEntryPath
        ? normalizePath(recordPath)
        : '@vue/devtools-tracer/client/record'
      if (resolveRecordEntryPath && isAbsolute(filename)) {
        const relativePath = relative(dirname(filename), recordPath)
        // Windows paths on different drives have no relative form; keep the absolute path.
        if (!isAbsolute(relativePath)) {
          recordImport = normalizePath(relativePath)
          if (!recordImport.startsWith('.')) recordImport = `./${recordImport}`
        }
      }
      const query = new URLSearchParams(id.split('?')[1])
      if (query.has('raw') || query.has('url')) return
      if (vaporFiles?.has(filename) && !query.has('type')) {
        if (code.includes('/* vue-devtools:vapor-runtime */')) return
        const s = new MagicString(code)
        s.prepend(`/* vue-devtools:vapor-runtime */\nimport ${JSON.stringify(recordImport)};\n`)
        return { code: s.toString(), map: s.generateMap({ hires: true }) }
      }
      if (this.environment.name !== 'client') return
      if (!code.includes('_sfc_render(') || !testRe.test(code)) return
      if (code.includes('_tracer(')) return

      const consumer = new SourceMapConsumer(this.getCombinedSourcemap() as unknown as RawSourceMap)
      const s = new MagicString(code)
      const ast = this.parse(code)
      let hit = false
      const lineStarts = getLineStarts(code)

      // Vite 8's Oxc AST is ESTree-compatible for these call expressions.
      walk(ast as unknown as Parameters<typeof walk>[0], {
        enter(node) {
          if (node.type !== 'CallExpression' || node.callee.type !== 'Identifier') return
          if (!functions.includes(node.callee.name)) return

          const { start, end } = node as typeof node & { start: number; end: number }
          const lineIndex = findLineIndex(lineStarts, start)
          const original = consumer.originalPositionFor({
            line: lineIndex + 1,
            column: start - lineStarts[lineIndex]!,
          })
          if (original.source === null || original.line === null || original.column === null) return

          hit = true
          s.appendLeft(start, `_tracer(${original.line},${original.column},`)
          s.appendRight(end, ')')
        },
      })
      if (!hit) return

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

/** Offsets of each line's first character, matching source map lines split on `\n`. */
function getLineStarts(code: string): number[] {
  const starts = [0]
  for (let index = code.indexOf('\n'); index !== -1; index = code.indexOf('\n', index + 1))
    starts.push(index + 1)
  return starts
}

function findLineIndex(lineStarts: number[], offset: number): number {
  let low = 0
  let high = lineStarts.length - 1
  while (low < high) {
    const middle = (low + high + 1) >> 1
    if (lineStarts[middle]! <= offset) low = middle
    else high = middle - 1
  }
  return low
}
