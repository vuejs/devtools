<script setup lang="ts">
import Number from './components/Number.vue'

const count = ref(0)
</script>

<template>
  <div class="m-auto mt-3 h-30 w-60 flex flex-col items-center justify-center rounded bg-[#363636]">
    App2
    <div>Count: <Number :num="count" /></div>
    <button @click="count++">
      ++
    </button>
  </div>
</template>
