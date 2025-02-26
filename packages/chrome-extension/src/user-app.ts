import { functions } from '@vue/devtools-core'
import { createRpcServer } from '@vue/devtools-kit'

window.addEventListener('message', handshake)

createRpcServer(functions, {
  preset: 'extension',
})

function handshake(e: MessageEvent) {
  if (e.data.source === 'proxy->server' && e.data.payload.event === 'init') {
    window.removeEventListener('message', handshake)

    const listeners: ((event: unknown) => void)[] = []
  }
}

// window.addEventListener('message', toggleOverlay)

// function toggleOverlay(e) {
//   const data = e.data
//   const payload = data.payload
//   if (data.source === '__VUE_DEVTOOLS_OVERLAY__' && payload.event === 'toggle-view-mode') {
//     // @TODO: refactor
//     target?.__VUE_DEVTOOLS_TOGGLE_OVERLAY__?.(payload.data === 'overlay')
//   }
// }
