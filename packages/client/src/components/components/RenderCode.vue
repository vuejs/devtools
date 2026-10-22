<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, useId } from 'vue'

const props = defineProps<{
  code: string
}>()

const emit = defineEmits<{
  close: []
}>()

const closeButton = ref<HTMLButtonElement>()
const titleId = `render-code-title-${useId()}`
let returnFocus: HTMLElement | undefined

// Load only when the conditionally rendered panel is opened.
const parseRow = shallowRef<typeof import('nue-glow').parseRow>()
onMounted(() => {
  returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : undefined
  void nextTick(() => closeButton.value?.focus())

  void import('nue-glow')
    .then(({ parseRow: parse }) => {
      parseRow.value = parse
    })
    .catch(() => {
      // Keep the original code readable if the chunk cannot be loaded.
    })
})

onBeforeUnmount(() => returnFocus?.focus())

const tokens = computed(() => {
  const parse = parseRow.value
  if (!parse) return [{ text: props.code, tag: '' }]
  // Use source offsets instead of Glow's HTML renderer: preserve whitespace,
  // entities and annotation characters, and let Vue escape all source text.
  return props.code.split('\n').flatMap((line, index) => {
    const parts = []
    if (index) parts.push({ text: '\n', tag: '' })
    let end = 0
    for (const token of parse(line, 'js')) {
      if (token.start < end || token.end <= token.start) continue
      parts.push({ text: line.slice(end, token.start), tag: '' })
      parts.push({ text: line.slice(token.start, token.end), tag: token.tag })
      end = token.end
    }
    parts.push({ text: line.slice(end), tag: '' })
    return parts.filter((part) => part.text)
  })
})
</script>

<template>
  <div
    class="absolute inset-0 z-10 min-h-0 flex flex-col bg-base p-2"
    role="dialog"
    :aria-labelledby="titleId"
    @keydown.esc.stop.prevent="emit('close')"
  >
    <div class="h-10 shrink-0 flex items-center justify-between border-b border-base px-2">
      <span :id="titleId" class="font-500 text-3.5">Render Code</span>
      <button
        ref="closeButton"
        v-tooltip.bottom="'Close render code'"
        class="h-7 w-7 rounded-1 border-0 bg-transparent color-muted flex items-center justify-center hover:bg-active hover:color-base"
        type="button"
        aria-label="Close render code"
        @click="emit('close')"
      >
        <span class="i-carbon-close text-4" aria-hidden="true" />
      </button>
    </div>
    <pre
      class="m-0 min-h-0 flex-1 overflow-auto p-3 text-3.25 leading-5"
    ><code class="render-code"><span v-for="(token, index) in tokens" :key="index" :class="token.tag && `syntax-${token.tag}`">{{ token.text }}</span></code></pre>
  </div>
</template>

<style scoped>
.render-code {
  --code-keyword: #8250df;
  --code-name: #0550ae;
  --code-literal: #116329;
  --code-muted: #57606a;
}
.syntax-strong,
.syntax-label {
  color: var(--code-keyword);
}
.syntax-b {
  color: var(--code-name);
}
.syntax-em {
  color: var(--code-literal);
}
.syntax-sup,
.syntax-i {
  color: var(--code-muted);
}
:global(.dark .render-code) {
  --code-keyword: #d2a8ff;
  --code-name: #79c0ff;
  --code-literal: #a5d6a7;
  --code-muted: #9da7b3;
}
</style>
