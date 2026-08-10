import { getComponentName, getInstanceName } from '../../src/core/component/utils'

// Minimal VueAppInstance['type'] shape used in tests
function makeType(overrides: Record<string, unknown> = {}) {
  return overrides as any
}

describe('getComponentName', () => {
  it('returns displayName when present', () => {
    expect(getComponentName(makeType({ displayName: 'MyDisplay' }))).toBe('MyDisplay')
  })

  it('returns name when present', () => {
    expect(getComponentName(makeType({ name: 'MyComp' }))).toBe('MyComp')
  })

  it('derives name from .vue __file', () => {
    expect(getComponentName(makeType({ __file: '/src/components/MyButton.vue' }))).toBe('MyButton')
  })

  it('derives name from .jsx __file', () => {
    expect(getComponentName(makeType({ __file: '/src/components/MyButton.jsx' }))).toBe('MyButton')
  })

  it('derives name from .tsx __file', () => {
    expect(getComponentName(makeType({ __file: '/src/components/MyButton.tsx' }))).toBe('MyButton')
  })

  it('derives PascalCase name from kebab-case jsx file', () => {
    expect(getComponentName(makeType({ __file: '/src/my-button.jsx' }))).toBe('MyButton')
  })

  it('returns undefined when no identifying info exists', () => {
    expect(getComponentName(makeType({}))).toBeUndefined()
  })
})

describe('getInstanceName', () => {
  it('returns component name for SFC', () => {
    const instance = { type: { name: 'HelloWorld' } } as any
    expect(getInstanceName(instance)).toBe('HelloWorld')
  })

  it('returns name derived from .tsx __file when no explicit name', () => {
    const instance = { type: { __file: '/src/Counter.tsx' } } as any
    expect(getInstanceName(instance)).toBe('Counter')
  })

  it('returns name derived from .jsx __file when no explicit name', () => {
    const instance = { type: { __file: '/src/Counter.jsx' } } as any
    expect(getInstanceName(instance)).toBe('Counter')
  })

  it('suppresses "index" name for index.jsx files', () => {
    // index.jsx should not surface the name "index", same as index.vue
    const instance = {
      type: { __name: 'index', __file: '/src/components/MyComp/index.jsx' },
      root: {},
      parent: null,
      appContext: { components: {} },
    } as any
    // __name is 'index' but file ends with index.jsx → falls through to filename-based name
    // getComponentTypeName returns '' → getInstanceName tries filename → returns 'MyComp'
    expect(getInstanceName(instance)).toBe('MyComp')
  })

  it('suppresses "index" name for index.tsx files', () => {
    const instance = {
      type: { __name: 'index', __file: '/src/components/MyComp/index.tsx' },
      root: {},
      parent: null,
      appContext: { components: {} },
    } as any
    expect(getInstanceName(instance)).toBe('MyComp')
  })

  it('returns functional component name from function.name', () => {
    function MyFunctional() {
      return null
    }
    const instance = { type: MyFunctional } as any
    expect(getInstanceName(instance)).toBe('MyFunctional')
  })

  it('returns functional component displayName over function.name', () => {
    function MyFunctional() {
      return null
    }
    ;(MyFunctional as any).displayName = 'BetterName'
    const instance = { type: MyFunctional } as any
    expect(getInstanceName(instance)).toBe('BetterName')
  })

  it('falls back to "Anonymous Component"', () => {
    const instance = {
      type: {},
      root: {},
      parent: null,
      appContext: { components: {} },
    } as any
    expect(getInstanceName(instance)).toBe('Anonymous Component')
  })
})
