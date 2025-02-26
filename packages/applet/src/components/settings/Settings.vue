<script setup lang="ts">
import { rpc } from '@vue/devtools-core'
import { VueInput, VueSelect, VueSwitch } from '@vue/devtools-ui'
import { computed } from 'vue'

const props = defineProps<{
  pluginId: string
  options: Record<string, any>
  values: Record<string, any>
}>()
const emit = defineEmits(['update'])
const options = computed(() => props.options)
const values = computed(() => props.values)

function toggleOption(key: any, v: any) {
  rpc.value.updatePluginSettings(props.pluginId, key, v)
  rpc.value.getPluginSettings(props.pluginId).then((_settings) => {
    emit('update', _settings)
  })
}
</script>

<template>
  <div class="flex-1 overflow-y-auto p2">
    <ul>
      <li v-for="(item, index) in options" :key="index" class="flex items-center py-2">
        <div class="max-w-[190px] flex-1 select-none py-1.5 text-sm">
          {{ item.label }}
        </div>
        <div class="w-4/5">
          <div v-if="item.type === 'boolean'" class="flex justify-start">
            <VueSwitch
              :model-value="values[index]"
              class="row-reverse flex hover:bg-active py1 pl2 pr1"
              @update:model-value="(v: boolean) => toggleOption(index, v)"
            />
          </div>
          <template v-else-if="item.type === 'choice'">
            <div>
              <VueSelect
                :model-value="values[index]"
                :options="item.options"
                @update:model-value="(v) => toggleOption(index, v)"
              />
            </div>
          </template>
          <template v-else-if="item.type === 'text'">
            <VueInput :model-value="values[index]" @update:model-value="(v: string) => toggleOption(index, v)" />
          </template>
        </div>
      </li>
    </ul>
  </div>
</template>
