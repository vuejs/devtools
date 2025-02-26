function detect(win: Window) {
  const detector = {
    delay: 1000,
    retry: 10,
  }
  function sendMessage(data) {
    win.postMessage({
      key: '__VUE_DEVTOOLS_VUE_DETECTED_EVENT__',
      data,
    }, '*')
  }

  function runDetect() {
    // 1. check Nuxt
    // @ts-expect-error types
    const nuxtDetected = !!(window.__NUXT__)

    if (nuxtDetected) {
      sendMessage({
        devtoolsEnabled: window.__VUE_DEVTOOLS_GLOBAL_HOOK__ && window.__VUE_DEVTOOLS_GLOBAL_HOOK__.enabled,
        vueDetected: true,
        nuxtDetected: true,
        vitePluginDetected: !!window.__VUE_DEVTOOLS_VITE_PLUGIN_DETECTED__,
        vitePluginClientUrl: window.__VUE_DEVTOOLS_VITE_PLUGIN_CLIENT_URL__,
      })
      return
    }

    // 2. check VitePress
    // @ts-expect-error types
    const vitePressDetected = !!(window.__VITEPRESS__)
    if (vitePressDetected) {
      sendMessage({
        devtoolsEnabled: window.__VUE_DEVTOOLS_GLOBAL_HOOK__ && window.__VUE_DEVTOOLS_GLOBAL_HOOK__.enabled,
        vueDetected: true,
        vitePressDetected: true,
        vitePluginDetected: !!window.__VUE_DEVTOOLS_VITE_PLUGIN_DETECTED__,
        vitePluginClientUrl: window.__VUE_DEVTOOLS_VITE_PLUGIN_CLIENT_URL__,
      })
      return
    }

    // 3. check Vue
    // @ts-expect-error types
    const vueDetected = !!(window.__VUE__)
    if (vueDetected) {
      sendMessage({
        devtoolsEnabled: window.__VUE_DEVTOOLS_GLOBAL_HOOK__ && window.__VUE_DEVTOOLS_GLOBAL_HOOK__.enabled,
        vueDetected: true,
        vitePluginDetected: !!window.__VUE_DEVTOOLS_VITE_PLUGIN_DETECTED__,
        vitePluginClientUrl: window.__VUE_DEVTOOLS_VITE_PLUGIN_CLIENT_URL__,
      })
      return
    }

    if (detector.retry > 0) {
      detector.retry--
      setTimeout(() => {
        runDetect()
      }, detector.delay)
      detector.delay *= 5
    }
  }

  setTimeout(() => {
    runDetect()
  }, 100)
}

if (document instanceof HTMLDocument) {
  detect(window)
}
