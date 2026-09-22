import { vTooltip } from 'floating-vue'
import { createApp, h } from 'vue'
import App from './App.vue'
import { router } from './router'
import 'floating-vue/dist/style.css'
import 'vue-virtual-scroller/index.css'
import 'uno.css'
import './style.css'

createApp({
  render: () => h(App),
  devtools: {
    hide: true,
  },
})
  .directive('tooltip', vTooltip)
  .use(router)
  .mount('#app')
