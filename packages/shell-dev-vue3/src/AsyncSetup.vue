<script>
import { getCurrentInstance, onMounted, ref } from 'vue'

export default {
  setup() {
    const vm = getCurrentInstance()
    onMounted(() => {
      console.log('Im alive', vm)
    })

    return new Promise((resolve) => {
      setTimeout(() => {
        const message = ref('Async setup')

        resolve({
          message,
        })
      }, 2000)
    })
  },
}
</script>

<template>
  <div>
    Async setup:<br>
    <pre>{{ message }}</pre>
  </div>
</template>
