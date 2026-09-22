import { defineConfig, presetAttributify, presetIcons, presetUno } from 'unocss'

export default defineConfig({
  shortcuts: {
    'border-base': 'border-color-$vp-c-divider',
    'text-brand': 'color-$vp-c-brand-1',
    'text-brand-yellow': 'color-$vp-c-yellow-1',
    'text-brand-red': 'color-$vp-c-red-1',
  },
  blocklist: ['container'],
  presets: [presetUno(), presetAttributify(), presetIcons()],
  safelist: ['font-mono', 'mb0!', 'no-underline!'],
})
