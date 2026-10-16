// @vitest-environment happy-dom

import { describe, expect, it } from 'vitest'
import { createDevtoolsRuntime } from '../../../packages/kit/src/runtime/runtime'

describe('object property pagination', () => {
  it('keeps preview, show-more expansion, and cursor pages in one alphabetical order', () => {
    const keys = Array.from({ length: 65 }, (_, index) => `field${String(index).padStart(2, '0')}`)
    const payload = Object.fromEntries([...keys].reverse().map((key) => [key, key]))
    const instance = {
      uid: 0,
      type: { name: 'ObjectOrder' },
      setupState: { payload },
      subTree: {},
    }
    const runtime = createDevtoolsRuntime()
    try {
      runtime.dispatch({
        type: 'app:init',
        app: { _instance: instance },
        version: '3.5.0',
        vueTypes: {},
        time: 1,
      })
      const collector = runtime.componentState
      const componentId = runtime.registry.getComponentId(instance)!
      const snapshot = collector.snapshot(componentId, 30, 30)!
      const value = snapshot.sections
        .find((section) => section.id === 'setup')!
        .entries.find((entry) => entry.key === 'payload')!.value
      if (value.kind !== 'object' || !value.handle) throw new Error('Missing object preview')
      expect(value.preview.map((entry) => entry.key)).toEqual(keys.slice(0, 30))

      const expanded = collector.expand(value.handle, [], 60)
      if (!expanded || !('value' in expanded) || expanded.value.kind !== 'object')
        throw new Error('Missing expanded object')
      expect(expanded.value.preview.map((entry) => entry.key)).toEqual(keys.slice(0, 60))

      let page = 1
      let snapshotId: string | undefined
      const allKeys: string[] = []
      while (true) {
        const result = collector.expandPage(
          'ordered-object',
          { page, pageSize: 30, snapshotId },
          value.handle,
        )
        if (!result || !('value' in result) || result.value.kind !== 'object')
          throw new Error('Missing object page')
        allKeys.push(...result.value.preview.map((entry) => entry.key))
        if (!result.pagination?.next) break
        page = result.pagination.next
        snapshotId = result.snapshotId
      }
      expect(allKeys).toEqual(keys)
      expect(Object.keys(payload)).toEqual([...keys].reverse())
    } finally {
      runtime.dispose()
    }
  })
})
