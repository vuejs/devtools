<script setup lang="ts">
import type { Ref } from 'vue'
import { computed, ref, toRefs } from 'vue'
import Checkbox from '../components/common/Checkbox.vue'
import ConfirmationDialog from '../components/common/ConfirmationDialog.vue'
import Switch from '../components/common/Switch.vue'
import TabIcon from '../components/nav/TabIcon.vue'
import { useDevtoolsColorMode } from '../composables/color-mode'
import { useDevtoolsSettings } from '../composables/settings'
import { useDevtoolsTabCatalog } from '../composables/tabs'

const { categorizedTabs: categories } = useDevtoolsTabCatalog()
const { dark, setDarkMode } = useDevtoolsColorMode()
const { settings, resetDevtoolsSettings } = useDevtoolsSettings()

const { scale, expandSidebar, scrollableSidebar, highlightUpdates } = toRefs(settings)
const { hiddenTabCategories, hiddenTabs, pinnedTabs } = toRefs(settings.tabSettings)

const scaleOptions = [
  ['Tiny', 12 / 15],
  ['Small', 14 / 15],
  ['Normal', 1],
  ['Large', 16 / 15],
  ['Huge', 18 / 15],
] as const

const clearOptionsConfirmState = ref(false)

function onToggleDarkMode() {
  setDarkMode(!dark.value)
}

function toggleTab(name: string, visible: boolean) {
  setListValue(hiddenTabs, name, !visible)
}

function toggleTabCategory(name: string, visible: boolean) {
  setListValue(hiddenTabCategories, name, !visible)
}

function togglePinTab(name: string) {
  setListValue(pinnedTabs, name, !pinnedTabs.value.includes(name))
}

function pinMove(name: string, delta: number) {
  const index = pinnedTabs.value.indexOf(name)
  if (index === -1) return

  const newIndex = index + delta
  if (newIndex < 0 || newIndex >= pinnedTabs.value.length) return

  const next = [...pinnedTabs.value]
  next.splice(index, 1)
  next.splice(newIndex, 0, name)
  pinnedTabs.value = next
}

function clearOptions() {
  resetDevtoolsSettings()
  window.location.reload()
}

function setListValue(list: Ref<string[]>, name: string, enabled: boolean) {
  const exists = list.value.includes(name)
  if (enabled && !exists) {
    list.value = [...list.value, name]
    return
  }

  if (!enabled && exists) list.value = list.value.filter((item) => item !== name)
}
</script>

