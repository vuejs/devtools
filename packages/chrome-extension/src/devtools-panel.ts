import { functions, onRpcConnected } from '@vue/devtools-core'
import { createRpcClient } from '@vue/devtools-kit'
import { disconnectDevToolsClient, initDevTools, reloadDevToolsClient } from '../client/devtools-panel'

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
      script.type = "module";
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
