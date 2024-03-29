import io from 'socket.io-client'
import { initBackend } from '@back'
import { installToast } from '@back/toast'
import { Bridge, chunk, target } from '@vue-devtools/shared-utils'

const host = target.__VUE_DEVTOOLS_HOST__ || 'http://localhost'
const port = target.__VUE_DEVTOOLS_PORT__ !== undefined ? target.__VUE_DEVTOOLS_PORT__ : 8098
const fullHost = port ? `${host}:${port}` : host
const createSocket = target.__VUE_DEVTOOLS_SOCKET__ || io
const socket = createSocket(fullHost)
const MAX_DATA_CHUNK = 2000

function connectedMessage() {
  if (target.__VUE_DEVTOOLS_TOAST__) {
    target.__VUE_DEVTOOLS_TOAST__('Remote Devtools Connected', 'normal')
  }
}

function disconnectedMessage() {
  if (target.__VUE_DEVTOOLS_TOAST__) {
    target.__VUE_DEVTOOLS_TOAST__('Remote Devtools Disconnected', 'error')
  }
}

socket.on('connect', () => {
  connectedMessage()
  // eslint-disable-next-line ts/no-use-before-define
  initBackend(bridge)
  socket.emit('vue-devtools-init')
})

// Global disconnect handler. Fires in two cases:
// - after calling above socket.disconnect()
// - once devtools is closed (that's why we need socket.disconnect() here too, to prevent further polling)
socket.on('disconnect', () => {
  socket.disconnect()
  disconnectedMessage()
})

// Disconnect socket once other client is connected
socket.on('vue-devtools-disconnect-backend', () => {
  socket.disconnect()
})

const bridge = new Bridge({
  listen(fn) {
    socket.on('vue-message', data => fn(data))
  },
  send(data) {
    const chunks = chunk(data, MAX_DATA_CHUNK)

    for (const chunk of chunks) {
      socket.emit('vue-message', chunk)
    }
  },
})

bridge.on('shutdown', () => {
  socket.disconnect()
  disconnectedMessage()
})

installToast(target)
