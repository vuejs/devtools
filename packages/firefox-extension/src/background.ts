import { isNumeric } from '@vue/devtools-shared'

type PortInfo = Record<'tab' | 'name', string | number> & { port: chrome.runtime.Port }
type PortDetail = Record<'devtools' | 'userApp', chrome.runtime.Port>
const ports: Record<string | number, PortDetail> = {}

function initPort(portInfo: PortInfo): Record<'devtools' | 'userApp', chrome.runtime.Port> {
  const { tab, name, port } = portInfo
  ports[tab] ??= {
    devtools: null!,
    userApp: null!,
  }
  ports[tab][name] = port
  return ports[tab]
}

function devtoolsUserAppPipe(tabId: string | number) {
  const { devtools, userApp } = ports[tabId]
  let disconnected = false

  function onDevtoolsMessage(message) {
    if (disconnected)
      return
    if (process.env.NODE_ENV === 'development') {
      console.log('%cdevtools -> userApp', 'color:#888;', message)
    }

    userApp.postMessage(message)
  }
  devtools.onMessage.addListener(onDevtoolsMessage)

  function onUserAppMessage(message) {
    if (disconnected)
      return
    if (process.env.NODE_ENV === 'development') {
      console.log('%cuserApp -> devtools', 'color:#888;', message)
    }

    devtools.postMessage(message)
  }
  userApp.onMessage.addListener(onUserAppMessage)

  function shutdown() {
    disconnected = true
    if (!ports[tabId])
      return
    const { devtools, userApp } = ports[tabId]
    devtools.onMessage.removeListener(onDevtoolsMessage)
    userApp.onMessage.removeListener(onUserAppMessage)
    devtools?.disconnect()
    userApp?.disconnect()
    delete ports[tabId]
    // ports[tabId] = null!
  }

  devtools.onDisconnect.addListener(shutdown)
  userApp.onDisconnect.addListener(shutdown)
}

chrome.runtime.onConnect.addListener((port) => {
  const portInfo: PortInfo = {
    tab: '',
    name: '',
    port,
  }

  // devtools panel
  if (isNumeric(port.name)) {
    portInfo.tab = port.name
    portInfo.name = 'devtools'
    chrome.tabs.executeScript(+port.name, {

      file: '/dist/proxy.js',
    }, (res) => {
    })
  }
  // userApp (user application)
  else {
    portInfo.tab = port.sender!.tab!.id!
    portInfo.name = 'userApp'
  }

  const tab = initPort(portInfo)

  if (tab.devtools && tab.userApp)
    devtoolsUserAppPipe(portInfo.tab)
})

chrome.runtime.onMessage.addListener((req, sender) => {
  if (sender.tab && req.vue2Detected) {
    chrome.browserAction.setPopup({
      tabId: sender.tab.id,
      popup: 'popups/vue2-migration-guide.html',
    })
    chrome.browserAction.setIcon({
      tabId: sender.tab.id,
      path: {
        16: `icons/16.png`,
        48: `icons/48.png`,
        128: `icons/128.png`,
      },
    })
  }

  if (sender.tab && req.vueDetected) {
    let suffix = ''

    if (req.nuxtDetected)
      suffix = '.nuxt'
    else if (req.vitePressDetected)
      suffix = '.vitepress'

    chrome.browserAction.setIcon({
      tabId: sender.tab.id,
      path: {
        16: `icons/16${suffix}.png`,
        48: `icons/48${suffix}.png`,
        128: `icons/128${suffix}.png`,
      },
    })

    chrome.browserAction.setPopup({
      tabId: sender.tab.id,
      popup: req.devtoolsEnabled ? `popups/enabled${suffix}.html` : `popups/disabled${suffix}.html`,
    })
  }
})