<template>
  <div class="h-full w-full overflow-y-auto">
    <div class="min-h-full px-8 py-6">
      <div class="mb-5 flex items-center gap-2 text-xl op75">
        <div class="i-carbon-settings-adjust" />
        <span>DevTools Settings</span>
      </div>

      <div
        class="grid max-w-300 grid-cols-1 gap-x-10 gap-y-3 md:grid-cols-[repeat(auto-fit,minmax(16rem,1fr))]"
      >
        <div class="flex flex-col gap-2">
          <h3 class="text-lg">Tabs</h3>

          <template v-for="[{ name, hidden }, tabs] of categories" :key="name">
            <div
              v-if="tabs.length"
              class="panel-card flex flex-col gap-1 p-3"
              :class="hidden ? 'op50 grayscale' : ''"
            >
              <Switch
                :model-value="!hiddenTabCategories.includes(name)"
                class="flex-row-reverse py-1 pl-2 pr-1 hover:bg-active"
                :aria-label="`Toggle ${name} tabs`"
                @update:model-value="(value: boolean) => toggleTabCategory(name, value)"
              >
                <span class="flex flex-auto items-center justify-start gap-2 capitalize op75">
                  {{ name }}
                </span>
              </Switch>

              <div class="-mx-1 my-1 h-1px border-b border-base op75" />

              <template v-for="tab of tabs" :key="tab.id">
                <Switch
                  :model-value="!hiddenTabs.includes(tab.id)"
                  class="flex-row-reverse py-1 pl-2 pr-1 hover:bg-active"
                  :class="tab.hidden ? 'op35' : ''"
                  :aria-label="`Toggle ${tab.title}`"
                  @update:model-value="(value: boolean) => toggleTab(tab.id, value)"
                >
                  <span
                    class="min-w-0 flex flex-auto items-center justify-start gap-2 pr-4 text-sm"
                  >
                    <TabIcon class="text-xl" :icon="tab.icon" />
                    <span class="truncate">{{ tab.title }}</span>
                    <span class="flex-auto" />

                    <template v-if="pinnedTabs.includes(tab.id)">
                      <button
                        v-tooltip.bottom="'Move up'"
                        class="settings-icon-button"
                        type="button"
                        aria-label="Move pinned tab up"
                        :disabled="pinnedTabs.indexOf(tab.id) === 0"
                        title="Move up"
                        @click.stop.prevent="pinMove(tab.id, -1)"
                      >
                        <div class="i-carbon-caret-up" aria-hidden="true" />
                      </button>
                      <button
                        v-tooltip.bottom="'Move down'"
                        class="settings-icon-button"
                        type="button"
                        aria-label="Move pinned tab down"
                        :disabled="pinnedTabs.indexOf(tab.id) === pinnedTabs.length - 1"
                        title="Move down"
                        @click.stop.prevent="pinMove(tab.id, 1)"
                      >
                        <div class="i-carbon-caret-down" aria-hidden="true" />
                      </button>
                    </template>

                    <button
                      v-tooltip.bottom="pinnedTabs.includes(tab.id) ? 'Unpin tab' : 'Pin tab'"
                      class="settings-icon-button"
                      type="button"
                      :aria-label="pinnedTabs.includes(tab.id) ? 'Unpin tab' : 'Pin tab'"
                      :title="pinnedTabs.includes(tab.id) ? 'Unpin tab' : 'Pin tab'"
                      @click.stop.prevent="togglePinTab(tab.id)"
                    >
                      <div
                        :class="
                          pinnedTabs.includes(tab.id)
                            ? 'i-carbon-pin-filled -rotate-45'
                            : 'i-carbon-pin op45'
                        "
                        aria-hidden="true"
                      />
                    </button>
                  </span>
                </Switch>
              </template>
            </div>
          </template>
        </div>

        <div class="flex flex-col gap-2">
          <h3 class="text-lg">Appearance</h3>

          <div class="panel-card flex flex-col gap-2 p-4">
            <div class="flex gap-2">
              <button
                class="settings-button text-primary-700 dark:text-primary-300"
                type="button"
                @click="onToggleDarkMode"
              >
                <div :class="dark ? 'i-carbon-moon' : 'i-carbon-sun'" />
                {{ dark ? 'Dark' : 'Light' }}
              </button>
            </div>

            <div class="-mx-2 my-1 h-1px border-b border-base op75" />

            <p>UI Scale</p>
            <div>
              <select
                v-model.number="scale"
                class="settings-select"
                :aria-label="`UI Scale: ${scale}`"
              >
                <option v-for="[label, value] of scaleOptions" :key="label" :value="value">
                  {{ label }}
                </option>
              </select>
            </div>

            <div class="-mx-2 my-1 h-1px border-b border-base op75" />

            <Checkbox v-model="expandSidebar" class="text-sm">
              <span class="op75">Expand Sidebar</span>
            </Checkbox>
            <Checkbox v-model="scrollableSidebar" class="text-sm">
              <span class="op75">Scrollable Sidebar</span>
            </Checkbox>
            <Checkbox v-model="highlightUpdates" class="text-sm">
              <span class="op75">Highlight component updates</span>
            </Checkbox>
          </div>

          <h3 class="mt-2 text-lg">Debug</h3>

          <div class="flex gap-2">
            <button
              class="settings-button text-primary-700 dark:text-primary-300"
              type="button"
              @click="clearOptionsConfirmState = true"
            >
              <div class="i-carbon-breaking-change" />
              Reset Local Settings & State
            </button>
          </div>
        </div>
      </div>

      <ConfirmationDialog
        v-model:open="clearOptionsConfirmState"
        description="Are you sure you want to reset all local settings and state? DevTools will reload."
        title="Clear Local Settings & State"
        @confirm="clearOptions"
      />
    </div>
  </div>
</template>
