import { createApp } from 'vue'

import App2 from './App2.vue'
import App from './App.vue'

import './style.css'
import 'uno.css'

const app = createApp(App)

const app2 = createApp(App2)

app.mount('#app')

app2.mount('#app2')
