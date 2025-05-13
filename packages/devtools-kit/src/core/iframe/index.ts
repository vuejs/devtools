export function detectIframe(target: Window | typeof globalThis, inIframe = false) {
  console.log({
    inIframe,
  })
  function injectIframeHook(iframe) {
    if ((iframe as any).__vdevtools__injected) {
      return
    }
    try {
      (iframe as any).__vdevtools__injected = true
      const inject = () => {
        try {
          /**
           * Install the hook on window, which is an event emitter.
           * Note because Chrome content scripts cannot directly modify the window object,
           * we are evaluating this function by inserting a script tag. That's why we have
           * to inline the whole event emitter implementation here.
           */
          (iframe.contentWindow as any).__VUE_DEVTOOLS_IFRAME__ = iframe
          const script = iframe.contentDocument.createElement('script')
          script.textContent = `;(${detectIframe.toString()})(window, true)`
          iframe.contentDocument.documentElement.appendChild(script)
          script.parentNode.removeChild(script)
        }
        catch (e) {
          // Ignore
        }
      }
      inject()
      iframe.addEventListener('load', () => inject())
    }
    catch (e) {
      // Ignore
    }
  }

  let iframeChecks = 0
  function injectToIframes() {
    if (typeof window === 'undefined') {
      return
    }

    const iframes = Array.from(document.querySelectorAll<HTMLIFrameElement>('iframe:not([data-vue-devtools-ignore])'))
    for (const iframe of iframes) {
      injectIframeHook(iframe)
    }
  }
  injectToIframes()
  const iframeTimer = setInterval(() => {
    injectToIframes()
    iframeChecks++
    if (iframeChecks >= 5) {
      clearInterval(iframeTimer)
    }
  }, 1000)
}
