import { presetAnthonyDesign } from '@antfu/design/unocss'
import { defineConfig, presetWind3 } from 'unocss'

export default defineConfig({
  presets: [
    presetAnthonyDesign({ primary: '#42b883', darkBackground: '#111' }),
    presetWind3({ variablePrefix: 'vdt-' }),
  ],
})
