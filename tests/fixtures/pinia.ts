import { createPinia, defineStore, setActivePinia } from 'pinia'

export function createPiniaFixture() {
  const pinia = createPinia()
  setActivePinia(pinia)

  const useFixtureStore = defineStore('fixture', {
    actions: {
      increment() {
        this.count += 1
      },
    },
    state: () => ({
      count: 0,
      label: 'undefined',
      selected: null as { id: number } | null,
    }),
  })

  return {
    pinia,
    store: useFixtureStore(),
    useFixtureStore,
  }
}
