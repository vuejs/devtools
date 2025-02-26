<script setup lang="ts">
import DynamicApp from '../components/DynamicApp.vue'
import { useAppStore } from '../stores'

const app = useAppStore()
</script>

<template>
  <div class="m-auto mt-3 h-80 w-120 flex flex-col items-center justify-center rounded bg-[#363636]">
    Hello {{ app.count }}
    <button class="w-30 cursor-pointer" @click="app.increment()">
      Increment count
    </button>

    <div>
      DynamicApp: <DynamicApp />
    </div>
  </div>
</template>

<style lang="scss" scoped>
.container {
  width: 250px;
  height: 150px;
  background: #363636;
  border-radius: 4px;
}
</style>
