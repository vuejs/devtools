import type { PluginWithDevTools } from '@vitejs/devtools-kit'
import type { Plugin } from 'vite'
import type { VueTracerOptions } from './options'
import { fileURLToPath } from 'node:url'

const registeredDocks = new WeakSet<object>()

export function tracerDevTools(
  options: Pick<VueTracerOptions, 'onPick'> = {},
): Plugin & Pick<PluginWithDevTools, 'devtools'> {
  const onPick = options.onPick === 'none' ? 'none' : 'open-in-editor'
  const clientModule = `@vue/devtools-tracer/virtual-devtools?onPick=${onPick}`
  const resolvedClientModule = `\0${clientModule}`
  return {
    name: 'vue-devtools:tracer-devtools',
    resolveId: {
      order: 'pre',
      handler(id) {
        if (id === clientModule) return resolvedClientModule
      },
    },
    load(id) {
      if (id !== resolvedClientModule) return
      const entry = fileURLToPath(import.meta.resolve('@vue/devtools-tracer/client/vite-devtools'))
      return `import { createClientScriptSetup } from ${JSON.stringify(entry)};\nexport default createClientScriptSetup(${JSON.stringify({ onPick })});`
    },
    devtools: {
      setup(ctx) {
        if (registeredDocks.has(ctx.docks)) return
        registeredDocks.add(ctx.docks)
        const id = 'vue-tracer'
        ctx.docks.register({
          id,
          title: 'Inspect Vue component',
          description:
            onPick === 'none'
              ? 'Pick an element on the page to inspect its Vue component'
              : 'Pick an element on the page to open its Vue component in the editor',
          icon: 'ph:crosshair-simple-duotone',
          type: 'action',
          toggle: true,
          action: { importFrom: clientModule },
        })
        ctx.commands?.register({
          id: 'vue-tracer:toggle-inspector',
          title: 'Toggle Vue component inspector',
          icon: 'ph:crosshair-simple-duotone',
          keybindings: [{ key: 'Mod+Shift+X' }],
          handler: () => ctx.docks.activate(id),
        })
      },
    },
  }
}
