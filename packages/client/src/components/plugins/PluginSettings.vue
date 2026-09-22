<script setup lang="ts">
import type {
  PluginSettingOption,
  PluginSettingSchema,
  PluginSnapshot,
} from '../../composables/devtools-client'
import { computed } from 'vue'
import Checkbox from '../common/Checkbox.vue'
const props = defineProps<{ plugin: PluginSnapshot }>()
const emit = defineEmits<{ update: [key: string, value: unknown] }>()
const selectedSettingEntries = computed<[string, PluginSettingSchema][]>(() =>
  Object.entries(props.plugin.settings ?? {}).sort(([a], [b]) => a.localeCompare(b)),
)

function getSettingType(schema: PluginSettingSchema): 'boolean' | 'choice' | 'text' | 'number' {
  if (schema.type) return schema.type
  if (schema.options?.length) return 'choice'
  if (typeof schema.defaultValue === 'boolean') return 'boolean'
  if (typeof schema.defaultValue === 'number') return 'number'
  return 'text'
}

function getSettingLabel(key: string, schema: PluginSettingSchema): string {
  return schema.label || titleize(key)
}

function getSettingDescription(schema: PluginSettingSchema): string | undefined {
  return typeof schema.description === 'string' ? schema.description : undefined
}

function getSettingValue(key: string, schema: PluginSettingSchema): unknown {
  const settingValues = props.plugin.settingValues ?? {}
  return key in settingValues ? settingValues[key] : schema.defaultValue
}

function getSettingTextValue(key: string, schema: PluginSettingSchema): string {
  const value = getSettingValue(key, schema)
  return value == null ? '' : String(value)
}

function getChoiceOptions(schema: PluginSettingSchema): PluginSettingOption[] {
  return schema.options ?? []
}

function isChoiceSelected(
  key: string,
  schema: PluginSettingSchema,
  option: PluginSettingOption,
): boolean {
  return Object.is(getSettingValue(key, schema), option.value)
}

function updateTextSetting(key: string, event: Event) {
  if (!(event.currentTarget instanceof HTMLInputElement)) return
  setPluginSettingValue(key, event.currentTarget.value)
}

function updateNumberSetting(key: string, event: Event) {
  if (!(event.currentTarget instanceof HTMLInputElement)) return
  const value = Number(event.currentTarget.value)
  setPluginSettingValue(key, Number.isNaN(value) ? event.currentTarget.value : value)
}

function updateSelectSetting(key: string, schema: PluginSettingSchema, event: Event) {
  if (!(event.currentTarget instanceof HTMLSelectElement)) return
  const selectedValue = event.currentTarget.value
  const option = getChoiceOptions(schema).find((item) => String(item.value) === selectedValue)
  setPluginSettingValue(key, option?.value ?? selectedValue)
}

function titleize(value: string): string {
  return value
    .replace(/[-_:.]+/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
}
function setPluginSettingValue(key: string, value: unknown) {
  emit('update', key, value)
}
</script>
<template>
  <section class="plugin-settings-pane h-full min-h-0 flex flex-col bg-transparent">
    <div
      class="min-h-15 shrink-0 flex items-center gap-2 border-b border-base px-4 font-state-field text-3.5"
    >
      <span>Settings</span>
      <span class="color-muted font-400">{{ selectedSettingEntries.length }}</span>
    </div>

    <div class="no-scrollbar min-h-0 flex-1 overflow-auto">
      <template v-if="selectedSettingEntries.length">
        <div
          v-for="[key, schema] in selectedSettingEntries"
          :key="key"
          class="plugin-setting-row mx-4 grid grid-cols-[minmax(0,1fr)_max-content] items-center gap-4 border-b border-base py-3"
        >
          <div class="min-w-0">
            <div class="font-state-field text-3.5">
              {{ getSettingLabel(key, schema) }}
            </div>
            <div
              v-if="getSettingDescription(schema)"
              class="mt-0.5 color-muted text-13px leading-5"
            >
              {{ getSettingDescription(schema) }}
            </div>
            <code class="mt-1 block truncate color-muted text-3.5">{{ key }}</code>
          </div>

          <div class="plugin-setting-control min-w-0 flex justify-end">
            <Checkbox
              v-if="getSettingType(schema) === 'boolean'"
              :aria-label="getSettingLabel(key, schema)"
              :model-value="getSettingValue(key, schema) === true"
              @update:model-value="(value: boolean) => setPluginSettingValue(key, value)"
            />

            <div
              v-else-if="getSettingType(schema) === 'choice' && schema.component === 'button-group'"
              class="min-w-0 inline-flex overflow-hidden rounded-1 border border-base"
            >
              <button
                v-for="option in getChoiceOptions(schema)"
                :key="String(option.value)"
                class="min-w-10 border-0 border-r border-base bg-transparent px-2 py-1 color-inherit text-3.5 last:border-r-0 hover:bg-active"
                :class="{
                  'bg-primary-500/15 text-primary-700 dark:text-primary-300': isChoiceSelected(
                    key,
                    schema,
                    option,
                  ),
                }"
                type="button"
                @click="setPluginSettingValue(key, option.value)"
              >
                {{ option.label }}
              </button>
            </div>

            <select
              v-else-if="getSettingType(schema) === 'choice'"
              class="plugin-field h-7 w-40 max-w-[42cqw] min-w-0 rounded-1 border border-base bg-transparent px-2 font-state-field text-3.5 color-inherit outline-none focus:border-primary-500/60"
              :value="String(getSettingValue(key, schema) ?? '')"
              @change="updateSelectSetting(key, schema, $event)"
            >
              <option
                v-for="option in getChoiceOptions(schema)"
                :key="String(option.value)"
                :value="String(option.value)"
              >
                {{ option.label }}
              </option>
            </select>

            <input
              v-else-if="getSettingType(schema) === 'number'"
              class="plugin-field h-7 w-40 max-w-[42cqw] min-w-0 rounded-1 border border-base bg-transparent px-2 font-state-field text-3.5 color-inherit outline-none focus:border-primary-500/60"
              type="number"
              :value="getSettingTextValue(key, schema)"
              @change="updateNumberSetting(key, $event)"
            />

            <input
              v-else
              class="plugin-field h-7 w-40 max-w-[42cqw] min-w-0 rounded-1 border border-base bg-transparent px-2 font-state-field text-3.5 color-inherit outline-none focus:border-primary-500/60"
              type="text"
              :value="getSettingTextValue(key, schema)"
              @input="updateTextSetting(key, $event)"
            />
          </div>
        </div>
      </template>

      <div v-else class="mx-4 border-b border-base py-3 color-muted font-state-field text-3.5">
        No plugin settings
      </div>
    </div>
  </section>
</template>
<style scoped>
.plugin-settings-pane {
  container: plugin-settings / inline-size;
}
</style>
