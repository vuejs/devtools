import type { Plugin } from 'vite'
import type { VueTracerOptions } from './options'
import { relative } from 'node:path'
import MagicString from 'magic-string'
import { normalizePath, searchForWorkspaceRoot } from 'vite'
import { parse } from 'vue/compiler-sfc'

const attribute = 'data-v-source'

export function vaporTransform(options: VueTracerOptions, vaporFiles: Set<string>): Plugin {
  let workspaceRoot = ''
  let forceVapor = false
  let isCustomElement: ((tag: string) => boolean) | undefined

  return {
    name: 'vue-devtools:tracer-vapor',
    enforce: 'pre',
    apply: 'serve',
    configResolved(config) {
      workspaceRoot = searchForWorkspaceRoot(config.root)
      const vue = config.plugins.find((plugin) => plugin.name === 'vite:vue')
      forceVapor = !!vue?.api?.options?.features?.vapor
      isCustomElement = vue?.api?.options?.template?.compilerOptions?.isCustomElement
    },
    transform(code, id) {
      if (options.enabled === false) return
      const [filename, query] = id.split('?', 2)
      if (!filename?.endsWith('.vue')) return
      const params = new URLSearchParams(query)
      if (params.has('raw') || params.has('url') || params.has('type')) return
      const { descriptor } = parse(code, {
        filename,
        ignoreEmpty: false,
        templateParseOptions: { isCustomElement },
      })
      const template = descriptor.template
      const vapor =
        [descriptor.script, descriptor.scriptSetup, template].some(
          (block) => block && 'vapor' in block.attrs,
        ) ||
        (forceVapor && (!!descriptor.scriptSetup || !descriptor.script))
      const supported =
        vapor && !!template && !template.src && (!template.lang || template.lang === 'html')
      if (!supported || !template?.ast) {
        vaporFiles.delete(filename)
        return
      }
      vaporFiles.add(filename)
      const source = normalizePath(relative(workspaceRoot, filename))
      const s = new MagicString(code)
      type Root = NonNullable<NonNullable<typeof template>['ast']>
      function visit(node: Root | Root['children'][number]) {
        if (!node) return
        if (
          node.type === 1 &&
          node.tagType === 0 &&
          !['template', 'slot', 'script', 'style'].includes(node.tag) &&
          !isCustomElement?.(node.tag) &&
          !node.tag.includes('-')
        ) {
          if (!node.props.some((prop) => prop.type === 6 && prop.name === attribute)) {
            const { line, column, offset } = node.loc.start
            const value = `${source}:${line}:${column - 1}`
              .replace(/&/g, '&amp;')
              .replace(/"/g, '&quot;')
              .replace(/</g, '&lt;')
              .replace(/>/g, '&gt;')
            s.appendLeft(offset + node.tag.length + 1, ` ${attribute}="${value}"`)
          }
        }
        if (node.type === 0 || node.type === 1) for (const child of node.children) visit(child)
      }
      visit(template.ast)
      if (!s.hasChanged()) return
      return { code: s.toString(), map: s.generateMap({ hires: true }) }
    },
    watchChange(id, change) {
      if (change.event === 'delete') vaporFiles.delete(id)
    },
  }
}
