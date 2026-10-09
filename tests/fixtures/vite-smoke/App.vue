<script setup lang="ts">
import { defineStore } from 'pinia'
import { ref } from 'vue'
import AgenticFixtures from './AgenticFixtures.vue'

const agentic = new URLSearchParams(location.search).has('agentic')

const useCounterStore = defineStore('counter', () => {
  const count = ref(0)
  return { count }
})
const counter = useCounterStore()
</script>

<template>
  <AgenticFixtures v-if="agentic" />
  <output id="count">{{ counter.count }}</output>
</template>
