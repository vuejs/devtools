<script setup vapor lang="ts">
import { ref } from 'vue'

const label = ref('multi-root component')
</script>

<template>
  <h3 class="card-title">Fragment root</h3>
  <p class="text-xs color-muted">This {{ label }} has no single root element.</p>
  <span class="mb-3 badge-active">fragment</span>
</template>
