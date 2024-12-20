import type { RemovableRef } from '@vueuse/core'
import { showVueNotification } from '@vue/devtools-ui'
import type { GraphSettings } from './graph'
import type { TabSettings } from './state-tab'
import { downloadFile, readFileAsText } from '~/utils'

interface DevtoolsClientState {
  isFirstVisit: boolean
  route: string
  graphSettings: GraphSettings
  tabSettings: TabSettings
  expandSidebar: boolean
  scrollableSidebar: boolean
  splitScreen: {
    enabled: boolean
    view: string
    size: [number, number]
  }
  scale: number
  interactionCloseOnOutsideClick: boolean
  showPanel: boolean
  minimizePanelInteractive: number
}

function clientStateFactory(): DevtoolsClientState {
  return {
    isFirstVisit: true,
    route: '/',
    graphSettings: {
      node_modules: false,
      virtual: false,
      lib: false,
    },
    tabSettings: {
      hiddenTabCategories: [],
      hiddenTabs: [],
      pinnedTabs: [],
    },
    expandSidebar: false,
    scrollableSidebar: true,
    splitScreen: {
      enabled: false,
      view: 'overview',
      size: [50, 50],
    },
    scale: 1,
    interactionCloseOnOutsideClick: false,
    showPanel: true,
    minimizePanelInteractive: 5000,
  }
}

export const devtoolsClientState: RemovableRef<DevtoolsClientState> = useLocalStorage(
  '__VUE_DEVTOOLS_CLIENT_STATE__',
  clientStateFactory(),
  { mergeDefaults: true },
)

export function resetDevtoolsClientState() {
  devtoolsClientState.value = clientStateFactory()
}

// #region split screen related
watch(() => devtoolsClientState.value.splitScreen.enabled, (enabled, o) => {
  if (o && !enabled) {
    // reset size
    devtoolsClientState.value.splitScreen.size = [50, 50]
  }
})

const DEVTOOLS_STATE_KEY = '__VUE_DEVTOOLS_CLIENT_STATE__'

export function useExportDevtoolsClientState() {
  return {
    exportDevtoolsClientState: () => {
      const blob = new Blob([
        JSON.stringify({ [DEVTOOLS_STATE_KEY]: devtoolsClientState.value }, null, 2),
      ], { type: 'application/json' })
      downloadFile(blob, 'vue-devtools-client-state.json')
    },
  }
}

export function useImportDevtoolsClientState() {
  const { open, onChange } = useFileDialog({ accept: '.json', multiple: false })

  onChange((fileList) => {
    const jsonFile = fileList?.[0]
    if (!jsonFile)
      return
    readFileAsText(jsonFile)
      .then((file) => {
        const data = JSON.parse(file as string)[DEVTOOLS_STATE_KEY]
        if (!data)
          throw new Error('Invalid file')
        devtoolsClientState.value = data
        showVueNotification({
          message: 'Import successful',
          type: 'success',
        })
      })
      .catch(() => {
        showVueNotification({
          type: 'error',
          message: 'Invalid file',
        })
      })
  })

  return {
    openImportDialog: open,
  }
}
// #endregion
