<script setup vapor lang="ts">
import { ref } from 'vue'

const visits = ref(0)
</script>

<template>
  <div class="flex items-center gap-2">
    <span class="badge-active">beta</span>
    <button class="btn-action-sm" @click="visits++">Clicked {{ visits }} times</button>
  </div>
</template>
