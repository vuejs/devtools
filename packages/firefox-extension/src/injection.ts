if (document instanceof Document) {
  const content = chrome.runtime.getURL('dist/prepare.js')
  const script = document.createElement('script')
  script.src = content
  document.documentElement.appendChild(script)
  script.parentNode?.removeChild(script)
}
