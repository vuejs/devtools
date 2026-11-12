import type { ViteDevServer } from 'vite'
import type { VueTracerOptions } from '../src'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import vue from '@vitejs/plugin-vue'
import { build, createServer, normalizePath } from 'vite'
import { afterAll, beforeAll, expect, it, vi } from 'vitest'
import VueTracer, { tracerTransform } from '../src'

const root = fileURLToPath(new URL('./fixtures', import.meta.url))
const clientSource = fileURLToPath(new URL('../src/client.ts', import.meta.url))
const compiled = new Map<string, string>()
const traced = new Map<string, string>()
let server: ViteDevServer

function createFixtureServer(fixtureRoot: string, options?: VueTracerOptions, duplicate = false) {
  return createServer({
    configFile: false,
    root: fixtureRoot,
    appType: 'custom',
    server: { middlewareMode: true, watch: null, hmr: false },
    resolve: { alias: { '@vue/devtools-tracer/client/record': clientSource } },
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
      tracerTransform(options),
      duplicate && VueTracer(options),
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

it.each([false, 'prod'] as const)(
  'does not trace dev modules when enabled is %s',
  async (enabled) => {
    const fixtureServer = await createFixtureServer(root, { enabled })
    try {
      const result = await fixtureServer.transformRequest('/Branches.vue')
      expect(result?.code).not.toContain('_tracerRecordPosition')
    } finally {
      await fixtureServer.close()
    }
  },
)

it('instruments only once with multiple tracer instances', async () => {
  const fixtureServer = await createFixtureServer(root, {}, true)
  try {
    await fixtureServer.transformRequest('/Branches.vue')
    const result = traced.get(normalizePath(`${root}/Branches.vue`))!
    expect(result.match(/function _tracer\(/g)).toHaveLength(1)
    expect(result.match(/import \{ recordPosition/g)).toHaveLength(1)
  } finally {
    await fixtureServer.close()
  }
})

it('keeps the public record specifier when path resolution is disabled', async () => {
  const fixtureServer = await createFixtureServer(root, { resolveRecordEntryPath: false })
  try {
    await fixtureServer.transformRequest('/Branches.vue')
    expect(traced.get(normalizePath(`${root}/Branches.vue`))).toContain(
      'from "@vue/devtools-tracer/client/record"',
    )
  } finally {
    await fixtureServer.close()
  }
})

it.each([
  ['dev', false],
  ['prod', true],
  [true, true],
] as const)('honors enabled=%s during a production build', async (enabled, expected) => {
  vi.stubEnv('NODE_ENV', 'production')
  const result = await build({
    configFile: false,
    root,
    logLevel: 'silent',
    plugins: [vue(), VueTracer({ enabled })],
    build: {
      write: false,
      sourcemap: true,
      minify: false,
      lib: { entry: `${root}/Static.vue`, formats: ['es'] },
      rolldownOptions: { external: ['vue'] },
    },
  })
  const outputs = Array.isArray(result) ? result : [result]
  const code = outputs
    .flatMap((output) => ('output' in output ? output.output : []))
    .map((output) => (output.type === 'chunk' ? output.code : ''))
    .join('\n')
  expect(code.includes('recordPosition('), code).toBe(expected)
  expect(code.includes('__vue_tracer__')).toBe(expected)
})
