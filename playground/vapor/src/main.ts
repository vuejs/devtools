import { createApp, createVaporApp, vaporInteropPlugin } from 'vue'
import VaporApp from './VaporApp.vue'
import InteropApp from './interop/InteropApp.vue'
import '@antfu/design/styles.css'
import '@unocss/reset/tailwind.css'
import 'uno.css'

// Pure Vapor tree: no VDOM instances, components render into `block`s.
createVaporApp(VaporApp).mount('#vapor-app')

// VDOM root mixing in Vapor components (and VDOM components below them).
createApp(InteropApp).use(vaporInteropPlugin).mount('#interop-app')
