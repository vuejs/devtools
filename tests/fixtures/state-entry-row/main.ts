import { createApp, h } from 'vue'
import { encodeValue } from '../../../packages/kit/src'
import StateEntryRow from '../../../packages/client/src/components/components/StateEntryRow.vue'
import 'virtual:uno.css'

createApp({
  render: () =>
    h(StateEntryRow, {
      depth: 0,
      entry: {
        key: 'payload',
        path: ['data', 'payload'],
        editable: true,
        value: encodeValue({ nested: { count: 1 } }),
      },
    }),
})
  .directive('tooltip', {})
  .mount('#app')
