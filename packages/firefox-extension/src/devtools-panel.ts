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
  chrome.devtools.inspectedWindow.eval(src, (res, err) => {
    if (err)
      console.error(err)

    cb()
  })
}
