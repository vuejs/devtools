<script setup lang="ts">
import { computed, defineComponent, h, ref } from 'vue'

const AgenticArrays = defineComponent({
  name: 'AgenticArrays',
  setup: () =>
    Object.fromEntries(
      Array.from({ length: 501 }, (_, i) => [
        `field${i}`,
        Array.from({ length: 500 }, (_, n) => n),
      ]),
    ),
  render: () => null,
})
const AgenticEditable = defineComponent({
  name: 'AgenticEditable',
  setup() {
    const count = ref(1)
    const doubled = computed(() => count.value * 2)
    return { count, doubled }
  },
  render() {
    return h('output', { id: 'agentic-count' }, String(this.count))
  },
})
const AgenticOversized = defineComponent({
  name: 'AgenticOversized',
  setup: () =>
    Object.fromEntries(Array.from({ length: 500 }, (_, i) => [`field${i}`, 'x'.repeat(10_000)])),
  render: () => null,
})
</script>

<template>
  <AgenticArrays />
  <AgenticEditable />
  <AgenticOversized />
</template>
