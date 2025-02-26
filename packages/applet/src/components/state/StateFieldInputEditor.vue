<script setup lang="ts">
import { customTypeEnums, toSubmit } from '@vue/devtools-kit'
import { vTooltip, VueButton, VueIcon, VueInput } from '@vue/devtools-ui'
import { useMagicKeys, useVModel } from '@vueuse/core'
import { debounce } from 'perfect-debounce'
import { computed, ref, watch, watchEffect } from 'vue'

const props = withDefaults(defineProps<{
  modelValue: string
  customType?: customTypeEnums
  showActions?: boolean
  autoFocus?: boolean
}>(), {
  showActions: true,
  autoFocus: true,
})

const emit = defineEmits<{
  'cancel': []
  'submit': []
  'update:modelValue': [value: string]
}>()

const inputType = computed(() => {
  if (props.customType === 'date')
    return 'datetime-local'
  return ''
})

// TODO: keyboard shortcut, esc to cancel, enter to submit
//       and show tooltip on button when hovering

const { escape, enter } = useMagicKeys()

watchEffect(() => {
  if (escape.value)
    emit('cancel')
  else if (enter.value)
    emit('submit')
})

const value = useVModel(props, 'modelValue', emit)

function tryToParseJSONString(v: unknown) {
  try {
    toSubmit(v as string, props.customType)
    return true
  }
  catch {
    return false
  }
}

const isWarning = ref(false)
const checkWarning = () => debounce(() => {
  isWarning.value = !tryToParseJSONString(value.value)
}, 300)
watch(value, checkWarning())
</script>

<template>
  <span class="flex-inline items-center gap4px">
    <VueInput v-model="value" :type="inputType" :variant="isWarning ? 'warning' : 'normal'" class="h25px px4px" :class="customType === 'date' ? 'w240px' : 'w120px'" :auto-focus="autoFocus" @click.stop />
    <template v-if="showActions">
      <VueButton
        v-tooltip="{
          content: 'Esc to cancel',
        }" size="mini" flat class="p2px!" @click.stop="$emit('cancel')"
      >
        <template #icon>
          <VueIcon icon="i-material-symbols-cancel" />
        </template>
      </VueButton>
      <template v-if="!isWarning">
        <VueButton
          v-tooltip="{
            content: 'Enter to submit change',
          }" size="mini" flat class="p2px!" @click.stop="$emit('submit')"
        >
          <template #icon>
            <VueIcon icon="i-material-symbols-save" />
          </template>
        </VueButton>
      </template>
      <VueIcon
        v-else v-tooltip="{
          content: 'Invalid value',
        }" icon="i-material-symbols-warning" class="color-warning-500 dark:color-warning-300"
      />
    </template>
  </span>
</template>
