import type { Plugin } from 'vite'
import type { ResolvedClientOptions, VitePluginVueDevToolsOptions } from './options'
import { fileURLToPath } from 'node:url'
import { normalizePath } from 'vite'
import { CLIENT_IMPORT_ID, CLIENT_MODULE_ID, RESOLVED_CLIENT_MODULE_ID } from './constants'

const CLIENT_INJECTION_MARKER = '/* vue-devtools:client-injection */'

export function createVueDevToolsClientInjectionPlugin(
  options: VitePluginVueDevToolsOptions,
  clientOptions: ResolvedClientOptions,
): Plugin {
  const pluginImporter = normalizePath(fileURLToPath(import.meta.url))
  const injectionMatchers = resolveInjectionMatchers(options.appendTo)

  return {
    name: 'vue-devtools:client-injection',
    enforce: 'pre',
    apply: 'serve',
    async resolveId(importee, importer) {
      if (importee === CLIENT_MODULE_ID) return RESOLVED_CLIENT_MODULE_ID

      if (importee === CLIENT_IMPORT_ID && importer === RESOLVED_CLIENT_MODULE_ID) {
        return await this.resolve(importee, pluginImporter, { skipSelf: true })
      }
    },
    load(id) {
      if (id === RESOLVED_CLIENT_MODULE_ID) return createClientModule(clientOptions)
    },
    transform(code, id, transformOptions) {
      if (transformOptions?.ssr) return

      if (!injectionMatchers.length) return

      const [filename] = id.split('?', 2)
      if (!matchesModule(filename, injectionMatchers) || code.includes(CLIENT_INJECTION_MARKER))
        return

      return `${CLIENT_INJECTION_MARKER}\nimport '${CLIENT_MODULE_ID}';\n${code}`
    },
    transformIndexHtml: {
      order: 'pre',
      handler() {
        if (injectionMatchers.length) return

        return [
          {
            tag: 'script',
            injectTo: 'head-prepend',
            attrs: {
              type: 'module',
            },
            children: `import ${JSON.stringify(CLIENT_MODULE_ID)}`,
          },
        ]
      },
    },
  }
}

function resolveInjectionMatchers(
  appendTo: VitePluginVueDevToolsOptions['appendTo'],
): Array<string | RegExp> {
  if (!appendTo) return []
  return Array.isArray(appendTo) ? appendTo : [appendTo]
}

function matchesModule(filename: string, matchers: Array<string | RegExp>): boolean {
  return matchers.some((matcher) => {
    if (typeof matcher === 'string') return filename.endsWith(matcher)

    matcher.lastIndex = 0
    return matcher.test(filename)
  })
}

function createClientModule(options: ResolvedClientOptions): string {
  return `
import { disposeVueDevTools, installVueDevTools } from '${CLIENT_IMPORT_ID}'

installVueDevTools(${JSON.stringify(options)})

if (import.meta.hot) {
  import.meta.hot.accept()
  import.meta.hot.dispose(disposeVueDevTools)
}
`.trimStart()
}
