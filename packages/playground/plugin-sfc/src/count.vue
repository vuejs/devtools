<script setup lang="ts">
import { ref } from 'vue'

const count = ref(0)
</script>

<template>
  <div class="h-full w-full flex flex-col items-center justify-center">
    <div>
      count is {{ count }}
    </div>
    <button class="btn" @click="count++">
      increment
    </button>
  </div>
</template>

<style scoped>
.btn {
  background-color: #4c51bf;
  color: #fff;
  padding: 0.5rem 1rem;
  border-radius: 0.25rem;
  border: none;
  cursor: pointer;
}
</style>
