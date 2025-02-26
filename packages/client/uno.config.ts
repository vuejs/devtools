import { unoConfig } from '@vue/devtools-ui/theme'
import { defineConfig, mergeConfigs, presetAttributify, presetWebFonts } from 'unocss'

export default defineConfig(mergeConfigs([unoConfig, {
  rules: [
    /**
     * Credit to Nanda Syahrasyad (https://github.com/narendrasss)
     *
     * - https://github.com/narendrasss/NotANumber
     * - https://www.nan.fyi/grid.svg
     * - https://www.nan.fyi/grid-dark.svg
     */
    ['panel-grids-light', {
      'background-image': 'url("data:image/svg+xml,%0A%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'20\' height=\'20\' transform=\'scale(3)\'%3E%3Crect x=\'0\' y=\'0\' width=\'100%25\' height=\'100%25\' fill=\'white\'/%3E%3Cpath d=\'M 10,-2.55e-7 V 20 Z M -1.1677362e-8,10 H 20 Z\' stroke-width=\'0.2\' stroke=\'hsla(0, 0%25, 98%25, 1)\' fill=\'none\'/%3E%3C/svg%3E")',
      'background-size': '40px 40px',
    }],
    ['panel-grids-dark', {
      'background-image': `url("data:image/svg+xml,%0A%3Csvg xmlns='http://www.w3.org/2000/svg' width='20' height='20' transform='scale(3)'%3E%3Crect x='0' y='0' width='100%25' height='100%25' fill='${encodeURIComponent('#121212')}'/%3E%3Cpath d='M 10,-2.55e-7 V 20 Z M -1.1677362e-8,10 H 20 Z' stroke-width='0.2' stroke='${encodeURIComponent('#121212')}' fill='none'/%3E%3C/svg%3E");`,
      'background-size': '40px 40px',
    }],
  ],
  theme: {
    fontFamily: {
      'data-field': 'Roboto Mono, Menlo, Consolas, monospace',
    },
  },
  variants: [
    // @children:[span]:bg-red => .@children\:\[span\]\:bg-red > span { bg-red }
    (input: string) => {
      const prefix = '@children:'
      const reg = /(@children:)\[(.*)\]:(.*)$/
      if (input.startsWith(prefix)) {
        return {
          matcher: input.replace(reg, '$3'),
          selector: s => `${s} > ${input.replace(reg, '$2')}`,
        }
      }
    },
    {
      name: '@active',
      match(matcher) {
        if (!matcher.startsWith('@active'))
          return matcher

        return {
          matcher: matcher.slice(8),
          selector: s => `${s}.active`,
        }
      },
    },
  ],
  shortcuts: [{
    // general
    'bg-base': 'bg-white dark:bg-#121212',
    'text-base': 'text-black dark:text-#dfe0e2',
    'bg-active': 'bg-gray:5',
    'border-base': 'border-gray/20',
    'navbar-base': 'border-b border-base h-50px',
    'transition-base': 'transition-all duration-200',

    'x-divider': 'h-1px w-full bg-gray/15',

    // glass
    'glass-effect': 'backdrop-blur-6 bg-white/80 dark:bg-#121212/90',
    'navbar-glass': 'sticky z-10 top-0 glass-effect',

    // code
    'code-block': 'dark:bg-#121212 bg-white',

    // panel grids
    'panel-grids': 'panel-grids-light dark:panel-grids-dark',
    'panel-grids-center': 'panel-grids flex flex-col h-full gap-2 items-center justify-center',

    'selectable-item': 'flex items-center px-2 py-1 rounded cursor-pointer hover:bg-primary-200 dark:(hover:bg-gray-800) @active:(text-white bg-primary-600 hover:(text-white bg-primary-600))',
    'selectable-item-label': 'text-truncate',

    // component state
    'state-key': 'text-purple-700 dark:text-purple-300',
    'colon': 'text-#444 dark:(text-white)',
    'state-value': 'text-#444 dark:(text-#bdc6cf)',
    'state-value-label': 'text-gray-500',
    'state-value-literal': 'text-#03c dark:(text-#997fff)',
    'state-value-string': 'text-#FFB980',
  }, [/^theme-card-(\w+)$/, $ => `p2 flex gap2 border border-base bg-base items-center rounded min-w-40 min-h-25 justify-center transition-all saturate-0 op50 shadow hover:(op100 bg-${$[1]}/10 text-${$[1]}6 saturate-100)`]],
  presets: [
    presetAttributify(),
    presetWebFonts({
      fonts: {
        sans: 'DM Sans',
        mono: 'DM Mono',
        stylish: 'Caveat',
      },
    }),
  ],
  safelist: [
    'state-value-literal',
    'state-value-string',
    'i-carbon-ibm-watson-discovery',
  ],
}]))
