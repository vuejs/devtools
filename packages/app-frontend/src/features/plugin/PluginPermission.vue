<script lang="ts">
import type { PropType } from 'vue'
import { computed, defineComponent } from 'vue'
import type { PluginPermission } from '@vue-devtools/shared-utils'
import { hasPluginPermission, setPluginPermission } from '@vue-devtools/shared-utils'

export default defineComponent({
  props: {
    pluginId: {
      type: String,
      required: true,
    },

    permission: {
      type: String as PropType<PluginPermission>,
      required: true,
    },

    label: {
      type: String,
      required: true,
    },
  },

  setup(props) {
    const model = computed({
      get() {
        return hasPluginPermission(props.pluginId, props.permission)
      },
      set(value: boolean) {
        setPluginPermission(props.pluginId, props.permission, value)
      },
    })

    return {
      model,
    }
  },
})
</script>

<template>
  <VueSwitch
    v-model="model"
    class="right w-full hover:bg-green-50 dark:hover:bg-green-900"
  >
    {{ label }}
  </VueSwitch>
</template>
