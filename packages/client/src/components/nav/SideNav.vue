<script setup lang="ts">
import type { DevtoolsTab, DevtoolsTabId } from '../../types/tab'
import { Dropdown } from 'floating-vue'
import { computed } from 'vue'
import DockingPanel from './DockingPanel.vue'
import SideNavItem from './SideNavItem.vue'
import { useDevtoolsSettings } from '../../composables/settings'

defineProps<{
  activeTab: DevtoolsTabId
  tabs: DevtoolsTab[]
  systemTabs: DevtoolsTab[]
  connected: boolean
}>()

const { settings } = useDevtoolsSettings()
const sidebarExpanded = computed(() => settings.expandSidebar)
const sidebarScrollable = computed(() => settings.scrollableSidebar)
</script>

<template>
  <aside class="side-nav">
    <div class="side-nav-brand">
      <Dropdown
        class="h-full w-full"
        placement="left-start"
        :distance="6"
        :skidding="5"
        :triggers="['click']"
      >
        <button
          v-tooltip.right="{ content: 'DevTools menu', disabled: sidebarExpanded }"
          class="relative h-10 w-full box-border select-none flex items-center justify-center gap-2 border-0 bg-transparent p-2 color-muted hover:bg-active hover:color-base"
          :class="sidebarExpanded ? 'rounded pl-2.5' : 'rounded-xl'"
          type="button"
          aria-label="DevTools menu"
        >
          <span class="i-logos-vue h-6 w-6 shrink-0" aria-hidden="true" />
          <span v-if="sidebarExpanded" class="min-w-0 truncate text-lg font-650"> DevTools </span>
          <span v-if="sidebarExpanded" class="flex-auto" />
          <span
            v-if="sidebarExpanded"
            class="i-carbon-overflow-menu-vertical color-muted text-4"
            aria-hidden="true"
          />
          <span
            class="absolute bottom-2 right-2 h-2 w-2 rounded-full"
            :class="connected ? 'bg-emerald-500' : 'bg-amber-500'"
          />
        </button>

        <template #popper>
          <DockingPanel />
        </template>
      </Dropdown>
    </div>

    <nav
      class="no-scrollbar min-h-0 box-border flex flex-auto flex-col overflow-x-hidden py-2"
      :class="[
        sidebarExpanded ? 'items-stretch px-1.5' : 'items-center px-1.5',
        sidebarScrollable ? 'overflow-y-auto' : 'overflow-y-hidden',
      ]"
      aria-label="Devtools panels"
    >
      <SideNavItem
        v-for="tab in tabs"
        :key="tab.id"
        :tab="tab"
        :active="activeTab === tab.id"
        :expanded="sidebarExpanded"
      />
    </nav>

    <div
      class="w-full box-border shrink-0 border-t border-base bg-subtle flex flex-col p-1"
      :class="sidebarExpanded ? 'items-stretch' : 'items-center'"
    >
      <SideNavItem
        v-for="tab in systemTabs"
        :key="tab.id"
        :tab="tab"
        :active="activeTab === tab.id"
        :expanded="sidebarExpanded"
      />
    </div>
  </aside>
</template>
