// @vitest-environment happy-dom

import { beforeEach, describe, expect, it } from 'vitest'
import type { ComponentSnapshot } from '../../../packages/client/src/composables/devtools-client'
import { getComponentPreferenceKey } from '../../../packages/client/src/composables/component-tree'
import {
  findPreferredComponent,
  persistComponentSelection,
  readFavoriteComponentKeys,
  readStoredComponentSelection,
  toggleFavoriteComponent,
} from '../../../packages/client/src/composables/component-tree-preferences'

const components: ComponentSnapshot[] = [
  createComponent('root:next', 'App', undefined, '/src/App.vue'),
  createComponent('page:next', 'UsersPage', 'root:next', '/src/pages/UsersPage.vue'),
]

describe('component tree preferences', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('restores a selection by app, route, file, and name instead of runtime id', () => {
    persistComponentSelection('Demo', '/users', {
      file: '/src/pages/UsersPage.vue',
      name: 'UsersPage',
    })

    const stored = readStoredComponentSelection('Demo', '/users')
    expect(stored).toBe(getComponentPreferenceKey(components[1]!))
    expect(findPreferredComponent(components, stored)?.id).toBe('page:next')
    expect(findPreferredComponent(components, undefined)).toBeUndefined()
    expect(readStoredComponentSelection('Demo', '/settings')).toBeUndefined()
  })

  it('persists favorites by app', () => {
    const favorites = toggleFavoriteComponent('Demo', components[1]!)

    expect(favorites).toEqual(new Set([getComponentPreferenceKey(components[1]!)]))
    expect(readFavoriteComponentKeys('Demo')).toEqual(favorites)
  })
})

function createComponent(
  id: string,
  name: string,
  parentId?: string,
  file?: string,
): ComponentSnapshot {
  return {
    appId: 'app:next',
    file,
    id,
    name,
    parentId,
    updatedAt: 1,
  }
}
