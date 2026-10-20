<script setup vapor lang="ts">
import { ref } from 'vue'
import CounterCard from './CounterCard.vue'

const visible = ref(true)
</script>

<template>
  <div class="card">
    <h3 class="card-title">v-if mount / unmount</h3>
    <div class="flex items-center gap-2">
      <button class="btn-action-sm" @click="visible = !visible">
        {{ visible ? 'Hide' : 'Show' }}
      </button>
    </div>
    <CounterCard v-if="visible" label="Conditional counter" :step="1" />
    <p v-else class="text-xs color-muted">Counter unmounted</p>
  </div>
</template>
