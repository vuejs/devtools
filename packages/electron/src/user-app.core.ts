import { functions } from '@vue/devtools-core'
import { createRpcServer, setElectronServerContext } from '@vue/devtools-kit'
import { isBrowser, target } from '@vue/devtools-shared'
import { devtools } from '../../devtools-kit/src/index'

export function init(io) {
  const createSocket = io
  const host = target.__VUE_DEVTOOLS_HOST__ || 'http://localhost'
  const port = target.__VUE_DEVTOOLS_PORT__ !== undefined ? target.__VUE_DEVTOOLS_PORT__ : 8098
  const fullHost = port ? `${host}:${port}` : host
  const socket = createSocket(fullHost)

  devtools.init()

  // Global disconnect handler. Fires in two cases:
  // - after calling above socket.disconnect()
  // - once devtools is closed (that's why we need socket.disconnect() here too, to prevent further polling)
  socket.on('disconnect', () => {
    socket.disconnect()
  })

  socket.on('connect', () => {
    setElectronServerContext(socket)
    createRpcServer(functions, {
      preset: 'electron',
    })

    socket.emit('vue-devtools:init')
  })

  // Disconnect socket once other client is connected
  socket.on('vue-devtools:disconnect-user-app', () => {
    socket.disconnect()
  })

  if (isBrowser) {
    window.addEventListener('beforeunload', () => {
      socket.emit('vue-devtools:disconnect')
    })
  }
}
