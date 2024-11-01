<script setup lang="ts">
import { VueButton, VueCard, VueCheckbox, VueConfirm, VueDarkToggle, VueSelect, VueSwitch } from '@vue/devtools-ui'

// #region view mode
// const viewMode = inject<Ref<'overlay' | 'panel'>>('viewMode', ref('overlay'))
// const viewModeSwitchVisible = computed(() => viewMode.value === 'panel' && isInChromePanel)
// const { toggle: toggleViewMode } = useToggleViewMode()
// #endregion

const { categorizedTabs: categories } = useAllTabs()

const hostEnv = useHostEnv()

/**
 * Enable feature settings in separate window because someone is using it, related #458
 */
const enableFeatureSettings = hostEnv === 'iframe' || hostEnv === 'separate-window'

const { scale, interactionCloseOnOutsideClick, showPanel, minimizePanelInteractive, expandSidebar, scrollableSidebar } = toRefs(toReactive(devtoolsClientState))

// #region settings
const scaleOptions = [
  ['Tiny', 12 / 15],
  ['Small', 14 / 15],
  ['Normal', 1],
  ['Large', 16 / 15],
  ['Huge', 18 / 15],
]
const MinimizeInactiveOptions = [
  ['Always', 0],
  ['1s', 1000],
  ['2s', 2000],
  ['5s', 5000],
  ['10s', 10000],
  ['Never', -1],
]
// #endregion

// #region tabs
const { hiddenTabCategories, hiddenTabs, pinnedTabs } = toRefs(devtoolsClientState.value.tabSettings)
function toggleTab(name: string, v: boolean) {
  if (v)
    hiddenTabs.value = hiddenTabs.value.filter(i => i !== name)
  else
    hiddenTabs.value.push(name)
}

function toggleTabCategory(name: string, v: boolean) {
  if (v)
    hiddenTabCategories.value = hiddenTabCategories.value.filter(i => i !== name)
  else
    hiddenTabCategories.value.push(name)
}

function togglePinTab(name: string) {
  if (pinnedTabs.value.includes(name))
    pinnedTabs.value = pinnedTabs.value.filter(i => i !== name)
  else
    pinnedTabs.value.push(name)
}

function pinMove(name: string, delta: number) {
  const index = pinnedTabs.value.indexOf(name)
  if (index === -1)
    return

  const newIndex = index + delta
  if (newIndex < 0 || newIndex >= pinnedTabs.value.length)
    return

  const newPinnedTabs = [...pinnedTabs.value]
  newPinnedTabs.splice(index, 1)
  newPinnedTabs.splice(newIndex, 0, name)
  pinnedTabs.value = newPinnedTabs
}
// #endregion

const clearOptionsConfirmState = ref(false)
async function clearOptions() {
  resetDevtoolsClientState()
  window.location.reload()
}

const minimizePanelInteractiveOptions = MinimizeInactiveOptions.map(([label, value]) => ({ label, value }))
const minimizePanelInteractiveLabel = computed(() => {
  const option = minimizePanelInteractiveOptions.find(i => i.value === minimizePanelInteractive.value)
  return `${option?.label ?? 'Select...'}`
})

const { openImportDialog } = useImportDevtoolsClientState()
const { exportDevtoolsClientState } = useExportDevtoolsClientState()
</script>

