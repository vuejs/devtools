// import { createApp, vaporInteropPlugin } from 'vue'
// import App from './App.vue'
// import 'todomvc-app-css/index.css'

// import 'uno.css'

// const app = createApp(App)
// app.use(vaporInteropPlugin)
// app.mount('#app')

import { createVaporApp } from 'vue'
import App from './App.vue'
import 'todomvc-app-css/index.css'
import 'uno.css'

const app = createVaporApp(App)
app.mount('#app')
