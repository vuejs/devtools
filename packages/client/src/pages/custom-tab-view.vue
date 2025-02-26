<script setup lang="ts">
import type { CustomTab } from '@vue/devtools-kit'
import type { ComputedRef } from 'vue'

const route = useRoute()
const router = useRouter()
const { flattenedTabs } = useAllTabs()
const tabName = computed(() => route.params.name as string | undefined)
const tab = computed(() => flattenedTabs.value.find(tab => tabName.value === tab.name) || null!) as ComputedRef<CustomTab>

onMounted(() => {
  if (!tab.value) {
    const timer = setTimeout(() => {
      if (tab.value) {
        clearTimeout(timer)
        return
      }
      router.replace('/overview')
    }, 2000)
  }
})
</script>

<template>
  <CustomTabComponent :tab="tab" />
</template>
