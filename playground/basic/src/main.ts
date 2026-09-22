import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import { router } from './router'
import '@antfu/design/styles.css'
import '@unocss/reset/tailwind.css'
import 'uno.css'
import './style.css'

document.documentElement.classList.add('dark')

createApp(App).use(createPinia()).use(router).mount('#app')
