<script setup lang="ts">
import { defineStore } from 'pinia'
import { ref } from 'vue'

const useCounterStore = defineStore('counter', () => {
  const count = ref(0)
  return { count }
})
const counter = useCounterStore()
</script>

<template>
  <output id="count">{{ counter.count }}</output>
</template>
