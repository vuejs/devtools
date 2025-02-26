<script setup lang="ts">
import Foo from '../components/Foo.vue'
import IndexComponent from '../components/IndexComponent/index.vue'

const emit = defineEmits(['update'])
const visible = ref(false)
const obj = reactive<{
  count: number
  foo?: number
  bar?: string
}>({
  count: 0,
})

// @ts-expect-error type guard
obj.foo = toRef(obj, 'count')
// @ts-expect-error type guard
obj.bar = ref('bar')

function trigger() {
  emit('update', 1)
}

const toRefObj = toRefs(obj)
const topLevelProxy = new Proxy({
  foo() {
    return 'foo'
  },
}, {
  get(target, key) {
    return target[key]()
  },
})
</script>

<template>
  <div class="m-auto mt-3 h-80 w-120 flex flex-col items-center justify-center rounded bg-[#363636]">
    Home
    <button @click="trigger">
      Click me
    </button>
    <Foo v-if="visible" />
    <IndexComponent v-if="visible" />
    <img src="/vite.svg" alt="Vite Logo">
    <button class="w-30 cursor-pointer" @click="visible = !visible">
      Toggle Foo
    </button>
  </div>
</template>

<style lang="scss" scoped>

</style>
