// No need to import "uno.css" to generate a css bundle file
// cause users will use UnoCSS to handle css fragment classes.
import { vTooltip } from 'floating-vue'
// Still provide a css bundle file for users who don't want to use UnoCSS.
import '@unocss/reset/tailwind.css'

import 'uno.css'
import 'floating-vue/dist/style.css'

export * from './components'
export * from './composables'
export * from './types'

export {
  vTooltip,
}
