import { devtools } from '@vue/devtools'
import { createApp } from 'vue'
import App from './App.vue'

devtools.connect('http://localhost', 8098)

createApp(App).mount('#app')
