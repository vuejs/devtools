import { createApp } from 'vue'

import App2 from './App2.vue'
import App from './App.vue'
import Iframe from './components/Iframe/index.vue'

import './style.css'
import 'uno.css'

const app = createApp(App)

const app2 = createApp(App2)

const app3 = createApp(Iframe)

app.mount('#app')

app2.mount('#app2')

app3.mount('#app3')
