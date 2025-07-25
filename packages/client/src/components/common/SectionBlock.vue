<script setup lang="ts">
import { VueIcon } from '@vue/devtools-ui'
import { useVModel } from '@vueuse/core'

const props = withDefaults(
  defineProps<{
    icon?: string
    text: string
    description?: string
    containerClass?: string
    collapse?: boolean
    open?: boolean
    padding?: boolean | string
  }>(),
  {
    containerClass: '',
    open: true,
    padding: true,
    collapse: true,
  },
)

const open = useVModel(props, 'open', undefined, { passive: true })
function onToggle(e) {
  open.value = e.target.open
}
</script>

<template>
  <details :open="open" @toggle="onToggle">
    <summary class="cursor-pointer select-none p4 hover:bg-active" :class="collapse ? '' : 'pointer-events-none'">
      <IconTitle :icon="icon" :text="text" text-xl transition :class="open ? 'op100' : 'op60'">
        <div>
          <div text-base>
            <slot name="text">
              {{ text }}
            </slot>
          </div>
          <div v-if="description || $slots.description" text-sm op50>
            <slot name="description">
              {{ description }}
            </slot>
          </div>
        </div>
        <div class="flex-auto" />
        <slot name="actions" />
        <VueIcon
          v-if="collapse"
          icon="i-carbon-chevron-down"
          class="chevron"
          cursor-pointer place-self-start text-base op75 transition duration-500
        />
      </IconTitle>
    </summary>
    <div
      v-lazy-show="open"
      class="flex flex-col flex-gap2 pb6 pt2"
      :class="typeof padding === 'string' ? padding : padding ? 'px4' : ''"
    >
      <slot name="details" />
      <div :class="containerClass" class="mt1">
        <slot />
      </div>
      <slot name="footer" />
    </div>
  </details>
  <div class="x-divider" />
</template>

<style scoped>
details {
  --at-apply: border-none;
}

summary {
  --at-apply: border-none;
  list-style: none;
}

details[open] summary {
  --at-apply: border-none;
}

details summary::-webkit-details-marker {
  display: none;
}

details[open] .chevron {
  transform: rotate(180deg);
  opacity: 0.75;
}
</style>
