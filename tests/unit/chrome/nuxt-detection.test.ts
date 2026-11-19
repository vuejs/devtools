import { describe, expect, it } from 'vitest'
import { isNuxtPage } from '../../../packages/chrome/src/shared/detection'

describe('Chrome Nuxt detection', () => {
  it('detects Nuxt 3 and 4 pages through window.__NUXT__', () => {
    expect(isNuxtPage({ __NUXT__: { config: {} } })).toBe(true)
  })

  it('detects Nuxt 5 pages, which delete window.__NUXT__ after hydration', () => {
    expect(isNuxtPage({ useNuxtApp: () => ({}) })).toBe(true)
  })

  it('does not flag plain Vue pages', () => {
    expect(isNuxtPage({})).toBe(false)
    expect(isNuxtPage({ __NUXT__: undefined, useNuxtApp: undefined })).toBe(false)
    expect(isNuxtPage({ useNuxtApp: 'not a function' })).toBe(false)
  })
})
