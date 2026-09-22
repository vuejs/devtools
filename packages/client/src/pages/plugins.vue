<script setup lang="ts">
import type { PluginSettingSchema, PluginSnapshot } from '../composables/devtools-client'
import { Pane, Splitpanes } from 'splitpanes'
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import PluginSettings from '../components/plugins/PluginSettings.vue'
import { useDevtoolsClient } from '../composables/devtools-client'
import { isInternalDevtoolsPlugin } from '../utils/inspectors'

const { error, inspectors, plugins, timelineLayers, updatePluginSetting } = useDevtoolsClient()

const container = ref<HTMLElement>()
const compact = ref(false)
const search = ref('')
const selectedPluginId = ref('')

let observer: ResizeObserver | undefined

const publicPlugins = computed(() =>
  plugins.value.filter((plugin) => !isInternalDevtoolsPlugin(plugin, inspectors.value)),
)

const sortedPlugins = computed(() =>
  [...publicPlugins.value].sort((a, b) => getPluginTitle(a).localeCompare(getPluginTitle(b))),
)

const filteredPlugins = computed(() => {
  const query = search.value.trim().toLowerCase()
  if (!query) return sortedPlugins.value

  return sortedPlugins.value.filter((plugin) =>
    [plugin.label, plugin.packageName, plugin.homepage, plugin.id].some((value) =>
      value?.toLowerCase().includes(query),
    ),
  )
})

const selectedPlugin = computed(() =>
  publicPlugins.value.find((plugin) => plugin.id === selectedPluginId.value),
)

const selectedInspectors = computed(() => {
  const pluginId = selectedPlugin.value?.id
  return pluginId ? inspectors.value.filter((inspector) => inspector.pluginId === pluginId) : []
})

const selectedTimelineLayers = computed(() => {
  const pluginId = selectedPlugin.value?.id
  return pluginId ? timelineLayers.value.filter((layer) => layer.pluginId === pluginId) : []
})

const selectedSettingEntries = computed<[string, PluginSettingSchema][]>(() =>
  Object.entries(selectedPlugin.value?.settings ?? {}).sort(([a], [b]) => a.localeCompare(b)),
)

watch(
  filteredPlugins,
  (items) => {
    if (items.some((plugin) => plugin.id === selectedPluginId.value)) return
    selectedPluginId.value = items[0]?.id ?? ''
  },
  { immediate: true },
)

function selectPlugin(pluginId: string) {
  selectedPluginId.value = pluginId
}

function getPluginTitle(plugin: PluginSnapshot): string {
  return plugin.label || plugin.packageName || plugin.id
}

function getPluginSubtitle(plugin: PluginSnapshot): string {
  return plugin.packageName || plugin.id
}

function setPluginSettingValue(plugin: PluginSnapshot, key: string, value: unknown) {
  void updatePluginSetting(plugin.id, key, value).catch(() => {})
}

onMounted(() => {
  observer = new ResizeObserver(([entry]) => {
    compact.value = entry.contentRect.width < 780
  })
  if (container.value) observer.observe(container.value)
})

onUnmounted(() => {
  observer?.disconnect()
})
</script>

