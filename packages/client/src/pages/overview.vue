<script setup lang="ts">
import { computed } from 'vue'
import DevToolsLogo from '../components/common/DevToolsLogo.vue'
import { useDevtoolsClient } from '../composables/devtools-client'
import { version } from '../../package.json'

const { apps, pageCount, selectedApp, totalComponents } = useDevtoolsClient()

const vueVersion = computed(() => selectedApp.value?.version ?? apps.value[0]?.version ?? '-')

const target = globalThis as typeof globalThis & {
  chrome?: {
    devtools?: unknown
  }
}
const isInChromePanel = typeof target.chrome !== 'undefined' && !!target.chrome.devtools

function isMacOS() {
  if (typeof navigator === 'undefined') return false
  return navigator.platform
    ? navigator.platform.toLowerCase().includes('mac')
    : /Macintosh/.test(navigator.userAgent)
}
</script>

<template>
  <div class="h-full w-full flex overflow-auto text-4">
    <div class="mx-auto h-full max-w-300 w-full px-20 flex flex-col gap-2">
      <div class="flex-auto" />

      <div class="mt-20 flex flex-col items-center">
        <div class="-mt-10 flex items-center justify-center">
          <DevToolsLogo class="h-18 color-base" />
        </div>
        <div v-if="!isInChromePanel" class="-mt-1 mb-6 flex gap-1 text-center text-sm op40">
          <span>Vue DevTools</span>
          <code>v{{ version }}</code>
        </div>
      </div>

      <div class="flex flex-wrap gap-2">
        <div
          class="min-h-25 min-w-40 flex flex-1 flex-col items-center justify-center gap-2 rounded-1 border border-base bg-transparent p-4 color-inherit op50 shadow-[0_1px_3px_#00000012] saturate-0 transition-[opacity,filter,background,color] duration-200 hover:bg-green/10 hover:text-green-600 hover:op100 hover:saturate-100"
        >
          <div class="i-logos-vue text-3xl" />
          <code>v{{ vueVersion }}</code>
        </div>

        <RouterLink
          class="min-h-25 min-w-40 flex flex-1 flex-col items-center justify-center gap-2 rounded-1 border border-base bg-transparent p-4 color-inherit no-underline op50 shadow-[0_1px_3px_#00000012] saturate-0 transition-[opacity,filter,background,color] duration-200 hover:bg-lime/10 hover:text-lime-600 hover:op100 hover:saturate-100"
          to="/pages"
          replace
        >
          <div class="i-carbon-tree-view-alt text-3xl" />
          <div>{{ pageCount }} pages</div>
        </RouterLink>

        <RouterLink
          v-if="totalComponents"
          class="min-h-25 min-w-40 flex flex-1 flex-col items-center justify-center gap-2 rounded-1 border border-base bg-transparent p-4 color-inherit no-underline op50 shadow-[0_1px_3px_#00000012] saturate-0 transition-[opacity,filter,background,color] duration-200 hover:bg-lime/10 hover:text-lime-600 hover:op100 hover:saturate-100"
          to="/components"
          replace
        >
          <div class="i-carbon-assembly-cluster text-3xl" />
          <div>{{ totalComponents }} components</div>
        </RouterLink>
      </div>

      <div class="mt-5 flex flex-wrap items-center justify-center gap-6">
        <a
          href="https://github.com/vuejs/devtools"
          target="_blank"
          class="color-inherit op50 transition-[opacity,color] duration-200 flex items-center gap-1 no-underline hover:text-blue hover:op100"
        >
          <div class="i-carbon-star" />
          Star on GitHub
        </a>
        <a
          href="https://github.com/vuejs/devtools/discussions/111"
          target="_blank"
          class="color-inherit op50 transition-[opacity,color] duration-200 flex items-center gap-1 no-underline hover:text-yellow hover:op100"
        >
          <div class="i-carbon-data-enrichment" />
          Ideas & Suggestions
        </a>
        <a
          href="https://github.com/vuejs/devtools/discussions/112"
          target="_blank"
          class="color-inherit op50 transition-[opacity,color] duration-200 flex items-center gap-1 no-underline hover:text-lime hover:op100"
        >
          <div class="i-carbon-plan" />
          Project Roadmap
        </a>
        <a
          href="https://github.com/vuejs/devtools/issues"
          target="_blank"
          class="color-inherit op50 transition-[opacity,color] duration-200 flex items-center gap-1 no-underline hover:text-rose hover:op100"
        >
          <div class="i-carbon-debug" />
          Bug Reports
        </a>
        <RouterLink
          to="/settings"
          replace
          class="color-inherit op50 transition-[opacity,color] duration-200 flex items-center gap-1 no-underline hover:op100"
        >
          <div class="i-carbon-settings" />
          Settings
        </RouterLink>
      </div>

      <div class="flex-auto" />

      <div
        class="cursor-default flex flex-wrap items-center justify-center gap-1 pb-2 text-3.5 op40"
      >
        Press
        <template v-if="isMacOS()">
          <kbd class="rounded-1 border border-base bg-active px-1.5 py-0.5 font-[inherit]">
            ⌘ Command
          </kbd>
          <span>+</span>
          <kbd class="rounded-1 border border-base bg-active px-1.5 py-0.5 font-[inherit]">K</kbd>
        </template>
        <template v-else>
          <kbd class="rounded-1 border border-base bg-active px-1.5 py-0.5 font-[inherit]">
            Ctrl
          </kbd>
          <span>+</span>
          <kbd class="rounded-1 border border-base bg-active px-1.5 py-0.5 font-[inherit]">K</kbd>
        </template>
        to toggle Command Palette
      </div>

      <template v-if="!isInChromePanel">
        <div
          class="cursor-default flex flex-wrap items-center justify-center gap-1 pb-8 text-3.5 op40"
        >
          Press
          <template v-if="isMacOS()">
            <kbd class="rounded-1 border border-base bg-active px-1.5 py-0.5 font-[inherit]">
              ⇧ Shift
            </kbd>
            <span>+</span>
            <kbd class="rounded-1 border border-base bg-active px-1.5 py-0.5 font-[inherit]">
              ⌥ Option
            </kbd>
            <span>+</span>
            <kbd class="rounded-1 border border-base bg-active px-1.5 py-0.5 font-[inherit]">
              D
            </kbd>
          </template>
          <template v-else>
            <kbd class="rounded-1 border border-base bg-active px-1.5 py-0.5 font-[inherit]">
              Shift
            </kbd>
            <span>+</span>
            <kbd class="rounded-1 border border-base bg-active px-1.5 py-0.5 font-[inherit]">
              Alt
            </kbd>
            <span>+</span>
            <kbd class="rounded-1 border border-base bg-active px-1.5 py-0.5 font-[inherit]">
              D
            </kbd>
          </template>
          to toggle DevTools
        </div>
      </template>
    </div>
  </div>
</template>
