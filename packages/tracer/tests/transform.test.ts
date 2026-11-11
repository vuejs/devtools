import type { ViteDevServer } from 'vite'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import vue from '@vitejs/plugin-vue'
import { createServer, normalizePath } from 'vite'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { tracerTransform } from '../src'

const root = fileURLToPath(new URL('./fixtures', import.meta.url))
const clientSource = fileURLToPath(new URL('../src/client.ts', import.meta.url))
const compiled = new Map<string, string>()
const traced = new Map<string, string>()
let server: ViteDevServer

function createFixtureServer(fixtureRoot: string) {
  return createServer({
    configFile: false,
    root: fixtureRoot,
    appType: 'custom',
    server: { middlewareMode: true, watch: null },
    plugins: [
      vue(),
      {
        name: 'capture-compiled-fixture',
        enforce: 'post',
        resolveId(id) {
          if (id.endsWith('/dist/client.mjs')) return clientSource
        },
        transform(code, id) {
          if (!id.endsWith('.vue')) return
          if (id.endsWith('/AlreadyTraced.vue')) {
            const marked = `/* _tracer( already instrumented */\n${code}`
            compiled.set(id, marked)
            return marked
          }
          compiled.set(id, code)
        },
      },
      tracerTransform(),
      {
        name: 'capture-traced-fixture',
        enforce: 'post',
        transform(code, id) {
          if (id.endsWith('.vue')) traced.set(id, code)
        },
      },
    ],
  })
}

beforeAll(async () => {
  server = await createFixtureServer(root)
})

afterAll(async () => {
  await server?.close()
})

it.each([
  ['Branches.vue', ['section', 'p', 'p', 'ul', 'li']],
  ['Slots.vue', ['span', 'strong']],
  ['Static.vue', ['main', 'h1', 'p', 'p']],
] as const)(
  'maps %s elements to the original template lines and columns',
  async (filename, tags) => {
    await server.transformRequest(`/${filename}`)
    const id = normalizePath(`${root}/${filename}`)
    const source = await readFile(id, 'utf8')
    const result = traced.get(id)!
    expect(result).toBeDefined()

    let offset = 0
    for (const tag of tags) {
      const start = source.indexOf(`<${tag}`, offset)
      expect(start).toBeGreaterThanOrEqual(0)
      offset = start + tag.length + 1
      const lines = source.slice(0, start).split('\n')
      const line = lines.length
      const column = lines.at(-1)!.length
      expect(result).toMatch(
        new RegExp(
          `_tracer\\(${line},${column},\\s*_create(?:ElementVNode|ElementBlock)\\("${tag}"`,
        ),
      )
    }

    expect(result).toContain(
      `_tracerRecordPosition("packages/tracer/tests/fixtures/${filename}", line, column, vnode)`,
    )
    expect(result).not.toContain('data-v-inspector')
    expect(compiled.get(id)).toContain('_sfc_render(')
  },
)

it('keeps already instrumented modules unchanged', async () => {
  await server.transformRequest('/AlreadyTraced.vue')
  const id = normalizePath(`${root}/AlreadyTraced.vue`)
  expect(traced.get(id)).toBe(compiled.get(id))
  expect(traced.get(id)).not.toContain('_tracerRecordPosition')
})

it('does not instrument the SSR environment', async () => {
  const result = await server.environments.ssr!.transformRequest('/Branches.vue')
  expect(result?.code).not.toContain('_tracerRecordPosition')
})

it('resolves source paths from the app root’s workspace, independently of cwd', async () => {
  const appRoot = `${root}/monorepo/apps/demo`
  const appServer = await createFixtureServer(appRoot)
  try {
    await appServer.transformRequest('/App.vue')
    const result = traced.get(normalizePath(`${appRoot}/App.vue`))
    expect(result).toContain('_tracerRecordPosition("apps/demo/App.vue", line, column, vnode)')
  } finally {
    await appServer.close()
  }
})
