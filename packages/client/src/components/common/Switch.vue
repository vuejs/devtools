<script setup lang="ts">
withDefaults(
  defineProps<{
    ariaLabel?: string
    disabled?: boolean
    id?: string
    name?: string
  }>(),
  {
    ariaLabel: undefined,
    disabled: false,
    id: undefined,
    name: undefined,
  },
)

const model = defineModel<boolean>({ required: true })
</script>

<template>
  <label
    class="inline-flex cursor-pointer items-center gap-2 rounded-1"
    :class="disabled ? 'cursor-not-allowed op50' : ''"
  >
    <input
      v-model="model"
      class="peer sr-only"
      type="checkbox"
      :aria-label="ariaLabel"
      :disabled="disabled"
      :id="id"
      :name="name"
    />
    <span
      class="relative h-4 w-7 shrink-0 border border-base rounded-full bg-#8882 transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-primary-500/35"
      :class="model ? 'border-primary-500/40 bg-primary-500/20' : ''"
      aria-hidden="true"
    >
      <span
        class="absolute left-3px top-1/2 h-2.5 w-2.5 rounded-full bg-#8889 transition-[transform,background-color] -translate-y-1/2"
        :class="model ? 'translate-x-3 bg-primary-500' : ''"
      />
    </span>
    <slot />
  </label>
</template>
