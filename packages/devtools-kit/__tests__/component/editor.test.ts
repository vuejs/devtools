import { RefStateEditor, StateEditor } from '../../src/core/component/state/editor'

describe('editor: RefStateEditor', () => {
  const editor = new RefStateEditor()

  // Plain object
  // eslint-disable-next-line test/consistent-test-it
  test.each([
    // Plain object.
    // Add new key.
    { refValue: { foo: 'bar' }, newValue: { foo: 'bar', bar: 'baz' } },
    // Add new key and modify origin value.
    { refValue: { foo: 'bar' }, newValue: { foo: 'barr', bar: 'baz' } },
    // Modify origin value.
    { refValue: { foo: 'bar' }, newValue: { foo: 'barr' } },
    // Remove key.
    { refValue: { foo: 'bar' }, newValue: {} },
    // Remove key and modify origin value.
    { refValue: { foo: 'bar' }, newValue: { foo: 'barr' } },
    // Remove key and add new key.
    { refValue: { foo: 'bar' }, newValue: { bar: 'baz' } },
  ])('$refValue can be modified to $newValue by RefStateEditor.set', ({ refValue, newValue }) => {
    editor.set(refValue as any, newValue)
    expect(refValue).toEqual(newValue)
  })

  // Native set
  it('refStateEditor.set on native set', () => {
    const refValue = new Set(['foo', 'bar'])
    const newValue = ['baz', 'foo', 'bar']
    const targetValue = new Set(['baz', 'foo', 'bar'])
    editor.set(refValue as any, newValue)
    expect(refValue).toEqual(targetValue)
  })

  // Native map
  // eslint-disable-next-line test/consistent-test-it
  test.each([
    // Add new key.
    { refValue: new Map([['foo', 'bar']]), newValue: { foo: 'bar', bar: 'baz' }, targetValue: new Map([['foo', 'bar'], ['bar', 'baz']]) },
    // Add new key and modify origin value.
    { refValue: new Map([['foo', 'bar']]), newValue: { foo: 'barr', bar: 'baz' }, targetValue: new Map([['foo', 'barr'], ['bar', 'baz']]) },
    // Add new key and modify origin value.
    { refValue: new Map([['foo', 'bar']]), newValue: { foo: 'barr', bar: 'baz' }, targetValue: new Map([['foo', 'barr'], ['bar', 'baz']]) },
    // Modify origin value.
    { refValue: new Map([['foo', 'bar']]), newValue: { foo: 'barr' }, targetValue: new Map([['foo', 'barr']]) },
    // Remove key.
    { refValue: new Map([['foo', 'bar']]), newValue: {}, targetValue: new Map() },
    // Remove key and modify origin value.
    { refValue: new Map([['foo', 'bar']]), newValue: { foo: 'barr' }, targetValue: new Map([['foo', 'barr']]) },
    // Remove key and add new key.
    { refValue: new Map([['foo', 'bar']]), newValue: { bar: 'baz' }, targetValue: new Map([['bar', 'baz']]) },
  ])('%o can be modified to $newValue by RefStateEditor.set', ({ refValue, newValue, targetValue }) => {
    editor.set(refValue as any, newValue)
    expect(refValue).toEqual(targetValue || newValue)
  })
})

