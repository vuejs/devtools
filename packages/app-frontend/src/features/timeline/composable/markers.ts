import { useCurrentApp } from '@front/features/apps'
import { computed, watch } from 'vue'
import { getBridge } from '@front/features/bridge'
import { BridgeEvents } from '@vue-devtools/shared-utils'
import { markersAllApps, markersPerApp } from './store'

export function useMarkers() {
  const { currentAppId } = useCurrentApp()
  const currentAppMarkers = computed(() => markersAllApps.value.concat(markersPerApp.value[currentAppId.value] ?? []))

  watch(currentAppId, () => {
    loadMarkers()
  }, {
    immediate: true,
  })

  return {
    currentAppMarkers,
  }
}

function loadMarkers() {
  getBridge().send(BridgeEvents.TO_BACK_TIMELINE_LOAD_MARKERS)
}
