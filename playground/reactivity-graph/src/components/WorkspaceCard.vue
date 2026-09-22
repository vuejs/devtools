<script setup lang="ts">
import { computed, ref, watch } from 'vue'

interface WorkspaceRow {
  label: string
  value: {
    readonly value: boolean | number | string
  }
}

const props = defineProps<{
  rows: WorkspaceRow[]
  subtitle: string
  title: string
}>()

const rowCount = computed(() => props.rows.length)
const visibleRows = computed(() => props.rows.slice(0, 4))
const primaryValue = computed(() => props.rows[0]?.value.value ?? 'None')
const cardSnapshot = ref('')

watch(
  () => props.rows.map((row) => formatWorkspaceValue(row.value.value)).join(' / '),
  (value) => {
    cardSnapshot.value = value
  },
  { immediate: true },
)

function formatWorkspaceValue(value: boolean | number | string) {
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  return String(value)
}
</script>

<template>
  <section class="rounded-2 border border-base bg-#f8fafc p-2.5">
    <div class="mb-2 min-w-0">
      <h3 class="truncate text-3.4 font-850">
        {{ title }}
      </h3>
      <p class="color-muted text-2.75 leading-4">{{ subtitle }} / {{ rowCount }} rows</p>
    </div>

    <dl class="m-0 grid gap-1.5">
      <div
        v-for="row in visibleRows"
        :key="row.label"
        class="grid grid-cols-[minmax(0,1fr)_auto] gap-2 border-t border-#8881 pt-1.5 first:border-t-0 first:pt-0"
      >
        <dt class="color-muted text-2.55 font-800 uppercase">
          {{ row.label }}
        </dt>
        <dd class="m-0 max-w-38 truncate text-right text-2.85 font-800">
          {{ formatWorkspaceValue(row.value.value) }}
        </dd>
      </div>
    </dl>

    <p class="mt-2 truncate color-soft text-2.55 font-750">
      {{ formatWorkspaceValue(primaryValue) }} / {{ cardSnapshot }}
    </p>
  </section>
</template>