describe('editor: StateEditor.set', () => {
  const stateEditor = new StateEditor()

  describe('editComponentState: plain object', () => {
    it('modify value', () => {
      const target = { foo: 'bar' }
      const newValue = 'baz'
      const state = { newKey: '', type: '', value: 'baz' }
      const path = 'foo'
      const defaultCallback = stateEditor.createDefaultSetCallback(state)
      stateEditor.set(target, path, newValue, defaultCallback)
      expect(target).toEqual({ foo: 'baz' })
    })

    it('add new value', () => {
      const target = { foo: 'bar' }
      const newValue = 'baz'
      const state = { newKey: 'bar', type: '', value: 'baz' }
      const defaultCallback = stateEditor.createDefaultSetCallback(state)
      stateEditor.set(target, '', newValue, defaultCallback)
      expect(target).toEqual({ foo: 'bar', bar: 'baz' })
    })

    it('remove value', () => {
      const target = { foo: 'bar', bar: 'baz' }
      const state = { newKey: '', type: '', value: '', remove: true }
      const path = 'foo'
      const defaultCallback = stateEditor.createDefaultSetCallback(state)
      stateEditor.set(target, path, '', defaultCallback)
      expect(target).toEqual({ bar: 'baz' })
    })
  })

  describe('editComponentState: array', () => {
    it('modify value', () => {
      const target = ['foo', 'bar']
      const state = { newKey: '', type: '', value: 'baz' }
      const newValue = 'baz'
      const path = '0'
      const defaultCallback = stateEditor.createDefaultSetCallback(state)
      stateEditor.set(target, path, newValue, defaultCallback)
      expect(target).toEqual(['baz', 'bar'])
    })

    it('add new value', () => {
      const target = ['foo', 'bar']
      const newValue = 'baz'
      const state = { newKey: '2', type: '', value: newValue }
      const defaultCallback = stateEditor.createDefaultSetCallback(state)
      stateEditor.set(target, '2', newValue, defaultCallback)
      expect(target).toEqual(['foo', 'bar', 'baz'])
    })

    it('remove value', () => {
      const target = ['foo', 'bar', 'baz']
      const state = { newKey: '', type: '', value: '', remove: true }
      const path = '0'
      const defaultCallback = stateEditor.createDefaultSetCallback(state)
      stateEditor.set(target, path, '', defaultCallback)
      expect(target).toEqual(['bar', 'baz'])
    })
  })

  describe('editComponentState: set', () => {
    it('add new value', () => {
      const target = new Set(['foo', 'bar'])
      const newValue = 'baz'
      const state = { newKey: '2', type: '', value: newValue }
      const defaultCallback = stateEditor.createDefaultSetCallback(state)
      stateEditor.set(target, '2', newValue, defaultCallback)
      expect(target).toEqual(new Set(['foo', 'bar', 'baz']))
    })

    it('remove value', () => {
      const target = new Set(['foo', 'bar', 'baz'])
      const state = { newKey: '', type: '', value: 'foo', remove: true }
      const path = '0'
      const defaultCallback = stateEditor.createDefaultSetCallback(state)
      stateEditor.set(target, path, '', defaultCallback)
      expect(target).toEqual(new Set(['bar', 'baz']))
    })

    it('remove object type member', () => {
      const target = new Set(['foo', { bar: 'baz' }])
      const state = { newKey: '', type: '', value: { bar: 'baz' }, remove: true }
      const path = '1'
      const defaultCallback = stateEditor.createDefaultSetCallback(state)
      stateEditor.set(target, path, '', defaultCallback)
      expect(target).toEqual(new Set(['foo']))
    })
  })

  describe('editComponentState: map', () => {
    it('modify value', () => {
      const target = new Map([['foo', 'bar']])
      const state = { newKey: '', type: '', value: 'baz' }
      const newValue = 'baz'
      const path = 'foo'
      const defaultCallback = stateEditor.createDefaultSetCallback(state)
      stateEditor.set(target, path, newValue, defaultCallback)
      expect(target).toEqual(new Map([['foo', 'baz']]))
    })

    it('add new value', () => {
      const target = new Map([['foo', 'bar']])
      const newValue = 'baz'
      const state = { newKey: 'bar', type: '', value: newValue }
      const defaultCallback = stateEditor.createDefaultSetCallback(state)
      stateEditor.set(target, 'bar', newValue, defaultCallback)
      expect(target).toEqual(new Map([['foo', 'bar'], ['bar', 'baz']]))
    })

    it('remove value', () => {
      const target = new Map([['foo', 'bar'], ['bar', 'baz']])
      const state = { newKey: '', type: '', value: '', remove: true }
      const path = 'foo'
      const defaultCallback = stateEditor.createDefaultSetCallback(state)
      stateEditor.set(target, path, '', defaultCallback)
      expect(target).toEqual(new Map([['bar', 'baz']]))
    })

    it('modify nested value in map', () => {
      const target = { foo: new Map([['bar', {
        baz: 1,
      }]]) }
      const state = { newKey: '', type: '', value: 2 }
      const path = ['foo', 'bar', 'baz']
      const defaultCallback = stateEditor.createDefaultSetCallback(state)
      stateEditor.set(target, path, 2, defaultCallback)
      expect(target).toEqual({
        foo: new Map([['bar', {
          baz: 2,
        }]]),
      })
    })
  })
})
