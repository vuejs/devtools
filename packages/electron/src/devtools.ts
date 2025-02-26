import { functions } from '@vue/devtools-core'
import { createRpcClient, setElectronClientContext } from '@vue/devtools-kit'
import ip from 'ip'
import io from 'socket.io-client/dist/socket.io.js'
import { createConnectionApp, initDevTools } from '../client/devtools-panel'

const port = window.process.env.PORT || 8098

function init() {
  const localhost = `http://localhost:${port}`
  const socket = io(localhost)
  let reload: Function | null = null

  const app = createConnectionApp('#app', {
    local: localhost,
    network: `http://${ip.address()}:${port}`,
  })

  socket.on('vue-devtools:init', () => {
    app.unmount()
    setElectronClientContext(socket)
    createRpcClient(functions, {
      preset: 'electron',
    })
    initDevTools()
  })

  function shutdown() {
    app.unmount()
    reload = null
    socket.close()
    init()
  }

  socket.on('vue-devtools:disconnect', shutdown)
  socket.on('vue-devtools-disconnect-devtools', shutdown)
}

init()
