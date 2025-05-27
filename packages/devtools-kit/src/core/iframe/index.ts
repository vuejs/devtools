export function detectIframeApp(target: Window | typeof globalThis, inIframe = false) {
  if (inIframe) {
    function sendEventToParent(cb) {
      try {
        // @ts-expect-error skip type check
        const hook = window.parent.__VUE_DEVTOOLS_GLOBAL_HOOK__
        if (hook) {
          cb(hook)
        }
      }
      catch (e) {
        // Ignore
      }
    }

    const hook = {
      id: 'vue-devtools-next',
      devtoolsVersion: '7.0',
      on: (event, cb) => {
        sendEventToParent((hook) => {
          hook.on(event, cb)
        })
      },
      once: (event, cb) => {
        sendEventToParent((hook) => {
          hook.once(event, cb)
        })
      },
      off: (event, cb) => {
        sendEventToParent((hook) => {
          hook.off(event, cb)
        })
      },
      emit: (event, ...payload) => {
        sendEventToParent((hook) => {
          hook.emit(event, ...payload)
        })
      },
    }

    Object.defineProperty(target, '__VUE_DEVTOOLS_GLOBAL_HOOK__', {
      get() {
        return hook
      },
      configurable: true,
    })
  }

  function injectVueHookToIframe(iframe) {
    if (iframe.__vdevtools__injected) {
      return
    }
    try {
      iframe.__vdevtools__injected = true
      const inject = () => {
        console.log('inject', iframe)
        try {
          iframe.contentWindow.__VUE_DEVTOOLS_IFRAME__ = iframe
          const script = iframe.contentDocument.createElement('script')
          script.textContent = `;(${detectIframeApp.toString()})(window, true)`
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

  // detect iframe app to inject vue hook
  function injectVueHookToIframes() {
    if (typeof window === 'undefined') {
      return
    }

    const iframes = Array.from(document.querySelectorAll<HTMLIFrameElement>('iframe:not([data-vue-devtools-ignore])'))
    for (const iframe of iframes) {
      injectVueHookToIframe(iframe)
    }
  }

  injectVueHookToIframes()

  let iframeAppChecks = 0
  const iframeAppCheckTimer = setInterval(() => {
    injectVueHookToIframes()
    iframeAppChecks++
    if (iframeAppChecks >= 5) {
      clearInterval(iframeAppCheckTimer)
    }
  }, 1000)
}
