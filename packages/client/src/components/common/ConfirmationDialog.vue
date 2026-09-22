<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, useId, watch } from 'vue'

const props = withDefaults(
  defineProps<{
    cancelLabel?: string
    confirmLabel?: string
    description: string
    open: boolean
    title: string
  }>(),
  {
    cancelLabel: 'Cancel',
    confirmLabel: 'Confirm',
  },
)

const emit = defineEmits<{
  confirm: []
  'update:open': [value: boolean]
}>()

const dialog = ref<HTMLDialogElement>()
const cancelButton = ref<HTMLButtonElement>()
const id = useId()
const titleId = `confirmation-dialog-title-${id}`
const descriptionId = `confirmation-dialog-description-${id}`
let returnFocus: HTMLElement | undefined

watch(
  () => props.open,
  async (open) => {
    if (open) {
      returnFocus =
        document.activeElement instanceof HTMLElement ? document.activeElement : undefined
      await nextTick()
      if (!dialog.value?.open) dialog.value?.showModal()
      await nextTick()
      cancelButton.value?.focus()
      return
    }

    if (dialog.value?.open) dialog.value.close()
  },
  { flush: 'post', immediate: true },
)

onBeforeUnmount(() => {
  if (dialog.value?.open) dialog.value.close()
})

function close() {
  emit('update:open', false)
}

function onCancel(event: Event) {
  event.preventDefault()
  close()
}

function onClose() {
  if (props.open) emit('update:open', false)
  void nextTick(() => {
    returnFocus?.focus()
    returnFocus = undefined
  })
}

function onDialogClick(event: MouseEvent) {
  if (event.target === dialog.value) close()
}
</script>

<template>
  <dialog
    ref="dialog"
    class="settings-confirm-dialog panel-card h-50 max-w-[calc(100vw-2rem)] w-[40%] min-w-80 overscroll-contain p-0 color-base shadow-2xl"
    role="dialog"
    aria-modal="true"
    :aria-describedby="descriptionId"
    :aria-labelledby="titleId"
    @cancel="onCancel"
    @click="onDialogClick"
    @close="onClose"
  >
    <div class="h-full flex flex-col">
      <h2 :id="titleId" class="m-0 border-b border-base px-4 py-3 text-base font-650">
        {{ title }}
      </h2>
      <div :id="descriptionId" class="flex flex-auto items-center px-4 py-3 color-muted">
        {{ description }}
      </div>
      <div class="flex justify-end gap-2 border-t border-base px-4 py-3">
        <button ref="cancelButton" class="settings-button" type="button" @click="close">
          {{ cancelLabel }}
        </button>
        <button
          class="settings-button settings-button-warning"
          type="button"
          @click="emit('confirm')"
        >
          {{ confirmLabel }}
        </button>
      </div>
    </div>
  </dialog>
</template>

<style scoped>
.settings-confirm-dialog::backdrop {
  background: rgb(0 0 0 / 35%);
}
</style>
