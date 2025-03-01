<script setup vapor>
import { ref } from 'vue'
import Entry from './components/Entry.vue'

const message = 'Hello, Vapor!'
const count = ref(0)
const increment = () => count.value++
</script>

<template>
  <div>
    <p>{{ message }}</p>
    <p>Count: {{ count }}</p>
    <button @click="increment">
      Increment
    </button>
    <Entry />
  </div>
</template>
