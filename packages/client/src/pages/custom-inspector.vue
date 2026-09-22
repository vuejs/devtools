<script setup lang="ts">
import CustomInspectorPanel from '@components/common/CustomInspectorPanel.vue'
import { computed, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useDevtoolsClient } from '../composables/devtools-client'

const route = useRoute()
const router = useRouter()
const { connected, inspectors, loading } = useDevtoolsClient()

const inspectorId = computed(() => {
  const value = route.params.inspectorId
  return typeof value === 'string' ? value : ''
})

const inspector = computed(() => inspectors.value.find((item) => item.id === inspectorId.value))

const missingInspector = computed(
  () => connected.value && !loading.value && !!inspectorId.value && !inspector.value,
)

watch(
  missingInspector,
  (missing) => {
    if (missing) void router.replace('/components')
  },
  { immediate: true },
)
</script>

<template>
  <CustomInspectorPanel v-if="inspector" :inspector="inspector" />
</template>
