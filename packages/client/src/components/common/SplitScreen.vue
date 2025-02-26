<script setup lang="ts">
import { CustomInspector as CustomInspectorComponent } from '@vue/devtools-applet'
import { CustomTab } from '@vue/devtools-kit'
import { vTooltip, VueButton, VueCard, VueDropdown } from '@vue/devtools-ui'
import { ModuleBuiltinTab } from '~/types'

function close() {
  devtoolsClientState.value.splitScreen.enabled = false
}
const splitScreenState = computed(() => devtoolsClientState.value.splitScreen)

const { enabledTabs, flattenedTabs } = useAllTabs()
const router = useRouter()
const route = useRoute()
const PageComponent = shallowRef()
const customTabName = ref<string | null>(null)
const customPluginId = ref<string | null>(null)
const customTabType = ref<'custom-tab' | 'custom-inspector' | null>(null)

function isMatchedWithRoute(tab?: typeof flattenedTabs['value'][number]) {
  const routeTabName = getRouteTabName()
  if (!tab)
    return false
  return tab.name === routeTabName
}

const currentTab = computed(() => {
  const tab = flattenedTabs.value.find(tab => tab.name === splitScreenState.value.view)
  return isMatchedWithRoute(tab) ? undefined : tab
})

const mainViewName = computed(() =>
  getRouteTabName(),
)

function getRouteTabName() {
  if (route.path.startsWith(`/${CUSTOM_TAB_VIEW}/`)) {
    return route.path.slice(CUSTOM_TAB_VIEW.length + 2)
  }
  if (route.path.startsWith(`/${CUSTOM_INSPECTOR_TAB_VIEW}/`)) {
    return route.path.slice(CUSTOM_INSPECTOR_TAB_VIEW.length + 2)
  }
  if (route.path.startsWith('/')) {
    return route.path.slice(1)
  }
  return route.path
}

watch(
  () => currentTab.value,
  (tab) => {
    if (!tab)
      return
    // check if is a custom tab
    if ((tab as CustomTab).view) {
      customTabName.value = tab.name
      customTabType.value = 'custom-tab'
      return
    }
    if ((tab as ModuleBuiltinTab).path.startsWith(CUSTOM_INSPECTOR_TAB_VIEW)) {
      customTabName.value = tab.name
      customPluginId.value = tab.pluginId
      customTabType.value = 'custom-inspector'
      return
    }
    customTabName.value = null
    const routes = router.getRoutes()
    const matched = routes.find(route => route.path === `/${(tab as ModuleBuiltinTab).path}`)
    const component = matched?.components?.default
    if (typeof component === 'function')
      PageComponent.value = defineAsyncComponent(component as any)
    else
      PageComponent.value = component
  },
  { immediate: true },
)

const showGridPanel = ref(false)
</script>

<template>
  <div h-full h-screen of-hidden>
    <div v-if="(PageComponent || customTabName) && currentTab" border="b base" flex="~ gap1" z-99 px4 py3 navbar-glass>
      <VueDropdown placement="bottom-start" :distance="12" :skidding="5" :shown="showGridPanel" trigger="click">
        <div flex cursor-pointer items-center gap2>
          <div i-carbon-chevron-down text-sm op50 />
          <TabIcon
            text-xl
            :icon="currentTab?.icon"
            :title="currentTab.name"
            :fallback="(currentTab as ModuleBuiltinTab).fallbackIcon"
            :show-title="false"
          />
          <span capitalize>
            {{ currentTab?.name }}
          </span>
        </div>
        <template #popper>
          <TabsGrid :categories="enabledTabs" target="side" :disabled-items="[mainViewName]" />
        </template>
      </VueDropdown>
      <div flex-auto />
      <button
        v-tooltip="'Close split screen'"
        title="Close split screen" cursor-pointer hover:bg-active px1
        @click="close"
      >
        <div i-carbon:side-panel-open />
      </button>
    </div>
    <template v-if="customTabName && currentTab">
      <CustomTabComponent v-if="customTabType === 'custom-tab'" :tab="currentTab as CustomTab" class="h-[calc(100%-50px)]" iframe-inline of-auto />
      <CustomInspectorComponent v-else-if="customPluginId" :id="customTabName" :plugin-id="customPluginId!" />
    </template>
    <div v-else-if="PageComponent && currentTab" of-auto class="h-[calc(100%-50px)]">
      <component :is="PageComponent" :key="`tab-${currentTab.name}`" />
    </div>
    <div v-else class="h-full w-full $ui-fcc">
      <div>
        <span text-lg op50>
          Select a tab to start
        </span>
        <VueCard px4 py2 bg-base>
          <TabsGrid :categories="enabledTabs" target="side" :disabled-items="[mainViewName]" />
        </VueCard>
        <VueButton type="warning" outlined mt2 @click="close">
          Close Split Screen
        </VueButton>
      </div>
    </div>
  </div>
</template>
