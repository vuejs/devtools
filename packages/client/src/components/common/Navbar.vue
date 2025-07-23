<script setup lang="ts">
import { VueInput } from '@vue/devtools-ui'

const props = defineProps<{
  search?: string
  noPadding?: boolean
}>()

const emit = defineEmits<{
  (event: 'update:search', value: string): void
}>()

const input = ref(props.search!)

watch(() => props.search, (v) => {
  input.value = v!
})

watch(input, () => {
  emit('update:search', input.value)
})
</script>

<template>
  <div flex="~ col gap2" border="b base" navbar-glass flex-1 p4>
    <div flex="~ gap4" items-center>
      <slot name="search">
        <VueInput
          v-if="search !== undefined"
          v-model="input"
          placeholder="Search..."
          left-icon="i-carbon-search"
          class="flex-auto"
          :class="{ 'px-5 py-2': !noPadding }"
        />
      </slot>
      <slot name="actions" />
    </div>
    <slot />
  </div>
</template>
