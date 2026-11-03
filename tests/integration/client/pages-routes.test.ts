// @vitest-environment happy-dom

import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import type { RouterSnapshotMessage } from '../../../packages/kit/src'

// router.getRoutes() returns nested routes as their own records with full paths,
// while the parent record still carries its raw children with relative paths.
const userChildren = [{ name: 'user-profile', path: 'profile' }, { path: 'posts' }]
const routerSnapshot = ref<RouterSnapshotMessage>({
  appId: 'app:0',
  currentRoute: {
    fullPath: '/users/1/profile',
    matched: [
      { children: userChildren, path: '/users/:id' },
      { name: 'user-profile', path: '/users/:id/profile' },
    ],
    name: 'user-profile',
    path: '/users/1/profile',
  },
  routes: [
    { name: 'user-profile', path: '/users/:id/profile' },
    { path: '/users/:id/posts' },
    { children: userChildren, path: '/users/:id' },
    { name: 'home', path: '/' },
  ],
})

vi.mock('../../../packages/client/src/composables/devtools-client', () => ({
  useDevtoolsClient: () => ({
    error: ref(''),
    getMatchedRoutes: vi.fn(async () => []),
    navigateRoute: vi.fn(async () => {}),
    routerSnapshot,
    selectedAppId: ref('app:0'),
  }),
}))

import Pages from '../../../packages/client/src/pages/pages.vue'

let wrapper: ReturnType<typeof mount> | undefined
afterEach(() => wrapper?.unmount())

function mountPages() {
  return mount(Pages, {
    global: {
      directives: { tooltip: {} },
      stubs: { Dropdown: { template: '<div><slot /></div>' } },
    },
  })
}

function routeRows() {
  return wrapper!.findAll('tbody tr').map((row) => {
    const [status, path, name] = row.findAll('td').map((cell) => cell.text())
    return { name, path, status }
  })
}

describe('Pages routes', () => {
  it('lists each registered route once', () => {
    wrapper = mountPages()
    const rows = routeRows()

    expect(wrapper.text()).toContain('4 routes registered')
    expect(rows).toHaveLength(4)
    expect(rows.map((row) => row.path)).not.toContain('profile')
    expect(rows.map((row) => row.path)).not.toContain('posts')
    expect(rows.filter((row) => row.name === 'user-profile')).toHaveLength(1)
  })

  it('marks only the matched route records as active', () => {
    wrapper = mountPages()

    expect(routeRows().filter((row) => row.status === 'active')).toHaveLength(2)
  })
})
