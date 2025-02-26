import type { UserConfig } from 'unocss'
import {
  presetIcons,
  presetUno,
  transformerDirectives,
  transformerVariantGroup,
} from 'unocss'
import { theme } from './theme'

export const unoConfig = {
  presets: [
    presetUno(),
    presetIcons({
      prefix: ['i-'],
      scale: 1.2,
      extraProperties: {
        'display': 'inline-block',
        'vertical-align': 'middle',
      },
    }),
  ],
  transformers: [transformerVariantGroup(), transformerDirectives()],
  theme,
  variants: [
    (matcher) => {
      const prefix = 'not-action:'
      if (!matcher.startsWith(prefix))
        return matcher
      return {
        matcher: matcher.slice(prefix.length),
        selector: s => `${s}:not(:hover):not(:focus):not(:active)`,
      }
    },
  ],
  shortcuts: {
    // utilities
    '$ui-fcc': 'flex justify-center items-center',
    '$ui-fbc': 'flex justify-between items-center',
    '$ui-fsc': 'flex justify-start items-center',
    '$ui-if-sc': 'inline-flex justify-start items-center',
    '$ui-fec': 'flex justify-end items-center',
    '$ui-inline-fcc': 'inline-flex justify-center items-center',
    '$ui-z-max': 'z-2147483646',
    '$ui-z-max-override': 'z-2147483647',

    // general
    '$ui-bg-base': 'bg-white dark:bg-#121212',
    '$ui-base': 'box-border font-inherit',
    '$ui-transition': 'transition-all duration-300 ease-in-out',
    '$ui-borderless': '!border-transparent !shadow-none',
    '$ui-base-br': 'rounded-3px',
    '$ui-border-base': 'border-gray/20',
    '$ui-text': 'text-black dark:text-#dfe0e2',
    '$ui-glass-effect': 'backdrop-blur-6 bg-white/80 dark:bg-#3C3C3C/90',
  },
  rules: [
    ['$ui-font-inherit', { 'font-family': 'inherit' }],
    [
      // the animation of dark toggle button
      /^\$ui-dark-toggle-vtr$/,
      () => {
        return `
          ::view-transition-old(root),
          ::view-transition-new(root) {
            animation: none;
            mix-blend-mode: normal;
          }

          ::view-transition-old(root),
          .dark::view-transition-new(root) {
            z-index: 1;
          }

          ::view-transition-new(root),
          .dark::view-transition-old(root) {
            z-index: 9999;
          }
        `
      },
    ],
  ],
} as UserConfig
