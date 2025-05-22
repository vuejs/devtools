<script setup lang="ts">
import { CustomTab } from '@vue/devtools-kit'

const p = defineProps<{
  tab: CustomTab
  iframeInline?: boolean
}>()

const props = toRefs(p)

const tabName = computed(() => props.tab.value?.name)

const iframeViewVisible = ref(true)
watch(() => tabName.value, () => {
  iframeViewVisible.value = false
  setTimeout(() => {
    iframeViewVisible.value = true
  }, 100)
})
</script>

<template>
  <template v-if="!tab">
    <div flex="~ col" h-full items-center justify-center>
      <div flex="~ col gap2" mxa items-center>
        <div i-carbon-queued mb2 text-5xl op50 />
        <p text-xl>
          Tab <code text-rose>{{ tabName }}</code> not found
        </p>
        <p mt8 animate-pulse>
          Redirecting to overview page...
        </p>
      </div>
    </div>
  </template>
  <template v-else-if="tab?.view?.type === 'iframe'">
    <IframeView v-if="iframeViewVisible" :src="tab.view.src" :inline="iframeInline" @load="tab.view.onLoad" @close="tab.view.onClose" />
  </template>
  <template v-else-if="tab?.view?.type === 'vnode'">
    <Component :is="tab.view.vnode" />
  </template>
  <template v-else-if="tab?.view?.type === 'sfc'">
    <SFCView :sfc="tab.view.sfc" :name="tab.name" />
  </template>
  <template v-else>
    <div>
      <NCard flex="~ col" h-full items-center justify-center>
        Unknown tab type {{ tab?.view }}
      </NCard>
    </div>
  </template>
</template>
