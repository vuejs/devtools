import { isVueDevtoolsDetectionMessage } from '../shared/detection'

window.addEventListener('message', (event) => {
  if (event.source !== window || !isVueDevtoolsDetectionMessage(event.data)) return

  chrome.runtime.sendMessage(event.data, () => {
    void chrome.runtime.lastError
  })
})
