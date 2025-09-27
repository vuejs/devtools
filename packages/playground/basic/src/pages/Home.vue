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
    <h1 class="mb-4 text-2xl font-bold">
      Vue DevTools Playground
    </h1>

    <div class="mb-6 flex flex-col gap-3">
      <router-link
        to="/pinia-demo"
        class="rounded bg-blue-600 px-4 py-2 text-center text-white transition-colors hover:bg-blue-700"
      >
        🚀 Pinia Store 演示 (测试展开/折叠功能)
      </router-link>
      <router-link
        to="/hello"
        class="rounded bg-green-600 px-4 py-2 text-center text-white transition-colors hover:bg-green-700"
      >
        Hello Page (App Store)
      </router-link>
      <router-link
        to="/hey/123"
        class="rounded bg-purple-600 px-4 py-2 text-center text-white transition-colors hover:bg-purple-700"
      >
        Hey Page (Counter Store)
      </router-link>
    </div>

    <button class="mb-3" @click="trigger">
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
