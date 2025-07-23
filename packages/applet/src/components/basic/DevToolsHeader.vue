<script setup lang="ts">
import { defineProps } from 'vue'
import { useVirtualRouter } from '~/composables/virtual-router'

defineProps<{
  githubRepoLink?: string
  docLink: string
}>()
const router = useVirtualRouter()
</script>

<template>
  <div border="b base" class="flex items-center justify-between px3">
    <div>
      <slot>
        <i class="i-ep:back cursor-pointer text-base op70 hover:op100" @click="router.push('/')" />
      </slot>
    </div>
    <div>
      <a class="pr2" :href="docLink" target="_blank" title="View Documentation">
        <i class="i-clarity:document-line cursor-pointer text-base op70 hover:op100" />
      </a>
      <a v-if="githubRepoLink" :href="githubRepoLink" target="_blank" title="Star on GitHub">
        <i class="i-mdi:github cursor-pointer text-base op70 hover:op100" />
      </a>
    </div>
  </div>
</template>
