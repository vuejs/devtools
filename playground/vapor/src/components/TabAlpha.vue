<script setup vapor lang="ts">
import { ref } from 'vue'

const typed = ref('')
</script>

<template>
  <div class="flex items-center gap-2">
    <span class="badge-active">alpha</span>
    <input
      v-model="typed"
      class="w-64 px-2 py-1 border border-base rounded bg-transparent text-sm outline-none focus:border-active"
      placeholder="State survives tab switches"
    />
  </div>
</template>
