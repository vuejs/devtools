/// <reference types="vite/client" />

declare module '*.vue' {
  import type { Component } from 'vue'

  const component: Component
  export default component
}

declare global {
  interface Window {
    __VUE_DEVTOOLS_VITE_PLUGIN_DETECTED__?: boolean
  }
}
