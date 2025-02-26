<script setup lang="ts">
import { useDevToolsColorMode, VueButton } from '@vue/devtools-ui'

useDevToolsColorMode()

const { toggle } = useToggleViewMode()
</script>

<template>
  <div class="fixed inset-0 h-screen w-screen flex flex-col items-center justify-center $ui-bg-base">
    <DevToolsLogo h-18 />
    <p class="p3 text-sm font-bold">
      DevTools is currently injected into user application in <em class="text-primary-600">Overlay</em> view mode.
    </p>
    <p>
      <VueButton @click.stop="toggle('panel')">
        Switch to Panel Mode
      </VueButton>
    </p>
  </div>
</template>
