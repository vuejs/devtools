import type { PluginWithDevTools } from '@vitejs/devtools-kit'

export function tracerDevTools() {
  return {
    name: 'vue-devtools:tracer-devtools',
    apply: 'serve',
    devtools: {
      setup(ctx) {
        const id = 'vue-tracer'
        ctx.docks.register({
          id,
          title: 'Inspect Vue element',
          icon: 'ph:crosshair-simple-duotone',
          type: 'action',
          toggle: true,
          action: { importFrom: '@vue/devtools-tracer/client/devtools' },
        })
        ctx.commands.register({
          id: 'vue-tracer:toggle-inspector',
          title: 'Pick Vue element',
          icon: 'ph:crosshair-simple-duotone',
          keybindings: [{ key: 'Mod+Shift+X' }],
          handler: () => ctx.docks.activate(id),
        })
      },
    },
  } satisfies PluginWithDevTools
}
