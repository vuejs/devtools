if (document instanceof HTMLDocument) {
  const content = chrome.runtime.getURL('dist/prepare.js')
  const script = document.createElement('script')
  script.src = content
  script.type = 'module'
  document.documentElement.appendChild(script)
  script.parentNode?.removeChild(script)
}
