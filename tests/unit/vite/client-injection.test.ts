import type { Plugin } from 'vite'
import { describe, expect, it } from 'vitest'
import { createVueDevToolsClientInjectionPlugin } from '../../../packages/vite/src/client-injection'
import { RESOLVED_CLIENT_MODULE_ID } from '../../../packages/vite/src/constants'

const SOURCE = 'export const app = true\n'

describe('Vue DevTools client injection', () => {
  it.each([
    ['string', 'src/main.ts'],
    ['regexp', /src\/main\.ts$/],
    ['array string', ['src/entry.ts', 'src/main.ts']],
    ['array regexp', [/src\/entry\.ts$/, /src\/main\.ts$/]],
  ])('injects when an appendTo %s target matches', (_label, appendTo) => {
    const result = transform(appendTo, SOURCE, '/project/src/main.ts?vue&type=script')

    expect(result).toContain("import 'virtual:vue-devtools-client'")
  })

  it('injects at most once when multiple targets match', () => {
    const appendTo = ['src/main.ts', /main\.ts$/]
    const first = transform(appendTo, SOURCE, '/project/src/main.ts')
    const second = transform(appendTo, first!, '/project/src/main.ts')

    expect(first?.match(/virtual:vue-devtools-client/g)).toHaveLength(1)
    expect(second).toBeUndefined()
  })

  it('does not keep state between transforms for global regexps', () => {
    const appendTo = /src\/main\.ts$/g

    expect(transform(appendTo, SOURCE, '/one/src/main.ts')).toBeDefined()
    expect(transform(appendTo, SOURCE, '/two/src/main.ts')).toBeDefined()
  })

  it('does not inject unmatched or SSR modules', () => {
    expect(transform('src/main.ts', SOURCE, '/project/src/other.ts')).toBeUndefined()
    expect(transform('src/main.ts', SOURCE, '/project/src/main.ts', true)).toBeUndefined()
  })

  it('issue-1057: does not subscribe to or parse unrelated HMR messages', () => {
    const module = loadClientModule()

    expect(module).toContain('import.meta.hot.accept()')
    expect(module).toContain('import.meta.hot.dispose(disposeVueDevTools)')
    expect(module).not.toContain('import.meta.hot.on(')
    expect(module).not.toContain('JSON.parse(')
    expect(module).not.toContain('vite-hot-client')
  })
})

function transform(
  appendTo: string | RegExp | Array<string | RegExp>,
  code: string,
  id: string,
  ssr = false,
): string | undefined {
  const plugin = createVueDevToolsClientInjectionPlugin({ appendTo }, { enabled: true }) as Plugin
  const hook = plugin.transform
  if (typeof hook !== 'function') throw new TypeError('Expected a transform hook')

  const runTransform = hook as unknown as (
    code: string,
    id: string,
    options: { moduleType: 'js'; ssr: boolean },
  ) => string | undefined
  return runTransform(code, id, { moduleType: 'js', ssr })
}

function loadClientModule(): string {
  const plugin = createVueDevToolsClientInjectionPlugin({}, { enabled: true }) as Plugin
  const hook = plugin.load
  if (typeof hook !== 'function') throw new TypeError('Expected a load hook')

  return (hook as unknown as (id: string) => string)(RESOLVED_CLIENT_MODULE_ID)
}
