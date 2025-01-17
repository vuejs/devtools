<script setup lang="ts">
import * as Vue from 'vue'
import { loadModule } from 'vue3-sfc-loader'

const props = defineProps<{
  sfc: string
  name: string
}>()

const options = {
  moduleCache: {
    vue: Vue,
  },
  getFile() {
    return props?.sfc ?? ''
  },
  addStyle(textContent: string) {
    const style = Object.assign(document.createElement('style'), { textContent })
    const ref = document.head.getElementsByTagName('style')[0] || null
    document.head.insertBefore(style, ref)
  },
}

const RemoteSFC = defineAsyncComponent(() => {
  const res = loadModule(`${props.name}.vue`, options)
  console.log(res)
  return res
})
</script>

<template>
  <RemoteSFC />
</template>
