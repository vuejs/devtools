<script setup lang="ts">
import Number from './components/Number.vue'

const num = ref(1)
const count = ref(num.value)

const doubleCount = computed(() => count.value * 2)

const fourCount = computed(() => num.value * count.value * 4)

const dCount = reactive({
  computed: count.value * 2,
})

watch(count, () => {
  console.log('count', count.value)
})
</script>

<template>
  <div class="m-auto mt-3 h-30 w-60 flex flex-col items-center justify-center rounded bg-[#363636]">
    App
    {{ dCount }}
    <div>Count: <Number :num="count" /></div>
    <div>Double Count: <Number :num="doubleCount" /></div>
    <div>Four Count: <Number :num="fourCount" /></div>
    <button @click="count++">
      ++
    </button>
  </div>
</template>
