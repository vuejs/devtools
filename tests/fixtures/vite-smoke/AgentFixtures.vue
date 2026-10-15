<script setup lang="ts">
import { computed, defineComponent, h, ref } from 'vue'

const AgentArrays = defineComponent({
  name: 'AgentArrays',
  setup: () =>
    Object.fromEntries(
      Array.from({ length: 501 }, (_, i) => [
        `field${i}`,
        Array.from({ length: 500 }, (_, n) => n),
      ]),
    ),
  render: () => null,
})
const AgentEditable = defineComponent({
  name: 'AgentEditable',
  setup() {
    const count = ref(1)
    const doubled = computed(() => count.value * 2)
    return { count, doubled }
  },
  render() {
    return h('output', { id: 'agent-count' }, String(this.count))
  },
})
const AgentOversized = defineComponent({
  name: 'AgentOversized',
  setup: () =>
    Object.fromEntries(Array.from({ length: 500 }, (_, i) => [`field${i}`, 'x'.repeat(10_000)])),
  render: () => null,
})
</script>

<template>
  <AgentArrays />
  <AgentEditable />
  <AgentOversized />
</template>
