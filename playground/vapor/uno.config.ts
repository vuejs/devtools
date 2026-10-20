import { presetAnthonyDesign } from '@antfu/design/unocss'
import transformerDirectives from '@unocss/transformer-directives'
import { defineConfig, presetWind3 } from 'unocss'

export default defineConfig({
  shortcuts: {
    card: 'flex flex-col gap-2 mb-3 p-3 border border-base rounded-md bg-base',
    'card-title': 'text-sm color-base font-600',
    'section-title': 'mb-3 text-sm color-active font-600',
  },
  presets: [
    presetAnthonyDesign({
      primary: '#42b883',
      darkBackground: '#111',
    }),
    presetWind3({
      variablePrefix: 'vdt-',
    }),
  ],
  transformers: [transformerDirectives()],
})
