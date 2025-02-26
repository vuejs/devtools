<script setup lang="ts">
import { CustomInspector as CustomInspectorPanel } from '@vue/devtools-applet'
import '@vue/devtools-applet/style.css'

const route = useRoute()
const router = useRouter()
const loadError = ref(false)
const customInspectorTabs = useCustomInspectorTabs()
// @ts-expect-error skip type check
const pluginId = computed(() => customInspectorTabs.value.find(tab => tab.name === route.params.name)?.pluginId)
function onLoadError() {
  loadError.value = true
  const timer = setTimeout(() => {
    clearTimeout(timer)
    router.replace('/overview')
  }, 2000)
}
</script>

<template>
  <div v-if="loadError" flex="~ col" h-full items-center justify-center>
    <div flex="~ col gap2" mxa items-center>
      <div i-carbon-queued mb2 text-5xl op50 />
      <p text-xl>
        <code text-rose>{{ route.params.name }}</code>  not found
      </p>
      <p mt8 animate-pulse>
        Redirecting to overview page...
      </p>
    </div>
  </div>
  <CustomInspectorPanel v-else-if="!loadError && pluginId" :id="route.params.name as string" :plugin-id="pluginId" @load-error="onLoadError" />
</template>
