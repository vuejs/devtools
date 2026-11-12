import type { Plugin, ResolvedConfig } from 'vite'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import vue from '@vitejs/plugin-vue'
import { build, createServer } from 'vite'
import { expect, it } from 'vitest'
import VueTracer from '../src'
import { vaporTransform } from '../src/vapor'

const root = fileURLToPath(new URL('./fixtures', import.meta.url))
const filename = `${root}/Vapor.vue`
const compiler = createRequire(new URL('../../../playground/vapor/package.json', import.meta.url))(
  'vue/compiler-sfc',
)

async function setup(options = {}, vueOptions = {}, command = 'serve') {
  const files = new Set<string>()
  const plugin = vaporTransform(options, files)
  const config = plugin.configResolved as (config: ResolvedConfig) => void
  config({
    root,
    command,
    plugins: [{ name: 'vite:vue', api: { options: vueOptions } }],
  } as unknown as ResolvedConfig)
  const transform = plugin.transform as (code: string, id: string) => { code: string } | undefined
  return { plugin, files, transform }
}

it.each([
  '<script setup vapor></script>',
  '<script vapor>export default {}</script>',
  '<template vapor><div/></template>',
])('recognizes Vapor marker %s with original line and column', async (marker) => {
  const { transform } = await setup()
  const code = marker.startsWith('<template')
    ? marker
    : `${marker}\n<template><div/><span/></template>`
  const result = transform(code, filename)!.code
  for (const tag of marker.startsWith('<template') ? ['div'] : ['div', 'span']) {
    const offset = code.indexOf(`<${tag}`)
    const lines = code.slice(0, offset).split('\n')
    expect(result).toContain(`Vapor.vue:${lines.length}:${lines.at(-1)!.length}`)
  }
  expect(transform(result, filename)).toBeUndefined()
})

it('skips components, template, slot, custom elements and unsupported templates', async () => {
  const { transform, files } = await setup(
    {},
    { template: { compilerOptions: { isCustomElement: (tag: string) => tag === 'custom' } } },
  )
  const code =
    '<script setup vapor></script><template><div><Foo/><template v-if="true"><span/></template><slot/><custom/><my-widget/></div></template>'
  const output = transform(code, filename)!.code
  expect(output.match(/data-v-source=/g)).toHaveLength(2)
  expect(files.has(filename)).toBe(true)
  for (const source of [
    '<template><div/></template>',
    '<script setup vapor></script><template src="./other.html"/>',
    '<script setup vapor></script><template lang="pug">div</template>',
  ]) {
    expect(transform(source, filename)).toBeUndefined()
    expect(files.has(filename)).toBe(false)
  }
})

it('supports global Vapor, escapes paths, and excludes raw and block requests', async () => {
  const { transform } = await setup()
  const code = '<template><div/></template>'
  expect(transform('<template vapor><div/></template>', `${root}/a&"b.vue`)!.code).toContain(
    'a&amp;&quot;b.vue:1:16',
  )
  for (const query of ['raw', 'url', 'type=style', 'type=script', 'type=template'])
    expect(transform(code, `${filename}?${query}`)).toBeUndefined()
  const forced = await setup({}, { features: { vapor: true } })
  expect(forced.transform(code, filename)?.code).toContain('data-v-source')
  expect(forced.transform('<script>export default {}</script>' + code, filename)).toBeUndefined()
})

it('does not instrument when disabled', async () => {
  const { transform } = await setup({ enabled: false })
  expect(transform('<template vapor><div/></template>', filename)).toBeUndefined()
})

it.each([true, false])(
  'compiles real Vapor for client and SSR with runtime resolution=%s',
  async (resolveRecordEntryPath) => {
    const server = await createServer({
      configFile: false,
      root,
      appType: 'custom',
      server: { middlewareMode: true, watch: null, hmr: false },
      plugins: [
        vue({ compiler }),
        VueTracer({ resolveRecordEntryPath }),
        VueTracer({ resolveRecordEntryPath }),
      ] as Plugin[],
    })
    try {
      for (const environment of [server.environments.client, server.environments.ssr]) {
        const result = await environment!.transformRequest('/Vapor.vue')
        expect(result?.code).toContain('data-v-source')
        expect(result?.code).toContain('Vapor.vue:5:2')
        expect(result?.code.match(/vue-devtools:vapor-runtime/g)).toHaveLength(1)
        expect(result?.code).not.toContain('_tracer(')
      }
    } finally {
      await server.close()
    }
  },
)

it('does not inject Vapor attributes, VNode records or runtime imports during build', async () => {
  const result = await build({
    configFile: false,
    root,
    logLevel: 'silent',
    plugins: [vue({ compiler }), VueTracer({ enabled: true })],
    build: {
      write: false,
      minify: false,
      sourcemap: false,
      lib: { entry: [filename, `${root}/Static.vue`], formats: ['es'] },
      rolldownOptions: { external: ['vue'] },
    },
  })
  const outputs = Array.isArray(result) ? result : [result]
  const code = outputs
    .flatMap((output) => ('output' in output ? output.output : []))
    .map((output) => (output.type === 'chunk' ? output.code : ''))
    .join('\n')
  expect(code).not.toContain('data-v-source')
  expect(code).not.toContain('_tracer(')
  expect(code).not.toContain('recordPosition')
  expect(code).not.toContain('__VUE_DEVTOOLS_TRACER__')
  expect(code).not.toContain('@vue/devtools-tracer')
  expect(code).not.toContain('vue-devtools:vapor-runtime')
})
