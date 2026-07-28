import type { Plugin } from 'vite'
import { describe, expect, it } from 'vitest'
import VitePluginVueDevTools from '../src/vite'

function getPlugin(options: Parameters<typeof VitePluginVueDevTools>[0]) {
  const plugins = VitePluginVueDevTools(options) as Plugin[]
  const plugin = plugins.find(plugin => plugin && typeof plugin === 'object' && plugin.name === 'vite-plugin-vue-devtools')

  if (!plugin || typeof plugin.transform !== 'function')
    throw new Error('Expected vite-plugin-vue-devtools transform hook')

  return plugin
}

function transform(plugin: Plugin, id: string) {
  const code = 'createApp(App).mount("#app")'
  const result = plugin.transform!.call(plugin, code, id, {})

  return typeof result === 'string' ? result : code
}

describe('appendTo', () => {
  it('matches any configured entry file', () => {
    const plugin = getPlugin({
      appendTo: [
        'resources/js/app.js',
        'resources/js/admin.js',
      ],
    })

    expect(transform(plugin, '/project/resources/js/app.js')).toContain('virtual:vue-devtools-path:overlay.js')
    expect(transform(plugin, '/project/resources/js/app.js')).toContain('virtual:vue-inspector-path:load.js')
    expect(transform(plugin, '/project/resources/js/admin.js')).toContain('virtual:vue-devtools-path:overlay.js')
    expect(transform(plugin, '/project/resources/js/other.js')).toBe('createApp(App).mount("#app")')
  })

  it('keeps inspector injection disabled when component inspector is off', () => {
    const plugin = getPlugin({
      appendTo: ['resources/js/app.js'],
      componentInspector: false,
    })

    const result = transform(plugin, '/project/resources/js/app.js')

    expect(result).toContain('virtual:vue-devtools-path:overlay.js')
    expect(result).not.toContain('virtual:vue-inspector-path:load.js')
  })
})
