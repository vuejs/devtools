import { createVueDevtoolsDetectionQueryMessage } from '../shared/detection'
import type { VueDevtoolsDetectionPayload } from '../shared/detection'

const PANEL_CHECK_INTERVAL = 1_000
const PANEL_CHECK_ATTEMPTS = 30
const PANEL_ICON = 'icons/128.png'
const PANEL_PAGE = 'dist/app/panel/devtools-panel.html'
const PANEL_TITLE = 'Vue'
const VUE_DETECTION_EVAL = `
  Boolean(
    window.__VUE_DEVTOOLS_EXTENSION_STATE__?.vueDetected ||
    window.__VUE_DEVTOOLS_EXTENSION_STATE__?.appCount ||
    window.__VUE_DEVTOOLS_GLOBAL_HOOK__?.apps?.length
  )
`

let panelCreated = false
let checkId = 0

chrome.devtools.network.onNavigated.addListener(() => {
  void checkPanel()
})

void checkPanel()

async function checkPanel(): Promise<void> {
  if (panelCreated) return

  const currentCheckId = ++checkId

  for (let attempt = 0; attempt < PANEL_CHECK_ATTEMPTS; attempt += 1) {
    if (await isVueDetected()) {
      if (currentCheckId === checkId) createPanel()
      return
    }

    if (attempt < PANEL_CHECK_ATTEMPTS - 1) await sleep(PANEL_CHECK_INTERVAL)
    if (currentCheckId !== checkId) return
  }
}

function createPanel(): void {
  if (panelCreated) return

  panelCreated = true
  chrome.devtools.panels.create(PANEL_TITLE, PANEL_ICON, PANEL_PAGE, () => {})
}

async function isVueDetected(): Promise<boolean> {
  if (await isVueDetectedInTopFrame()) return true
  // Vue may only live in a subframe; the background aggregates detection
  // messages from every frame of the inspected tab.
  return isVueDetectedInAnyFrame()
}

function isVueDetectedInTopFrame(): Promise<boolean> {
  return new Promise((resolve) => {
    chrome.devtools.inspectedWindow.eval<boolean>(VUE_DETECTION_EVAL, (result, exceptionInfo) => {
      resolve(!exceptionInfo && !!result)
    })
  })
}

function isVueDetectedInAnyFrame(): Promise<boolean> {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(
      createVueDevtoolsDetectionQueryMessage(chrome.devtools.inspectedWindow.tabId),
      (payload?: VueDevtoolsDetectionPayload) => {
        void chrome.runtime.lastError
        resolve(!!payload?.vueDetected)
      },
    )
  })
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
