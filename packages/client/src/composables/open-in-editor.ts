import { rpc } from '@vue/devtools-core'
import { isInChromePanel } from '@vue/devtools-shared'

export const vueInspectorDetected = ref(false)

export const openInEditor = async (file: string) => {
  const opts: { file: string, host?: string } = { file }
  if (isInChromePanel) {
    opts.host = 'chrome-extension'
  }
  return rpc.value.openInEditor(opts)
}
