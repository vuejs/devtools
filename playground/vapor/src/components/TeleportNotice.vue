<script setup vapor lang="ts">
import { ref } from 'vue'

const open = ref(false)
</script>

<template>
  <div class="card">
    <h3 class="card-title">Teleport</h3>
    <div class="flex items-center gap-2">
      <button class="btn-action-sm" @click="open = !open">
        {{ open ? 'Close' : 'Open' }} notice
      </button>
    </div>
    <Teleport to="#teleport-target">
      <div v-if="open" class="card mb-0 shadow-lg">Teleported from a Vapor component</div>
    </Teleport>
  </div>
</template>
