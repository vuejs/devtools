import Tres from '@tresjs/core'
import { createPinia } from 'pinia'
import App from './App.vue'
import './style.css'
import 'uno.css'
import '@vue/devtools-applet/style.css'

const pinia = createPinia()
const app = createApp(App)
app.use(pinia)

app.use(Tres)
app.mount('#app')
