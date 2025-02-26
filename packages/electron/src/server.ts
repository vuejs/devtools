import fs from 'node:fs'
import { createServer } from 'node:http'
import path from 'node:path'
import { createRpcProxy, setElectronProxyContext } from '@vue/devtools-kit'
import { createApp, eventHandler, toNodeListener } from 'h3'
import { Server } from 'socket.io'

const port = process.env.PORT || 8098
export function init() {
  const app = createApp()
  app.use(
    '/',
    eventHandler(() => {
      const userAppContent = fs.readFileSync(path.join(__dirname, './user-app.iife.js'), 'utf-8')
      const processSyntaxPolyfill = `if(!window.process){window.process={env:{}}};`
      return processSyntaxPolyfill + userAppContent
    }),
  )

  const httpServer = createServer(toNodeListener(app))
  const io = new Server(httpServer, {
    cors: {
      origin: true,
    },
  })

  io.on('connection', (socket) => {
    setElectronProxyContext(socket)
    createRpcProxy({
      preset: 'electron',
    })

    // Disconnect any previously connected apps
    socket.broadcast.emit('vue-devtools:disconnect-user-app')

    socket.on('vue-devtools:init', () => {
      socket.broadcast.emit('vue-devtools:init')
    })

    socket.on('vue-devtools:disconnect', () => {
      socket.broadcast.emit('vue-devtools:disconnect')
    })

    socket.on('disconnect', (reason) => {
      if (reason.indexOf('client'))
        socket.broadcast.emit('vue-devtools-disconnect-devtools')
    })
  })

  httpServer.listen(port, () => {
    console.log(`listening on 0.0.0.0:${port}`)
  })
}
