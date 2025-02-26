<script setup lang="ts">
import Foo from '../components/Foo.vue'

const str = ref<'hello' | 'world'>('hello')

useIntervalFn(() => {
  str.value = str.value === 'hello' ? 'world' : 'hello'
}, 1000)
</script>

<template>
  <div>
    This is {{ str }} time!
    <Foo />
  </div>
</template>
