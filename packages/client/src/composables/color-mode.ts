import { onMounted, onUnmounted, ref } from 'vue'

type ColorScheme = 'dark' | 'light'

const COLOR_SCHEME_STORAGE_KEY = 'vite-devtools-color-scheme'

export function useDevtoolsColorMode() {
  const dark = ref(false)
  let colorSchemeMedia: MediaQueryList | undefined
  let hostThemeObserver: MutationObserver | undefined

  function applyColorScheme(scheme: ColorScheme, options: { persist?: boolean } = {}) {
    dark.value = scheme === 'dark'
    document.documentElement.classList.toggle('dark', dark.value)
    document.documentElement.classList.toggle('light', !dark.value)

    if (options.persist) writeStoredColorScheme(scheme)
  }

  function setDarkMode(value: boolean) {
    applyColorScheme(value ? 'dark' : 'light', { persist: true })
  }

  function syncColorMode() {
    applyColorScheme(resolveColorScheme())
  }

  function onSystemColorSchemeChange() {
    if (readStoredColorScheme() || resolveHostColorScheme()) return
    syncColorMode()
  }

  function onStorageChange(event: StorageEvent) {
    if (event.key !== COLOR_SCHEME_STORAGE_KEY) return
    syncColorMode()
  }

  onMounted(() => {
    syncColorMode()

    colorSchemeMedia = window.matchMedia('(prefers-color-scheme: dark)')
    colorSchemeMedia.addEventListener('change', onSystemColorSchemeChange)
    window.addEventListener('storage', onStorageChange)

    hostThemeObserver = observeHostTheme(syncColorMode)
  })

  onUnmounted(() => {
    colorSchemeMedia?.removeEventListener('change', onSystemColorSchemeChange)
    window.removeEventListener('storage', onStorageChange)
    hostThemeObserver?.disconnect()
  })

  return {
    dark,
    setDarkMode,
    syncColorMode,
  }
}

function resolveColorScheme(): ColorScheme {
  return readStoredColorScheme() ?? resolveHostColorScheme() ?? resolveSystemColorScheme()
}

function readStoredColorScheme(): ColorScheme | undefined {
  try {
    const value = window.localStorage.getItem(COLOR_SCHEME_STORAGE_KEY)
    return isColorScheme(value) ? value : undefined
  } catch {
    return undefined
  }
}

function writeStoredColorScheme(scheme: ColorScheme) {
  try {
    window.localStorage.setItem(COLOR_SCHEME_STORAGE_KEY, scheme)
  } catch {}
}

function resolveHostColorScheme(): ColorScheme | undefined {
  const hostDocument = getHostDocument()
  if (!hostDocument) return undefined

  for (const element of [hostDocument.documentElement, hostDocument.body]) {
    if (!element) continue

    if (element.classList.contains('dark')) return 'dark'
    if (element.classList.contains('light')) return 'light'

    const theme = element.getAttribute('data-theme')
    if (isColorScheme(theme)) return theme
  }

  return undefined
}

function resolveSystemColorScheme(): ColorScheme {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function observeHostTheme(onChange: () => void): MutationObserver | undefined {
  const hostDocument = getHostDocument()
  if (!hostDocument || typeof MutationObserver === 'undefined') return undefined

  const observer = new MutationObserver(onChange)
  for (const element of [hostDocument.documentElement, hostDocument.body]) {
    if (!element) continue

    observer.observe(element, {
      attributes: true,
      attributeFilter: ['class', 'data-theme'],
    })
  }

  return observer
}

function getHostDocument(): Document | undefined {
  if (window.parent === window) return undefined

  try {
    return window.parent.document
  } catch {
    return undefined
  }
}

function isColorScheme(value: unknown): value is ColorScheme {
  return value === 'dark' || value === 'light'
}