<template>
  <div h-full w-full of-auto px8 py6>
    <IconTitle
      class="mb-5 text-xl op75"
      icon="i-carbon-settings-adjust"
      text="DevTools Settings"
    />
    <div grid="~ md:cols-[repeat(auto-fit,minmax(16rem,1fr))] gap-x-10 gap-y-3" max-w-300>
      <div flex="~ col gap-2">
        <h3 text-lg>
          Tabs
        </h3>
        <template v-for="[{ name, hidden }, tabs] of categories" :key="name">
          <VueCard
            v-if="tabs.length" p3 flex="~ col gap-1"
            :class="hidden ? 'op50 grayscale' : ''"
          >
            <VueSwitch
              :model-value="!hiddenTabCategories.includes(name)"
              class="row-reverse flex hover:bg-active py1 pl2 pr1"
              @update:model-value="(v: boolean) => toggleTabCategory(name, v)"
            >
              <div flex="~ gap-2" flex-auto items-center justify-start>
                <span capitalize op75>{{ name }}</span>
              </div>
            </VueSwitch>

            <div mx--1 my1 h-1px border="b base" op75 />

            <template v-for="tab of tabs" :key="tab.name">
              <VueSwitch
                class="row-reverse n-primary flex hover:bg-active py1 pl2 pr1"
                :model-value="!hiddenTabs.includes(tab.name)"
                :class="tab.hidden ? 'op35' : ''"
                @update:model-value="(v: boolean) => toggleTab(tab.name, v)"
              >
                <div flex="~ gap-2" flex-auto items-center justify-start pr-4 text-sm>
                  <TabIcon text-xl :icon="tab.icon" :fallback="tab.fallbackIcon" :title="tab.title" />
                  <span>{{ tab.title }}</span>
                  <div flex-auto />
                  <template v-if="pinnedTabs.includes(tab.name)">
                    <button
                      class="flex items-center hover:(bg-active op100) px1 py1 text-sm op65"
                      @click.stop="() => {
                        if (pinnedTabs.indexOf(tab.name) === 0) return
                        pinMove(tab.name, -1)
                      }"
                    >
                      <div class="i-carbon-caret-up" />
                    </button>
                    <button
                      class="flex items-center hover:(bg-active op100) px1 py1 text-sm op65"
                      @click.stop="() => {
                        if (pinnedTabs.indexOf(tab.name) === pinnedTabs.length - 1) return
                        pinMove(tab.name, 1)
                      }"
                    >
                      <div class="i-carbon-caret-down" />
                    </button>
                  </template>
                  <button class="flex items-center hover:(bg-active op100) px1 py1 text-sm op65" @click.stop="togglePinTab(tab.name)">
                    <div :class="pinnedTabs.includes(tab.name) ? ' i-carbon-pin-filled rotate--45' : ' i-carbon-pin op45'" />
                  </button>
                </div>
              </VueSwitch>
            </template>
          </VueCard>
        </template>
      </div>
      <div flex="~ col gap-2">
        <h3 text-lg>
          Appearance
        </h3>
        <VueCard p4 flex="~ col gap-2">
          <div flex="~ gap2">
            <VueDarkToggle v-slot="{ isDark, toggle }">
              <VueButton outlined type="primary" @click="toggle">
                <div i-carbon-sun dark:i-carbon-moon translate-y--1px /> {{ isDark ? 'Dark' : 'Light' }}
              </VueButton>
            </VueDarkToggle>
            <!-- <VueButton v-if="viewModeSwitchVisible" outlined type="primary" @click="toggleViewMode('overlay')">
              Switch to Overlay Mode
            </VueButton> -->
          </div>
          <div mx--2 my1 h-1px border="b base" op75 />
          <p>UI Scale</p>
          <div>
            <VueSelect
              v-model="scale" :options="scaleOptions.map(([label, value]) => ({ label, value }))" :button-props="{ outlined: true }"
            />
          </div>
          <div mx--2 my1 h-1px border="b base" op75 />
          <div class="flex items-center gap2 text-sm">
            <VueCheckbox v-model="expandSidebar" />
            <span op75>Expand Sidebar</span>
          </div>
          <div class="flex items-center gap2 text-sm">
            <VueCheckbox v-model="scrollableSidebar" />
            <span op75>Scrollable Sidebar</span>
          </div>
        </VueCard>

        <template v-if="enableFeatureSettings">
          <h3 mt2 text-lg>
            Features
          </h3>
          <VueCard p4 flex="~ col gap-2">
            <div class="flex items-center gap2 text-sm">
              <VueCheckbox v-model="interactionCloseOnOutsideClick" />
              <span op75>Close DevTools when clicking outside</span>
            </div>
            <div class="flex items-center gap2 text-sm">
              <VueCheckbox v-model="showPanel" />
              <span op75>Always show the floating panel</span>
            </div>

            <div mx--2 my1 h-1px border="b base" op75 />

            <p>Minimize floating panel on inactive</p>
            <div>
              <VueSelect v-model="minimizePanelInteractive" :button-props="{ outlined: true }" :options="minimizePanelInteractiveOptions" :placeholder="minimizePanelInteractiveLabel" />
            </div>
          </VueCard>
        </template>

        <h3 mt2 text-lg>
          Data
        </h3>
        <div flex="~ gap-2 wrap">
          <VueButton outlined @click="() => exportDevtoolsClientState()">
            <div i-ph-export />
            Export Settings
          </VueButton>
          <VueButton outlined @click="() => openImportDialog()">
            <div i-ph-download-simple />
            Import Settings
          </VueButton>
        </div>

        <h3 mt2 text-lg>
          Debug
        </h3>
        <div flex="~ gap-2">
          <VueButton outlined type="warning" @click="clearOptionsConfirmState = true">
            <div i-carbon-breaking-change />
            Reset Local Settings & State
          </VueButton>
          <VueConfirm
            v-model="clearOptionsConfirmState"
            title="Clear Local Settings & State"
            width="40%"
            height="200px"
            content="Are you sure you to reset all local settings & state? Devtools will reload."
            @confirm="clearOptions"
          />
        </div>
      </div>
    </div>
  </div>
</template>
