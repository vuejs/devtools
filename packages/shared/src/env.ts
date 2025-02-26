export const isBrowser = typeof navigator !== 'undefined'
export const target = (typeof window !== 'undefined'
  ? window
  : typeof globalThis !== 'undefined'
    ? globalThis
    // eslint-disable-next-line no-restricted-globals
    : typeof global !== 'undefined'
      // eslint-disable-next-line no-restricted-globals
      ? global
      : {}) as typeof globalThis

export const isInChromePanel = typeof target.chrome !== 'undefined' && !!target.chrome.devtools
export const isInIframe = isBrowser && target.self !== target.top
export const isInElectron = typeof navigator !== 'undefined' && navigator.userAgent?.toLowerCase().includes('electron')
// @ts-expect-error skip type check
export const isNuxtApp = typeof window !== 'undefined' && !!window.__NUXT__
export const isInSeparateWindow = !isInIframe && !isInChromePanel && !isInElectron
