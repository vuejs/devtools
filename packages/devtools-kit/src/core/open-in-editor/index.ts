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
  if (file) {
    if (host === 'chrome-extension') {
      const fileName = file.replace(/\\/g, '\\\\')
      // @ts-expect-error skip type check
      const _baseUrl = window.VUE_DEVTOOLS_CONFIG?.openInEditorHost ?? '/'
      fetch(`${_baseUrl}__open-in-editor?file=${encodeURI(file)}`).then((response) => {
        if (!response.ok) {
          const msg = `Opening component ${fileName} failed`
          console.log(`%c${msg}`, 'color:red')
        }
      })
    }
    else if (devtoolsState.vitePluginDetected) {
      const _baseUrl = target.__VUE_DEVTOOLS_OPEN_IN_EDITOR_BASE_URL__ ?? baseUrl
      target.__VUE_INSPECTOR__.openInEditor(_baseUrl, file, line, column)
    }
  }
}
