<script setup lang="ts">
import { VueDropdown } from '@vue/devtools-ui'

const emit = defineEmits(['toggleDevtoolsClientVisible'])
const showDocking = ref(false)
const showMoreTabs = ref(false)
const panel = ref()
const buttonDocking = ref<HTMLButtonElement>()
const buttonMoreTabs = ref<HTMLButtonElement>()
const sidebarExpanded = computed(() => devtoolsClientState.value.expandSidebar)
const sidebarScrollable = computed(() => devtoolsClientState.value.scrollableSidebar)
const { enabledTabs, flattenedTabs } = useAllTabs()

const ITEM_HEIGHT = 45

const { height: windowHeight } = useWindowSize()
const containerCapacity = computed(() => {
  const containerHeight = windowHeight.value - 130
  return Math.max(0, Math.floor(containerHeight / ITEM_HEIGHT))
})
const inlineTabs = computed(() => flattenedTabs.value.slice(0, containerCapacity.value))
const overflowTabs = computed(() => flattenedTabs.value.slice(containerCapacity.value))
const categorizedInlineTabs = getCategorizedTabs(inlineTabs, enabledTabs)
const categorizedOverflowTabs = getCategorizedTabs(overflowTabs, enabledTabs)

const displayedTabs = computed(() =>
  (sidebarScrollable.value || sidebarExpanded.value)
    ? enabledTabs.value
    : categorizedInlineTabs.value,
)

onClickOutside(
  panel,
  (e) => {
    if (buttonDocking.value && e.composedPath().includes(buttonDocking.value))
      return
    if (buttonMoreTabs.value && e.composedPath().includes(buttonMoreTabs.value))
      return
    showDocking.value = false
    showMoreTabs.value = false
  },
  { detectIframe: true },
)

const containerRef = ref<HTMLDivElement>()

const dropdownDistance = ref(6)

useResizeObserver(containerRef, () => {
  // This is a hack to force the dropdown to reposition itself
  dropdownDistance.value = dropdownDistance.value === 6 ? 6.01 : 6
})

const hostEnv = useHostEnv()
useIntersectionObserver(
  containerRef,
  ([{ isIntersecting }]) => {
    emit('toggleDevtoolsClientVisible', {
      visible: isIntersecting,
      host: hostEnv,
    })
  },
)
</script>

<template>
  <div
    ref="containerRef"
    border="r base" flex="~ col items-start"
    class="$ui-z-max-override" h-full of-hidden bg-base
  >
    <div
      sticky top-0 z-1 w-full p1 bg-base border="b base"
    >
      <VueDropdown placement="left-start" :distance="dropdownDistance" :skidding="5" trigger="click" :shown="showDocking" class="w-full">
        <button
          ref="buttonDocking"
          flex="~ items-center justify-center gap-2"
          hover="bg-active"
          text-secondary relative h-10 w-full select-none p2
          exact-active-class="!text-primary bg-active"
          :class="[
            sidebarExpanded ? 'rounded pl2.5' : 'rounded-xl',
          ]"
        >
          <div i-logos-vue h-6 w-6 />
          <template v-if="sidebarExpanded">
            <span text-lg font-600 text-base>
              DevTools
            </span>
            <div flex-auto />
            <div i-carbon-overflow-menu-vertical />
          </template>
        </button>
        <template #popper>
          <DockingPanel />
        </template>
      </VueDropdown>
    </div>

    <div
      flex="~ auto col gap-0.5 items-center" w-full of-x-hidden of-y-auto p1 class="no-scrollbar"
    >
      <template v-for="[name, tabs], idx of displayedTabs" :key="name">
        <!-- if is not the first nonempty list, render the top divider -->
        <div v-if="idx" my1 h-1px w-full border="b base" />
        <SideNavItem
          v-for="tab of tabs.filter(item => !item.hidden)"
          :key="tab.name"
          :tab="tab"
          :minimized="!sidebarExpanded"
        />
      </template>
      <div flex-auto />
    </div>

    <div
      :flex="`~ items-center gap-1 ${sidebarExpanded ? '' : 'none col'}`"
      border="t base" sticky bottom-0 w-full p1 bg-base class="$ui-z-max-override"
    >
      <VueDropdown
        v-if="overflowTabs.length && !sidebarScrollable && !sidebarExpanded" placement="left-end"
        :distance="6"
      >
        <button
          ref="buttonMoreTabs" flex="~"
          hover="bg-active"
          text-secondary relative h-10 w-10 select-none items-center justify-center rounded-xl p1
          exact-active-class="!text-primary bg-active"
        >
          <TabIcon
            text-xl
            icon="i-carbon-overflow-menu-vertical" title="More tabs" :show-title="false"
          />
          <div
            absolute bottom-0 right-0 h-4 w-4 rounded-full text-9px
            flex="~ items-center justify-center"
            border="~ base"
          >
            <span translate-y-0.5px>{{ overflowTabs.length }}</span>
          </div>
        </button>
        <template #popper>
          <TabsGrid :categories="categorizedOverflowTabs" max-w-80 target="main" />
        </template>
      </VueDropdown>
      <SideNavItem
        :minimized="!sidebarExpanded"
        :tab="{
          icon: 'i-carbon-settings-adjust',
          title: 'Settings',
          name: 'settings',
          path: '/settings',
        }"
      />
    </div>
  </div>
</template>
