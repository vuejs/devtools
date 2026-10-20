/// <reference types="vite/client" />

declare module '*.vue' {
  import type { DefineComponent, VaporComponent } from 'vue'

  // `<script setup vapor>` SFCs are also accepted by `createVaporApp`.
  const component: DefineComponent<object, object, unknown> & VaporComponent
  export default component
}
