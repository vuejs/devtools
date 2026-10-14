<script setup lang="ts">
import { defineStore } from 'pinia'
import { ref } from 'vue'
import AgentFixtures from './AgentFixtures.vue'

const agent = new URLSearchParams(location.search).has('agent')

const useCounterStore = defineStore('counter', () => {
  const count = ref(0)
  return { count }
})
const counter = useCounterStore()
</script>

<template>
  <AgentFixtures v-if="agent" />
  <output id="count">{{ counter.count }}</output>
</template>
