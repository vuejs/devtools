<script setup lang="ts">
import type { RouteMeta, RouteRecordNormalized } from 'vue-router'
import { useDevToolsState } from '@vue/devtools-core'
import { VueBadge } from '@vue/devtools-ui'
import { openInEditor } from '../../composables/open-in-editor'

const props = defineProps<{
  pages: RouteRecordNormalized[]
  matched: RouteRecordNormalized[]
  matchedPending: RouteRecordNormalized[]
}>()

defineEmits<{
  (e: 'navigate', path: string): void
  (e: 'selectMeta', meta: RouteMeta): void
}>()

const sorted = computed(() => {
  return [...props.pages].sort((a, b) => a.path.localeCompare(b.path))
})

const _vueInspectorDetected = computed(() => vueInspectorDetected.value)
const state = useDevToolsState()

function metaToString(meta: RouteMeta, num: number = 0) {
  const metaStr = JSON.stringify(meta, null, num)
  return metaStr === '{}' ? '-' : metaStr
}

const metaFieldVisible = computed(() => {
  return sorted.value.some(item => Object.keys(item.meta)?.length)
})
</script>

<template>
  <div>
    <table w-full>
      <thead border="b base" px-3>
        <tr>
          <th text-left />
          <th text-left>
            Route Path
          </th>
          <th text-left>
            Name
          </th>
          <th v-if="metaFieldVisible" text-left>
            Route Meta
          </th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="item of sorted" :key="item.name" class="group" h-7 border="b dashed transparent hover:base">
          <td w-20 pr-1>
            <div flex items-center justify-end>
              <VueBadge
                v-if="matched.find(m => m.name === item.name)"
                bg-green-400:10 text-green-400
                title="active"
                v-text="'active'"
              />
              <VueBadge
                v-else-if="matchedPending.find(m => m.name === item.name)"
                bg-teal-400:10 text-teal-400
                title="next"
                v-text="'next'"
              />
            </div>
          </td>
          <td text-sm>
            <div flex="inline gap3" items-center>
              <RoutePathItem
                :route="item"
                :class="matched.find(m => m.name === item.name) ? 'text-primary-400' : matchedPending.find(m => m.name === item.name) ? 'text-teal' : ''"
                @navigate="path => $emit('navigate', path)"
              />
              <div op0 group-hover:op100 flex="~ gap1">
                <button
                  v-if="(item.meta?.file) && state.vitePluginDetected.value && _vueInspectorDetected"
                  text-sm op40 hover="op100 text-primary-400"
                  title="Open in editor"
                  @click="openInEditor((item.meta?.file) as string)"
                >
                  <div i-carbon-script-reference />
                </button>
              </div>
            </div>
          </td>
          <td w-0 ws-nowrap pr-1 text-left text-sm font-mono op50>
            {{ item.name }}
          </td>
          <td v-if="metaFieldVisible" w-50 ws-nowrap pr-1 text-left text-sm font-mono op50 hover="text-primary op100">
            <span inline-block w-50 cursor-pointer overflow-hidden text-ellipsis :title="metaToString(item.meta, 2)" @click="() => $emit('selectMeta', item.meta)">{{ metaToString(item.meta) }}</span>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
