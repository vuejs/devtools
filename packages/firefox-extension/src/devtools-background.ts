let created = false
let checkCount = 0

chrome.devtools.network.onNavigated.addListener(createPanelOnVueDetected)
const checkVueInterval = setInterval(createPanelOnVueDetected, 1000)
createPanelOnVueDetected()

function createPanelOnVueDetected() {
  if (created || checkCount++ > 10) {
    clearInterval(checkVueInterval)
    return
  }
  chrome.devtools.inspectedWindow.eval(
    '!!(window.__VUE_DEVTOOLS_GLOBAL_HOOK__ && (window.__VUE_DEVTOOLS_GLOBAL_HOOK__.Vue || window.__VUE_DEVTOOLS_GLOBAL_HOOK__.apps.length))',
    (vueDetected) => {
      if (!vueDetected || created)
        return

      clearInterval(checkVueInterval)
      created = true
      chrome.devtools.panels.create(
        'Vue',
        'icons/128.png',
        'devtools-panel.html',
        (panel) => {
          panel.onShown.addListener(() => {
            chrome.devtools.inspectedWindow.eval(`window.__VUE_DEVTOOLS_UPDATE_CLIENT_DETECTED__({ chrome: true })`)
          })
          panel.onHidden.addListener(() => {
            chrome.devtools.inspectedWindow.eval(`window.__VUE_DEVTOOLS_UPDATE_CLIENT_DETECTED__({ chrome: false })`)
          })
        },
      )
    },
  )
}
