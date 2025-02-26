<script setup lang="ts">
import { useVirtualRouter } from '~/composables/virtual-router'
import DevToolsLogo from './DevToolsLogo.vue'

const virtualRouter = useVirtualRouter()
</script>

<template>
  <div h-full w-full flex items-center>
    <div flex="~ col gap2" ma px-5>
      <div flex-auto />

      <!-- Banner -->
      <div flex="~ col" mt-20 items-center>
        <div flex="~" mt--10 items-center justify-center>
          <DevToolsLogo h-18 />
        </div>
        <div mb6 mt--1 text-center text-sm flex="~ gap-1">
          <span op40>
            Pinia DevTools
          </span>
        </div>
      </div>

      <div flex-auto />

      <div flex="~ gap2 wrap">
        <!-- <div flex="~ col auto" min-w-40 p4 theme-card-lime>
          <div i-logos-pinia text-3xl />
        </div> -->
        <div flex="~ col auto" min-w-40 p4 theme-card-lime @click="virtualRouter.push('/store')">
          <div i-carbon-tree-view-alt text-3xl />
          <code>Store</code>
        </div>
        <div flex="~ col auto" min-w-40 p4 theme-card-lime @click="virtualRouter.push('/timeline')">
          <div i-mdi:timeline-clock-outline text-3xl />
          <div>Timeline</div>
        </div>
      </div>

      <div flex="~ gap-6 wrap" mt-5 items-center justify-center>
        <a href="https://github.com/vuejs/pinia" target="_blank" flex="~ gap1" items-center op50 hover="op100 text-blue" transition>
          <div i-carbon-star />
          Star on GitHub
        </a>
        <a href="https://pinia.vuejs.org/" target="_blank" flex="~ gap1" items-center op50 hover="op100 text-yellow" transition>
          <div i-carbon-document />
          View Documentation
        </a>
      </div>

      <div flex-auto />
    </div>
  </div>
</template>
