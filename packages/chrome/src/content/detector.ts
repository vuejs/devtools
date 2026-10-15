import {
  isVueDevtoolsDetectionMessage,
  isVueDevtoolsDetectionRequestMessage,
} from '../shared/detection'

window.addEventListener('message', (event) => {
  if (event.source !== window || !isVueDevtoolsDetectionMessage(event.data)) return

  chrome.runtime.sendMessage(event.data, () => {
    void chrome.runtime.lastError
  })
})

// The background asks every frame to re-publish after it lost its detection state.
chrome.runtime.onMessage.addListener((message) => {
  if (isVueDevtoolsDetectionRequestMessage(message)) window.postMessage(message, '*')
})
