// import { createApp, vaporInteropPlugin } from 'vue'
// import App from './App.vue'
// import 'todomvc-app-css/index.css'

// const app = createApp(App)
// app.use(vaporInteropPlugin)
// app.mount('#app')

import { createVaporApp } from 'vue'
import App from './App.vue'
import 'todomvc-app-css/index.css'

const app = createVaporApp(App)
console.log(app.mount)
app.mount('#app')
