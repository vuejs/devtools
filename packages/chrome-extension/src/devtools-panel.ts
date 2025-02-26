// import { Bridge } from '../../core/src/bridge'
import { functions, onRpcConnected } from '@vue/devtools-core'
import { createRpcClient } from '@vue/devtools-kit'
import { disconnectDevToolsClient, initDevTools, reloadDevToolsClient } from '../client/devtools-panel'

const connectionInfo: {
  retryTimer: NodeJS.Timeout | null
  count: number
  disconnected: boolean
  port: chrome.runtime.Port
  listeners: Array<() => void>
} = {
  retryTimer: null,
  count: 0,
  disconnected: false,
  port: null!,
  listeners: [],
}

// function connect() {
//   try {
//     clearTimeout(connectionInfo.retryTimer!)
//     connectionInfo.count++
//     connectionInfo.port = chrome.runtime.connect({
//       name: `${chrome.devtools.inspectedWindow.tabId}`,
//     })

//     connectionInfo.disconnected = false
//     connectionInfo.port.onDisconnect.addListener(() => {
//       connectionInfo.disconnected = true
//       connectionInfo.retryTimer = setTimeout(connect, 1000)
//     })
//     if (connectionInfo.count > 1)
//       connectionInfo.listeners.forEach(fn => connectionInfo.port.onMessage.addListener(fn))
//   }
//   catch (e) {
//     connectionInfo.disconnected = true
//     connectionInfo.retryTimer = setTimeout(connect, 5000)
//   }
// }

function init() {
  injectScript(chrome.runtime.getURL('dist/user-app.js'), () => {
    initDevTools()

    createRpcClient(functions, {
      preset: 'extension',
    })
  })
  chrome.devtools.network.onNavigated.addListener(() => {
    disconnectDevToolsClient()
    injectScript(chrome.runtime.getURL('dist/user-app.js'), () => {
      onRpcConnected(() => {
        reloadDevToolsClient()
      })
    })
  })
}

init()

function injectScript(scriptName: string, cb: () => void) {
  const src = `
    (function() {
      var script = document.constructor.prototype.createElement.call(document, 'script');
      script.src = "${scriptName}";
      document.documentElement.appendChild(script);
      script.parentNode.removeChild(script);
    })()
  `
  let timeoutId: number = null!
  function execute() {
    clearTimeout(timeoutId)
    chrome.devtools.inspectedWindow.eval(src, (res, err) => {
      if (err) {
        // @ts-expect-error skip type check
        timeoutId = setTimeout(() => {
          execute()
        }, 100)
        return
      }

      cb()
    })
  }
  execute()
}
