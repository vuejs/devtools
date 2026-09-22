// @vitest-environment happy-dom

import { describe, expect, it } from 'vitest'
import type { ComponentSnapshot } from '../../../packages/client/src/composables/devtools-client'
import {
  buildComponentTree,
  getComponentPreferenceKey,
  parseComponentFilter,
} from '../../../packages/client/src/composables/component-tree'

const components: ComponentSnapshot[] = [
  createComponent('root', 'App'),
  createComponent('layout', 'LayoutWrapper', 'root'),
  createComponent('page', 'UsersPage', 'layout', '/src/pages/UsersPage.vue'),
  createComponent('cached', 'CachedDetails', 'layout', '/src/pages/CachedDetails.vue', true),
]

describe('component tree composable', () => {
  it('keeps ancestors when a deep component matches the filter', () => {
    const tree = buildComponentTree(components, 'users')

    expect(tree).toEqual([
      expect.objectContaining({
        id: 'root',
        children: [
          expect.objectContaining({
            id: 'layout',
            children: [expect.objectContaining({ id: 'page' })],
          }),
        ],
      }),
    ])
  })

  it('matches component files and preserves inactive metadata', () => {
    const tree = buildComponentTree(components, 'cached')
    const cached = tree[0]?.children?.[0]?.children?.[0]

    expect(cached).toMatchObject({ id: 'cached', inactive: true })
  })

  it('supports positive, file, tag, and negative search terms', () => {
    const taggedComponents = components.map((component) =>
      component.id === 'page'
        ? {
            ...component,
            tags: [{ label: 'router-view', tooltip: 'Current route component' }],
          }
        : component,
    )

    expect(buildComponentTree(taggedComponents, 'users file:/pages/ tag:route')).toEqual([
      expect.objectContaining({
        id: 'root',
        children: [
          expect.objectContaining({
            id: 'layout',
            children: [expect.objectContaining({ id: 'page' })],
          }),
        ],
      }),
    ])
    expect(parseComponentFilter('users -tag:cached file:"/src/pages/user views/"')).toEqual({
      positive: [
        { field: 'all', value: 'users' },
        { field: 'file', value: '/src/pages/user views/' },
      ],
      negative: [{ field: 'tag', value: 'cached' }],
    })
  })

  it('hides a negative wrapper while keeping its visible descendants', () => {
    const tree = buildComponentTree(components, '-wrapper')

    expect(tree).toEqual([
      expect.objectContaining({
        id: 'root',
        children: [
          expect.objectContaining({ id: 'page' }),
          expect.objectContaining({ id: 'cached', inactive: true }),
        ],
      }),
    ])
  })

  it('filters favorites by stable file and component name', () => {
    const favorites = new Set([getComponentPreferenceKey(components[2]!)])
    const tree = buildComponentTree(components, 'is:favorite', favorites)

    expect(tree[0]?.children?.[0]?.children).toEqual([
      expect.objectContaining({ id: 'page', favorite: true }),
    ])
  })

  it('formats duration only when includeDuration is enabled', () => {
    const timed: ComponentSnapshot[] = [{ ...createComponent('root', 'App'), lastUpdateMs: 1.25 }]
    expect(buildComponentTree(timed, '')[0]?.duration).toBeUndefined()
    expect(buildComponentTree(timed, '', new Set(), true)[0]?.duration).toBe('1.3ms')
  })
})

function createComponent(
  id: string,
  name: string,
  parentId?: string,
  file?: string,
  inactive?: boolean,
): ComponentSnapshot {
  return {
    appId: 'app:0',
    file,
    id,
    inactive,
    name,
    parentId,
    updatedAt: 1,
  }
}
