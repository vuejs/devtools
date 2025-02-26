<script setup lang="ts">
import { useVModel } from '@vueuse/core'
import { watchEffect } from 'vue'
import VueButton from './Button.vue'
import VueDialog from './Dialog.vue'

const props = withDefaults(defineProps<{
  modelValue: boolean
  content: string
  cancelText?: string
  confirmText?: string
  width?: string
  height?: string
  title?: string
  loading?: boolean
  autoClose?: boolean
}>(), {
  cancelText: 'Cancel',
  confirmText: 'Confirm',
  width: '20%',
  height: '9rem',
  title: 'Warning',
  loading: false,
  autoClose: true,
})

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  'confirm': []
  'cancel': []
  'close': []
}>()

const value = useVModel(props, 'modelValue', emit)

watchEffect(() => {
  if (!value.value)
    emit('close')
})

function close(close = false) {
  if (props.autoClose || close)
    value.value = false
}
</script>

<template>
  <VueDialog v-model="value" :width="width" :height="height" :title="title" :closable="false">
    <slot class="h-auto w-auto">
      {{ content }}
    </slot>
    <template #footer>
      <div class="$ui-fec gap2.5">
        <VueButton
          @click="() => {
            emit('cancel')
            close(true)
          }"
        >
          {{ cancelText }}
        </VueButton>
        <VueButton
          :loading="loading" type="primary" @click="() => {
            emit('confirm')
            close()
          }"
        >
          {{ confirmText }}
        </VueButton>
      </div>
    </template>
  </VueDialog>
</template>