<template>
  <section ref="container" class="h-full min-h-0 overflow-hidden">
    <div v-if="!publicPlugins.length" class="h-full flex items-center justify-center p-6">
      <div class="max-w-90 text-center">
        <div class="mx-auto mb-2 h-8 w-8 flex items-center justify-center">
          <span class="i-carbon-plug color-muted text-7" aria-hidden="true" />
        </div>
        <div class="font-650">No data</div>
      </div>
    </div>

    <Splitpanes v-else class="h-full min-h-0 overflow-hidden" :horizontal="compact">
      <Pane class="h-full min-h-0" min-size="18" :size="compact ? 34 : 28">
        <aside class="h-full min-h-0 flex flex-col bg-#88808005">
          <label class="h-9.5 shrink-0 flex items-center gap-1.5 px-3.5">
            <span class="i-carbon-search shrink-0 color-muted text-4" aria-hidden="true" />
            <input
              v-model="search"
              class="min-w-0 w-full border-0 bg-transparent p-0 outline-none font-state-field text-3.5 color-inherit placeholder-color-gray-500 dark:placeholder-gray-300"
              placeholder="Filter plugins..."
              type="search"
            />
          </label>

          <div class="no-scrollbar min-h-0 flex-1 overflow-auto p-1.5">
            <button
              v-for="plugin in filteredPlugins"
              :key="plugin.id"
              class="w-full min-h-8 flex items-center gap-2 border-0 rounded-0 bg-transparent px-2 py-1 color-inherit hover:bg-active"
              :class="plugin.id === selectedPluginId ? 'bg-active!' : ''"
              type="button"
              @click="selectPlugin(plugin.id)"
            >
              <span
                class="h-6 w-6 shrink-0 color-active op90 inline-flex items-center justify-center"
              >
                <img v-if="plugin.logo" class="max-h-full max-w-full" :src="plugin.logo" alt="" />
                <span v-else class="i-carbon-plug text-4" aria-hidden="true" />
              </span>

              <span class="min-w-0 flex-1 text-left">
                <span class="block truncate font-state-field text-3.5">
                  {{ getPluginTitle(plugin) }}
                </span>
                <code class="block truncate color-muted text-3.5 leading-4">
                  {{ getPluginSubtitle(plugin) }}
                </code>
              </span>
            </button>

            <div v-if="!filteredPlugins.length" class="px-3 py-8 text-center color-muted text-13px">
              No matching plugins
            </div>
          </div>
        </aside>
      </Pane>

      <Pane class="h-full min-h-0" min-size="44">
        <div v-if="selectedPlugin" class="h-full min-h-0">
          <Splitpanes class="h-full min-h-0 overflow-hidden" :horizontal="compact">
            <Pane class="h-full min-h-0" min-size="28" :size="compact ? 42 : 38">
              <aside class="h-full min-h-0 flex flex-col bg-transparent">
                <header
                  class="min-h-15 shrink-0 flex items-center gap-2.5 border-b border-base px-4 py-3"
                >
                  <span class="h-8 w-8 shrink-0 inline-flex items-center justify-center">
                    <img
                      v-if="selectedPlugin.logo"
                      class="max-h-full max-w-full"
                      :src="selectedPlugin.logo"
                      alt=""
                    />
                    <span v-else class="i-carbon-plug color-muted text-5" aria-hidden="true" />
                  </span>

                  <div class="min-w-0 flex-1">
                    <h1 class="m-0 truncate font-state-field text-3.5">
                      {{ getPluginTitle(selectedPlugin) }}
                    </h1>
                    <code class="block truncate color-muted text-3.5 leading-5">
                      {{ selectedPlugin.id }}
                    </code>
                  </div>
                </header>

                <div class="no-scrollbar min-h-0 flex-1 overflow-auto">
                  <section class="px-4 py-4">
                    <div
                      class="min-h-6 flex items-center color-muted font-state-field font-500 text-3.5"
                    >
                      Details
                    </div>
                    <dl
                      class="plugin-info-list m-0 mt-2.5 grid grid-cols-[minmax(7rem,max-content)_minmax(0,1fr)] gap-x-4 gap-y-2.5 font-state-field text-3.5"
                    >
                      <div class="contents">
                        <dt class="text-#a3a3a3">ID</dt>
                        <dd class="m-0 min-w-0">
                          <code>{{ selectedPlugin.id }}</code>
                        </dd>
                      </div>

                      <div v-if="selectedPlugin.packageName" class="contents">
                        <dt class="text-#a3a3a3">Package</dt>
                        <dd class="m-0 min-w-0">
                          <code>{{ selectedPlugin.packageName }}</code>
                        </dd>
                      </div>

                      <div v-if="selectedPlugin.homepage" class="contents">
                        <dt class="text-#a3a3a3">Homepage</dt>
                        <dd class="m-0 min-w-0">
                          <a
                            class="color-inherit inline-flex items-center gap-0.75 no-underline hover:color-active"
                            :href="selectedPlugin.homepage"
                            rel="noreferrer"
                            target="_blank"
                          >
                            Open
                            <span class="i-carbon-launch text-3" aria-hidden="true" />
                          </a>
                        </dd>
                      </div>
                    </dl>
                  </section>

                  <section class="border-t border-base px-4 py-4">
                    <div
                      class="min-h-6 flex items-center color-muted font-state-field font-500 text-3.5"
                    >
                      Capabilities
                    </div>
                    <dl
                      class="plugin-info-list m-0 mt-2.5 grid grid-cols-[minmax(7rem,max-content)_minmax(0,1fr)] gap-x-4 gap-y-2.5 font-state-field text-3.5"
                    >
                      <div class="contents">
                        <dt class="text-#a3a3a3">Custom inspectors</dt>
                        <dd class="m-0 min-w-0">
                          <span
                            v-if="selectedInspectors.length"
                            class="flex flex-wrap gap-x-2 gap-y-1.5"
                          >
                            <span v-for="inspector in selectedInspectors" :key="inspector.id">
                              {{ inspector.label }}
                            </span>
                          </span>
                          <span v-else class="color-muted">None</span>
                        </dd>
                      </div>

                      <div class="contents">
                        <dt class="text-#a3a3a3">Timeline layers</dt>
                        <dd class="m-0 min-w-0">
                          <span
                            v-if="selectedTimelineLayers.length"
                            class="flex flex-wrap gap-x-2 gap-y-1.5"
                          >
                            <span v-for="layer in selectedTimelineLayers" :key="layer.id">
                              {{ layer.label }}
                            </span>
                          </span>
                          <span v-else class="color-muted">None</span>
                        </dd>
                      </div>

                      <div class="contents">
                        <dt class="text-#a3a3a3">Settings</dt>
                        <dd class="m-0 min-w-0">{{ selectedSettingEntries.length }}</dd>
                      </div>
                    </dl>
                  </section>

                  <div
                    v-if="error"
                    class="mx-4 mb-4 border-l-2 border-red-500 px-2.5 py-1.5 text-red-600 text-12px"
                  >
                    {{ error }}
                  </div>
                </div>
              </aside>
            </Pane>

            <Pane class="h-full min-h-0" min-size="40">
              <PluginSettings
                :plugin="selectedPlugin"
                @update="(key, value) => setPluginSettingValue(selectedPlugin!, key, value)"
              />
            </Pane>
          </Splitpanes>
        </div>

        <div v-else class="h-full flex items-center justify-center color-muted text-13px">
          Select a plugin
        </div>
      </Pane>
    </Splitpanes>
  </section>
</template>

<style scoped>
@media (max-width: 780px) {
  .plugin-info-list {
    grid-template-columns: minmax(0, 1fr);
    gap: 0.5rem;
  }
}
</style>
