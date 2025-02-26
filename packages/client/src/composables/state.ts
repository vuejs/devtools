import type { RemovableRef } from '@vueuse/core'
import type { GraphSettings } from './graph'
import type { TabSettings } from './state-tab'

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
  reduceMotion: boolean
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
    reduceMotion: false,
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
// #endregion

const preferredMotion = usePreferredReducedMotion()

watch(preferredMotion, (value) => {
  devtoolsClientState.value.reduceMotion = value === 'reduce'
}, { immediate: true })
