import { target } from '@vue/devtools-shared'
import { devtoolsState } from '../../ctx/state'

export interface OpenInEditorOptions {
  baseUrl?: string
  file?: string
  line?: number
  column?: number
  host?: string
}

export function setOpenInEditorBaseUrl(url: string) {
  target.__VUE_DEVTOOLS_OPEN_IN_EDITOR_BASE_URL__ = url
}

export function openInEditor(options: OpenInEditorOptions = {}) {
  const { file, host, baseUrl = window.location.origin, line = 0, column = 0 } = options
  if (!file)
    return

  // When the Vite plugin is active __VUE_INSPECTOR__ is the most reliable path —
  // it uses the properly configured launch-editor-middleware. Prefer it even when
  // the devtools UI is running inside a Chrome extension panel.
  if (devtoolsState.vitePluginDetected && target.__VUE_INSPECTOR__) {
    const _baseUrl = target.__VUE_DEVTOOLS_OPEN_IN_EDITOR_BASE_URL__ ?? baseUrl
    target.__VUE_INSPECTOR__.openInEditor(_baseUrl, file, line, column)
    return
  }

  // Fallback for Chrome extension without the Vite plugin: send a plain fetch
  // to the /__open-in-editor endpoint and log clearly on failure.
  if (host === 'chrome-extension') {
    const fileName = file.replace(/\\/g, '\\\\')
    // @ts-expect-error skip type check
    const _baseUrl = window.VUE_DEVTOOLS_CONFIG?.openInEditorHost ?? '/'
    fetch(`${_baseUrl}__open-in-editor?file=${encodeURI(file)}`).then((response) => {
      if (!response.ok) {
        const msg = `Opening component ${fileName} failed — is the Vite plugin (vite-plugin-vue-devtools) installed in your app?`
        console.log(`%c${msg}`, 'color:red')
      }
    })
  }
}
