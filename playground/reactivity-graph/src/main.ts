import { createApp } from 'vue'
import App from './App.vue'
import '@antfu/design/styles.css'
import '@unocss/reset/tailwind.css'
import 'uno.css'
import './style.css'

document.documentElement.classList.add('dark')

createApp(App).mount('#app')
