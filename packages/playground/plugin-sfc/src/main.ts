import { addCustomTab } from '@vue/devtools-kit'
import { createApp } from 'vue'
import App from './App.vue'
import countSFC from './count.vue?raw'

const app = createApp(App)
app.mount('#app')

setTimeout(() => {
  addCustomTab({
    name: 'plugin_count',
    title: 'Plugin Count',
    icon: 'baseline-exposure-plus-1',
    view: {
      type: 'sfc',
      sfc: countSFC,
    },
    category: 'app',
  })
}, 2000)
