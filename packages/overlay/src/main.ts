import type { Component, App as VueAppType } from 'vue'
import { createApp, h } from 'vue'
import App from './App.vue'

let app: VueAppType | null = null
function createDevToolsContainer(App: Component) {
  const CONTAINER_ID = '__vue-devtools-container__'
  const el = document.createElement('div')
  el.setAttribute('id', CONTAINER_ID)
  el.setAttribute('data-v-inspector-ignore', 'true')
  document.getElementsByTagName('body')[0].appendChild(el)
  app = createApp({
    render: () => h(App),
    devtools: {
      hide: true,
    },
  })
  app.mount(el)
}

createDevToolsContainer(App)

const targetNode = document.body
const config = { childList: true, attributes: false }
const observer = new MutationObserver(callback)
observer.observe(targetNode, config)

let isInitialized = false
function callback(mutationsList, observer) {
  for (const mutation of mutationsList) {
    if (mutation.type === 'childList' && isInitialized === false) {
      if (app) {
        app.unmount()
      }
      createDevToolsContainer(App)
      isInitialized = true
      observer.disconnect()
    }
  }
}
