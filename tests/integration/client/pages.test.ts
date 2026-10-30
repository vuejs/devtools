// @vitest-environment happy-dom

import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'

const routerSnapshot = ref({
  appId: 'app:0',
  currentRoute: { fullPath: '/', matched: [], path: '/' },
  routes: [
    { name: 'home', path: '/' },
    { meta: { auth: true }, name: 'user', path: '/user/:id' },
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

describe('Pages', () => {
  it('labels the route path input', () => {
    wrapper = mountPages()
    expect(wrapper.get('input[type="text"]').attributes('aria-label')).toBe('Route path')
  })

  it('renders dynamic routes and route meta as buttons', async () => {
    wrapper = mountPages()
    const dynamicRoute = wrapper.findAll('button').find((button) => button.text() === '/user/id')
    expect(dynamicRoute?.attributes('type')).toBe('button')

    const metaButton = wrapper.get('button[title]')
    expect(metaButton.text()).toBe('{"auth":true}')
    await metaButton.trigger('click')
    expect(wrapper.text()).toContain('Route meta detail')
  })
})
