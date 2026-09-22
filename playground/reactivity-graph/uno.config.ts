import { presetAnthonyDesign } from '@antfu/design/unocss'
import transformerDirectives from '@unocss/transformer-directives'
import { defineConfig, presetIcons, presetWind3 } from 'unocss'

export default defineConfig({
  shortcuts: {
    'panel-heading': 'text-sm color-base font-600',
    'panel-subtitle': 'text-xs color-muted',
    'divide-base': 'divide-#8882',
    'z-graph-link': 'z-10',
    'z-graph-node': 'z-11',
    'z-nav': 'z-30',
    'z-dropdown': 'z-40',
    'z-tooltip': 'z-45',
    'z-toast': 'z-50',
    'z-modal-backdrop': 'z-60',
    'z-modal-content': 'z-70',
    'z-drawer-backdrop': 'z-80',
    'z-drawer-content': 'z-90',
  },
  presets: [
    presetAnthonyDesign({
      primary: '#42b883',
      darkBackground: '#111',
    }),
    presetWind3({
      variablePrefix: 'vdt-',
    }),
    presetIcons(),
  ],
  transformers: [transformerDirectives()],
})
