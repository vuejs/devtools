<script setup lang="ts">
import type { DevtoolsTabId } from './types/tab'
import { computed, onMounted, onUnmounted, watchEffect } from 'vue'
import { RouterView, useRoute } from 'vue-router'
import CommandPalette from './components/common/CommandPalette.vue'
import SideNav from './components/nav/SideNav.vue'
import { useDevtoolsCommands } from './composables/commands'
import {
  startDevtoolsClient,
  stopDevtoolsClient,
  useDevtoolsClient,
} from './composables/devtools-client'
import { useDevtoolsColorMode } from './composables/color-mode'
import { useDevtoolsSettings } from './composables/settings'
import { useDevtoolsTabs } from './composables/tabs'
import { isRouterInspectorId } from './utils/inspectors'

const route = useRoute()
const { connected } = useDevtoolsClient()
const { settings } = useDevtoolsSettings()
const sidebarExpanded = computed(() => settings.expandSidebar)

useDevtoolsColorMode()

const activeTab = computed<DevtoolsTabId>(() => {
  if (route.name === 'custom-inspector') {
    const inspectorId = route.params.inspectorId
    if (inspectorId === 'pinia') return 'pinia'
    if (typeof inspectorId === 'string' && isRouterInspectorId(inspectorId)) return 'router'
    return typeof inspectorId === 'string' ? `inspector:${inspectorId}` : 'components'
  }

  const tabId = route.meta.tabId
  return typeof tabId === 'string' ? (tabId as DevtoolsTabId) : 'components'
})
const { mainTabs, systemTabs } = useDevtoolsTabs(activeTab)
const commandTabs = computed(() => [...mainTabs.value, ...systemTabs.value])
const commands = useDevtoolsCommands({ tabs: commandTabs })

onMounted(() => {
  startDevtoolsClient()
})

onUnmounted(() => {
  stopDevtoolsClient()
})

watchEffect(() => {
  document.documentElement.style.fontSize = `${settings.scale * 15}px`
  document.documentElement.classList.toggle('reduce-motion', settings.reduceMotion)
})
</script>

<template>
  <main
    class="h-full bg-base color-base grid"
    :class="sidebarExpanded ? 'grid-cols-[250px_1fr]' : 'grid-cols-[52px_1fr]'"
  >
    <SideNav
      :active-tab="activeTab"
      :tabs="mainTabs"
      :system-tabs="systemTabs"
      :connected="connected"
    />

    <div class="min-w-0 min-h-0 overflow-hidden">
      <RouterView />
    </div>

    <CommandPalette :commands="commands" />
  </main>
</template>
