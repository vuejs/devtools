<script setup lang="ts">
withDefaults(
  defineProps<{
    ariaLabel?: string
    disabled?: boolean
    id?: string
    name?: string
    size?: 'md' | 'sm'
  }>(),
  {
    ariaLabel: undefined,
    disabled: false,
    id: undefined,
    name: undefined,
    size: 'md',
  },
)

const model = defineModel<boolean>({ required: true })
</script>

<template>
  <label
    class="box-border inline-flex cursor-pointer items-center gap-2 rounded-1"
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
      class="shrink-0 border border-solid rounded-1 flex items-center justify-center transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-primary-500/35"
      :class="[
        size === 'sm' ? 'h-3.5 w-3.5' : 'h-4 w-4',
        model
          ? 'border-primary-600 bg-primary-600 text-white dark:border-primary-500 dark:bg-primary-500'
          : 'border-neutral-400 bg-base text-transparent dark:border-neutral-500',
      ]"
      aria-hidden="true"
    >
      <span class="i-carbon-checkmark" :class="size === 'sm' ? 'text-3' : 'text-3.5'" />
    </span>
    <slot />
  </label>
</template>
